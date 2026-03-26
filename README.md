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

Abre **http://localhost:3847** (el servidor sirve `index.html` y las APIs). No uses `file://`; el login y el proxy de Sheets requieren el mismo origen.

### Contraseña como hash (recomendado)

```bash
printf 'tu_password' | shasum -a 256
```

Copia el hex en `BUDA_AUTH_PASSWORD_SHA256` y elimina `BUDA_AUTH_PASSWORD`.

## EEFF auditados

1. Inicia sesión.
2. Pestaña **EEFF auditados**.
3. Sube un PDF (texto seleccionable funciona mejor que escaneos).
4. Revisa partidas y ratios; pulsa **Generar análisis IA** si configuraste `OPENAI_API_KEY`.

Datos en `data/` (SQLite `eeff.db` y PDFs en `data/uploads/`). Añade `data/` a backups si te interesa el histórico.

## Seguridad

- La clave de Google Sheets **no** se expone en el navegador; el cliente llama a `/api/sheets/values`.
- Rotar cualquier clave que haya estado en versiones antiguas del HTML en repositorios públicos.
