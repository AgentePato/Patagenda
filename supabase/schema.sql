-- =====================================================================
-- Patagenda · Esquema de base de datos para Supabase
--
-- Ejecuta este archivo completo en Supabase → SQL Editor → "Run".
-- Se puede ejecutar varias veces sin perder datos (es idempotente): cada
-- vez que cambie, basta con volver a ejecutarlo entero.
--
-- Idea clave de los reinicios: cada voto se guarda con el periodo al que
-- pertenece (semana que empieza en lunes / mes). El periodo actual lo
-- calcula SIEMPRE Postgres con la hora de Europe/Madrid, así que en cuanto
-- empieza una semana o un mes nuevo las encuestas aparecen vacías, aunque
-- nadie tenga la web abierta. Además, cron.sql borra los votos antiguos.
-- Las quedadas confirmadas (tabla events) NO se borran nunca: son el
-- histórico.
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
alter table public.profiles add column if not exists emoji text;

-- Sitios para cenar: se añaden buscándolos en el mapa, con su ubicación.
create table if not exists public.restaurants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default clock_timestamp()
);
alter table public.restaurants add column if not exists address  text;
alter table public.restaurants add column if not exists lat      double precision;
alter table public.restaurants add column if not exists lng      double precision;
alter table public.restaurants add column if not exists place_id text;
alter table public.restaurants add column if not exists maps_url text;
alter table public.restaurants drop constraint if exists restaurants_name_check;
alter table public.restaurants add constraint restaurants_name_check check (char_length(name) between 1 and 120);
drop index if exists public.restaurants_name_key;   -- puede haber dos locales con el mismo nombre
create unique index if not exists restaurants_place_key on public.restaurants (place_id);

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

-- Quedadas confirmadas: la cena definitiva de cada semana y el plan fijado
-- de cada mes. Guardan una copia del sitio/plan para que el histórico no
-- cambie aunque luego se borre de la lista.
create table if not exists public.events (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('dinner', 'plan')),
  period_start  date not null,             -- lunes (cena) o día 1 (plan)
  event_date    date not null,
  event_time    time,                      -- hora de la cena
  slot          text check (slot in ('manana', 'tarde', 'noche')),  -- franja del plan
  title         text not null,             -- nombre del sitio o del plan
  restaurant_id uuid references public.restaurants (id) on delete set null,
  place_address text,
  lat           double precision,
  lng           double precision,
  maps_url      text,
  created_by    text references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (kind, period_start)
);

-- ¿Vas? (una respuesta por persona y quedada)
create table if not exists public.event_attendance (
  event_id    uuid not null references public.events (id) on delete cascade,
  profile_id  text not null references public.profiles (id) on delete cascade,
  going       boolean not null,
  updated_at  timestamptz not null default now(),
  primary key (event_id, profile_id)
);

-- ---------------------------------------------------------------------
-- Datos iniciales
-- ---------------------------------------------------------------------
insert into public.profiles (id, name, emoji, color, sort_order) values
  ('aroa',   'Aroa',   '🦖', '#7cc576', 1),
  ('carlo',  'Carlo',  '🍺', '#f2b84b', 2),
  ('diana',  'Diana',  '🎯', '#e5606b', 3),
  ('eva',    'Eva',    '🖌️', '#a58bea', 4),
  ('mario',  'Mario',  '⚽', '#5aa9e6', 5),
  ('marta',  'Marta',  '🩺', '#ef7aa1', 6),
  ('naiara', 'Naiara', '🐄', '#a7b0bb', 7),
  ('raquel', 'Raquel', '🦆', '#f6c445', 8),
  ('sofia',  'Sofía',  '💻', '#4fbf9f', 9),
  ('yaiza',  'Yaiza',  '🎤', '#d17be0', 10),
  ('ines',   'Inés',   '🎮', '#6c8cf0', 11),
  ('javi',   'Javi',   '👟', '#f08a4b', 12),
  ('alvaro', 'Álvaro', '🎾', '#b5d334', 13),
  ('pablo',  'Pablo',  '🍸', '#ff9f80', 14)
on conflict (id) do update
  set name = excluded.name, emoji = excluded.emoji, color = excluded.color, sort_order = excluded.sort_order;

-- Los sitios de ejemplo del principio no tenían ubicación: se quitan.
delete from public.restaurants
where place_id is null and name in ('Al fondo hay sitio', 'McDonald''s', 'Carrefour');

insert into public.activities (name)
select v.name from (values ('Ir a patinar'), ('Pintar camisetas'), ('Jugar a los bolos')) as v(name)
where not exists (select 1 from public.activities);

-- ---------------------------------------------------------------------
-- Seguridad: lectura pública, escritura solo mediante las funciones RPC
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles', 'restaurants', 'activities', 'dinner_day_votes', 'restaurant_votes',
                           'availability', 'activity_ratings', 'events', 'event_attendance'] loop
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
  foreach t in array array['profiles', 'restaurants', 'activities', 'dinner_day_votes', 'restaurant_votes',
                           'availability', 'activity_ratings', 'events', 'event_attendance'] loop
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
-- Lectura: todo el estado en una sola llamada
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
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'emoji', emoji, 'color', color) order by sort_order)
      from profiles), '[]'::jsonb),
    'restaurants', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'address', address, 'lat', lat, 'lng', lng,
                                          'place_id', place_id, 'maps_url', maps_url) order by created_at)
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
      from activity_ratings where month_start = v_month), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'kind', e.kind, 'period_start', e.period_start, 'event_date', e.event_date,
        'event_time', to_char(e.event_time, 'HH24:MI'), 'slot', e.slot, 'title', e.title,
        'restaurant_id', e.restaurant_id, 'place_address', e.place_address, 'lat', e.lat, 'lng', e.lng,
        'maps_url', e.maps_url, 'created_by', e.created_by,
        'attendance', coalesce((
          select jsonb_agg(jsonb_build_object('profile_id', a.profile_id, 'going', a.going))
          from event_attendance a where a.event_id = e.id), '[]'::jsonb)
      ) order by e.event_date desc)
      from events e), '[]'::jsonb)
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
  if p_kind = 'restaurant' then raise exception 'Los sitios se añaden buscándolos en el mapa'; end if;
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

