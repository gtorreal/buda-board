'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Fastify = require('fastify');
const fastifyJwt = require('@fastify/jwt');
const fastifyMultipart = require('@fastify/multipart');
const fastifyCors = require('@fastify/cors');

const { openDb, rowToReport } = require('./db');
const { extractTextFromPdf } = require('./lib/extractPdf');
const { normalizeFromPdfText } = require('./lib/normalize');
const { computeRatios, trendSummary, yoyDeltas } = require('./lib/ratios');
const { runFinancialAnalysis } = require('./lib/llm');

const PORT = Number(process.env.PORT || 3847);
const DATA_DIR = process.env.BUDA_DATA_DIR || path.join(__dirname, '..', 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '';
const GOOGLE_API_KEY = process.env.GOOGLE_SHEETS_API_KEY || '';

function sha256hex(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

/** Used only when neither BUDA_AUTH_PASSWORD nor BUDA_AUTH_PASSWORD_SHA256 is set (local dev). */
const DEFAULT_DEV_PASSWORD = 'buda-dev';

function authPasswordOk(password) {
  const shaEnv = process.env.BUDA_AUTH_PASSWORD_SHA256;
  const plainEnv = process.env.BUDA_AUTH_PASSWORD;

  if (shaEnv && String(shaEnv).trim() !== '') {
    const expected = String(shaEnv).trim().replace(/\s+/g, '');
    const h = sha256hex(password);
    try {
      return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(expected, 'hex'));
    } catch {
      return false;
    }
  }

  const effectivePlain =
    plainEnv != null && String(plainEnv).trim() !== ''
      ? String(plainEnv).trim()
      : DEFAULT_DEV_PASSWORD;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(password, 'utf8'),
      Buffer.from(effectivePlain, 'utf8'),
    );
  } catch {
    return false;
  }
}

function authEmailOk(email) {
  const raw =
    process.env.BUDA_AUTH_EMAIL ||
    'admin@buda.com,usuario@buda.com';
  const allowed = String(raw)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(String(email || '').trim().toLowerCase());
}

