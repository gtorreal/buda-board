/**
 * Single source of truth for Google Sheets data used by the EBITDA board.
 * Fetches via /api/sheets/values, parses with BudaSheetParsers, exposes state + subscribe().
 */
'use strict';

(function (global) {
  var SHEET_FETCH_TIMEOUT_MS = 35000;

  /**
   * Declarative list of sheet sources. `parsedKey` is the key on state.parsed.
   */
  var SHEET_SOURCES = [
    { id: 'ebitda_consolidated', parsedKey: 'consolidated', sheetName: 'EBITDA_LIVE', range: 'A3:CZ80', kind: 'ebitda' },
    { id: 'ebitda_chile', parsedKey: 'chile', sheetName: 'EBITDA CHI_LIVE', range: 'A3:CZ80', kind: 'ebitda' },
    { id: 'ebitda_peru', parsedKey: 'peru', sheetName: 'EBITDA PEN_LIVE', range: 'A3:CZ80', kind: 'ebitda' },
    { id: 'ebitda_colombia', parsedKey: 'colombia', sheetName: 'EBITDA COL_LIVE', range: 'A3:CZ80', kind: 'ebitda' },
    { id: 'metrics_live', parsedKey: 'metrics', sheetName: 'METRICS_LIVE', range: 'A1:CZ100', kind: 'metrics' },
    { id: 'rrhh_live', parsedKey: 'rrhh', sheetName: 'RRHH_LIVE', range: 'A25:CZ35', kind: 'rrhh' },
    { id: 'loans_live', parsedKey: 'loans', sheetName: 'LOANS_LIVE', range: 'A1:CZ20', kind: 'loans' },
  ];

  var state = {
    status: 'idle',
    error: null,
    fetchedAt: null,
    googleSheetsConfigured: null,
    parsed: {},
    raw: {},
  };

  var listeners = new Set();
  var loadPromise = null;

  function budaSameOriginUrl(url) {
    if (!url || String(url).indexOf('http') === 0) return url;
    var o = global.location && global.location.origin;
    return o ? o + url : url;
  }

  function fetchWithTimeout(url, options, ms) {
    var ctrl = new AbortController();
    var tid = setTimeout(function () {
      ctrl.abort();
    }, ms);
    return fetch(
      budaSameOriginUrl(url),
      Object.assign({}, options || {}, { signal: ctrl.signal, cache: 'no-store' }),
    ).finally(function () {
      clearTimeout(tid);
    });
  }

  function getAuthHeaders() {
    if (typeof global.budaAuthHeaders === 'function') return global.budaAuthHeaders();
    return {};
  }

  function getPublicState() {
    return {
      status: state.status,
      error: state.error,
      fetchedAt: state.fetchedAt,
      googleSheetsConfigured: state.googleSheetsConfigured,
      parsed: state.parsed,
      raw: state.raw,
    };
  }

  function notify() {
    var snap = getPublicState();
    listeners.forEach(function (fn) {
      try {
        fn(snap);
      } catch (e) {
        console.error('[BudaSheetDataStore] subscriber error', e);
      }
    });
  }

  function setState(partial) {
    Object.assign(state, partial);
    notify();
  }

  async function fetchSheetValues(sheetName, range) {
    var url =
      '/api/sheets/values?sheetName=' +
      encodeURIComponent(sheetName) +
      '&range=' +
      encodeURIComponent(range || 'A3:CZ80');
    var ctrl = new AbortController();
    var tid = setTimeout(function () {
      ctrl.abort();
    }, SHEET_FETCH_TIMEOUT_MS);
    var res;
    try {
      res = await fetch(budaSameOriginUrl(url), {
        headers: getAuthHeaders(),
        signal: ctrl.signal,
        cache: 'no-store',
      });
    } catch (e) {
      clearTimeout(tid);
      if (e && e.name === 'AbortError') {
        throw new Error(
          'Tiempo de espera al leer «' +
            sheetName +
            '». El servidor o Google no respondieron a tiempo; revisa .env, red o nombres de pestañas.',
        );
      }
      throw e;
    }
    clearTimeout(tid);
    if (res.status === 401) {
      if (global.sessionStorage) global.sessionStorage.removeItem('buda_token');
      throw new Error('Sesión expirada; vuelve a iniciar sesión.');
    }
    if (res.status === 503) {
      throw new Error('Google Sheets no configurado en el servidor (GOOGLE_SHEETS_* en .env).');
    }
    if (!res.ok) {
      var msg = 'Error al leer Google Sheets (' + res.status + ')';
      try {
        var ej = await res.json();
        if (ej.detail) msg += ': ' + String(ej.detail).slice(0, 280);
        else if (ej.error) msg = String(ej.error) + (ej.message ? ' — ' + ej.message : '');
      } catch (e2) {
        /* ignore */
      }
      throw new Error(msg + ' [hoja: ' + sheetName + ']');
    }
    var json = await res.json();
    return json.values || [];
  }

  function parseRows(kind, rows) {
    var P = global.BudaSheetParsers;
    if (!P) throw new Error('Falta sheet-parsers.js antes de sheet-data-store.js.');
    if (kind === 'ebitda') return P.parseSheet(rows);
    if (kind === 'metrics') return P.parseMetrics(rows);
    if (kind === 'rrhh') return P.parseRRHH(rows);
    if (kind === 'loans') return P.parseLoans(rows);
    throw new Error('Unknown sheet kind: ' + kind);
  }

  async function doLoad(options) {
    var onHint = options && options.onHint;
    if (onHint) onHint('Paso 1/4: leyendo configuración del servidor…');

    var cfgRes;
    try {
      cfgRes = await fetchWithTimeout('/api/config', {}, 12000);
    } catch (e) {
      throw new Error(
        e && e.name === 'AbortError'
          ? 'El servidor no respondió a /api/config a tiempo. ¿Está corriendo npm start en buda-board/server?'
          : 'No se pudo contactar al servidor: ' + (e && e.message ? e.message : String(e)),
      );
    }
    if (!cfgRes.ok) {
      throw new Error('HTTP ' + cfgRes.status + ' al leer /api/config. ¿Servidor correcto en este puerto?');
    }
    var cfg = await cfgRes.json().catch(function () {
      return {};
    });

    if (!cfg.googleSheetsConfigured) {
      setState({
        status: 'idle',
        error: null,
        fetchedAt: null,
        googleSheetsConfigured: false,
        parsed: {},
        raw: {},
      });
      return { ok: false, reason: 'not_configured' };
    }

    if (onHint) onHint('Paso 2/4: descargando hojas desde Google (varias peticiones)…');

    var raw = {};
    var valuesList = await Promise.all(
      SHEET_SOURCES.map(function (src) {
        return fetchSheetValues(src.sheetName, src.range).then(function (values) {
          raw[src.id] = values;
          return values;
        });
      }),
    );

    var parsed = {};
    for (var i = 0; i < SHEET_SOURCES.length; i++) {
      var src = SHEET_SOURCES[i];
      parsed[src.parsedKey] = parseRows(src.kind, valuesList[i]);
    }

    setState({
      status: 'ready',
      error: null,
      fetchedAt: Date.now(),
      googleSheetsConfigured: true,
      parsed: parsed,
      raw: raw,
    });

    return { ok: true };
  }

  var exports = {
    SHEET_SOURCES: SHEET_SOURCES,

    getState: getPublicState,

    subscribe: function (fn) {
      if (typeof fn !== 'function') return function () {};
      listeners.add(fn);
      return function unsubscribe() {
        listeners.delete(fn);
      };
    },

    /**
     * Loads /api/config then all configured sheets. Deduplicates concurrent calls.
     * @param {{ onHint?: (text: string) => void }} [options]
     * @returns {Promise<{ ok: true } | { ok: false, reason: 'not_configured' }>}
     */
    load: function (options) {
      if (loadPromise) return loadPromise;
      setState({ status: 'loading', error: null });
      loadPromise = doLoad(options || {})
        .catch(function (err) {
          var msg = err && err.message ? err.message : String(err);
          setState({ status: 'error', error: msg });
          throw err;
        })
        .finally(function () {
          loadPromise = null;
        });
      return loadPromise;
    },
  };

  global.BudaSheetDataStore = exports;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
