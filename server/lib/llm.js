'use strict';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

const ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['executiveSummary', 'trends', 'risks', 'recommendations', 'boardQuestions'],
  properties: {
    executiveSummary: { type: 'string', description: '2-4 frases, solo datos del JSON' },
    trends: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'detail'],
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
        },
      },
    },
    risks: {
      type: 'array',
      items: { type: 'string' },
    },
    recommendations: {
      type: 'array',
      items: { type: 'string' },
    },
    boardQuestions: {
      type: 'array',
      items: { type: 'string' },
    },
  },
};

/**
 * @param {object} payload - series, ratios, trendSummary
 * @returns {Promise<object>}
 */
async function runFinancialAnalysis(payload) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      skipped: true,
      reason: 'OPENAI_API_KEY no configurada',
    };
  }

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const system = `Eres analista financiero para directorio. Solo puedes usar cifras y ratios presentes en el JSON de entrada. Si falta un dato, dilo explícitamente sin inventar números. Responde en español.`;

  const user = `Datos para análisis (JSON):\n${JSON.stringify(payload, null, 2)}\n\nProduce el análisis según el schema requerido.`;

  const body = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'eeff_board_analysis',
        strict: true,
        schema: ANALYSIS_SCHEMA,
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
    throw new Error(`OpenAI error ${res.status}: ${errText.slice(0, 500)}`);
  }

  const data = await res.json();
  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) throw new Error('OpenAI: empty response');
  return JSON.parse(content);
}

module.exports = { runFinancialAnalysis, ANALYSIS_SCHEMA };
