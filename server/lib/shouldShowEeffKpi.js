'use strict';

/**
 * Whether the EEFF detail UI should show the official KPI ratio grid.
 * Keep in sync with buda-board/index.html (renderEeffDetail KPI block).
 */
function shouldShowEeffKpi(extractionStatus, sanityWarningCount) {
  const n = Number(sanityWarningCount);
  const count = Number.isFinite(n) && n >= 0 ? n : 0;
  return extractionStatus === 'ok' && count === 0;
}

module.exports = { shouldShowEeffKpi };
