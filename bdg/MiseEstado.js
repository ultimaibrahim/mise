/**
 * ════════════════════════════════════════════════════════════════════════════
 * 🩺 MISE ESTADO — Resumen de salud de la suite para la página de estado (1.7.6g)
 * ════════════════════════════════════════════════════════════════════════════
 * - Las tiendas escriben su latido en SU hoja _ESTADO (sin activador propio).
 * - Bodega SOLO LEE las tiendas: recolecta al cierre de las 23:00 o bajo demanda (vigencia 10 min)
 *   y guarda el resumen como JSON en la hoja técnica _ESTADO_SISTEMA (una celda).
 * - obtenerEstadoSistema() es el punto de entrada de la página de estado (doGet, 1.7.6h) y de
 *   cualquier consumidor futuro (mise-web).
 */
const SHEET_ESTADO_SISTEMA = "_ESTADO_SISTEMA";
const ESTADO_VIGENCIA_MS = 10 * 60 * 1000;
const ESTADO_HISTORIAL_CIERRES = 14;
const ESTADO_DIAS_INCIDENTES = 7;
const ACTIVADORES_BDG = ["descontarSurtidoAutomatico", "ejecutarMantenimientoSemanalBDG", "onEditBodegaInstalable", "onOpenBodegaInstalable"];
const ACTIVADORES_TIENDA = ["_resetearPedidoSilencioso", "_checkAutoResetNuevoDia", "onEditTiendaInstalable", "onOpenTiendaInstalable"];
const HORA_MS = 3600 * 1000;

// Huella del catálogo (producto · activo · picking) sobre filas A4:L de VISTA_MOVIL / _SYNC.
// La MISMA función vive en bdg/MiseEstado.js: si cambia aquí, cambia allá (lo verifica estado.test.js).
function _huellaCatalogo(filas) {
  const lineas = filas.filter(r => String(r[2]).trim())
    .map(r => [String(r[2]).trim(), String(r[8]).trim().toUpperCase(), parseInt(r[11], 10) || 0].join("|")).sort();
  const txt = lineas.join("\n");
  let h = 5381;
  for (let i = 0; i < txt.length; i++) h = ((h << 5) + h + txt.charCodeAt(i)) >>> 0;
  return `${lineas.length}-${h.toString(16)}`;
}

// ── Historial de cierres nocturnos (lo alimenta MiseSmartSync.ejecutarDescuento) ─────────────
function _registrarCierre(detalle) {
  const props = PropertiesService.getScriptProperties();
  let hist = [];
  try { hist = JSON.parse(props.getProperty("HISTORIAL_CIERRES") || "[]"); } catch (e) {}
  hist.unshift(detalle);
  props.setProperty("HISTORIAL_CIERRES", JSON.stringify(hist.slice(0, ESTADO_HISTORIAL_CIERRES)));
}

function _historialCierres() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty("HISTORIAL_CIERRES") || "[]"); }
  catch (e) { return []; }
}

// ── Punto de entrada ─────────────────────────────────────────────────────────────────────────
function obtenerEstadoSistema(forzar) {
  if (!forzar) {
    const hoja = _hoja(SpreadsheetApp.getActiveSpreadsheet(), SHEET_ESTADO_SISTEMA);
    if (hoja) {
      try {
        const cache = JSON.parse(hoja.getRange(1, 1).getValue());
        if (Date.now() - Date.parse(cache.generado) < ESTADO_VIGENCIA_MS) return cache;
      } catch (e) {}
    }
  }
  return _recolectarEstadoSistema();
}

function _recolectarEstadoSistema() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const props = PropertiesService.getScriptProperties();
  const ahora = new Date();
  const resumen = {
    generado: ahora.toISOString(),
    entorno: props.getProperty("MISE_ENV") === "DEV" ? "DEV" : "PROD",
    bodega: _estadoBodega(ss),
    tiendas: {}
  };
  Object.keys(BODEGAS).forEach(key => { resumen.tiendas[key] = _estadoTienda(key, props); });
  resumen.componentes = _evaluarComponentes(resumen, ahora);
  resumen.estadoGeneral = _peorEstado(resumen.componentes.map(c => c.estado));

  let hoja = _hoja(ss, SHEET_ESTADO_SISTEMA);
  if (!hoja) {
    hoja = ss.insertSheet(SHEET_ESTADO_SISTEMA);
    try { hoja.hideSheet(); } catch (e) {}
    try { _blindarHoja(hoja, "Blindaje técnico — _ESTADO_SISTEMA"); } catch (e) {}
  }
  hoja.getRange(1, 1).setValue(JSON.stringify(resumen));
  return resumen;
}

