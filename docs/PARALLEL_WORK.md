# Trabajo en paralelo: EBITDA (Sheets) vs EEFF

Este documento sirve para **repartir responsabilidades** entre quien configura Google Sheets / servidor y quien desarrolla el módulo EEFF.

## Rol A — Infra / EBITDA Live (Google Sheets)

**Objetivo:** Que `GET /api/config` devuelva `googleSheetsConfigured: true` y que EBITDA Live cargue datos.

**Tareas típicas:**

1. Crear o usar un proyecto en Google Cloud con **Google Sheets API** habilitada.
2. Crear una **clave de API** (restringir por IP/referrer en producción).
3. Obtener el **ID del spreadsheet** (URL: `.../spreadsheets/d/ESTE_ID/...`).
4. En el entorno donde corre el servidor (`server/.env` en local, o variables del hosting en prod):
   - `GOOGLE_SHEETS_SPREADSHEET_ID=...`
   - `GOOGLE_SHEETS_API_KEY=...`
5. Reiniciar el proceso Node y comprobar en el navegador (pestaña EBITDA Live).

**No commitear** `.env` ni secretos. `.env` debe seguir en `.gitignore`.

**Evitar tocar** (salvo acuerdo explícito): lógica de extracción EEFF, `server/lib/normalize.js`, `parseNumber.js`, pestaña EEFF en `index.html`.

---

## Rol B — Módulo EEFF (este repo, código)

**Objetivo:** Mejorar PDF → partidas, ratios, UI, análisis, etc.

**Tareas típicas:** archivos bajo `server/lib/` (normalize, ratios, …), rutas `/api/eeff/*`, sección EEFF en `index.html`, esquema SQLite si aplica.

**Evitar tocar** (salvo acuerdo): `GOOGLE_SHEETS_*` en `.env`, credenciales de Google Cloud.

---

## Archivos con posible solapamiento

| Archivo | Riesgo |
|---------|--------|
| `server/index.js` | Medio: Rol A puede añadir endpoints o CORS; Rol B añade rutas EEFF. **Mergear con cuidado** o trabajar en ramas y unificar. |
| `index.html` | Medio: Rol B suele editar bloque EEFF; Rol A raramente toca el HTML. **Convención:** Rol A evita cambios en `index.html` salvo texto global. |

---

## Comunicación mínima

1. **Rama** sugerida: `infra/sheets-config` (Rol A) vs `feature/eeff-*` (Rol B).
2. Antes de merge a `main`: `git pull` y resolver conflictos en `server/index.js` / `index.html` si ambos tocaron.
3. **Rol A** avisa cuando el entorno (staging/prod) ya tiene variables; **Rol B** no depende de eso para seguir desarrollando EEFF en local.

---

## Quién “coordina”

Este archivo es la **única** coordinación automática que podemos dejar en el repo. La asignación de personas y plazos la define el equipo.
