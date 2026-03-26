'use strict';

const pdfParse = require('pdf-parse');

/**
 * @param {Buffer} buffer
 * @returns {Promise<{ text: string, numpages: number }>}
 */
async function extractTextFromPdf(buffer) {
  const data = await pdfParse(buffer);
  return {
    text: data.text || '',
    numpages: data.numpages || 0,
  };
}

module.exports = { extractTextFromPdf };
