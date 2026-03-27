'use strict';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const { computeSanityWarnings } = require('./normalize');

const EXTRACT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['balanceSheet', 'incomeStatement', 'cashFlow'],
  properties: {
    balanceSheet: {
      type: 'object',
      additionalProperties: false,
      required: [
        'totalAssets',
        'currentAssets',
        'nonCurrentAssets',
        'totalLiabilities',
        'currentLiabilities',
        'nonCurrentLiabilities',
        'equity',
      ],
      properties: {
        totalAssets: { type: ['number', 'null'] },
        currentAssets: { type: ['number', 'null'] },
        nonCurrentAssets: { type: ['number', 'null'] },
        totalLiabilities: { type: ['number', 'null'] },
        currentLiabilities: { type: ['number', 'null'] },
        nonCurrentLiabilities: { type: ['number', 'null'] },
        equity: { type: ['number', 'null'] },
      },
    },
    incomeStatement: {
      type: 'object',
      additionalProperties: false,
      required: [
        'revenue',
        'costOfSales',
        'grossProfit',
        'operatingExpenses',
        'operatingIncome',
        'financialResult',
        'incomeTax',
        'netIncome',
      ],
      properties: {
        revenue: { type: ['number', 'null'] },
        costOfSales: { type: ['number', 'null'] },
        grossProfit: { type: ['number', 'null'] },
        operatingExpenses: { type: ['number', 'null'] },
        operatingIncome: { type: ['number', 'null'] },
        financialResult: { type: ['number', 'null'] },
        incomeTax: { type: ['number', 'null'] },
        netIncome: { type: ['number', 'null'] },
      },
    },
    cashFlow: {
      type: 'object',
      additionalProperties: false,
      required: ['operating', 'investing', 'financing', 'netChangeInCash'],
      properties: {
        operating: { type: ['number', 'null'] },
        investing: { type: ['number', 'null'] },
        financing: { type: ['number', 'null'] },
        netChangeInCash: { type: ['number', 'null'] },
      },
    },
  },
};

function llmExtractEnabled() {
  return (
    Boolean(String(process.env.OPENAI_API_KEY || '').trim()) &&
    String(process.env.EEFF_LLM_EXTRACT || '').trim() === '1'
  );
}

const LLM_SECTIONS = ['balanceSheet', 'incomeStatement', 'cashFlow'];

function deepMergeNumericSection(target, patch) {
  if (!patch || typeof patch !== 'object') return;
  for (const k of Object.keys(patch)) {
    const pv = patch[k];
    if (pv == null || typeof pv !== 'number' || Number.isNaN(pv)) continue;
    if (target[k] == null || target[k] === null) target[k] = pv;
  }
}

/**
 * Overwrite balance / ER / flujo with LLM output: numbers apply; null clears the field.
 * @param {object} normalized
 * @param {object} patch
 */
function applyFullLlmExtract(normalized, patch) {
  if (!patch || typeof patch !== 'object') return;
  for (const sec of LLM_SECTIONS) {
    if (!patch[sec] || typeof patch[sec] !== 'object') continue;
    const target = normalized[sec];
    if (!target || typeof target !== 'object') continue;
    for (const k of Object.keys(target)) {
      if (!Object.prototype.hasOwnProperty.call(patch[sec], k)) continue;
      const v = patch[sec][k];
      if (v != null && typeof v === 'number' && !Number.isNaN(v)) {
        target[k] = v;
      } else {
        target[k] = null;
      }
    }
  }
}

async function callOpenAiExtract(apiKey, model, system, user) {
  const body = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'eeff_numeric_extract',
        strict: true,
        schema: EXTRACT_SCHEMA,
      },
    },
  };
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    const err = new Error(`API_${res.status}`);
    err.detail = errText.slice(0, 200);
    throw err;
  }
  const data = await res.json();
  const content =
    data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) {
    throw new Error('EMPTY');
  }
  try {
    return JSON.parse(content);
  } catch {
    throw new Error('BAD_JSON');
  }
}

/**
 * Fills only null numeric fields from LLM output; discards merge if sanity warnings increase.
 * @param {string} textSample
 * @param {object} normalized - normalizeFromPdfText result (mutated on success)
 * @returns {Promise<{ used: boolean, warnings: string[] }>}
 */
