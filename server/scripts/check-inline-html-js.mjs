/**
 * Valida la sintaxis de cada bloque <script> inline en index.html (sin atributo src).
 * Un error de sintaxis en un bloque hace que el navegador no ejecute TODO ese script
 * (EBITDA + EEFF dejan de funcionar sin un mensaje claro en el servidor).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, '..', '..', 'index.html');

let html;
try {
  html = fs.readFileSync(htmlPath, 'utf8');
} catch (e) {
  console.error(`check-inline-html-js: no se pudo leer ${htmlPath}: ${e.message}`);
  process.exit(1);
}

const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;
let m;
let ok = 0;

while ((m = re.exec(html)) !== null) {
  const attrs = m[1] || '';
  if (/\bsrc\s*=/i.test(attrs)) continue;

  const code = m[2].trim();
  if (!code) continue;

  const line = (html.slice(0, m.index).match(/\n/g) || []).length + 1;
  ok += 1;

  try {
    new Function(code);
  } catch (e) {
    console.error(`check-inline-html-js: error de sintaxis en bloque inline #${ok} (~línea ${line} de index.html)`);
    console.error(`  ${e.message}`);
    process.exit(1);
  }
}

if (ok === 0) {
  console.error('check-inline-html-js: no se encontraron <script> inline en index.html');
  process.exit(1);
}

console.log(`check-inline-html-js: OK — ${ok} bloque(s) inline válidos (${path.relative(process.cwd(), htmlPath)})`);
