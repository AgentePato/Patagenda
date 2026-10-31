# 🦆 Patagenda

Web para organizar las quedadas de Raquel, Marta y Diana:

- **Cena del finde**: ¿viernes o sábado? y ¿dónde cenamos? Se reinicia cada lunes a las 00:00 (hora de España).
- **Plan del mes**: disponibilidad por franjas (mañana, tarde y noche de todos los viernes, sábados y domingos) y puntuación del 1 al 5 de cada plan. Se reinicia el día 1 de cada mes a las 00:00.
- **Nuestro plan definitivo**: se calcula solo. Elige la franja en la que puede más gente y, contando únicamente a esas personas (y solo a las que han puntuado), el plan con mejor media.
- Votos en tiempo real, perfiles sin contraseña y opciones editables (proponer, renombrar y borrar planes y sitios).

## Arquitectura

```
index.html, styles.css      Página y estilos (sin compilación: HTML + JS nativo)
src/
  main.js                   Arranque, perfil, pestañas, sincronización
  store.js                  Estado compartido + actualizaciones optimistas
  logic/dates.js            Fechas en Europe/Madrid, fines de semana del mes
  logic/polls.js            Recuentos, medias y algoritmo del plan definitivo
  api/supabaseBackend.js    Backend real (Supabase)
  api/demoBackend.js        Modo demo (localStorage) si no hay Supabase configurado
  views/                    Secciones de la interfaz
  ui/                       Componentes, modales y avisos
supabase/schema.sql         Tablas, seguridad, funciones y tiempo real
supabase/cron.sql           Limpieza automática de votos antiguos (pg_cron)
tests/                      Tests de la lógica
```

**Backend: [Supabase](https://supabase.com)** (gratis). Es Postgres con tiempo real incluido.

- Las páginas leen con `get_state()` y escriben solo a través de funciones SQL que validan los datos: perfil existente, día válido, puntuación de 1 a 5, fecha del mes actual y viernes, sábado o domingo, nombres no vacíos ni repetidos. Las tablas no aceptan escrituras directas.
- Las claves primarias impiden los votos duplicados: un voto por persona y semana en la cena, una puntuación por persona, plan y mes, y una fila por persona y franja de disponibilidad. Volver a votar sustituye el voto anterior.

### Cómo funcionan los reinicios

Cada voto se guarda junto a su periodo (el lunes de la semana o el día 1 del mes). **Postgres calcula el periodo actual con la hora de Europe/Madrid**, así que en cuanto llega el lunes a las 00:00, o el día 1, las encuestas aparecen vacías para todas aunque nadie tenga la web abierta. Las opciones (sitios y planes) no se tocan nunca.

Además, `cron.sql` programa una tarea en el propio Supabase (pg_cron) que borra los votos de periodos pasados. Se ejecuta cada hora y es DST-safe, porque pg_cron funciona en UTC. Los reinicios no dependen del navegador.

> Las puntuaciones de los planes también son mensuales: cada mes se puntúa de nuevo.

## Probarlo en local (modo demo)

Hace falta servir la carpeta por HTTP, porque los módulos JS no funcionan abriendo el archivo con doble clic:

```sh
cd Patagenda
python3 -m http.server 8000
```

Abre <http://localhost:8000>. Sin Supabase configurado arranca en **modo demo**: todo funciona, pero los datos se guardan solo en ese navegador. Puedes abrir dos pestañas para ver la sincronización.

## Configurar Supabase (para compartirlo de verdad)

1. Crea una cuenta y un proyecto en <https://supabase.com> (plan gratuito). Elige como región *West EU*.
2. Ve a **SQL Editor → New query**, pega el contenido de [supabase/schema.sql](supabase/schema.sql) y pulsa **Run**.
3. Haz lo mismo con [supabase/cron.sql](supabase/cron.sql). Si da error por `pg_cron`, actívala antes en **Database → Extensions → pg_cron** y vuelve a ejecutarlo.
4. Ve a **Project Settings → API Keys** y copia la *Project URL* y la clave pública (*anon* o *publishable*) en [src/config.js](src/config.js):

   ```js
   export const config = {
     supabaseUrl: 'https://xxxxxxxx.supabase.co',
     supabaseAnonKey: 'eyJhbGciOi...',
   };
   ```

   Esta clave es pública por diseño, así que se puede subir a GitHub sin problema. **Nunca pongas la clave `service_role` / `secret`.**
5. Recarga la web. El indicador de arriba debe decir **"En directo"** en verde.

No hay que desplegar ningún servicio adicional: el tiempo real (Supabase Realtime) y los reinicios (Postgres + pg_cron) funcionan dentro de Supabase. `schema.sql` ya publica las tablas en Realtime. Puedes comprobarlo en **Database → Publications → supabase_realtime**.

No hace falta configurar variables de entorno: la web es estática y la única configuración es `src/config.js`.

## Publicarla para usarla desde el móvil (GitHub Pages)

1. Sube los cambios a GitHub (`git add . && git commit -m "Patagenda" && git push`).
2. En el repositorio ve a **Settings → Pages → Build and deployment**, elige *Deploy from a branch*, la rama `main` y la carpeta `/ (root)`, y guarda.
3. En un par de minutos estará en `https://agentepato.github.io/Patagenda/`.
4. En el móvil: abre el enlace y usa *Compartir → Añadir a pantalla de inicio* para tenerla como app.

Vale cualquier hosting estático (Netlify, Vercel, Cloudflare Pages…), porque no hay paso de compilación.

## Tests

```sh
./tests/run.sh
```

Usa Node si está instalado o, si no, el motor JavaScript que trae macOS. Comprueban las fechas en Europe/Madrid (incluido el cambio de hora), los recuentos y porcentajes, los empates y el ejemplo del plan definitivo del enunciado: sábado 7 por la noche, con patinar 4,5, pintar camisetas 4 y bolos 4.

## Cosas a tener en cuenta

- **Sin contraseñas**: cualquiera con el enlace podría votar en nombre de otra persona. Para un grupo de amigas es suficiente. Si algún día hace falta, se puede añadir login con Supabase Auth.
- **Plan gratuito de Supabase**: pausa el proyecto si pasa una semana sin ninguna actividad. Se reactiva desde el panel con un clic y no se pierde nada.
- **Añadir a otra persona**: en el SQL Editor, `insert into profiles (id, name, color, sort_order) values ('lucia', 'Lucía', '#f2a65a', 4);`.
- **Mínimo para el plan definitivo**: hacen falta al menos 2 personas en la misma franja. Se cambia en `MIN_ATTENDEES` de [src/constants.js](src/constants.js).