async function tryLlmAugmentNormalized(textSample, normalized) {
  const warnings = [];
  if (!llmExtractEnabled()) {
    return { used: false, warnings };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const maxChars = Math.min(Number(process.env.EEFF_LLM_EXTRACT_MAX_CHARS || 28000), 100000);
  const slice = String(textSample || '').slice(0, maxChars);

  const before = computeSanityWarnings(normalized);
  const beforeCount = before.warnings.length;

  const system = `Eres asistente contable. Extrae SOLO cifras que aparezcan explícitamente en el texto de estados financieros (IFRS/NIIF, español). 
Responde JSON según el schema. Usa null si no encuentras un dato. No inventes ni extrapoles. Miles/millones: respeta el texto.`;

  const user = `Fragmento de EEFF (puede estar truncado):\n---\n${slice}\n---\n\nDevuelve un único JSON con balanceSheet, incomeStatement y cashFlow (números o null).`;

  let patch;
  try {
    patch = await callOpenAiExtract(apiKey, model, system, user);
  } catch (e) {
    if (String(e.message || '').startsWith('API_')) {
      warnings.push(
        `Extracción IA omitida: API ${e.message.replace('API_', '')} (${e.detail || ''}).`.slice(0, 220),
      );
    } else if (e.message === 'EMPTY') {
      warnings.push('Extracción IA omitida: respuesta vacía.');
    } else if (e.message === 'BAD_JSON') {
      warnings.push('Extracción IA omitida: JSON inválido.');
    } else {
      warnings.push(`Extracción IA omitida: ${String(e.message || e).slice(0, 200)}`);
    }
    return { used: false, warnings };
  }
  if (!patch || typeof patch !== 'object') {
    warnings.push('Extracción IA omitida: JSON inválido.');
    return { used: false, warnings };
  }

  const trial = JSON.parse(JSON.stringify(normalized));
  deepMergeNumericSection(trial.balanceSheet, patch.balanceSheet);
  deepMergeNumericSection(trial.incomeStatement, patch.incomeStatement);
  deepMergeNumericSection(trial.cashFlow, patch.cashFlow);

  const after = computeSanityWarnings(trial);
  if (after.warnings.length > beforeCount) {
    warnings.push(
      'Propuesta de extracción IA descartada: empeoraba las alertas de sanidad respecto a la extracción por reglas.',
    );
    return { used: false, warnings };
  }

  normalized.balanceSheet = trial.balanceSheet;
  normalized.incomeStatement = trial.incomeStatement;
  normalized.cashFlow = trial.cashFlow;
  warnings.push('Se aplicó extracción asistida (IA) solo en campos que estaban vacíos; revisa cifras.');
  return { used: true, warnings };
}

/**
 * Full replace of numeric sections from LLM (user opted in). Does not discard on sanity; adds warnings.
 * @param {string} textSample
 * @param {object} normalized
 * @returns {Promise<{ used: boolean, warnings: string[] }>}
 */
async function tryLlmFullExtractNormalized(textSample, normalized) {
  const warnings = [];
  if (!llmExtractEnabled()) {
    return { used: false, warnings };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const maxChars = Math.min(
    Number(process.env.EEFF_LLM_FULL_MAX_CHARS || process.env.EEFF_LLM_EXTRACT_MAX_CHARS || 56000),
    120000,
  );
  const slice = String(textSample || '').slice(0, maxChars);
  const meta = normalized.metadata || {};

  const system = `Eres contable senior. Debes extraer del texto los importes del balance, estado de resultados y flujo de efectivo (NIIF/IFRS, español).
Devuelve un único JSON según el schema. Usa los metadatos del usuario (año fiscal, moneda) para elegir la columna correcta en tablas comparativas.
Solo números que puedas ubicar en el texto; si una partida no aparece o es ilegible en el fragmento, usa null.
No inventes cifras ni completes por analogía. Respeta miles/millones y signos como en el documento.`;

  const user = `Metadatos del formulario (prioritarios para columna de ejercicio y lectura):
- Año fiscal: ${meta.fiscalYear ?? '—'}
- Moneda: ${meta.currency ?? '—'}
- Unidad referida (notas): ${meta.amountUnit || 'sin indicar'}
- Entidad (referencia): ${meta.entityLabel || meta.entityId || '—'}

Texto del PDF (puede estar truncado; extrae lo que sea explícito):
---
${slice}
---

Responde con balanceSheet, incomeStatement y cashFlow completos (número o null por campo).`;

  let patch;
  try {
    patch = await callOpenAiExtract(apiKey, model, system, user);
  } catch (e) {
    if (String(e.message || '').startsWith('API_')) {
      warnings.push(
        `Extracción IA completa omitida: error API (${e.message.replace('API_', '')}) ${e.detail ? e.detail.slice(0, 120) : ''}.`,
      );
    } else if (e.message === 'EMPTY') {
      warnings.push('Extracción IA completa omitida: respuesta vacía.');
    } else if (e.message === 'BAD_JSON') {
      warnings.push('Extracción IA completa omitida: JSON inválido.');
    } else {
      warnings.push(`Extracción IA completa omitida: ${String(e.message || e).slice(0, 200)}`);
    }
    return { used: false, warnings };
  }

  if (!patch || typeof patch !== 'object') {
    warnings.push('Extracción IA completa omitida: JSON inválido.');
    return { used: false, warnings };
  }

  applyFullLlmExtract(normalized, patch);
  if (!normalized.extraction) normalized.extraction = {};
  normalized.extraction.llmFullExtractApplied = true;

  warnings.push(
    'Extracción completa aplicada por IA: todas las cifras del resumen fueron sustituidas por la propuesta del modelo. Contrasta siempre con el PDF.',
  );
  const sanity = computeSanityWarnings(normalized);
  if (sanity.warnings.length) {
    warnings.push(
      `Tras IA completa persisten ${sanity.warnings.length} alerta(s) de sanidad; corrige manualmente o vuelve a subir.`,
    );
  }

  return { used: true, warnings };
}

module.exports = {
  tryLlmAugmentNormalized,
  tryLlmFullExtractNormalized,
  llmExtractEnabled,
  applyFullLlmExtract,
  EXTRACT_SCHEMA,
};