// ── Bodega: versión, activadores, cierres, semana de cada Kardex, bajo mínimo, incidentes ────
function _estadoBodega(ss) {
  let activadores = [];
  try { activadores = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction()); } catch (e) { activadores = null; }
  const kardex = {};
  const bajoMinimo = {};
  const huellas = {};
  Object.keys(BODEGAS).forEach(key => {
    try {
      const lunes = _lunesSemanaActivaKardex(ss, key);
      const actual = _obtenerLunesSemanaActual();
      kardex[key] = { nombre: BODEGAS[key].nombre, semana: _isoWeek(lunes), semanaActual: _isoWeek(actual),
        lunes: lunes.toISOString(), alDia: lunes.getTime() >= new Date(actual.getFullYear(), actual.getMonth(), actual.getDate()).getTime() };
    } catch (e) { kardex[key] = { nombre: BODEGAS[key].nombre, error: e.message }; }
    bajoMinimo[key] = _productosBajoMinimo(_hoja(ss, BODEGAS[key].vista));
    const vista = _hoja(ss, BODEGAS[key].vista);
    huellas[key] = vista && vista.getLastRow() >= 4 ? _huellaCatalogo(vista.getRange(4, 1, vista.getLastRow() - 3, 12).getValues()) : "";
  });
  const log = _hoja(ss, SHEET_LOG);
  const filasLog = log && log.getLastRow() >= 2 ? log.getRange(2, 1, Math.min(log.getLastRow() - 1, 300), 7).getValues() : [];
  // 🗒 LOG de Bodega: [TIMESTAMP, NIVEL, FUNCIÓN, DURACIÓN, DETALLE, USUARIO, STACK]
  const reg = filasLog.map(r => ({ fecha: r[0], nivel: r[1], funcion: r[2], ms: r[3], detalle: r[4] }));
  return {
    version: MISE_VERSION,
    activadores,
    cierres: _historialCierres(),
    kardex,
    bajoMinimo,
    huellas,
    incidentes: _incidentes(reg),
    minutosHoy: _minutosHoy(reg)
  };
}

function _productosBajoMinimo(vista) {
  if (!vista || vista.getLastRow() < 4) return { total: 0, productos: [] };
  // VISTA_MOVIL A4:L = No, CATEGORÍA, PRODUCTO, UNIDAD, SALDO, 🚦, ENT_HOY, SAL_HOY, ACTIVO, MÍN, MÁX, PICKING
  const filas = vista.getRange(4, 1, vista.getLastRow() - 3, 12).getValues();
  const bajos = filas.filter(r => r[2] && String(r[8]).trim().toUpperCase() !== "NO"
    && Number(r[9]) > 0 && (Number(r[4]) || 0) < Number(r[9]))
    .map(r => ({ producto: String(r[2]), saldo: Number(r[4]) || 0, minimo: Number(r[9]), unidad: String(r[3] || "") }));
  return { total: bajos.length, productos: bajos.slice(0, 15) };
}

