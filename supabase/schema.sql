-- =====================================================================
-- Patagenda · Esquema de base de datos para Supabase
--
-- Ejecuta este archivo completo en Supabase → SQL Editor → "Run".
-- Se puede ejecutar varias veces sin romper nada (es idempotente).
--
-- Idea clave de los reinicios: cada voto se guarda con el periodo al que
-- pertenece (semana que empieza en lunes / mes). El periodo actual lo
-- calcula SIEMPRE Postgres con la hora de Europe/Madrid, así que en cuanto
-- empieza una semana o un mes nuevo las encuestas aparecen vacías, aunque
-- nadie tenga la web abierta. Además, cron.sql borra los votos antiguos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Periodos (zona horaria Europe/Madrid)
-- ---------------------------------------------------------------------
create or replace function public.madrid_today()
returns date language sql stable set search_path = public as $$
  select (now() at time zone 'Europe/Madrid')::date
$$;

-- Lunes de la semana actual.
create or replace function public.current_week_start()
returns date language sql stable set search_path = public as $$
  select madrid_today() - (extract(isodow from madrid_today())::int - 1)
$$;

-- Día 1 del mes actual.
create or replace function public.current_month_start()
returns date language sql stable set search_path = public as $$
  select madrid_today() - (extract(day from madrid_today())::int - 1)
$$;

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          text primary key,
  name        text not null,
  color       text not null,
  sort_order  int  not null default 0
);

create table if not exists public.restaurants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  created_at  timestamptz not null default clock_timestamp()
);
create unique index if not exists restaurants_name_key on public.restaurants (lower(name));

create table if not exists public.activities (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  created_at  timestamptz not null default clock_timestamp()
);
create unique index if not exists activities_name_key on public.activities (lower(name));

-- Encuesta semanal 1: ¿cuándo cenamos? (un voto por persona y semana)
create table if not exists public.dinner_day_votes (
  week_start  date not null,
  profile_id  text not null references public.profiles (id) on delete cascade,
  day         text not null check (day in ('viernes', 'sabado')),
  updated_at  timestamptz not null default now(),
  primary key (week_start, profile_id)
);

-- Encuesta semanal 2: ¿dónde cenamos? (un voto por persona y semana)
create table if not exists public.restaurant_votes (
  week_start    date not null,
  profile_id    text not null references public.profiles (id) on delete cascade,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  updated_at    timestamptz not null default now(),
  primary key (week_start, profile_id)
);

-- Encuesta mensual 1: disponibilidad (varias franjas por persona)
create table if not exists public.availability (
  month_start date not null,
  profile_id  text not null references public.profiles (id) on delete cascade,
  slot_date   date not null,
  slot        text not null check (slot in ('manana', 'tarde', 'noche')),
  created_at  timestamptz not null default now(),
  primary key (profile_id, slot_date, slot),
  check (month_start = slot_date - (extract(day from slot_date)::int - 1)),
  check (extract(isodow from slot_date) in (5, 6, 7))
);
create index if not exists availability_month_idx on public.availability (month_start);

-- Encuesta mensual 2: puntuación 1-5 de cada actividad
create table if not exists public.activity_ratings (
  month_start date not null,
  profile_id  text not null references public.profiles (id) on delete cascade,
  activity_id uuid not null references public.activities (id) on delete cascade,
  score       smallint not null check (score between 1 and 5),
  updated_at  timestamptz not null default now(),
  primary key (month_start, profile_id, activity_id)
);

-- ---------------------------------------------------------------------
-- Datos iniciales
-- ---------------------------------------------------------------------
insert into public.profiles (id, name, color, sort_order) values
  ('raquel', 'Raquel', '#ef7aa1', 1),
  ('marta',  'Marta',  '#a58bea', 2),
  ('diana',  'Diana',  '#4fbf9f', 3)
on conflict (id) do nothing;

insert into public.restaurants (name)
select v.name from (values ('Al fondo hay sitio'), ('McDonald''s'), ('Carrefour')) as v(name)
where not exists (select 1 from public.restaurants);