async function buildServer() {
  const db = openDb(DATA_DIR);
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  const app = Fastify({ logger: true });

  if (!process.env.BUDA_AUTH_PASSWORD_SHA256 && !process.env.BUDA_AUTH_PASSWORD) {
    app.log.warn(
      `Auth: ninguna contraseña en .env — usando la de desarrollo "${DEFAULT_DEV_PASSWORD}" (define BUDA_AUTH_PASSWORD en producción).`,
    );
  }

  await app.register(fastifyCors, {
    origin: true,
    credentials: true,
  });

  await app.register(fastifyJwt, {
    secret: process.env.BUDA_JWT_SECRET || 'dev-secret-change-in-production-min-32-chars!!',
    sign: { expiresIn: '7d' },
  });

  await app.register(fastifyMultipart, {
    limits: { fileSize: 50 * 1024 * 1024 },
  });

  const requireAuth = async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  };

  app.post('/api/auth/login', async (request, reply) => {
    const body = request.body || {};
    const email = body.email || '';
    const password = body.password || '';
    if (!authEmailOk(email) || !authPasswordOk(password)) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }
    const token = await reply.jwtSign({ sub: email, v: 1 });
    return { token };
  });

  app.get('/api/auth/me', { preHandler: requireAuth }, async (request) => ({
    email: request.user.sub,
  }));

  app.get('/api/sheets/values', { preHandler: requireAuth }, async (request, reply) => {
    const sheetName = request.query.sheetName || '';
    const customRange = request.query.range || 'A3:CZ80';
    if (!SPREADSHEET_ID || !GOOGLE_API_KEY) {
      return reply.code(503).send({ error: 'sheets_not_configured' });
    }
    const range = encodeURIComponent(`${sheetName}!${customRange}`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?key=${GOOGLE_API_KEY}&valueRenderOption=UNFORMATTED_VALUE`;
    const res = await fetch(url);
    if (!res.ok) {
      const t = await res.text();
      return reply.code(res.status).send({ error: 'sheets_fetch_failed', detail: t.slice(0, 200) });
    }
    const json = await res.json();
    return { values: json.values || [] };
  });

  app.get('/api/eeff/reports', { preHandler: requireAuth }, async () => {
    const rows = db.prepare(
      `SELECT id, entity_id, entity_label, fiscal_year, currency, report_type, audit_version,
              pdf_filename, extraction_status, created_at, updated_at
       FROM eeff_reports ORDER BY entity_id, fiscal_year DESC`,
    ).all();
    return rows.map((r) => ({
      id: r.id,
      entityId: r.entity_id,
      entityLabel: r.entity_label,
      fiscalYear: r.fiscal_year,
      currency: r.currency,
      reportType: r.report_type,
      auditVersion: r.audit_version,
      pdfFilename: r.pdf_filename,
      extractionStatus: r.extraction_status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  });

  app.get('/api/eeff/reports/:id', { preHandler: requireAuth }, async (request, reply) => {
    const row = db.prepare('SELECT * FROM eeff_reports WHERE id = ?').get(request.params.id);
    const rep = rowToReport(row);
    if (!rep) return reply.code(404).send({ error: 'not_found' });
    if (rep.ratios == null && rep.normalized) {
      rep.ratios = computeRatios(rep.normalized);
    }

    const series = db.prepare(
      `SELECT * FROM eeff_reports WHERE entity_id = ? ORDER BY fiscal_year ASC`,
    ).all(rep.entityId);
    const fullSeries = series.map((r) => {
      const n = JSON.parse(r.normalized_json);
      const ratios = r.ratios_json ? JSON.parse(r.ratios_json) : computeRatios(n);
      return { fiscalYear: r.fiscal_year, normalized: n, ratios };
    });
    const trends = trendSummary(fullSeries);
    let yoy = null;
    if (fullSeries.length >= 2) {
      const prev = fullSeries[fullSeries.length - 2].normalized;
      const curr = fullSeries[fullSeries.length - 1].normalized;
      yoy = yoyDeltas(prev, curr);
    }

    return { report: rep, series: fullSeries, trends, yoy };
  });

  app.post('/api/eeff/upload', { preHandler: requireAuth }, async (request, reply) => {
    const parts = request.parts();
    let fileBuffer = null;
    let filename = 'upload.pdf';
    const fields = {};

    for await (const part of parts) {
      if (part.type === 'file') {
        fileBuffer = await part.toBuffer();
        filename = part.filename || filename;
      } else {
        fields[part.fieldname] = part.value;
      }
    }

    if (!fileBuffer) {
      return reply.code(400).send({ error: 'file_required' });
    }

    const entityId = (fields.entityId || '').trim() || 'default';
    const entityLabel = (fields.entityLabel || '').trim();
    const fiscalYear = parseInt(fields.fiscalYear, 10) || new Date().getFullYear();
    const currency = (fields.currency || 'USD').trim();
    const reportType = (fields.reportType || 'other').trim();
    const auditVersion = (fields.auditVersion || '').trim();

    const dup = db.prepare('SELECT id FROM eeff_reports WHERE entity_id = ? AND fiscal_year = ?').get(entityId, fiscalYear);
    if (dup) {
      return reply.code(409).send({ error: 'duplicate_entity_year', id: dup.id });
    }

    const id = crypto.randomUUID();
    const pdfPath = path.join(UPLOADS_DIR, `${id}.pdf`);
    fs.writeFileSync(pdfPath, fileBuffer);

    let text = '';
    let numpages = 0;
    try {
      const ex = await extractTextFromPdf(fileBuffer);
      text = ex.text;
      numpages = ex.numpages;
    } catch (e) {
      request.log.error(e);
    }

    const normalized = normalizeFromPdfText(text, {
      entityId,
      entityLabel,
      fiscalYear,
      currency,
      reportType,
      auditVersion,
      numpages,
    });
    normalized.metadata.sourcePdfId = id;
    if (numpages) {
      normalized.extraction.warnings = normalized.extraction.warnings || [];
      normalized.extraction.warnings.push(`Páginas PDF: ${numpages}`);
    }

    const ratios = computeRatios(normalized);
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO eeff_reports (id, entity_id, entity_label, fiscal_year, currency, report_type, audit_version,
        pdf_filename, pdf_path, normalized_json, ratios_json, llm_analysis_json, extraction_status, created_at, updated_at)
       VALUES (@id, @entity_id, @entity_label, @fiscal_year, @currency, @report_type, @audit_version,
        @pdf_filename, @pdf_path, @normalized_json, @ratios_json, NULL, @extraction_status, @created_at, @updated_at)`,
    ).run({
      id,
      entity_id: entityId,
      entity_label: entityLabel,
      fiscal_year: fiscalYear,
      currency,
      report_type: reportType,
      audit_version: auditVersion,
      pdf_filename: filename,
      pdf_path: pdfPath,
      normalized_json: JSON.stringify(normalized),
      ratios_json: JSON.stringify(ratios),
      extraction_status: normalized.extraction.status,
      created_at: now,
      updated_at: now,
    });

    return { id, normalized, ratios, extractionStatus: normalized.extraction.status };
  });

  app.patch('/api/eeff/reports/:id', { preHandler: requireAuth }, async (request, reply) => {
    const row = db.prepare('SELECT * FROM eeff_reports WHERE id = ?').get(request.params.id);
    if (!row) return reply.code(404).send({ error: 'not_found' });

    const body = request.body || {};
    let normalized = JSON.parse(row.normalized_json);
    if (body.normalized && typeof body.normalized === 'object') {
      const b = body.normalized;
      // Deep-merge sections only — avoid shallow spread that replaces balanceSheet/incomeStatement with partial objects.
      if (b.balanceSheet && typeof b.balanceSheet === 'object') {
        normalized.balanceSheet = { ...normalized.balanceSheet, ...b.balanceSheet };
      }
      if (b.incomeStatement && typeof b.incomeStatement === 'object') {
        normalized.incomeStatement = { ...normalized.incomeStatement, ...b.incomeStatement };
      }
      if (b.cashFlow && typeof b.cashFlow === 'object') {
        normalized.cashFlow = { ...normalized.cashFlow, ...b.cashFlow };
      }
      if (b.metadata && typeof b.metadata === 'object') {
        normalized.metadata = { ...normalized.metadata, ...b.metadata };
      }
      if (b.extraction && typeof b.extraction === 'object') {
        normalized.extraction = { ...normalized.extraction, ...b.extraction };
      }
    }
    normalized.metadata.updatedAt = new Date().toISOString();
    const ratios = computeRatios(normalized);
    const now = new Date().toISOString();

    db.prepare(
      `UPDATE eeff_reports SET normalized_json = ?, ratios_json = ?, updated_at = ? WHERE id = ?`,
    ).run(JSON.stringify(normalized), JSON.stringify(ratios), now, request.params.id);

    return rowToReport(db.prepare('SELECT * FROM eeff_reports WHERE id = ?').get(request.params.id));
  });

  app.post('/api/eeff/reports/:id/analyze', { preHandler: requireAuth }, async (request, reply) => {
    const row = db.prepare('SELECT * FROM eeff_reports WHERE id = ?').get(request.params.id);
    if (!row) return reply.code(404).send({ error: 'not_found' });

    const entityId = row.entity_id;
    const series = db.prepare(
      `SELECT * FROM eeff_reports WHERE entity_id = ? ORDER BY fiscal_year ASC`,
    ).all(entityId);

    const fullSeries = series.map((r) => {
      const n = JSON.parse(r.normalized_json);
      const ratios = r.ratios_json ? JSON.parse(r.ratios_json) : computeRatios(n);
      return {
        fiscalYear: r.fiscal_year,
        normalized: n,
        ratios,
      };
    });

    const trends = trendSummary(fullSeries);
    let yoy = null;
    if (fullSeries.length >= 2) {
      yoy = yoyDeltas(fullSeries[fullSeries.length - 2].normalized, fullSeries[fullSeries.length - 1].normalized);
    }

    const payload = {
      entityId,
      entityLabel: row.entity_label,
      series: fullSeries,
      trends,
      yoy,
    };

    try {
      const analysis = await runFinancialAnalysis(payload);
      if (analysis.skipped) {
        return { analysis, message: analysis.reason };
      }
      const now = new Date().toISOString();
      db.prepare('UPDATE eeff_reports SET llm_analysis_json = ?, updated_at = ? WHERE id = ?').run(
        JSON.stringify(analysis),
        now,
        request.params.id,
      );
      return { analysis };
    } catch (e) {
      request.log.error(e);
      return reply.code(500).send({ error: 'llm_failed', message: e.message });
    }
  });

  app.delete('/api/eeff/reports/:id', { preHandler: requireAuth }, async (request, reply) => {
    const row = db.prepare('SELECT * FROM eeff_reports WHERE id = ?').get(request.params.id);
    if (!row) return reply.code(404).send({ error: 'not_found' });
    if (row.pdf_path && fs.existsSync(row.pdf_path)) {
      try { fs.unlinkSync(row.pdf_path); } catch (_) {}
    }
    db.prepare('DELETE FROM eeff_reports WHERE id = ?').run(request.params.id);
    return { ok: true };
  });

  const staticRoot = path.join(__dirname, '..');
  await app.register(require('@fastify/static'), {
    root: staticRoot,
    index: ['index.html'],
  });

  return app;
}

buildServer()
  .then((app) => app.listen({ port: PORT, host: '0.0.0.0' }))
  .then((addr) => {
    console.log(`Buda Board server listening on ${addr}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