// ── Tiendas: se abren solo para LEER _ESTADO y _LOGS ───────────────────────────────────────────
function _estadoTienda(key, props) {
  const nombre = BODEGAS[key].nombre;
  const id = key === "BA" ? (props.getProperty("PDA_SPREADSHEET_ID") || props.getProperty("BODEGA_ID_BA"))
                          : (props.getProperty("PDM_SPREADSHEET_ID") || props.getProperty("BODEGA_ID_BM"));
  const url = key === "BA" ? (props.getProperty("BODEGA_URL_BA") || props.getProperty("PDA_SPREADSHEET_URL"))
                           : (props.getProperty("BODEGA_URL_BM") || props.getProperty("PDM_SPREADSHEET_URL"));
  let tss = null;
  try { if (id) tss = SpreadsheetApp.openById(id); } catch (e) {}
  try { if (!tss && url) tss = _abrirLibro(url); } catch (e) {}
  if (!tss) return { nombre, accesible: false, error: id || url ? "No se pudo abrir el libro" : "Sin ID/URL configurado" };

  const estado = {};
  const hoja = _hoja(tss, "_ESTADO");
  if (hoja && hoja.getLastRow() >= 2) {
    hoja.getRange(2, 1, Math.min(hoja.getLastRow() - 1, 40), 2).getValues().forEach(r => { if (r[0]) estado[String(r[0]).trim()] = r[1]; });
  }
  // _LOGS de tienda: fila 3 en adelante = [FECHA "yyyy-MM-dd HH:mm:ss", USUARIO, FUNCIÓN, NIVEL, DURACIÓN, DETALLE, STACK]
  const logs = _hoja(tss, "_LOGS");
  const filas = logs && logs.getLastRow() >= 3 ? logs.getRange(3, 1, Math.min(logs.getLastRow() - 2, 300), 7).getValues() : [];
  const reg = filas.map(r => ({ fecha: _fechaLogTienda(r[0]), nivel: r[3], funcion: r[2], ms: r[4], detalle: r[5] }));
  return { nombre, accesible: true, conLatido: Object.keys(estado).length > 0, estado, incidentes: _incidentes(reg), minutosHoy: _minutosHoy(reg) };
}

function _fechaLogTienda(v) {
  if (v instanceof Date) return v;
  const m = String(v || "").match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) : null;
}

function _incidentes(reg) {
  const limite = Date.now() - ESTADO_DIAS_INCIDENTES * 24 * HORA_MS;
  return reg.filter(r => r.fecha instanceof Date && r.fecha.getTime() >= limite && /^(WARN|ERROR|FATAL)$/.test(String(r.nivel)))
    .slice(0, 25)
    .map(r => ({ fecha: r.fecha.toISOString(), nivel: String(r.nivel), funcion: String(r.funcion || ""), detalle: String(r.detalle || "").substring(0, 240) }));
}

// Suma de duraciones registradas hoy (aprox.: incluye procesos anidados y ejecuciones manuales)
function _minutosHoy(reg) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const ms = reg.filter(r => r.fecha instanceof Date && r.fecha >= hoy).reduce((s, r) => s + (Number(r.ms) || 0), 0);
  return Math.round(ms / 600) / 100;
}