insert into public.activities (name)
select v.name from (values ('Ir a patinar'), ('Pintar camisetas'), ('Jugar a los bolos')) as v(name)
where not exists (select 1 from public.activities);

-- ---------------------------------------------------------------------
-- Seguridad: lectura pública, escritura solo mediante las funciones RPC
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles', 'restaurants', 'activities', 'dinner_day_votes',
                           'restaurant_votes', 'availability', 'activity_ratings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "lectura" on public.%I', t);
    execute format('create policy "lectura" on public.%I for select to anon, authenticated using (true)', t);
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Tiempo real: publicar los cambios de estas tablas
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['restaurants', 'activities', 'dinner_day_votes',
                           'restaurant_votes', 'availability', 'activity_ratings'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Funciones auxiliares
-- ---------------------------------------------------------------------
create or replace function public._assert_profile(p_profile text)
returns void language plpgsql stable set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = p_profile) then
    raise exception 'Perfil desconocido';
  end if;
end $$;

create or replace function public._option_table(p_kind text)
returns text language plpgsql immutable as $$
begin
  if p_kind = 'restaurant' then return 'restaurants'; end if;
  if p_kind = 'activity' then return 'activities'; end if;
  raise exception 'Tipo de opción no válido';
end $$;

create or replace function public._clean_option_name(p_name text)
returns text language plpgsql immutable as $$
declare v text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if char_length(v) = 0 then raise exception 'El nombre no puede estar vacío'; end if;
  if char_length(v) > 60 then raise exception 'El nombre es demasiado largo (máximo 60 caracteres)'; end if;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- Lectura: todo el estado del periodo actual en una sola llamada
-- ---------------------------------------------------------------------
create or replace function public.get_state()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_week  date := current_week_start();
  v_month date := current_month_start();