-- Sus votos se borran en cascada (las quedadas pasadas conservan su copia).
create or replace function public.delete_option(p_kind text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  execute format('delete from %I where id = $1', _option_table(p_kind)) using p_id;
end $$;

-- Añadir un sitio encontrado en el buscador del mapa.
create or replace function public.add_place(
  p_name text, p_address text, p_lat double precision, p_lng double precision, p_place_id text, p_maps_url text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_id   uuid;
begin
  if char_length(v_name) = 0 or char_length(v_name) > 120 then raise exception 'Nombre de sitio no válido'; end if;
  if p_place_id is null or char_length(p_place_id) > 300 then raise exception 'Sitio no válido'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Ubicación no válida';
  end if;
  if p_maps_url is not null and p_maps_url !~ '^https://' then raise exception 'Enlace no válido'; end if;
  if (select count(*) from restaurants) >= 200 then raise exception 'Hay demasiados sitios; borra alguno antes'; end if;

  insert into restaurants (name, address, lat, lng, place_id, maps_url)
  values (v_name, left(btrim(p_address), 300), p_lat, p_lng, p_place_id, p_maps_url)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'Ese sitio ya está en la lista';
end $$;

-- ---------------------------------------------------------------------
-- Quedadas confirmadas
-- ---------------------------------------------------------------------
-- Cena definitiva de esta semana (crea o sustituye la que hubiera).
create or replace function public.set_dinner(p_profile text, p_date date, p_time text, p_restaurant uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_week date := current_week_start();
  v_time time;
  r      restaurants%rowtype;
  v_id   uuid;
begin
  perform _assert_profile(p_profile);
  if p_date is null or p_date < v_week or p_date > v_week + 6 then
    raise exception 'La fecha tiene que ser de esta semana';
  end if;
  if p_time is null or p_time !~ '^\d{1,2}:\d{2}$' then raise exception 'Hora no válida'; end if;
  begin
    v_time := p_time::time;
  exception when others then
    raise exception 'Hora no válida';
  end;
  select * into r from restaurants where id = p_restaurant;
  if not found then raise exception 'Elige un sitio de la lista'; end if;

  insert into events (kind, period_start, event_date, event_time, title, restaurant_id,
                      place_address, lat, lng, maps_url, created_by)
  values ('dinner', v_week, p_date, v_time, r.name, r.id, r.address, r.lat, r.lng, r.maps_url, p_profile)
  on conflict (kind, period_start) do update set
    event_date = excluded.event_date, event_time = excluded.event_time, title = excluded.title,
    restaurant_id = excluded.restaurant_id, place_address = excluded.place_address,
    lat = excluded.lat, lng = excluded.lng, maps_url = excluded.maps_url, created_by = excluded.created_by
  returning id into v_id;
  return v_id;
end $$;

-- Plan fijado de este mes (crea o sustituye el que hubiera).
create or replace function public.set_plan_event(p_profile text, p_date date, p_slot text, p_activity uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_month date := current_month_start();
  v_title text;
  v_id    uuid;
begin
  perform _assert_profile(p_profile);
  if p_slot not in ('manana', 'tarde', 'noche') then raise exception 'Franja no válida'; end if;
  if p_date is null or p_date - (extract(day from p_date)::int - 1) <> v_month
     or extract(isodow from p_date) not in (5, 6, 7) then
    raise exception 'La fecha tiene que ser un fin de semana de este mes';
  end if;
  select name into v_title from activities where id = p_activity;
  if v_title is null then raise exception 'Ese plan ya no existe'; end if;

  insert into events (kind, period_start, event_date, slot, title, created_by)
  values ('plan', v_month, p_date, p_slot, v_title, p_profile)
  on conflict (kind, period_start) do update set
    event_date = excluded.event_date, slot = excluded.slot, title = excluded.title, created_by = excluded.created_by
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.delete_event(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from events where id = p_id;
end $$;

-- ¿Vas? (p_going a null = quitar la respuesta)
create or replace function public.set_attendance(p_profile text, p_event uuid, p_going boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _assert_profile(p_profile);
  if not exists (select 1 from events where id = p_event) then raise exception 'Esa quedada ya no existe'; end if;
  if p_going is null then
    delete from event_attendance where event_id = p_event and profile_id = p_profile;
  else
    insert into event_attendance (event_id, profile_id, going) values (p_event, p_profile, p_going)
    on conflict (event_id, profile_id) do update set going = excluded.going, updated_at = now();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Limpieza de votos de periodos pasados (la lanza pg_cron, ver cron.sql).
-- Las quedadas confirmadas se conservan para el histórico.
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
  public.delete_option(text, uuid),
  public.add_place(text, text, double precision, double precision, text, text),
  public.set_dinner(text, date, text, uuid),
  public.set_plan_event(text, date, text, uuid),
  public.delete_event(uuid),
  public.set_attendance(text, uuid, boolean)
to anon, authenticated;