// ── Semáforo por componente (función pura: la prueba la ejercita con fechas fijas) ────────────
function _evaluarComponentes(resumen, ahora) {
  const t = ahora.getTime();
  const c = [];
  const add = (id, grupo, nombre, estado, detalle) => c.push({ id, grupo, nombre, estado, detalle });
  const hace = (fecha) => {
    const h = (t - new Date(fecha).getTime()) / HORA_MS;
    return h < 1 ? `hace ${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `hace ${Math.round(h)} h` : `hace ${Math.round(h / 24)} días`;
  };
  const faltantes = (lista, esperados) => esperados.filter(n => lista.indexOf(n) === -1);
  const b = resumen.bodega;

  if (b.activadores === null) add("bdg.activadores", "Bodega", "Activadores", "aviso", "No se pudieron consultar");
  else {
    const f = faltantes(b.activadores, ACTIVADORES_BDG);
    add("bdg.activadores", "Bodega", "Activadores", f.length ? "falla" : "ok", f.length ? `Faltan: ${f.join(", ")} (usa 🚀 Configurar)` : `${ACTIVADORES_BDG.length} de ${ACTIVADORES_BDG.length}`);
  }

  const cierre = (b.cierres || []).filter(x => !x.manual)[0] || (b.cierres || [])[0];
  if (!cierre) add("bdg.cierre", "Bodega", "Cierre 23:00", "aviso", "Sin registro aún");
  else if (!cierre.ok) add("bdg.cierre", "Bodega", "Cierre 23:00", "falla", `Falló ${hace(cierre.fecha)}: ${cierre.error || "error"}`);
  else {
    const viejo = t - new Date(cierre.fecha).getTime() > 26 * HORA_MS;
    add("bdg.cierre", "Bodega", "Cierre 23:00", viejo ? "aviso" : "ok",
      `${viejo ? "No corre desde " : "Corrió "}${hace(cierre.fecha)} · ${cierre.descontados} insumos · ${Math.round((cierre.ms || 0) / 1000)} s`);
  }

  Object.keys(b.kardex || {}).forEach(key => {
    const k = b.kardex[key];
    if (k.error) add(`kardex.${key}`, "Bodega", `Semana Kardex ${k.nombre}`, "falla", k.error);
    else add(`kardex.${key}`, "Bodega", `Semana Kardex ${k.nombre}`, k.alDia ? "ok" : "aviso",
      k.alDia ? `Semana ${k.semana}` : `En semana ${k.semana}; la actual es ${k.semanaActual}`);
  });

  Object.keys(resumen.tiendas || {}).forEach(key => {
    const tn = resumen.tiendas[key];
    const g = tn.nombre;
    if (!tn.accesible) { add(`${key}.acceso`, g, "Acceso al libro", "falla", tn.error); return; }
    if (!tn.conLatido) { add(`${key}.latido`, g, "Latido", "aviso", "Aún sin latido (se crea al abrir, editar o en el reset de las 00:00)"); return; }
    const e = tn.estado;
    const edad = t - new Date(e.ULTIMO_LATIDO).getTime();
    add(`${key}.latido`, g, "Latido", edad <= 24 * HORA_MS ? "ok" : edad <= 48 * HORA_MS ? "aviso" : "falla",
      `${hace(e.ULTIMO_LATIDO)} (${e.ORIGEN_LATIDO || "—"})`);

    if (e.ULTIMO_RESET_ERROR) add(`${key}.reset`, g, "Reset 00:00", "falla", `Error: ${e.ULTIMO_RESET_ERROR}`);
    else if (!e.ULTIMO_RESET) add(`${key}.reset`, g, "Reset 00:00", "aviso", "Sin registro aún");
    else add(`${key}.reset`, g, "Reset 00:00", t - new Date(e.ULTIMO_RESET).getTime() <= 26 * HORA_MS ? "ok" : "aviso", hace(e.ULTIMO_RESET));

    const f = faltantes(String(e.ACTIVADORES || "").split(/,\s*/), ACTIVADORES_TIENDA);
    add(`${key}.activadores`, g, "Activadores", f.length ? "falla" : "ok", f.length ? `Faltan: ${f.join(", ")} (usa 🚀 Configurar)` : `${ACTIVADORES_TIENDA.length} de ${ACTIVADORES_TIENDA.length}`);
    add(`${key}.sync`, g, "Enlace con Bodega", e.SYNC_VIVO === "SI" ? "ok" : "falla", e.SYNC_VIVO === "SI" ? "IMPORTRANGE vivo" : "Sin enlace vivo (valores fijos)");
    const huellaBdg = (b.huellas || {})[key];
    if (huellaBdg) {
      const alDia = e.CATALOGO_HUELLA === huellaBdg;
      add(`${key}.catalogo`, g, "Catálogo (orden y activos)", alDia ? "ok" : "aviso",
        alDia ? `Al día${e.CATALOGO_APLICADO ? " · aplicado " + hace(e.CATALOGO_APLICADO) : ""}` : "Hay cambios de Bodega pendientes: se aplican al abrir la tienda o a las 00:00");
    }
    add(`${key}.version`, g, "Versión", e.VERSION === b.version ? "ok" : "aviso",
      e.VERSION === b.version ? `v${e.VERSION}` : `v${e.VERSION} (Bodega v${b.version})`);
  });
  return c;
}

function _peorEstado(estados) {
  return estados.indexOf("falla") !== -1 ? "falla" : estados.indexOf("aviso") !== -1 ? "aviso" : "ok";
}

// Vista rápida desde el menú mientras llega la página de estado (1.7.6h)
function mostrarEstadoSistema() {
  const r = obtenerEstadoSistema(true);
  const ic = { ok: "🟢", aviso: "🟡", falla: "🔴" };
  let grupo = "";
  const lineas = [];
  r.componentes.forEach(x => {
    if (x.grupo !== grupo) { grupo = x.grupo; lineas.push(`\n${grupo.toUpperCase()}`); }
    lineas.push(`${ic[x.estado]} ${x.nombre}: ${x.detalle}`);
  });
  SpreadsheetApp.getUi().alert(`${ic[r.estadoGeneral]} Estado del sistema (${r.entorno})`, lineas.join("\n").trim(), SpreadsheetApp.getUi().ButtonSet.OK);
}

// ── 🌐 Página de estado (webapp de Bodega, 1.7.6h) ────────────────────────────────────────────
// Se publica como webapp "Ejecutar como: yo · Acceso: solo yo" (appsscript.json). Lee el mismo resumen.
function doGet() {
  return HtmlService.createHtmlOutputFromFile("EstadoSistema")
    .setTitle("MISE · Estado")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

// JSON como texto: google.script.run no transporta objetos Date anidados
function obtenerEstadoWeb(forzar) {
  const r = obtenerEstadoSistema(!!forzar);
  try { r.accesos = _accesosEstado(); } catch (e) { r.accesos = []; }
  return JSON.stringify(r);
}

function _accesosEstado() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const props = PropertiesService.getScriptProperties();
  const base = ss.getUrl().replace(/\/edit.*$/, "/edit");
  const accesos = [{ nombre: "🏬 Bodega", url: base }];
  [[SHEET_ENTRADAS, "📥 Entradas"], [BODEGAS.BA.kardex, "📦 Inventario Andares"], [BODEGAS.BM.kardex, "📦 Inventario Mercado"], [SHEET_MAESTRO, "📋 Catálogo"], [SHEET_LOG, "🗒 Log"]]
    .forEach(([hoja, nombre]) => {
      const h = _hoja(ss, hoja);
      if (h) accesos.push({ nombre, url: `${base}#gid=${h.getSheetId()}` });
    });
  Object.keys(BODEGAS).forEach(key => {
    const id = key === "BA" ? (props.getProperty("PDA_SPREADSHEET_ID") || props.getProperty("BODEGA_ID_BA"))
                            : (props.getProperty("PDM_SPREADSHEET_ID") || props.getProperty("BODEGA_ID_BM"));
    if (id) accesos.push({ nombre: `🥞 ${BODEGAS[key].nombre}`, url: `https://docs.google.com/spreadsheets/d/${id}/edit` });
  });
  return accesos;
}

