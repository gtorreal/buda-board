'use strict';

const MAX_DEFAULT = 14000;

/**
 * @param {string} text
 * @param {number} [maxChars]
 * @returns {{ suggestions: object, confidenceNotes: string[], warnings: string[], charCount: number }}
 */
function inferEeffMetadata(text, maxChars = MAX_DEFAULT) {
  const slice = String(text || '').slice(0, maxChars);
  const confidenceNotes = [];
  const warnings = [];

  let fiscalYear = null;
  const decM = slice.match(/31\s+de\s+diciembre\s+de\s+(20\d{2})\b/i);
  if (decM) {
    fiscalYear = parseInt(decM[1], 10);
    confidenceNotes.push('Año fiscal sugerido por cierre al 31 de diciembre en el texto.');
  }
  if (fiscalYear == null) {
    const ej = slice.match(/ejercicio[^\n]{0,100}?\b(20\d{2})\b/i);
    if (ej) {
      fiscalYear = parseInt(ej[1], 10);
      confidenceNotes.push('Año fiscal sugerido por mención de ejercicio.');
    }
  }
  if (fiscalYear == null) {
    const head = slice.split(/\r?\n/).slice(0, 40).join('\n');
    const years = [];
    for (const m of head.matchAll(/\b(20\d{2})\b/g)) {
      const y = parseInt(m[1], 10);
      if (y >= 2000 && y <= 2099 && !years.includes(y)) years.push(y);
    }
    if (years.length === 1) {
      fiscalYear = years[0];
      confidenceNotes.push('Único año de 4 dígitos detectado al inicio del texto (heurística débil).');
    }
  }

  let currency = null;
  if (/\bCLP\b/i.test(slice) || /pesos?\s+chilenos?/i.test(slice)) currency = 'CLP';
  else if (/\bUSD\b/i.test(slice) || /d[oó]lares?\b/i.test(slice)) currency = 'USD';
  else if (/\bPEN\b/i.test(slice) || /\bsoles?\b/i.test(slice)) currency = 'PEN';
  else if (/\bCOP\b/i.test(slice) || /pesos?\s+colombianos?/i.test(slice)) currency = 'COP';

  let reportType = null;
  if (/estados?\s+financieros?\s+consolidad/i.test(slice) || /informaci[oó]n\s+consolidad/i.test(slice)) {
    reportType = 'consolidated';
    confidenceNotes.push('Tipo «consolidado» por lenguaje del documento.');
  } else if (/\bchile\b/i.test(slice) && /estados?\s+financieros?/i.test(slice)) {
    reportType = 'chile';
  }

  let amountUnit = null;
  if (/miles\s+de\s+(pesos|d[oó]lares|UF)\b/i.test(slice)) {
    amountUnit = 'thousands';
    confidenceNotes.push('Unidad «miles» detectada en notas o encabezado.');
  } else if (/millones\s+de\s+(pesos|d[oó]lares)\b/i.test(slice)) {
    amountUnit = 'millions';
    confidenceNotes.push('Unidad «millones» detectada en notas o encabezado.');
  }

  let entityLabel = null;
  const rs = slice.match(/raz[oó]n\s+social\s*[:\s]+([^\n]+)/i);
  if (rs) {
    entityLabel = rs[1].trim().replace(/\s+/g, ' ').slice(0, 200);
    confidenceNotes.push('Nombre sugerido por «razón social» (revisar).');
  }

  if (slice.length < 200) {
    warnings.push('Muy poco texto para inferir metadatos; revisa sugerencias con cuidado.');
  }

  return {
    suggestions: {
      fiscalYear,
      currency,
      reportType,
      amountUnit,
      entityLabel,
    },
    confidenceNotes,
    warnings,
    charCount: slice.length,
  };
}

function inferEeffMetadataPreview(text, numpages) {
  const inf = inferEeffMetadata(text);
  return {
    suggestions: inf.suggestions,
    confidenceNotes: inf.confidenceNotes,
    warnings: inf.warnings,
    charCount: String(text || '').length,
    numpages: Number(numpages) || 0,
  };
}

module.exports = { inferEeffMetadata, inferEeffMetadataPreview };