begin
  return jsonb_build_object(
    'today',       madrid_today(),
    'week_start',  v_week,
    'month_start', v_month,
    'profiles', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'color', color) order by sort_order)
      from profiles), '[]'::jsonb),
    'restaurants', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by created_at)
      from restaurants), '[]'::jsonb),
    'activities', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by created_at)
      from activities), '[]'::jsonb),
    'dinner_day_votes', coalesce((
      select jsonb_agg(jsonb_build_object('profile_id', profile_id, 'day', day))
      from dinner_day_votes where week_start = v_week), '[]'::jsonb),
    'restaurant_votes', coalesce((
      select jsonb_agg(jsonb_build_object('profile_id', profile_id, 'restaurant_id', restaurant_id))
      from restaurant_votes where week_start = v_week), '[]'::jsonb),
    'availability', coalesce((
      select jsonb_agg(jsonb_build_object('profile_id', profile_id, 'slot_date', slot_date, 'slot', slot))
      from availability where month_start = v_month), '[]'::jsonb),
    'activity_ratings', coalesce((
      select jsonb_agg(jsonb_build_object('profile_id', profile_id, 'activity_id', activity_id, 'score', score))
      from activity_ratings where month_start = v_month), '[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------------------
-- Votos (p_day / p_restaurant / p_score a null = quitar el voto)
-- ---------------------------------------------------------------------
create or replace function public.vote_dinner_day(p_profile text, p_day text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _assert_profile(p_profile);
  if p_day is null then
    delete from dinner_day_votes where week_start = current_week_start() and profile_id = p_profile;
  elsif p_day not in ('viernes', 'sabado') then
    raise exception 'Día no válido';
  else
    insert into dinner_day_votes (week_start, profile_id, day)
    values (current_week_start(), p_profile, p_day)
    on conflict (week_start, profile_id) do update set day = excluded.day, updated_at = now();
  end if;
end $$;

create or replace function public.vote_restaurant(p_profile text, p_restaurant uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _assert_profile(p_profile);
  if p_restaurant is null then
    delete from restaurant_votes where week_start = current_week_start() and profile_id = p_profile;
  elsif not exists (select 1 from restaurants where id = p_restaurant) then
    raise exception 'Ese sitio ya no existe';
  else
    insert into restaurant_votes (week_start, profile_id, restaurant_id)
    values (current_week_start(), p_profile, p_restaurant)
    on conflict (week_start, profile_id) do update
      set restaurant_id = excluded.restaurant_id, updated_at = now();
  end if;
end $$;

create or replace function public.set_availability(p_profile text, p_date date, p_slot text, p_available boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_month date := current_month_start();
begin
  perform _assert_profile(p_profile);
  if p_slot not in ('manana', 'tarde', 'noche') then raise exception 'Franja no válida'; end if;
  if p_date is null or p_date - (extract(day from p_date)::int - 1) <> v_month then
    raise exception 'Esa fecha no es de este mes';
  end if;
  if extract(isodow from p_date) not in (5, 6, 7) then
    raise exception 'Solo se puede quedar viernes, sábado o domingo';
  end if;

  if p_available then
    insert into availability (month_start, profile_id, slot_date, slot)
    values (v_month, p_profile, p_date, p_slot)
    on conflict (profile_id, slot_date, slot) do nothing;
  else
    delete from availability where profile_id = p_profile and slot_date = p_date and slot = p_slot;
  end if;
end $$;

create or replace function public.rate_activity(p_profile text, p_activity uuid, p_score int)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _assert_profile(p_profile);
  if p_score is null then
    delete from activity_ratings
    where month_start = current_month_start() and profile_id = p_profile and activity_id = p_activity;
  elsif p_score not between 1 and 5 then
    raise exception 'La puntuación debe estar entre 1 y 5';
  elsif not exists (select 1 from activities where id = p_activity) then
    raise exception 'Ese plan ya no existe';
  else
    insert into activity_ratings (month_start, profile_id, activity_id, score)
    values (current_month_start(), p_profile, p_activity, p_score)
    on conflict (month_start, profile_id, activity_id) do update
      set score = excluded.score, updated_at = now();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Gestión de opciones (p_kind: 'restaurant' | 'activity')
-- ---------------------------------------------------------------------
create or replace function public.add_option(p_kind text, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_table text := _option_table(p_kind);
  v_count int;
  v_id    uuid;
begin
  execute format('select count(*) from %I', v_table) into v_count;
  if v_count >= 30 then raise exception 'Hay demasiadas opciones; borra alguna antes'; end if;
  execute format('insert into %I (name) values ($1) returning id', v_table)
    into v_id using _clean_option_name(p_name);
  return v_id;
exception when unique_violation then
  raise exception 'Ya existe una opción con ese nombre';
end $$;

create or replace function public.rename_option(p_kind text, p_id uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare v_rows int;
begin
  execute format('update %I set name = $1 where id = $2', _option_table(p_kind))
    using _clean_option_name(p_name), p_id;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then raise exception 'Esa opción ya no existe'; end if;
exception when unique_violation then
  raise exception 'Ya existe una opción con ese nombre';
end $$;

-- Sus votos se borran en cascada.
create or replace function public.delete_option(p_kind text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  execute format('delete from %I where id = $1', _option_table(p_kind)) using p_id;
end $$;

-- ---------------------------------------------------------------------
-- Limpieza de periodos pasados (la lanza pg_cron, ver cron.sql)
-- ---------------------------------------------------------------------
create or replace function public.cleanup_old_periods()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from dinner_day_votes where week_start  < current_week_start();
  delete from restaurant_votes where week_start  < current_week_start();
  delete from availability     where month_start < current_month_start();
  delete from activity_ratings where month_start < current_month_start();
end $$;

-- ---------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------
revoke execute on function public._assert_profile(text), public._option_table(text),
  public._clean_option_name(text), public.cleanup_old_periods() from public, anon, authenticated;

grant execute on function
  public.get_state(),
  public.vote_dinner_day(text, text),
  public.vote_restaurant(text, uuid),
  public.set_availability(text, date, text, boolean),
  public.rate_activity(text, uuid, int),
  public.add_option(text, text),
  public.rename_option(text, uuid, text),
  public.delete_option(text, uuid)
to anon, authenticated;