// Menú: abre la página publicada (su URL existe solo después de "Implementar → Nueva implementación")
function abrirPaginaEstado() {
  const url = ScriptApp.getService().getUrl();
  const ui = SpreadsheetApp.getUi();
  if (!url) {
    ui.alert("🌐 Página de estado", "Aún no está publicada. En Extensiones → Apps Script: Implementar → Nueva implementación → Aplicación web (Ejecutar como: yo · Acceso: solo yo).", ui.ButtonSet.OK);
    return;
  }
  const html = HtmlService.createHtmlOutput(`<p style="font-family:sans-serif">Abriendo… <a href="${url}" target="_blank">abrir manualmente</a></p><script>window.open(${JSON.stringify(url)}, "_blank"); google.script.host.close();</script>`)
    .setWidth(320).setHeight(90);
  ui.showModalDialog(html, "🌐 Página de estado");
}

// ── ⏳ MONITOR DE PROGRESO (1.7.6r) ───────────────────────────────────────────────────────────
// Un diálogo SIN bloqueo (ProgresoDialog.html) lanza el proceso con google.script.run y, en paralelo, consulta su avance
// cada ~0.7 s. El proceso reporta cada paso en CacheService (10 min). Solo se ejecutan procesos de esta lista.
// Procesos pesados con monitor (1.7.7c). Cada uno corre sin alertas y cierra el reporte con su resumen;
// las confirmaciones (si las hay) se piden en el menú ANTES de abrir el monitor.
const PROCESOS_MONITOREADOS = {
  configurar: { titulo: "🚀 Configurar este libro", pasos: 10, fn: (rep) => _configurarBDGCore(rep) },
  descontarHoy: { titulo: "🚚 Descontar pedidos de hoy", pasos: 3, fn: (rep) => _cerrarDescuento(rep,
    MiseSmartSync.ejecutarDescuento(true, null, { rep, manual: true })) },
  descontarAyer: { titulo: "🚚 Descontar pedidos de ayer", pasos: 3, fn: (rep) => {
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    return _cerrarDescuento(rep, MiseSmartSync.ejecutarDescuento(true, ayer, { rep, manual: true, soloRegistros: true }));
  } },
  reconciliar: { titulo: "🔄 Reconciliar días pasados", pasos: 7, fn: (rep) => {
    const r = MiseSmartSync.reconciliarSemanaCompleta(true, null, { rep });
    return rep.cerrar(true, "✅ Reconciliación terminada", r.dias
      ? `${r.dias} día(s) revisado(s) · ${r.totalDescontados} descontado(s) ahora · ${r.totalOmitidos} ya estaban aplicados.`
      : "La semana activa empieza hoy: no hay días pasados que revisar.");
  } },
  mantenimiento: { titulo: "🛡️ Mantenimiento semanal", pasos: 4, fn: (rep) => _cerrarSimple(rep,
    _mantenimientoSemanalCore(rep), "✅ Mantenimiento terminado", "Catálogo ordenado, vistas al día y hojas blindadas.") },
  reparar: { titulo: "🩺 Diagnosticar y reparar", pasos: 4, fn: (rep) => _cerrarSimple(rep,
    repararYSincronizarSistema(false, rep), "✅ Sistema verificado", "Fórmulas, validaciones, vistas y activadores al día.") }
};

