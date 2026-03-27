# Buda Board

Board financiero (EBITDA live desde Google Sheets) y módulo **EEFF auditados** (PDF → extracción, ratios, tendencias, análisis con IA).

## Requisitos

- Node.js 18+
- Para **EBITDA Live**: un proyecto en [Google Cloud](https://console.cloud.google.com/) con **Google Sheets API** habilitada y una **clave de API** (restringir por IP o referrer en producción). Copia también el **ID del spreadsheet** desde la URL del documento.

Si solo usas **EEFF auditados**, no hace falta configurar Sheets; la pestaña EBITDA mostrará un aviso hasta que añadas `GOOGLE_SHEETS_*` en `.env`.

**Importante:** `GOOGLE_SHEETS_*` se configura **una vez por servidor** (archivo `server/.env` o variables del hosting). **No** es un paso que repitas cada vez que inicias sesión: con el servidor ya configurado, **todos** los usuarios autorizados ven EBITDA Live igual.

## Arranque

```bash
cd server
cp .env.example .env
# Edita .env: BUDA_JWT_SECRET, GOOGLE_SHEETS_*, y opcionalmente BUDA_AUTH_EMAIL / BUDA_AUTH_PASSWORD.
# Si no defines contraseña en .env, el servidor acepta `admin@buda.com` o `usuario@buda.com` y password `buda-dev`.
npm install
npm start
```

Abre **http://localhost:3847** (el servidor sirve `index.html`, `chart.umd.min.js` y las APIs). No uses `file://`; el login y el proxy de Sheets requieren el mismo origen.

El gráfico **Chart.js** va en `chart.umd.min.js` en la raíz del board (no depende del CDN). Si falta el archivo, vuelve a generarlo con:
`curl -fsSL -o chart.umd.min.js "https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"`

### EBITDA Live se queda en “Cargando datos desde Google Sheets…”

- En la raíz del board, ejecuta **`cd server && npm run check:html-js`**. Si falla, hay un **error de sintaxis en el JS** embebido en `index.html`: el navegador ignora todo ese script (no verás peticiones a `/api/config`). Revisa también la **consola** del navegador (F12).
- Comprueba en `server/.env` que **`GOOGLE_SHEETS_SPREADSHEET_ID`** y **`GOOGLE_SHEETS_API_KEY`** estén rellenos (sin espacios raros) y **reinicia** `npm start`.
- El spreadsheet debe tener pestañas con los nombres que espera el board (p. ej. `EBITDA_LIVE`, `EBITDA CHI_LIVE`, `METRICS_LIVE`, etc.). Si falta una o el nombre no coincide, Google devuelve error: tras la actualización del código verás el mensaje en pantalla en lugar de un spinner infinito.
- La **API key** necesita **Google Sheets API** habilitada en el mismo proyecto de Google Cloud. Restricciones de la clave (IP, etc.) pueden bloquear al servidor.
- Si no usas Sheets en local, deja esas variables vacías: el board mostrará el aviso y la pestaña **EEFF auditados** sigue funcionando.

### Contraseña como hash (recomendado)

```bash
printf 'tu_password' | shasum -a 256
```

Copia el hex en `BUDA_AUTH_PASSWORD_SHA256` y elimina `BUDA_AUTH_PASSWORD`.

## EEFF auditados

1. Inicia sesión.
2. Pestaña **EEFF auditados**.
3. Sube un PDF con **texto seleccionable** cuando sea posible. La extracción usa texto plano (`pdf-parse`). Si el texto es muy corto frente al número de páginas, puedes activar **OCR local** (ver variables abajo).
4. **Dos columnas (año anterior | año actual):** si el PDF trae una cabecera con dos años (p. ej. `2023 2024`), el servidor elige la columna que coincide con el **año fiscal** del formulario. Si no detecta dos años, sigue la heurística anterior (último número / escala mediana).
5. **Vista previa de metadatos:** al elegir un archivo, el cliente llama a `POST /api/eeff/metadata-preview` (mismo PDF, sin guardar) y muestra sugerencias heurísticas (año al 31/12, moneda, miles/millones, tipo consolidado, razón social). **Aplicar** solo rellena campos que siguen vacíos (o tipo de reporte si estaba en «Otro»). Siempre revisa: son patrones por texto, no sustituto del criterio humano.
6. **Sanidad y KPI:** las tarjetas de ratios solo se muestran si el estado es `ok` y no hay alertas de sanidad. Hay avisos aparte de **comparabilidad vs año anterior** (misma entidad, año fiscal − 1) cuando ingresos, activos o utilidad saltan órdenes de magnitud (umbral configurable con `EEFF_YOY_LOG10_THRESHOLD`, por defecto ~2.25 en log10).
7. **OCR opcional (servidor):** instala **poppler** (`pdftoppm`) y **Tesseract** con idiomas `spa+eng`. En `server/.env` define `EEFF_OCR=1`. Límites: `EEFF_OCR_MAX_PAGES` (defecto 20), `EEFF_OCR_DPI`, `EEFF_OCR_PAGE_TIMEOUT_MS`. Sin binarios, verás un aviso y puedes corregir a mano. El PDF se procesa en el proceso Node local (privacidad); no se envía a cloud salvo que actives otra cosa.
8. **Extracción asistida (IA):** opcional con `OPENAI_API_KEY` y `EEFF_LLM_EXTRACT=1`. Dos casillas en el formulario: **solo vacíos** (no sustituye cifras ya extraídas; si **empeora** la sanidad frente a las reglas, se **descarta** la propuesta) y **extracción completa** (el modelo **reemplaza** todas las cifras del resumen; no se descarta por sanidad, pero se avisa si quedan alertas). Truncado: `EEFF_LLM_EXTRACT_MAX_CHARS` (modo vacíos) y `EEFF_LLM_FULL_MAX_CHARS` (modo completo, por defecto más alto). El análisis de directorio (**Generar análisis IA**) es independiente.
9. Indica la **unidad de cifras** (miles/millones) en el formulario como referencia; no rescala automáticamente los números del PDF.
10. Si ya cargaste un año para una entidad, marca **Reemplazar reporte** para subir de nuevo sin borrar a mano el registro anterior.
11. Revisa alertas, KPI, bloque **Comparabilidad vs año anterior**, variación en series, gráfico de tendencia y **Recomendaciones**.

Datos en `data/` (SQLite `eeff.db` y PDFs en `data/uploads/`). Añade `data/` a backups si te interesa el histórico.

### Tests del servidor

```bash
cd server && npm test
```

`npm test` ejecuta antes **`npm run check:html-js`**: valida la sintaxis de los `<script>` inline de `index.html`. Si hay un paréntesis o llave mal cerrada, el navegador no ejecuta el tablero entero (EBITDA y EEFF). Puedes correr solo la comprobación con `npm run check:html-js`.

## Seguridad

- La clave de Google Sheets **no** se expone en el navegador; el cliente llama a `/api/sheets/values`.
- Rotar cualquier clave que haya estado en versiones antiguas del HTML en repositorios públicos.
