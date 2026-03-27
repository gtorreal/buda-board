'use strict';

const pdfParse = require('pdf-parse');
const { tryOcrPdfBuffer } = require('./ocrPdf');

const MIN_CHARS_PER_PAGE_HINT = 100;

/**
 * @param {Buffer} buffer
 * @param {object} [opts]
 * @param {import('fastify').FastifyBaseLogger | null} [opts.log]
 * @returns {Promise<{ text: string, numpages: number, source: 'pdf-parse'|'ocr'|'mixed', ocrAttempted: boolean, ocrMetaWarnings: string[] }>}
 */
async function extractTextFromPdf(buffer, opts = {}) {
  const log = opts.log || null;
  const data = await pdfParse(buffer);
  let text = data.text || '';
  const numpages = data.numpages || 0;
  let source = 'pdf-parse';
  let ocrAttempted = false;
  const ocrMetaWarnings = [];

  const trimmed = text.trim().length;
  const short = numpages > 0 && trimmed < numpages * MIN_CHARS_PER_PAGE_HINT;

  if (short || trimmed === 0) {
    const ocr = await tryOcrPdfBuffer(buffer, numpages, log);
    ocrAttempted = ocr.attempted;
    if (ocr.text && ocr.text.trim()) {
      if (trimmed > 0) {
        source = 'mixed';
        text = `${text}\n\n--- OCR ---\n${ocr.text}`;
      } else {
        source = 'ocr';
        text = ocr.text;
      }
    } else if (ocr.attempted && ocr.error) {
      ocrMetaWarnings.push(ocr.error);
    }
  }

  return {
    text,
    numpages,
    source,
    ocrAttempted,
    ocrMetaWarnings,
  };
}

module.exports = { extractTextFromPdf, MIN_CHARS_PER_PAGE_HINT };
