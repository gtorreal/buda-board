'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const MAX_OCR_PAGES = Math.min(Math.max(Number(process.env.EEFF_OCR_MAX_PAGES || 20), 1), 40);
const OCR_DPI = Math.min(Math.max(Number(process.env.EEFF_OCR_DPI || 150), 72), 300);
const PAGE_TIMEOUT_MS = Math.min(Math.max(Number(process.env.EEFF_OCR_PAGE_TIMEOUT_MS || 60000), 5000), 180000);

/**
 * @param {Buffer} pdfBuffer
 * @param {number} numpages
 * @param {import('fastify').FastifyBaseLogger | null} log
 * @returns {Promise<{ text: string, attempted: boolean, error: string | null }>}
 */
async function tryOcrPdfBuffer(pdfBuffer, numpages, log = null) {
  const wantOcr = String(process.env.EEFF_OCR || '').trim() === '1';
  if (!wantOcr) {
    return { text: '', attempted: false, error: null };
  }

  let tmp;
  try {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eeff-ocr-'));
    const pdfPath = path.join(tmp, 'doc.pdf');
    fs.writeFileSync(pdfPath, pdfBuffer);

    const pages = Math.min(numpages > 0 ? numpages : MAX_OCR_PAGES, MAX_OCR_PAGES);
    if (pages < 1) {
      return { text: '', attempted: true, error: 'no_pages' };
    }

    const parts = [];
    for (let p = 1; p <= pages; p++) {
      const outPrefix = path.join(tmp, `scan_${p}`);
      const before = new Set(fs.readdirSync(tmp));
      try {
        await execFileAsync(
          'pdftoppm',
          ['-png', '-f', String(p), '-l', String(p), '-r', String(OCR_DPI), pdfPath, outPrefix],
          { timeout: PAGE_TIMEOUT_MS },
        );
      } catch (e) {
        if (log) log.warn({ err: String(e.message || e), page: p }, 'eeff_pdftoppm_fail');
        return {
          text: parts.join('\n\n'),
          attempted: true,
          error: `pdftoppm falló (¿instalaste poppler?): ${String(e.message || e).slice(0, 160)}`,
        };
      }

      const created = fs.readdirSync(tmp).filter((f) => !before.has(f) && f.endsWith('.png'));
      const imgName = created[0];
      if (!imgName) {
        if (log) log.warn({ page: p }, 'eeff_ocr_no_png');
        break;
      }
      const imgPath = path.join(tmp, imgName);
      try {
        const { stdout } = await execFileAsync('tesseract', [imgPath, 'stdout', '-l', 'spa+eng'], {
          timeout: PAGE_TIMEOUT_MS,
          maxBuffer: 20 * 1024 * 1024,
          encoding: 'utf8',
        });
        if (stdout) parts.push(stdout);
      } catch (e) {
        if (log) log.warn({ err: String(e.message || e), page: p }, 'eeff_tesseract_fail');
        return {
          text: parts.join('\n\n'),
          attempted: true,
          error: `tesseract falló (¿instalaste tesseract + spa+eng?): ${String(e.message || e).slice(0, 160)}`,
        };
      }
      try {
        fs.unlinkSync(imgPath);
      } catch (_) {}
    }

    return { text: parts.join('\n\n'), attempted: true, error: null };
  } catch (e) {
    return { text: '', attempted: true, error: String(e.message || e).slice(0, 200) };
  } finally {
    if (tmp) {
      try {
        fs.rmSync(tmp, { recursive: true, force: true });
      } catch (_) {}
    }
  }
}

module.exports = { tryOcrPdfBuffer, MAX_OCR_PAGES };
