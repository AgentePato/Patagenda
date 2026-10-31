-- =====================================================================
-- Patagenda · Reinicios automáticos con pg_cron
--
-- Ejecuta este archivo DESPUÉS de schema.sql (Supabase → SQL Editor).
--
-- pg_cron trabaja en UTC, y la medianoche de Madrid cae a las 22:00 o a las
-- 23:00 UTC según sea horario de verano o de invierno. Por eso la tarea se
-- ejecuta cada hora (minuto 1) y es la propia función la que decide, con la
-- hora de Europe/Madrid, qué votos pertenecen a periodos ya terminados:
--   · votos semanales  → se borran al llegar el lunes a las 00:00
--   · votos mensuales  → se borran al llegar el día 1 a las 00:00
-- Si se ejecuta de más no pasa nada: es idempotente.
-- =====================================================================

create extension if not exists pg_cron;

select cron.schedule(
  'patagenda-reinicios',
  '1 * * * *',
  $$select public.cleanup_old_periods()$$
);

-- Para comprobarlo:   select * from cron.job;
-- Historial:          select * from cron.job_run_details order by start_time desc limit 10;