// Paso con reporte opcional: sin monitor (rep null) solo ejecuta fn
function _pasoMonitor(rep, nombre, fn) {
  if (rep) rep.inicio(nombre);
  try {
    const d = fn();
    if (rep) rep.fin(nombre, true, d || "");
    return d;
  } catch (e) {
    if (rep) rep.fin(nombre, false, e.message);
    throw e;
  }
}

function _cerrarSimple(rep, r, titulo, resumen) {
  if (!r || !r.ok) return rep.cerrar(false, "⚠️ Terminado con observaciones", (r && r.error) || "Revisa 🗒 Registro del sistema.");
  return rep.cerrar(true, titulo, resumen);
}

function _cerrarDescuento(rep, r) {
  if (!r) return rep.cerrar(false, "⚠️ Bodega ocupada", "Otro proceso está trabajando; intenta de nuevo en unos segundos.");
  if (r.error) return rep.cerrar(false, "❌ No se pudo descontar", r.error);
  let resumen = `${r.totalDescontados} insumo(s) descontado(s) · ${r.totalOmitidosDuplicados} ya aplicado(s) · ${r.totalVaciadosTiendas} tienda(s) vaciada(s).`;
  if (r.fueraDeSemana && r.fueraDeSemana.length) resumen += ` Sin descontar (fuera de la semana activa): ${r.fueraDeSemana.join(", ")}.`;
  return rep.cerrar(!(r.fueraDeSemana && r.fueraDeSemana.length), "✅ Descuento terminado", resumen);
}

function _reporteProgreso(runId) {
  let cache = null;
  try { cache = runId ? CacheService.getScriptCache() : null; } catch (e) {}
  const estado = { pasos: [] };
  const guardar = () => { if (cache) { try { cache.put("prog_" + runId, JSON.stringify(estado), 600); } catch (e) {} } };
  return {
    estado,
    inicio(nombre) { estado.pasos.push({ nombre, estado: "corriendo", t0: Date.now() }); guardar(); },
    fin(nombre, ok, detalle) {
      const p = estado.pasos.filter(x => x.nombre === nombre).pop();
      if (p) { p.estado = ok ? "ok" : "falla"; p.detalle = detalle ? String(detalle) : ""; p.ms = Date.now() - p.t0; }
      guardar();
    },
    cerrar(ok, titulo, resumen) { Object.assign(estado, { fin: true, ok, titulo, resumen }); guardar(); return JSON.stringify(estado); }
  };
}

function leerProgreso(runId) {
  try { return CacheService.getScriptCache().get("prog_" + runId) || "{}"; } catch (e) { return "{}"; }
}

function ejecutarConMonitor(proceso, runId) {
  const def = PROCESOS_MONITOREADOS[proceso];
  if (!def) throw new Error("Proceso no permitido: " + proceso);
  return def.fn(_reporteProgreso(String(runId || "")));
}

function _abrirMonitor(proceso) {
  const def = PROCESOS_MONITOREADOS[proceso];
  const t = HtmlService.createTemplateFromFile("ProgresoDialog");
  t.runId = Utilities.getUuid();
  t.proceso = proceso;
  t.totalPasos = def.pasos;
  SpreadsheetApp.getUi().showModelessDialog(t.evaluate().setWidth(440).setHeight(520), def.titulo);
}
