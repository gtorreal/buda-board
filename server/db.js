'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function openDb(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'eeff.db');
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS eeff_reports (
      id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL,
      entity_label TEXT,
      fiscal_year INTEGER NOT NULL,
      currency TEXT DEFAULT 'USD',
      report_type TEXT,
      audit_version TEXT,
      pdf_filename TEXT,
      pdf_path TEXT,
      normalized_json TEXT NOT NULL,
      ratios_json TEXT,
      llm_analysis_json TEXT,
      extraction_status TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_eeff_entity ON eeff_reports(entity_id);
    CREATE INDEX IF NOT EXISTS idx_eeff_year ON eeff_reports(fiscal_year);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_eeff_entity_year ON eeff_reports(entity_id, fiscal_year);
  `);
  return db;
}

function rowToReport(row) {
  if (!row) return null;
  return {
    id: row.id,
    entityId: row.entity_id,
    entityLabel: row.entity_label,
    fiscalYear: row.fiscal_year,
    currency: row.currency,
    reportType: row.report_type,
    auditVersion: row.audit_version,
    pdfFilename: row.pdf_filename,
    pdfPath: row.pdf_path,
    normalized: JSON.parse(row.normalized_json),
    ratios: row.ratios_json ? JSON.parse(row.ratios_json) : null,
    llmAnalysis: row.llm_analysis_json ? JSON.parse(row.llm_analysis_json) : null,
    extractionStatus: row.extraction_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = { openDb, rowToReport };
