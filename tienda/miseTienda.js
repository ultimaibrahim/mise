/**
 * MISE — Pedidos Tienda · FUENTE ÚNICA de Andares (PDA) y Mercado (PDM)
 * Suite Atelier · La Crêpe Parisienne · Grupo MYT
 *
 * Este es el ÚNICO archivo que se edita para las tiendas. scripts/build-tienda.js genera
 * pda/miseAuthPDA.js y pdm/miseAuthPDM.js (gitignored) con su cabecera y MISE_SUCURSAL_DEFAULT.
 * La sucursal real la deciden las Propiedades del Script (BODEGA_KEY / BODEGA_NOMBRE).
 * SUBTITULO: Configuración en un Clic · Picking y Colores por Producto · Migración Automática de Estructura · Surtido Rápido con CANT. FINAL
 */

// ── BODEGA & CONFIGURACIÓN DINÁMICA DE ENTORNO ──────────────────────────────
const props = PropertiesService.getScriptProperties();
// MISE_SUCURSAL_DEFAULT lo inyecta el build por libro; solo aplica si faltan las propiedades
const BODEGA_KEY    = props.getProperty("BODEGA_KEY") || MISE_SUCURSAL_DEFAULT.key;
const BODEGA_NOMBRE = props.getProperty("BODEGA_NOMBRE") || MISE_SUCURSAL_DEFAULT.nombre;
const VISTA_MOVIL   = `VISTA_MOVIL_${BODEGA_KEY}`;
const SHEET_SYNC    = `_SYNC_${BODEGA_KEY}`;

// ── CONSTANTES ──────────────────────────────────────────────────────────────
const SHEET_PEDIDO   = "📋 PEDIDO DIARIO";
const COL_CANT_PEDIR = 6;   // F — CANT. A PEDIR
const COL_RECIBIDA   = 8;   // H — CANT. RECIBIDA (oculta)
const COL_ESTADO     = 9;   // I — ESTADO (oculta)
const DATA_START_ROW = 4;
// Estructura de 📋 PEDIDO DIARIO. El esquema 3 (1.7.6k) quitó la columna J reservada (ex ADICIÓN): MÍN|MÁX pasa
// de K a J y las auxiliares de L:O a K:N. Se detecta por el ENCABEZADO real (fila 3), no por una constante: el
// código nuevo opera igual sobre una tienda que aún no migra, a media migración o en un reintento.
let _layoutCache = null;
function _layoutPedido(sheet) {
  if (_layoutCache && !sheet) return _layoutCache;
  const hoja = sheet || SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PEDIDO);
  let viejo = false;
  if (hoja) {
    try {
      const enc = hoja.getRange(3, 10, 1, 2).getValues()[0];
      viejo = /MÍN/i.test(String(enc[1])) && !/MÍN/i.test(String(enc[0]));
    } catch (e) {}
  }
  const l = viejo ? { esquema: 2, numCols: 11, colMinMax: 11, colAux: 12 } : { esquema: 3, numCols: 10, colMinMax: 10, colAux: 11 };
  l.letrasAux = [0, 1, 2, 3].map(i => _letraColumna(l.colAux + i));
  if (!sheet) _layoutCache = l;
  return l;
}

function _letraColumna(n) {
  let txt = "";
  while (n > 0) { const m = (n - 1) % 26; txt = String.fromCharCode(65 + m) + txt; n = Math.floor((n - 1) / 26); }
  return txt;
}

// Colores institucionales
const COLORS = {
  completo:    "#B9F6CA",
  parcial:     "#FFE0B2",
  pendiente:   "#FFFDE7",
  inexistente: "#FFCDD2", // Rojo para cuando es 0 recibido
  yellow:      "#FFFCD0",
  blue:        "#D0E8FF",
  neutral_a:   "#FAFAFA",
  neutral_b:   "#FFFFFF",
  logHeader:   "#3D5A47"
};

const ESTADO = {
  COMPLETO:  "✅ COMPLETO",
  PARCIAL:   "⚠️ PARCIAL",
  PENDIENTE: "⏳ PENDIENTE"
};

// ── MENÚ ────────────────────────────────────────────────────────────────────
function onOpen() {
  // Con onOpen instalable (🚀 Configurar), el reset y el aviso corren allí como el dueño; el simple solo
  // arma el menú (corre como quien abre, con 30 s y sin permiso sobre celdas protegidas).
  if (PropertiesService.getScriptProperties().getProperty("ONOPEN_INSTALABLE") !== "1") {
    try {
      _checkAutoResetNuevoDia();
    } catch(e) {}
    try {
      _ensureDailyResetTrigger();
    } catch(e) {}
    try {
      _actualizarAvisoPedido();
    } catch(e) {}
  }
  try {
    const ui = SpreadsheetApp.getUi();
    // Menús (1.7.6t): ⚙️ Mise = uso diario; 🛠 Técnico = mantenimiento y zona de riesgo;
    // 🧪 Mise DEV = solo si tienda/MiseDevTools.js está en el proyecto (los libros DEV).
    ui.createMenu("⚙️ Mise")
      .addItem("🚚 Generar Surtido Rápido", "generarSurtidoRapido")
      .addItem("🖐️ Reordenar lista por picking", "ordenarPedido")
      .addSeparator()
      .addSubMenu(ui.createMenu("▸ Más opciones")
        .addItem("🔧 Sincronizar catálogo y reparar formato", "repararSistemaTienda")
        .addItem("🔄 Aplicar actualización de estructura pendiente", "aplicarActualizacionPendienteManualmente")
        .addItem("🗑️ Limpiar el pedido de hoy", "resetearPedidoManualmente")
        .addItem("🔐 Auditoría de permisos", "auditarPermisos"))
      .addSeparator()
      .addItem("ℹ️ Acerca de Mise", "acercaDe")
      .addToUi();

    ui.createMenu("🛠 Técnico")
      .addItem("🚀 Configurar este libro", "configurarEsteLibroTienda")
      .addItem("⏰ Reiniciar activadores", "instalarActivadoresTienda")
      .addItem("🔒 Proteger Pedido Diario", "protegerPedidoSeguro")
      .addItem("🛡️ Blindar Pedido y Surtido (total)", "protegerTodasLasHojasTiendaSeguras")
      .addSeparator()
      .addItem(`🔗 Configurar conexión con ${BODEGA_NOMBRE}`, "configurarBodega")
      .addItem("🔐 Cambiar contraseña de administrador", "cambiarPasswordAdmin")
      .addItem("⚠️ Restablecer sistema desde cero (destructivo)", "setupCompleto")
      .addToUi();

    // 🧪 Mise DEV: herramientas de tienda/MiseDevTools.js (solo existen en los libros DEV)
    if (typeof generarDatosPrueba === "function") {
      ui.createMenu("🧪 Mise DEV")
        .addItem("🎲 Generar datos aleatorios de prueba", "generarDatosPrueba")
        .addItem("🗒️ Forzar registro en LOG_SURTIDO", "probadorForzarLogSurtido")
        .addToUi();
    }
  } catch(e) {}
}

// ── AVISO DE CONEXIÓN / POBLAR DATOS ──────────────────────────────────────────
function _actualizarAvisoPedido() {
  const ss      = SpreadsheetApp.getActiveSpreadsheet();
  const pedido  = ss.getSheetByName(SHEET_PEDIDO);
  let sync      = ss.getSheetByName(SHEET_SYNC);
  if (!pedido) return;
  
  // 1.7.7i: "Loading…/Cargando…" del IMPORTRANGE NO es un enlace listo (antes contaba como activo)
  const _syncListo = (h) => h && h.getLastRow() > 3 && !/^(#|loading|cargando|$)/i.test(String(h.getRange(4, 1).getValue()).trim());
  let syncActivo = _syncListo(sync);

  // Autoconexión inicial desde Propiedades del Script
  if (!syncActivo) {
    const props = PropertiesService.getScriptProperties();
    const propKey = `BODEGA_URL_${BODEGA_KEY}`;
    const url = props.getProperty(propKey);
    if (url) {
      try {
        _setupSync(url);
        sync = ss.getSheetByName(SHEET_SYNC);
        syncActivo = _syncListo(sync);
      } catch(err) {}
    }
  }

  // Aviso en D2 (barra de acciones, visible en celular). NUNCA en H4: es CANT. RECIBIDA del 1er producto.
  if (!syncActivo) {
    pedido.getRange("D2")
      .setValue("⚠️ CONECTAR BDG")
      .setFontColor("#C62828")
      .setFontSize(9)
      .setHorizontalAlignment("center")
      .setFontStyle("italic");
    _aplicarAnchosColumnas(pedido);
    return;
  }

  // Limpiar advertencia (D2); H4 pertenece a la tabla y no se toca
  if (String(pedido.getRange("D2").getValue()).indexOf("CONECTAR") !== -1) pedido.getRange("D2").clearContent();

  const count  = sync.getLastRow() - 3; 
  if (count < 1) return;
  const DR     = DATA_START_ROW;
  
  const existente = pedido.getRange(DR, 3).getValue(); 
  if (existente !== "" && existente !== null) {
    _aplicarAnchosColumnas(pedido);
    _aplicarOcultamientoColumnas(pedido);
    return;
  }

  // 1.7.7i: el armado inicial es SOLO para un pedido vacío. Con la estructura vieja (PRODUCTO por fila de _SYNC), abrir
  // mientras el IMPORTRANGE cargaba dejaba C4 en blanco y aquí se reconstruía el pedido sin cantidades, sin dejar registro
  // (Mercado PROD, 02/oct). Si hay cualquier captura, no se toca.
  const filasPed = pedido.getLastRow() - DR + 1;
  if (filasPed > 0) {
    const capt = pedido.getRange(DR, COL_CANT_PEDIR, filasPed, COL_RECIBIDA - COL_CANT_PEDIR + 2).getValues()
      .some(r => r.some(v => v !== "" && v !== null));
    if (capt) {
      MiseLogger.warn("_actualizarAvisoPedido", "PRODUCTO de la primera fila vacío con capturas en el pedido: no se reconstruyó (¿el enlace con Bodega seguía cargando?).");
      return;
    }
  }
  MiseLogger.info("_actualizarAvisoPedido", `Pedido vacío: armado inicial con ${count} productos.`);

  const outputGrid = [];
  const bgs = [];
  const syncNombres = sync.getRange(4, 3, count, 1).getValues();

  for (let i = 0; i < count; i++) {
    const r  = DR + i;
    const bg = i % 2 === 0 ? COLORS.neutral_a : COLORS.neutral_b;

    outputGrid.push(_filaPedido(r, String(syncNombres[i][0] || "").trim(), i + 1, {}));

    const rowBg = Array(_layoutPedido().numCols).fill(bg);
    rowBg[COL_CANT_PEDIR - 1] = COLORS.yellow; // Col F
    rowBg[4]                  = COLORS.blue;   // Col E
    bgs.push(rowBg);
  }

  // Escribir en una sola llamada Batch 2D de alta velocidad (<100ms)
  const fullRange = pedido.getRange(DR, 1, count, _layoutPedido().numCols);
  fullRange.clearContent();
  fullRange.setBackgrounds(bgs);
  fullRange.setValues(outputGrid); // setValues: "=…" sigue siendo fórmula; el texto NO se vuelve #NAME?

  pedido.getRange(DR, 1, count, _layoutPedido().numCols)
    .setFontFamily("Calibri").setFontSize(10).setVerticalAlignment("middle");
  
  pedido.getRange(DR, 1, count, 1).setHorizontalAlignment("center"); 
  pedido.getRange(DR, 3, count, 1).setHorizontalAlignment("left");   
  pedido.getRange(DR, 4, count, 1).setHorizontalAlignment("center"); 
  pedido.getRange(DR, 5, count, 1).setHorizontalAlignment("right");  
  pedido.getRange(DR, 7, count, 1).setHorizontalAlignment("center"); 
  pedido.getRange(DR, _layoutPedido().colMinMax, count, 1).setHorizontalAlignment("center");
  
  _aplicarAnchosColumnas(pedido);
  _aplicarOcultamientoColumnas(pedido);
  _aplicarFormatosCondicionales(pedido);
}

function _aplicarOcultamientoColumnas(sheet) {
  try {
    const L = _layoutPedido(sheet);
    sheet.showColumns(1, L.numCols); // Estado base limpio
    sheet.hideColumns(1, 2);   // Ocultar Col A (No) y Col B (CATEGORÍA)
    sheet.showColumns(3, 2);   // Mostrar Col C (PRODUCTO) y Col D (UNIDAD TIENDA)
    sheet.hideColumns(5);      // Ocultar Col E (SALDO TEÓRICO)
    sheet.showColumns(6);      // Mostrar Col F (CANT. A PEDIR)
    sheet.hideColumns(7, L.esquema === 2 ? 4 : 3); // Ocultar G (DIFERENCIA), H (RECIBIDA), I (ESTADO) [+ J reservada en esquema 2]
    sheet.showColumns(L.colMinMax); // Mostrar MÍN/MÁX QUIOSCO
    
    let filter = sheet.getFilter();
    if (filter) filter.remove();
  } catch(err) {}
}

function _aplicarAnchosColumnas(sheet) {
  sheet.setColumnWidth(1, 40);   // No
  sheet.setColumnWidth(2, 115);  // CATEGORÍA
  sheet.setColumnWidth(3, 240);  // PRODUCTO (VISIBLE)
  sheet.setColumnWidth(4, 75);   // UNIDAD TIENDA (VISIBLE: Domo, Caja, Kg, etc.)
  sheet.setColumnWidth(5, 100);  // SALDO TEÓRICO (Oculto)
  sheet.setColumnWidth(6, 115);  // CANT. A PEDIR (VISIBLE)
  sheet.setColumnWidth(7, 100);  // DIFERENCIA
  sheet.setColumnWidth(8, 120);  // H
  sheet.setColumnWidth(9, 60);   // I
  if (_layoutPedido(sheet).esquema === 2) sheet.setColumnWidth(10, 40); // J reservada (esquema 2)
  else sheet.setColumnWidth(10, 110);                                     // J MÍN | MÁX (esquema 3)
}

function _getProductCount() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_PEDIDO);
  if (!sheet) return 131;
  const lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) return 131;
  return lastRow - DATA_START_ROW + 1;
}

// onEdit SIMPLE: corre con los permisos de QUIEN EDITA. Con cuentas propias en tienda, sus escrituras a
// columnas protegidas (PEDIDO H/I, Surtido D, hojas técnicas) fallaban EN SILENCIO — causa del histórico
// "Surtido se pinta pero PEDIDO no recibe cantidad/estado". Con el instalable (corre como el dueño), el
// simple no hace nada para no duplicar.
function onEdit(e) {
  if (PropertiesService.getScriptProperties().getProperty("ONEDIT_INSTALABLE") === "1") return;
  _onEditTienda(e);
}

function onEditTiendaInstalable(e) {
  _onEditTienda(e);
  _latidoTienda("edición");   // como máximo 1 escritura cada 10 min; casi siempre solo revisa la hora
}

function _onEditTienda(e) {
  if (!e) return;
  const sheet = e.range.getSheet();
  const name  = sheet.getName();
  const row = e.range.getRow();
  const col = e.range.getColumn();

  // A. Manejo de la pestaña de Surtido Rápido (Optimizado para latencia cero)
  if (name === "🚚 SURTIDO RÁPIDO") {
    if (row < 4) return;

    const rData = sheet.getRange(row, 1, 1, 7).getValues()[0];
    const prodNo    = rData[0];
    const cantPedir = parseFloat(rData[3]) || 0;
    const prodName  = String(rData[2] || "").trim();

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const pSheet = ss.getSheetByName(SHEET_PEDIDO);
    if (!pSheet) return;

    const lrP = pSheet.getLastRow();
    const pData = pSheet.getRange(DATA_START_ROW, 1, lrP - DATA_START_ROW + 1, 3).getValues();
    let rowInPedido = -1;
    for (let i = 0; i < pData.length; i++) {
      if (pData[i][0] === prodNo || String(pData[i][2]).trim() === prodName) {
        rowInPedido = DATA_START_ROW + i;
        break;
      }
    }
    if (rowInPedido === -1) return;

    const lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) return;

    try {
      // Una sola fuente activa por fila: número manual (E) · ✅ COMPLETO (F) · ❌ INEXISTENTE (G).
      // CANT. FINAL (H) es fórmula: decide colores y descuento aunque este sincronizado fallara.
      let recibida = "", estado = "";
      if (col === 6 || col === 7) {
        const marcado = (e.range.getValue() === true);
        if (col === 6) {
          sheet.getRange(row, 5, 1, 3).setValues([["", marcado, false]]);
          if (marcado) { recibida = cantPedir; estado = "COMPLETO"; }
        } else {
          sheet.getRange(row, 5, 1, 3).setValues([["", false, marcado]]);
          if (marcado) { recibida = 0; estado = "INEXISTENTE"; }
        }
      } else if (col === 5) {
        const val = e.range.getValue();
        const num = (val === "" || val === null || val === undefined) ? NaN
          : (typeof val === "string" ? parseFloat(val.replace(',', '.')) : Number(val));
        if (!isNaN(num) && num >= 0) {
          sheet.getRange(row, 5, 1, 3).setValues([[num, false, false]]);
          recibida = num;
          estado = _estadoRecepcion(num, cantPedir);
        } else {
          sheet.getRange(row, 5, 1, 3).setValues([["", false, false]]);
        }
      } else {
        return;
      }
      pSheet.getRange(rowInPedido, COL_RECIBIDA, 1, 2).setValues([[recibida, estado]]);
    } finally {
      lock.releaseLock();
    }
    return;
  }

  // B. Manejo de la pestaña de Pedido Diario
  if (name !== SHEET_PEDIDO) return;

  if (row === 2) {
    if (col === 6) { // F2 - Surtido Rápido
      if (e.range.getValue() === true) {
        e.range.setValue(false);
        try {
          generarSurtidoRapido();
          MiseLogger.info("surtidoRapido", "Pestaña de Surtido Rápido generada desde botón F2.");
        } catch(err) {
          MiseLogger.error("surtidoRapido", err.message);
        }
      }
    }
    return;
  }

  if (row < DATA_START_ROW) return;

  // 2. Validaciones rápidas de entrada (F)
  if (col === COL_CANT_PEDIR) {
    let val = e.range.getValue();

    // Vacía: no hay nada que validar, pero SÍ hay que sacar el producto de Surtido Rápido (más abajo).
    // (Antes terminaba aquí para limpiar la marca de ADICIÓN y el producto cancelado seguía en Surtido.)
    const vacia = (val === "" || val === null || val === undefined);

    if (!vacia && Object.prototype.toString.call(val) === '[object Date]') {
      e.range.clearContent();
      try { SpreadsheetApp.getActive().toast("El valor debe ser un número positivo (no se permiten fechas).", "❌ Mise", 5); } catch(err) {}
      return;
    }

    if (!vacia && typeof val === "string") {
      const cleanVal = val.replace(',', '.').trim();
      const num = Number(cleanVal);
      if (!isNaN(num)) {
        e.range.setValue(num);
        val = num;
      }
    }

    const checkVal = Number(val);
    if (!vacia && (isNaN(checkVal) || checkVal < 0)) {
      e.range.clearContent();
      return;
    }
  }

  // Si existe la pestaña de Surtido Rápido, reflejar altas, cambios y cancelaciones sin lag
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const surtido = ss.getSheetByName("🚚 SURTIDO RÁPIDO");
    if (surtido && surtido.getLastRow() >= 4) {
      const prodNo = sheet.getRange(row, 1).getValue();
      const prodName = String(sheet.getRange(row, 3).getValue() || "").trim();
      const cantPed = parseFloat(sheet.getRange(row, COL_CANT_PEDIR).getValue()) || 0;

      const sLr = surtido.getLastRow();
      const sData = surtido.getRange(4, 1, sLr - 3, 4).getValues(); // Cols A-D
      let foundRow = -1;
      for (let i = 0; i < sData.length; i++) {
        if (sData[i][0] === prodNo || String(sData[i][2] || "").trim() === prodName) {
          foundRow = 4 + i;
          break;
        }
      }

      if (foundRow !== -1) {
        if (cantPed > 0) {
          // Actualización quirúrgica O(1) de cantidad pedida sin reconstruir la hoja
          surtido.getRange(foundRow, 4).setValue(cantPed);
        } else {
          // Si el producto se canceló o limpió, regenerar para remover la fila
          generarSurtidoRapidoSilencioso();
        }
      } else if (cantPed > 0) {
        // Producto nuevo en el pedido: regenerar para insertarlo en secuencia de picking
        generarSurtidoRapidoSilencioso();
      }
    }
  } catch (err) {}
}

function _validarYAutoRepararSyncSilencioso() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sync = ss.getSheetByName(SHEET_SYNC);
    if (!sync) return;
    const val = String(sync.getRange(4, 1).getValue()).trim();
    if (val === "" || val === "#REF!" || val === "#ERROR!" || val === "#N/A") {
      const props = PropertiesService.getScriptProperties();
      const url = props.getProperty(`BODEGA_URL_${BODEGA_KEY}`);
      if (url) {
        _setupSync(url);
      }
    }
  } catch(e) {}
}

function ordenarPedido() {
  const tId = "ordenarPedido_" + Date.now();
  MiseLogger.time(tId);
  try {
    _validarYAutoRepararSyncSilencioso();
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_PEDIDO);
    if (!sheet) return;

    const count  = _getProductCount();
    if (count < 1) return;
    const range  = sheet.getRange(DATA_START_ROW, 1, count, _layoutPedido().numCols);
    const values = range.getValues();

    const sync = ss.getSheetByName(SHEET_SYNC);
    const syncLr = sync ? sync.getLastRow() : 3;
    const syncCount = Math.max(syncLr - 3, 0);
    const syncValues = (sync && syncCount > 0) ? sync.getRange(4, 1, syncCount, 12).getValues() : [];
    const activeMap = {};
    const pickingMap = {};
    for (let i = 0; i < syncValues.length; i++) {
      const prodName = String(syncValues[i][2]).trim();  // Col C = PRODUCTO (index 2)
      const activo   = String(syncValues[i][8]).trim();  // Col I = ACTIVO (index 8)
      const picking  = parseInt(syncValues[i][11]) || 0; // Col L = PICKING (index 11)
      if (prodName) {
        activeMap[prodName]  = activo;
        pickingMap[prodName] = picking;
      }
    }

    const items = [];
    for (let i = 0; i < values.length; i++) {
      items.push({
        vals: values[i]
      });
    }

    // Ordenar estrictamente según la Secuencia de Picking definida en Bodega (Col L de _SYNC)
    items.sort((a, b) => {
      const nameA = String(a.vals[2] || "").trim();
      const nameB = String(b.vals[2] || "").trim();

      // 1. Ordenamiento Estricto por Posición de Picking de Quiosco (rankA vs rankB)
      const rankA = pickingMap[nameA] !== undefined ? pickingMap[nameA] : 9999;
      const rankB = pickingMap[nameB] !== undefined ? pickingMap[nameB] : 9999;
      if (rankA !== rankB) {
        return rankA - rankB;
      }

      // 3. Fallback secundario: Categoría alfabética y Número original
      const catA = String(a.vals[1] || "").trim();
      const catB = String(b.vals[1] || "").trim();
      if (catA !== catB) {
        return catA.localeCompare(catB);
      }

      const numA = parseInt(a.vals[0]) || 0;
      const numB = parseInt(b.vals[0]) || 0;
      return numA - numB;
    });

    // 1.7.7j: si el orden ya es el correcto, no se reescribe nada (antes: ~12 s reescribiendo pedido, formatos y
    // protecciones en cada apertura tras un cambio del Catálogo, mientras alguien cargaba la hoja en el celular).
    // Solo se aplican activos/inactivos, que no mueven filas.
    if (_layoutPedido(sheet).esquema !== 2 && items.every((it, i) => String(it.vals[2] || "").trim() === String(values[i][2] || "").trim())) {
      _actualizarVisibilidadInactivos(sheet);
      const durSin = MiseLogger.timeEnd(tId);
      MiseLogger.info("ordenarPedido", `Orden ya correcto (${count} productos): solo activos/inactivos.`, durSin);
      PropertiesService.getScriptProperties().setProperty("IS_ORDER_SORTED", "true");
      try { SpreadsheetApp.getActive().toast("El pedido ya estaba en orden de picking ✓", "⚙️ Ordenar", 3); } catch (e) {}
      return;
    }

    const bgs = [];
    const cleanFonts = [];
    const outputData = [];

    for (let i = 0; i < items.length; i++) {
      const r = DATA_START_ROW + i;
      const prodNo = parseInt(items[i].vals[0]) || (i + 1);
      const prodName = String(items[i].vals[2] || "").trim();
      
      // Generar fondos estándar
      const bgRow = i % 2 === 0 ? COLORS.neutral_a : COLORS.neutral_b;
      const rowBg = Array(_layoutPedido().numCols).fill(bgRow);
      rowBg[4] = COLORS.blue;                    // Col E
      rowBg[COL_CANT_PEDIR - 1] = COLORS.yellow; // Col F
      bgs.push(rowBg);

      // Tipografía estándar limpia
      const rowFont = Array(_layoutPedido().numCols).fill("normal");
      rowFont[COL_CANT_PEDIR - 1] = "bold";
      cleanFonts.push(rowFont);

      // Generar fórmulas y valores limpios (Col G es DIFERENCIA, Col K es MÍN/MÁX QUIOSCO)
      outputData.push(_filaPedido(r, prodName, prodNo, { pedir: items[i].vals[5], recibida: items[i].vals[7], estado: _normalizarEstado(items[i].vals[8]) }));
    }

    // Escribir en bloque
    range.clearContent();
    sheet.getRange(DATA_START_ROW, 1, count, _layoutPedido().numCols).setValues(outputData); // texto (ESTADO) no se vuelve #NAME?
    range.setBackgrounds(bgs);
    range.setFontWeights(cleanFonts);

    // Formatear
    sheet.getRange(DATA_START_ROW, 1, count, _layoutPedido().numCols)
      .setFontFamily("Calibri").setFontSize(10).setVerticalAlignment("middle");
    sheet.getRange(DATA_START_ROW, 1, count, 1).setHorizontalAlignment("center");
    sheet.getRange(DATA_START_ROW, 3, count, 1).setHorizontalAlignment("left");
    sheet.getRange(DATA_START_ROW, 4, count, 1).setHorizontalAlignment("center");
    sheet.getRange(DATA_START_ROW, 5, count, 1).setHorizontalAlignment("right");
    sheet.getRange(DATA_START_ROW, 7, count, 1).setHorizontalAlignment("center");
    sheet.getRange(DATA_START_ROW, _layoutPedido().colMinMax, count, 1).setHorizontalAlignment("center");

    _aplicarFormatosCondicionales(sheet);
    _actualizarVisibilidadInactivos(sheet);
    if (_layoutPedido(sheet).esquema === 2) sheet.hideColumns(10); // J reservada solo existe en esquema 2
    protegerPedidoSeguro();

    PropertiesService.getScriptProperties().setProperty("IS_ORDER_SORTED", "true");
    const dur = MiseLogger.timeEnd(tId);
    MiseLogger.info("ordenarPedido", `Pedido ordenado con éxito (${count} productos re-secuenciados).`, dur);
    try {
      SpreadsheetApp.getActive().toast("Pedido ordenado por secuencia de picking de quiosco ✓", "⚙️ Ordenar", 3);
    } catch(e) {}

    // Actualizar Surtido Rápido silenciosamente si existe
    try {
      const surtido = ss.getSheetByName("🚚 SURTIDO RÁPIDO");
      if (surtido) {
        generarSurtidoRapidoSilencioso();
      }
    } catch (err) {}
  } catch(err) {
    const dur = MiseLogger.timeEnd(tId);
    MiseLogger.error("ordenarPedido", err.message, err, dur);
  }
}

function configurarBodega() {
  const ui    = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();
  const propKey = `BODEGA_URL_${BODEGA_KEY}`;
  const urlActual = props.getProperty(propKey) || "SIN CONFIGURAR";
  const resp = ui.prompt(
    `🔗 Configurar ${BODEGA_NOMBRE}`,
    `Pega aquí la URL del archivo Bodegas:\n\n` +
    `URL configurada: ${urlActual.length > 60 ? urlActual.substring(0, 60) + '…' : urlActual}\n\n`,
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const url = resp.getResponseText().trim();
  if (!url || !url.includes("docs.google.com/spreadsheets")) {
    ui.alert("❌ URL inválida.");
    return;
  }
  props.setProperty(propKey, url);
  _setupSync(url);
}

function _setupSync(bodegaUrl) {
  const url = bodegaUrl || PropertiesService.getScriptProperties().getProperty(`BODEGA_URL_${BODEGA_KEY}`);
  if (!url) throw new Error(`Falta configurar la propiedad BODEGA_URL_${BODEGA_KEY} en Propiedades del Script.`);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let syncSheet = ss.getSheetByName(SHEET_SYNC);
  if (!syncSheet) {
    syncSheet = ss.insertSheet(SHEET_SYNC);
    syncSheet.hideSheet();
    syncSheet.getRange(1, 1).setValue(`⚙️ SINCRONIZACIÓN ${BODEGA_NOMBRE} — NO EDITAR`);
    syncSheet.getRange(3, 1, 1, 12).setValues([["No","CATEGORÍA","PRODUCTO","UNIDAD","SALDO","🚦","ENT_HOY","SAL_HOY","ACTIVO","MÍN","MÁX","PICKING"]]);
  }
  const lastRow = Math.max(syncSheet.getLastRow(), 4);
  if (lastRow >= 4) syncSheet.getRange(4, 1, lastRow - 3, 12).clearContent();
  const formula = '=IMPORTRANGE("' + url + '", "'  + VISTA_MOVIL + '!A4:L")';
  syncSheet.getRange(4, 1).setFormula(formula);
}

// Backup del reset diario: onOpen (simple trigger) NO se dispara de forma confiable
// al abrir la hoja desde la app móvil nativa de Sheets (solo desde navegador).
// Este trigger instalable corre solo, sin depender de que alguien abra el archivo.
function _ensureDailyResetTrigger() {
  const yaExiste = ScriptApp.getProjectTriggers()
    .some(t => t.getHandlerFunction() === "_checkAutoResetNuevoDia");
  if (!yaExiste) {
    ScriptApp.newTrigger("_checkAutoResetNuevoDia").timeBased().everyDays(1).atHour(4).create();
  }
}

function resetearPedidoManualmente() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.alert("🗑️ Reiniciar Pedido Diario", "¿Estás seguro de que deseas borrar las cantidades capturadas y reiniciar el pedido del día?", ui.ButtonSet.YES_NO);
  if (resp === ui.Button.YES) {
    _resetearPedidoSilencioso();
    try {
      SpreadsheetApp.getActive().toast("Pedido borrado y limpiado correctamente ✓", "⚙️ Mise", 4);
    } catch(e) {}
  }
}

// Reset diario (activador 00:00, respaldo 04:00 o menú). Envoltura: deja constancia en el latido
// aunque el reset falle, para que Bodega distinga "no corrió" de "corrió con error".
function _resetearPedidoSilencioso(e) {
  const props = PropertiesService.getScriptProperties();
  try {
    const r = _resetearPedidoSilenciosoCore(e);
    props.setProperty("ULTIMO_RESET_TS", String(Date.now()));
    props.setProperty("LAST_AUTO_RESET_DATE", _fmtDate(new Date())); // 1.7.7h: el respaldo y la apertura ya no repiten el reset
    props.setProperty("ULTIMO_RESET_ERROR", "");
    if (e && e.triggerUid) _sincronizarSiCambioCatalogo("reset 00:00");
    return r;
  } catch (err) {
    props.setProperty("ULTIMO_RESET_ERROR", String(err.message || err).substring(0, 200));
    throw err;
  } finally {
    _latidoTienda(e && e.triggerUid ? "reset 00:00" : "reset", true);
  }
}

function _resetearPedidoSilenciosoCore(e) {
  const tId = "_resetearPedidoSilencioso_" + Date.now();
  MiseLogger.time(tId);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_PEDIDO);
  if (!sheet) return;
  
  // Issue 6: Registrar evidencias en LOG_SURTIDO antes de vaciar las cantidades
  try { _registrarLogSurtidoDiario(ss, sheet); } catch(e) {}

  const count = _getProductCount();
  sheet.getRange(DATA_START_ROW, COL_CANT_PEDIR, count, 1).clearContent();
  sheet.getRange(DATA_START_ROW, COL_RECIBIDA, count, 2).clearContent(); // Limpiar Col H (Cant. Recibida) y Col I (Estado)
  if (_layoutPedido(sheet).esquema === 2) sheet.getRange(DATA_START_ROW, 10, count, 1).clearContent(); // J reservada (esquema 2); en el 3 J es MÍN|MÁX
  
  const bgs = [];
  for (let i = 0; i < count; i++) {
    const row = Array(_layoutPedido().numCols).fill(i % 2 === 0 ? COLORS.neutral_a : COLORS.neutral_b);
    row[COL_CANT_PEDIR - 1] = COLORS.yellow; // Col F
    row[4]                  = COLORS.blue;   // Col E
    bgs.push(row);
  }
  sheet.getRange(DATA_START_ROW, 1, count, _layoutPedido().numCols).setBackgrounds(bgs);

  // Limpiar la pestaña de Surtido Rápido si existe para reiniciar recepción sin romper fórmulas
  const surtido = ss.getSheetByName("🚚 SURTIDO RÁPIDO");
  if (surtido) {
    try {
      ss.deleteSheet(surtido);
    } catch(e) {
      try {
        const lastRow = surtido.getLastRow();
        if (lastRow >= 4) {
          surtido.getRange(4, 1, lastRow - 3, surtido.getMaxColumns()).clearContent().clearFormat().clearDataValidations();
          const protections = surtido.getProtections(SpreadsheetApp.ProtectionType.RANGE);
          protections.forEach(p => { if (p.canEdit()) p.remove(); });
        }
      } catch(err) {}
    }
  }

  // Re-aplicar formatos condicionales y visibilidad de inactivos
  _aplicarFormatosCondicionales(sheet);
  _actualizarVisibilidadInactivos(sheet);
  if (_layoutPedido(sheet).esquema === 2) sheet.hideColumns(10); // J reservada solo existe en esquema 2

  // Resetear los flags de ordenamiento y surtido activo
  PropertiesService.getScriptProperties().setProperty("IS_ORDER_SORTED", "false");
  PropertiesService.getScriptProperties().setProperty("IS_SURTIDO_ACTIVE", "false");
  
  const dur = MiseLogger.timeEnd(tId);
  MiseLogger.info("_resetearPedidoSilencioso", `Pedido diario reseteado (${count} productos limpiados).`, dur);

  // Enlace vivo con Bodega: si _SYNC quedó con valores fijos, restaurar el IMPORTRANGE
  try { _asegurarSyncVivo(); } catch (errSync) {}

  // Actualización de estructura pendiente: justo después del reset (sin capturas del día en juego)
  _migrarSiEsActivador(e);
}

/**
 * Issue 6: Guarda una fila por producto con entrega (COMPLETO o PARCIAL) en 🗒 LOG_SURTIDO
 */
function _registrarLogSurtidoDiario(ss, sheet) {
  let logSheet = ss.getSheetByName("🗒 LOG_SURTIDO");
  if (!logSheet) {
    logSheet = ss.insertSheet("🗒 LOG_SURTIDO");
    logSheet.getRange(1, 1, 1, 7).setValues([["Fecha", "Bodega", "Producto", "Categoría", "Cant.Pedida", "Cant.Recibida", "Estado"]])
      .setBackground(COLORS.logHeader).setFontColor("#FFFFFF").setFontWeight("bold");
    logSheet.setFrozenRows(1);
  }

  const lr = sheet.getLastRow();
  if (lr < DATA_START_ROW) return;
  const count = lr - DATA_START_ROW + 1;
  const data = sheet.getRange(DATA_START_ROW, 1, count, 10).getValues();

  const hoy = new Date();
  const fechaObj = hoy.getHours() < 5 ? new Date(hoy.getTime() - 24 * 60 * 60 * 1000) : hoy;
  const fechaStr = _fmtDate(fechaObj);
  const logRows = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const prodName = String(row[2] || "").trim();
    const catName  = String(row[1] || "").trim();
    const cantPed  = parseFloat(row[5]) || 0;
    const cantRec  = parseFloat(row[7]) || 0;
    const estado   = String(row[8] || "").trim();

    // Misma regla que el descuento de Bodega: solo cuenta lo registrado (número, ✅ o ❌). Sin registro → 0.
    // El estado se normaliza (un "#NAME?" o variante no cuenta) y, si falta, se deduce de la cantidad recibida.
    const est = _normalizarEstado(estado);
    if (prodName && (cantPed > 0 || cantRec > 0 || est)) {
      const cantEfectiva = (est === "INEXISTENTE") ? 0
        : (cantRec > 0) ? cantRec
        : (est === "COMPLETO") ? cantPed : 0;
      logRows.push([
        fechaStr,
        BODEGA_NOMBRE,
        prodName,
        catName,
        cantPed,
        cantEfectiva,
        est || (cantEfectiva > 0 ? _estadoRecepcion(cantEfectiva, cantPed) : "SIN_REGISTRO")
      ]);
    }
  }

  if (logRows.length > 0) {
    _asegurarEncabezadoLogSurtido(logSheet);
    const startRow = Math.max(logSheet.getLastRow() + 1, 2);
    logSheet.getRange(startRow, 1, logRows.length, 7).setValues(logRows);
  }
}

// Reinicio "de respaldo" (04:00 y al abrir). 1.7.7h: el de las 00:00 no marcaba LAST_AUTO_RESET_DATE; si el respaldo de
// las 04:00 no corría, la primera APERTURA del día borraba el pedido ya capturado (pasó en Mercado PROD, 02/oct). Ahora:
//  · si el reset de hoy ya ocurrió (00:00 o manual) → solo se marca la fecha;
//  · al abrir, en horario de operación (06:00 en adelante) NUNCA se limpia: se deja aviso en el registro.
const RESET_APERTURA_HASTA_HORA = 6;
function _checkAutoResetNuevoDia(e) {
  try {
    const ahora = new Date();
    const todayStr = _fmtDate(ahora);
    const props = PropertiesService.getScriptProperties();
    const lastReset = props.getProperty("LAST_AUTO_RESET_DATE");
    if (lastReset !== todayStr) {
      const tsReset = parseInt(props.getProperty("ULTIMO_RESET_TS") || "0", 10);
      const esActivador = !!(e && e.triggerUid);
      if (tsReset && _fmtDate(new Date(tsReset)) === todayStr) {
        props.setProperty("LAST_AUTO_RESET_DATE", todayStr);
      } else if (esActivador || ahora.getHours() < RESET_APERTURA_HASTA_HORA) {
        _resetearPedidoSilencioso();
        props.setProperty("LAST_AUTO_RESET_DATE", todayStr);
      } else if (props.getProperty("AVISO_SIN_RESET") !== todayStr) {
        props.setProperty("AVISO_SIN_RESET", todayStr);
        MiseLogger.warn("_checkAutoResetNuevoDia", "Hoy no corrió el reinicio de las 00:00 ni el de las 04:00. Por seguridad NO se limpió el pedido al abrir (puede tener capturas de hoy). Revisa los activadores (🛠 Técnico → 🚀 Configurar).");
      }
    }
  } catch(err) {}
  // Respaldo de las 04:00: reintenta una actualización de estructura pendiente
  _migrarSiEsActivador(e);
  if (e && e.triggerUid) _latidoTienda("respaldo 04:00", true);
}

function _fmtDate(date) {
  if (!date || isNaN(date)) return "—";
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}

function repararSistemaTienda() {
  _abrirMonitor("reparar");
}

function _repararSistemaTiendaCore(rep) {
  const tId = "repararSistemaTienda_" + Date.now();
  MiseLogger.time(tId);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return rep.cerrar(false, "⚠️ Archivo ocupado", "Otro proceso está trabajando; intenta de nuevo en unos segundos.");

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const syncCount = _reconstruirPedidoDiarioCore(_leerCapturasTienda(ss.getSheetByName(SHEET_PEDIDO), ss.getSheetByName(SHEET_SURTIDO)), rep);
    const dur = MiseLogger.timeEnd(tId);
    MiseLogger.info("repararSistemaTienda", `Reconstrucción limpia completada: ${syncCount} productos sincronizados y fórmulas reestablecidas.`, dur);
    return rep.cerrar(true, "✅ Pedido sincronizado y reparado", `${syncCount} productos. Tus cantidades se conservaron; formatos y protecciones rehechos.`);
  } catch (err) {
    const dur = MiseLogger.timeEnd(tId);
    MiseLogger.error("repararSistemaTienda", err.message, err, dur);
    return rep.cerrar(false, "❌ Error en reparación", err.message);
  } finally {
    lock.releaseLock();
  }
}

// Estado canónico sin emojis ni variantes de mayúsculas (lo que esperan las reglas de color)
function _normalizarEstado(v) {
  const t = String(v || "").toUpperCase();
  return ["INEXISTENTE", "EXCEDENTE", "PARCIAL", "COMPLETO"].find(k => t.indexOf(k) !== -1) || "";
}

// Captura en RAM (por nombre de producto) todo lo que el usuario o el sistema escribió en el día:
// PEDIDO DIARIO F (pedir), H (recibida), I (estado) + lo marcado en SURTIDO RÁPIDO (E/F/G),
// que tiene prioridad porque es la captura directa del surtidor.
function _leerCapturasTienda(pedido, surtido) {
  const capturas = {};
  if (pedido && pedido.getLastRow() >= DATA_START_ROW) {
    const n = pedido.getLastRow() - DATA_START_ROW + 1;
    pedido.getRange(DATA_START_ROW, 1, n, 10).getValues().forEach(r => {
      const name = String(r[2] || "").trim();
      if (!name) return;
      const c = { pedir: r[COL_CANT_PEDIR - 1], recibida: r[COL_RECIBIDA - 1], estado: _normalizarEstado(r[COL_ESTADO - 1]) };
      if ([c.pedir, c.recibida, c.estado].some(v => v !== "" && v !== null)) capturas[name] = c;
    });
  }
  if (surtido && surtido.getLastRow() >= 4) {
    surtido.getRange(4, 1, surtido.getLastRow() - 3, 7).getValues().forEach(r => {
      const name = String(r[2] || "").trim();
      if (!name) return;
      const ped = parseFloat(r[3]) || 0;
      let recibida = "", estado = "";
      if (r[6] === true) { recibida = 0; estado = "INEXISTENTE"; }
      else if (r[4] !== "" && r[4] !== null && !isNaN(parseFloat(String(r[4]).replace(",", ".")))) {
        recibida = parseFloat(String(r[4]).replace(",", ".")); estado = _estadoRecepcion(recibida, ped);
      } else if (r[5] === true) { recibida = ped; estado = "COMPLETO"; }
      if (estado) {
        const c = capturas[name] || { pedir: ped, recibida: "", estado: "" };
        c.recibida = recibida; c.estado = estado;
        capturas[name] = c;
      }
    });
  }
  return capturas;
}

// Reconstrucción limpia de 📋 PEDIDO DIARIO sin UI (la usan la reparación manual y el motor de migración).
// El llamador debe tener el candado. Lanza Error si la conexión con Bodega no está lista.
function _reconstruirPedidoDiarioCore(backupData, rep = null) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pedido = ss.getSheetByName(SHEET_PEDIDO);
  const sync = ss.getSheetByName(SHEET_SYNC);
  if (!pedido || !sync) throw new Error("No se encontraron las pestañas necesarias del sistema.");

  // 1. Asegurar la conexión IMPORTRANGE en _SYNC
  if (rep) rep.inicio("Enlace con Bodega");
  const url = PropertiesService.getScriptProperties().getProperty(`BODEGA_URL_${BODEGA_KEY}`);
  if (!url) throw new Error(`Falta la propiedad BODEGA_URL_${BODEGA_KEY}. Ve a ⚙️ Mise → Configurar Bodega.`);
  const syncFormula = '=IMPORTRANGE("' + url + '", "'  + VISTA_MOVIL + '!A4:L")';
  if (sync.getRange(4, 1).getFormula() !== syncFormula) {
    sync.getRange(4, 1).clearContent();
    sync.getRange(4, 1).setFormula(syncFormula);
  }

  // 2. Conteo de productos sincronizados
  const syncCount = Math.max(0, sync.getLastRow() - 3);
  if (syncCount < 1) {
    if (rep) rep.fin("Enlace con Bodega", false, "no llegan productos desde Bodega");
    throw new Error("No se detectaron productos sincronizados desde Bodega.");
  }
  if (rep) { rep.fin("Enlace con Bodega", true, `${syncCount} productos`); rep.inicio("Pedido reconstruido (capturas conservadas)"); }

  // 3. Reconstrucción total limpia de la hoja
  _buildPedidoDiario(pedido);
  PropertiesService.getScriptProperties().setProperty("PRODUCT_COUNT", String(syncCount));

  // 4. Ensamblado en matriz 2D unificada, restaurando capturas por nombre de producto
  const DR = DATA_START_ROW;
  const syncVals = sync.getRange(4, 1, syncCount, 12).getValues();
  const orden = _ordenPickingSync(syncVals);
  const outputGrid = [];
  const cleanBgs = [];

  for (let i = 0; i < syncCount; i++) {
    const r = DR + i;
    const sr = 4 + orden[i];
    const pName = String(syncVals[orden[i]][2] || "").trim();
    const b = (backupData && backupData[pName]) || {};

    outputGrid.push(_filaPedido(r, pName, i + 1, b));

    const rowBg = Array(_layoutPedido().numCols).fill(i % 2 === 0 ? COLORS.neutral_a : COLORS.neutral_b);
    rowBg[4] = COLORS.blue;                    // Col E (Saldo Teórico)
    rowBg[COL_CANT_PEDIR - 1] = COLORS.yellow; // Col F (Cant a pedir)
    cleanBgs.push(rowBg);
  }

  const rangeData = pedido.getRange(DR, 1, syncCount, _layoutPedido().numCols);
  rangeData.clearContent();
  rangeData.setBackgrounds(cleanBgs);
  rangeData.setValues(outputGrid); // texto (ESTADO) no se vuelve #NAME?
  if (rep) { rep.fin("Pedido reconstruido (capturas conservadas)", true, ""); rep.inicio("Colores, inactivos y protección"); }

  // 5. Visibilidad, formatos condicionales y protecciones
  _aplicarFormatosCondicionales(pedido);
  _actualizarVisibilidadInactivos(pedido);
  _protegerPedidoDiario(pedido, syncCount);
  SpreadsheetApp.flush();
  if (rep) rep.fin("Colores, inactivos y protección", true, "");
  return syncCount;
}

// Esquema 4 (1.7.7g): el PRODUCTO (C) es un valor fijo y lo demás se busca POR NOMBRE en _SYNC. Antes cada fila apuntaba
// a un NÚMERO de fila de _SYNC: un alta recorría las filas y la cantidad capturada quedaba junto al producto vecino
// (caso real Canada Dry 600 ml). La MISMA función vive en bdg/miseAuthBDG.js (lo verifica simulacion.test.js).
function _formulasPedidoPorNombre(r, hojaSync) {
  const S = "'" + hojaSync + "'!";
  const m = `MATCH($C${r}, ${S}$C$4:$C, 0)`;
  const col = (L) => `INDEX(${S}$${L}$4:$${L}, ${m})`;
  return {
    categoria: `=IFERROR(${col("B")}, "")`,
    unidad: `=IFERROR(${col("D")}, "")`,
    saldo: `=IFERROR(LET(e, ${col("E")}*1, j, ${col("J")}, k, ${col("K")}, e & IF(AND(j=0, k=0), "", IF(e<j, " (-" & (j-e) & ")", IF(e>k, " (+" & (e-k) & ")", " (-)")))), 0)`,
    minmax: `=IFERROR(LET(j, ${col("J")}, k, ${col("K")}, IF(AND(j=0, k=0), "—", j & "  |  " & k)), "—")`
  };
}

// ÚNICO constructor de filas de 📋 PEDIDO DIARIO (A:J en esquema 3+; A:K en el 2).
//   r = fila en PEDIDO · nombre = producto (identidad de la fila) · no = número · c = capturas {pedir, recibida, estado}
function _filaPedido(r, nombre, no, c) {
  const f = _formulasPedidoPorNombre(r, SHEET_SYNC);
  const v = (x) => (x !== "" && x !== null && x !== undefined) ? x : "";
  const fila = [
    no,                                                            // A No
    f.categoria,                                                   // B CATEGORÍA
    nombre,                                                        // C PRODUCTO (valor fijo)
    f.unidad,                                                      // D UNIDAD
    f.saldo,                                                       // E SALDO
    v(c.pedir),                                                    // F CANT. A PEDIR
    '=IF(OR(F' + r + '="", H' + r + '=""), "", H' + r + ' - F' + r + ')', // G DIFERENCIA
    v(c.recibida),                                                 // H RECIBIDA
    v(c.estado),                                                   // I ESTADO
    f.minmax                                                       // J MÍN | MÁX (K en esquema 2)
  ];
  if (_layoutPedido().esquema === 2) fila.splice(9, 0, "");         // esquema 2: J reservada vacía
  return fila;
}

// Índices de _SYNC ordenados como ordenarPedido(): PICKING (col L) → CATEGORÍA → No
function _ordenPickingSync(syncVals) {
  return syncVals.map((_, i) => i).sort((a, b) => {
    const ra = parseInt(syncVals[a][11]) || 9999, rb = parseInt(syncVals[b][11]) || 9999;
    if (ra !== rb) return ra - rb;
    const ca = String(syncVals[a][1] || ""), cb = String(syncVals[b][1] || "");
    if (ca !== cb) return ca.localeCompare(cb);
    return (parseInt(syncVals[a][0]) || 0) - (parseInt(syncVals[b][0]) || 0);
  });
}

// ── 🔄 MOTOR DE MIGRACIÓN DE ESQUEMA (automático en los activadores nocturnos) ──────────
// Cuando un cambio requiere re-armar hojas, se sube MISE_SCHEMA_TIENDA y el libro se actualiza solo
// en la siguiente corrida nocturna (00:00 reset o 04:00 respaldo), abra o no abra alguien la hoja.
//  • Respaldo doble: copia nativa oculta de cada hoja (_RESPALDO_*) + capturas en RAM por producto.
//  • Reintento seguro: si una corrida falla, la siguiente lee las capturas del respaldo original,
//    no de la hoja a medio reconstruir.
//  • Idempotente: solo corre si la versión guardada es menor que la del código.
//  • Compatible: mientras no migra, el código nuevo opera sobre la estructura vieja sin romperla.
const MISE_SCHEMA_TIENDA = 4; // 2 = v1.7.5 (DIFERENCIA intra-fila, CANT. FINAL) · 3 = v1.7.6k (sin columna J reservada) · 4 = v1.7.7g (PRODUCTO fijo, lo demás por nombre)
const PROP_SCHEMA        = "MISE_SCHEMA_VERSION";
const PROP_MIGRANDO      = "MISE_SCHEMA_MIGRANDO";
const SHEET_SURTIDO      = "🚚 SURTIDO RÁPIDO";

function _respaldoMigracion(ss, sheet, etiqueta, reutilizar) {
  const nombre = `_RESPALDO_${etiqueta}_v${MISE_SCHEMA_TIENDA}`;
  const previo = ss.getSheetByName(nombre);
  if (previo && reutilizar) return previo;
  if (previo) ss.deleteSheet(previo);
  if (!sheet) return null;
  const copia = sheet.copyTo(ss).setName(nombre);
  try { copia.hideSheet(); } catch(e) {}
  return copia;
}

function _migrarEsquemaTienda() {
  const props = PropertiesService.getScriptProperties();
  const actual = parseInt(props.getProperty(PROP_SCHEMA) || "1", 10);
  if (actual >= MISE_SCHEMA_TIENDA) return false;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    MiseLogger.warn("_migrarEsquemaTienda", "Candado ocupado; se reintentará en la siguiente corrida.");
    return false;
  }
  const tId = "_migrarEsquemaTienda_" + Date.now();
  MiseLogger.time(tId);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const pedido = ss.getSheetByName(SHEET_PEDIDO);
    if (!pedido) return false;
    const surtido = ss.getSheetByName(SHEET_SURTIDO);

    // Reintento tras un fallo: capturas desde el respaldo original, no desde la hoja a medias
    const reintento = props.getProperty(PROP_MIGRANDO) === String(MISE_SCHEMA_TIENDA);
    const respPedido = _respaldoMigracion(ss, pedido, "PEDIDO", reintento);
    const respSurtido = _respaldoMigracion(ss, surtido, "SURTIDO", reintento);
    props.setProperty(PROP_MIGRANDO, String(MISE_SCHEMA_TIENDA));
    const capturas = _leerCapturasTienda(respPedido, respSurtido);

    // Esquema 3: quitar físicamente la J reservada; MÍN|MÁX y las auxiliares se recorren solas (y Google
    // ajusta sus rangos). Idempotente: si ya no está (reintento), no se toca.
    if (_layoutPedido(pedido).esquema === 2) {
      pedido.deleteColumn(10);
      _layoutCache = null;
    }

    const n = _reconstruirPedidoDiarioCore(capturas);
    if (surtido || respSurtido) _generarSurtidoRapidoInternal(false);

    // Verificación: toda captura de un producto vigente debe estar de vuelta en su lugar
    const vigentes = {};
    pedido.getRange(DATA_START_ROW, 1, n, 10).getValues().forEach(r => { vigentes[String(r[2] || "").trim()] = r; });
    const perdidas = [], descontinuados = [];
    Object.keys(capturas).forEach(name => {
      const r = vigentes[name];
      if (!r) { descontinuados.push(name); return; }
      const c = capturas[name];
      if (String(r[COL_CANT_PEDIR - 1]) !== String(c.pedir) || String(r[COL_RECIBIDA - 1]) !== String(c.recibida)) perdidas.push(name);
    });

    props.setProperty(PROP_SCHEMA, String(MISE_SCHEMA_TIENDA));
    props.deleteProperty(PROP_MIGRANDO);
    const dur = MiseLogger.timeEnd(tId);
    MiseLogger.info("_migrarEsquemaTienda", `Esquema ${actual} → ${MISE_SCHEMA_TIENDA}: ${n} productos, ` +
      `${Object.keys(capturas).length} capturas respaldadas, ${perdidas.length} sin restaurar, ` +
      `${descontinuados.length} de productos ya no vigentes. Respaldo en _RESPALDO_*_v${MISE_SCHEMA_TIENDA}.`, dur);
    if (perdidas.length || descontinuados.length) {
      MiseLogger.warn("_migrarEsquemaTienda", `Revisar contra _RESPALDO_PEDIDO_v${MISE_SCHEMA_TIENDA}: ` +
        `sin restaurar [${perdidas.join(", ")}] · no vigentes [${descontinuados.join(", ")}]`);
    }
    return true;
  } catch (err) {
    const dur = MiseLogger.timeEnd(tId);
    MiseLogger.error("_migrarEsquemaTienda", `Migración a esquema ${MISE_SCHEMA_TIENDA} falló; se reintentará: ${err.message}`, err, dur);
    return false;
  } finally {
    lock.releaseLock();
  }
}

// Solo en activadores de tiempo (traen triggerUid): el onOpen simple tiene 30 s y no debe migrar
function _migrarSiEsActivador(e) {
  if (e && e.triggerUid) {
    try { _migrarEsquemaTienda(); } catch (err) {}
  }
}

function aplicarActualizacionPendienteManualmente() {
  const actual = parseInt(PropertiesService.getScriptProperties().getProperty(PROP_SCHEMA) || "1", 10);
  if (actual >= MISE_SCHEMA_TIENDA) {
    const ui = SpreadsheetApp.getUi();
    ui.alert("✅ Al día", `La estructura ya está en la versión ${actual}.`, ui.ButtonSet.OK);
    return;
  }
  _abrirMonitor("actualizar");
}

function _aplicarActualizacionCore(rep) {
  const actual = parseInt(PropertiesService.getScriptProperties().getProperty(PROP_SCHEMA) || "1", 10);
  rep.inicio("Respaldo, actualización y restauración de capturas");
  const ok = _migrarEsquemaTienda();
  rep.fin("Respaldo, actualización y restauración de capturas", ok, ok ? `versión ${actual} → ${MISE_SCHEMA_TIENDA}` : "revisa 🗒 LOG");
  return rep.cerrar(ok, ok ? "✅ Estructura actualizada" : "⚠️ No se pudo actualizar",
    ok ? "Tus capturas se respaldaron y restauraron." : "Se reintentará automáticamente esta noche.");
}

function _protegerPedidoDiario(sheet, count) {
  if (!sheet) return;
  const countToProtect = count || _getProductCount();
  
  // Remover protecciones previas en la pestaña
  const protections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  protections.forEach(p => {
    try { p.remove(); } catch(e) {}
  });

  const sheetProtection = sheet.protect().setDescription("Protección anti-dummies de PEDIDO DIARIO");
  const me = Session.getEffectiveUser().getEmail();
  sheetProtection.getEditors().forEach(editor => {
    if (editor.getEmail() !== me) {
      try { sheetProtection.removeEditor(editor); } catch(e) {}
    }
  });

  // Rangos desprotegidos (únicos donde el usuario puede escribir):
  // 1. Fila 2 Checkboxes (C2, E2, G2)
  const checkboxesFila2 = sheet.getRange("B2:G2");
  // 2. Columna F (CANT. A PEDIR, de la fila 4 hasta el final de la tabla)
  const rangeCantPedir = sheet.getRange(DATA_START_ROW, COL_CANT_PEDIR, Math.max(1, countToProtect), 1);

  sheetProtection.setUnprotectedRanges([checkboxesFila2, rangeCantPedir]);
}

// ── 🔐 CONTRASEÑA DE ADMINISTRADOR (1.7.6j) ───────────────────────────────────────────────────
// Nunca en el código: solo su huella SHA-256 en la propiedad ADMIN_PASSWORD_HASH de este libro (ni los editores del
// script pueden leerla). Solo el dueño del libro la define o cambia. Sin contraseña definida, lo destructivo queda bloqueado.
function _hashAdmin(txt) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, "mise-admin:" + txt, Utilities.Charset.UTF_8));
}

function _validarPasswordAdmin(ui, titulo, mensaje) {
  const hash = PropertiesService.getScriptProperties().getProperty("ADMIN_PASSWORD_HASH");
  if (!hash) {
    ui.alert("🔐 Sin contraseña de administrador",
      "Esta acción está bloqueada hasta que el dueño del libro defina la contraseña en:\n⚙️ Mise → Mantenimiento Avanzado → 🔐 Cambiar contraseña de administrador.", ui.ButtonSet.OK);
    return false;
  }
  const r = ui.prompt(titulo, mensaje, ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return false;
  if (_hashAdmin(r.getResponseText().trim()) !== hash) {
    MiseLogger.warn("_validarPasswordAdmin", `Contraseña incorrecta en "${titulo}"`);
    ui.alert("❌ Contraseña incorrecta. Operación abortada.");
    return false;
  }
  return true;
}

function _esDuenoDelLibro() {
  try {
    const dueno = SpreadsheetApp.getActiveSpreadsheet().getOwner();
    if (!dueno) return true; // Unidad compartida: sin dueño individual
    return dueno.getEmail() === Session.getActiveUser().getEmail();
  } catch (e) { return false; }
}

function cambiarPasswordAdmin() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();
  if (!_esDuenoDelLibro()) { ui.alert("🔐 Solo el dueño del libro puede cambiar la contraseña de administrador."); return; }
  if (props.getProperty("ADMIN_PASSWORD_HASH") &&
      !_validarPasswordAdmin(ui, "🔐 Cambiar contraseña de administrador", "Escribe la contraseña ACTUAL:")) return;
  const n1 = ui.prompt("🔐 Nueva contraseña de administrador",
    "Mínimo 10 caracteres. No se guarda en el código ni en texto: solo su huella cifrada en este libro.", ui.ButtonSet.OK_CANCEL);
  if (n1.getSelectedButton() !== ui.Button.OK) return;
  const nueva = n1.getResponseText().trim();
  if (nueva.length < 10) { ui.alert("❌ Debe tener al menos 10 caracteres. No se cambió nada."); return; }
  const n2 = ui.prompt("🔐 Confirmar contraseña", "Escríbela otra vez:", ui.ButtonSet.OK_CANCEL);
  if (n2.getSelectedButton() !== ui.Button.OK) return;
  if (n2.getResponseText().trim() !== nueva) { ui.alert("❌ No coinciden. No se cambió nada."); return; }
  props.setProperty("ADMIN_PASSWORD_HASH", _hashAdmin(nueva));
  props.deleteProperty("ADMIN_PASSWORD"); // formato anterior (texto plano), si existía
  MiseLogger.info("cambiarPasswordAdmin", "Contraseña de administrador actualizada");
  ui.alert("✅ Contraseña actualizada en este libro.\n\nCada libro guarda la suya: repite esto en Bodega, Andares y Mercado (PROD y DEV).");
}

function setupCompleto() {
  const ui   = SpreadsheetApp.getUi();
  if (!_validarPasswordAdmin(ui, "⚠️ Restablecer sistema (Acción Destructiva)",
    "Esta operación borrará y reconstruirá la hoja de Pedido Diario por completo.\n\nIngresa la contraseña de administrador para continuar:")) return;

  const resp = ui.alert(
    "⚠️ Confirmación Final",
    "¿Estás absolutamente seguro de que deseas borrar y reconstruir el archivo?",
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return; // antes faltaba: con "No" también borraba todo

  // Purgar estados de sesión pero PRESERVAR infraestructura (enlace con Bodega), contraseña y entorno
  const props = PropertiesService.getScriptProperties();
  const conservar = {};
  [`BODEGA_URL_${BODEGA_KEY}`, "BODEGA_KEY", "BODEGA_NOMBRE", "ADMIN_PASSWORD_HASH", "MISE_ENV"]
    .forEach(k => { const v = props.getProperty(k); if (v) conservar[k] = v; });

  props.deleteAllProperties();
  try { SpreadsheetApp.flush(); } catch(e) {}

  if (Object.keys(conservar).length) props.setProperties(conservar);
  
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  // Forzar configuración regional de México para evitar errores de análisis de fórmula (Inglés + comas)
  try { ss.setSpreadsheetLocale('es_MX'); } catch(e) {}
  
  // Hojas del sistema que queremos conservar (incluye _LOGS)
  const systemSheetNames = [SHEET_PEDIDO, SHEET_SYNC, "_LOGS"];
  ss.getSheets().forEach(s => {
    const name = s.getName();
    if (!systemSheetNames.includes(name)) {
      try { ss.deleteSheet(s); } catch(e) {}
    }
  });

  // Reutilizar o crear SHEET_PEDIDO
  let pedido = ss.getSheetByName(SHEET_PEDIDO);
  if (pedido) {
    pedido.clear();
    pedido.clearConditionalFormatRules();
    pedido.setHiddenGridlines(false);
    pedido.setFrozenRows(0);
    pedido.setFrozenColumns(0);
    try { pedido.showSheet(); } catch(e) {}
  } else {
    pedido = ss.insertSheet(SHEET_PEDIDO);
  }

  _buildPedidoDiario(pedido);
  MiseLogger.info("setupCompleto", "Sistema de Pedido Diario reestructurado desde cero.");
}

function _buildPedidoDiario(sheet) {
  if (sheet.getMaxColumns() < _layoutPedido().numCols) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), Math.max(1, _layoutPedido().numCols - sheet.getMaxColumns()));
  }

  // Banner superior partiendo de la Columna C visible (C1)
  sheet.getRange(1, 1, 1, _layoutPedido().numCols).clearContent().setBackground(null);
  sheet.getRange(1, 3, 1, _layoutPedido().numCols - 2).clearContent().setBackground("#3D5A47");
  sheet.getRange("C1")
    .setFormula('="MISE — PEDIDO DIARIO · ' + BODEGA_NOMBRE + '   |   La Crêpe Parisienne   ·   " & TEXT(TODAY(),"dd/mmm/yyyy")')
    .setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(10).setFontFamily("Arial").setHorizontalAlignment("left").setVerticalAlignment("middle");
  sheet.setRowHeight(1, 30);

  // Fila 2: Botón Interactivo Único (F2 = 🚚 Surtido Rápido)
  sheet.getRange("A2:ZZ2").setBackground(null).clearContent().clearDataValidations();
  sheet.getRange(2, 1, 1, _layoutPedido().numCols).setBackground("#7A9E8A");
  sheet.getRange(3, 1, 1, _layoutPedido().numCols).setBackground(null).clearContent().clearDataValidations();

  // Col C: Etiqueta explicativa del botón único
  sheet.getRange("C2").setValue("🚚  Surtido Rápido:").setFontWeight("bold").setFontColor("#FFFFFF").setHorizontalAlignment("right").setVerticalAlignment("middle").setFontSize(9);
  
  // Col F: Casilla táctil interactiva que acciona el Surtido Rápido
  sheet.getRange("F2").insertCheckboxes().setValue(false).setBackground("#FFFCD0");
  sheet.setRowHeight(2, 26);

  // Fila 3: Headers (Encabezados institucionales de la tabla)
  sheet.getRange(3, 1, 1, _layoutPedido().numCols)
    .setValues([_layoutPedido(sheet).esquema === 2
      ? ["No","CATEGORÍA","PRODUCTO","UNIDAD","SALDO TEÓRICO","CANT. A PEDIR","DIFERENCIA","","","","MÍN  |  MÁX"]
      : ["No","CATEGORÍA","PRODUCTO","UNIDAD","SALDO TEÓRICO","CANT. A PEDIR","DIFERENCIA","","","MÍN  |  MÁX"]])
    .setBackground("#3D5A47").setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(9).setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.setRowHeight(3, 32);
  
  // Inmovilización blindada móvil
  sheet.setFrozenRows(3);
  sheet.setFrozenColumns(3); 
  sheet.setHiddenGridlines(false);

  // Reglas de Formato Condicional Nativo para Estados de Pedido
  _aplicarFormatosCondicionales(sheet);
  _actualizarVisibilidadInactivos(sheet);

  _aplicarAnchosColumnas(sheet);
  _aplicarOcultamientoColumnas(sheet);
  
  // Quitar cualquier filtro de la hoja
  try {
    let filter = sheet.getFilter();
    if (filter) filter.remove();
  } catch(err) {}
  
  _actualizarAvisoPedido();
}

// Columnas auxiliares ocultas (ACTIVO, SALDO, MÍN, MÁX) buscadas por NOMBRE en _SYNC: K:N en esquema 3, L:O en el 2.
// Una sola ARRAYFORMULA: ningún escritor de la tabla la pisa y siempre corresponde al producto
// de la fila, sin importar el orden de picking. Reemplaza las reglas INDIRECT(... & ROW()).
function _asegurarColumnasAuxiliaresPedido(sheet) {
  const COL_AUX = _layoutPedido(sheet).colAux;
  if (sheet.getMaxColumns() < COL_AUX + 3) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), COL_AUX + 3 - sheet.getMaxColumns());
  }
  const formula = `=ARRAYFORMULA(IF(C${DATA_START_ROW}:C="",,IFERROR(VLOOKUP(C${DATA_START_ROW}:C,'${SHEET_SYNC}'!C4:K,{7,3,8,9},FALSE))))`;
  if (sheet.getRange(DATA_START_ROW, COL_AUX).getFormula() !== formula) {
    const maxRows = sheet.getMaxRows();
    if (maxRows >= DATA_START_ROW) sheet.getRange(DATA_START_ROW, COL_AUX, maxRows - DATA_START_ROW + 1, 4).clearContent();
    sheet.getRange(3, COL_AUX, 1, 4).setValues([["_ACTIVO", "_SALDO", "_MÍN", "_MÁX"]]);
    sheet.getRange(DATA_START_ROW, COL_AUX).setFormula(formula);
  }
  sheet.hideColumns(COL_AUX, 4);
}

// Pedido cómodo en el celular (1.7.6u–v): filas más altas, PRODUCTO / CANT. A PEDIR más grandes, la casilla de
// 🚚 Surtido Rápido (F2) más grande (una casilla crece con el tamaño de letra) y sin columnas vacías a la derecha
// (en el celular no hay a dónde desplazarse "muy lejos").
function _estiloTactilPedido(sheet, count) {
  if (!count || count < 1) return;
  try {
    sheet.setRowHeights(DATA_START_ROW, count, 34);
    sheet.getRange(DATA_START_ROW, 3, count, 1).setFontSize(12).setVerticalAlignment("middle");
    sheet.getRange(DATA_START_ROW, COL_CANT_PEDIR, count, 1).setFontSize(13).setFontWeight("bold")
      .setHorizontalAlignment("center").setVerticalAlignment("middle");
    sheet.getRange("C2").setFontSize(11);
    sheet.getRange("F2").setFontSize(20).setHorizontalAlignment("center").setVerticalAlignment("middle");
    sheet.setRowHeight(2, 40);
    _ocultarColumnasSobrantes(sheet, _layoutPedido(sheet).colAux + 3);
    _colorearPestanasTienda(SpreadsheetApp.getActiveSpreadsheet());
  } catch (e) {}
}

// Surtido Rápido táctil (1.7.6v): filas altas, letra grande, casillas ✅/❌ grandes y sin filas/columnas sobrantes
function _estiloTactilSurtido(sheet, n) {
  try {
    if (n > 0) {
      sheet.setRowHeights(4, n, 38);
      sheet.getRange(4, 2, n, 1).setFontSize(11).setWrap(true).setHorizontalAlignment("left").setVerticalAlignment("middle");
      sheet.getRange(4, 5, n, 1).setFontSize(14).setFontWeight("bold").setHorizontalAlignment("center").setVerticalAlignment("middle");
      sheet.getRange(4, 6, n, 2).setFontSize(18).setHorizontalAlignment("center").setVerticalAlignment("middle");
      sheet.getRange(4, 8, n, 1).setFontSize(12).setFontWeight("bold").setHorizontalAlignment("center").setVerticalAlignment("middle");
    }
    _ocultarColumnasSobrantes(sheet, 11);                       // hasta K (resumen)
    _colorearPestanasTienda(sheet.getParent ? sheet.getParent() : SpreadsheetApp.getActiveSpreadsheet());
    const ultima = Math.max(3 + n, 8);                         // datos o resumen (J3:K8), lo que llegue más abajo
    const maxR = sheet.getMaxRows();
    sheet.showRows(1, maxR);
    if (maxR > ultima + 1) sheet.hideRows(ultima + 2, maxR - ultima - 1); // deja 1 fila de aire
  } catch (e) {}
}

// Pestañas con color por uso, como en Bodega (1.7.6w): capturar = amarillo/verde, consulta y técnicas = gris
function _colorearPestanasTienda(ss) {
  const colores = { [SHEET_PEDIDO]: "#4A6E58", [SHEET_SURTIDO]: "#F9A825", "🗒 LOG_SURTIDO": "#B0BEC5" };
  ss.getSheets().forEach(h => {
    const n = h.getName();
    try { h.setTabColor(colores[n] || (n.startsWith("_") ? "#CFD8DC" : null)); } catch (e) {}
  });
}

function _ocultarColumnasSobrantes(sheet, ultimaUtil) {
  const maxC = sheet.getMaxColumns();
  if (maxC > ultimaUtil) sheet.hideColumns(ultimaUtil + 1, maxC - ultimaUtil);
}

function _aplicarFormatosCondicionales(sheet) {
  _asegurarColumnasAuxiliaresPedido(sheet);
  sheet.clearConditionalFormatRules();
  const count = _getProductCount();
  if (count < 1) return;
  const L = _layoutPedido(sheet);
  const [cA, cS, cMin, cMax] = L.letrasAux; // _ACTIVO, _SALDO, _MÍN, _MÁX
  const range = sheet.getRange(DATA_START_ROW, 1, count, L.numCols);
  const rangeE = sheet.getRange(DATA_START_ROW, 5, count, 1);
  // (Regla de ADICIÓN retirada en 1.7.6e)
      
  // Regla 1.5: Inactivos (gris)
  const ruleInactivo = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=$${cA}4="NO"`)
    .setBackground("#EEEEEE")
    .setFontColor("#9E9E9E")
    .setItalic(true)
    .setRanges([range])
    .build();
      
  // Regla 2: Completos (Verde suave - Directo desde Col I ESTADO)
  const ruleCompleto = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$I4="COMPLETO"')
    .setBackground(COLORS.completo)
    .setRanges([range])
    .build();

  // Regla 3: Inexistente / 0 Recibido (Rojo suave - Directo desde Col I ESTADO)
  const ruleInexistente = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$I4="INEXISTENTE"')
    .setBackground(COLORS.inexistente)
    .setRanges([range])
    .build();
      
  // Regla 4: Parciales / Menor recibido (Naranja suave - Directo desde Col I ESTADO)
  const ruleParcial = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$I4="PARCIAL"')
    .setBackground(COLORS.parcial)
    .setRanges([range])
    .build();

  // Regla 4b: Excedentes / Mayor recibido (Azul claro suave - Directo desde Col I ESTADO)
  const ruleExcedente = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$I4="EXCEDENTE"')
    .setBackground("#E1F5FE")
    .setRanges([range])
    .build();
      
  // Regla 5: Pendientes (Tiene pedido pero aún no tiene entrega registrada)
  const rulePendiente = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($F4>0, $I4="")')
    .setBackground(COLORS.pendiente)
    .setRanges([range])
    .build();

  const rules = [ruleCompleto, ruleParcial, ruleExcedente, ruleInexistente, rulePendiente, ruleInactivo];
  
  // Reglas Semáforo en Columna E (SALDO TEÓRICO) — leen las auxiliares de su propia fila (saldo, mín, máx)
  const _sem = (f, bg, fg) => rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(f).setBackground(bg).setFontColor(fg).setRanges([rangeE]).build());
  const [S, N, X] = [`$${cS}4`, `$${cMin}4`, `$${cMax}4`];
  _sem(`=AND(${N}>0, ${S}<0.5*${N})`,                     "#FFCDD2", "#B71C1C");
  _sem(`=AND(${N}>0, ${S}<${N}, ${S}>=0.5*${N})`,         "#FFE0B2", "#BF360C");
  _sem(`=AND(OR(${N}>0, ${X}>0), ${S}>=${N}, ${S}<=${X})`, "#C8E6C9", "#1B5E20");
  _sem(`=AND(${X}>0, ${S}>${X})`,                         "#B3E5FC", "#0D47A1");
  _sem(`=AND($C4<>"", ${N}=0, ${X}=0)`,                   "#CFD8DC", "#37474F");
      
  sheet.setConditionalFormatRules(rules);
  _estiloTactilPedido(sheet, count);
}

const MISE_VERSION = "1.7.7l";   // debe coincidir con la cabecera (línea 2); lo verifica tests/suites/version.test.js
const MISE_EPOCA   = "Altair";
const MISE_NOVEDADES = [
  "🚚 Surtido: el producto y lo pedido siempre a la vista, incluso en pantallas chicas",
  "Pedido y Surtido Rápido más cómodos en el celular: filas altas, letra y casillas grandes, sin desplazarse de más",
  "Menú más simple: ⚙️ Mise para el día a día y 🛠 Técnico para mantenimiento",
  "Pides en tu unidad (domo, caja, paquete) y el saldo y los colores ya se ven en esa misma unidad",
  "Pedido Diario más limpio: se retiró una columna vacía que quedaba de una función antigua",
  "Los cambios de catálogo de Bodega (orden y productos desactivados) se aplican solos al abrir",
  "Bodega ve si esta tienda está al día (latido automático, sin pasos extra)",
  "Surtido Rápido: escribe lo recibido y la fila completa se pinta sola",
  "CANT. FINAL: lo que ves es lo que Bodega descuenta",
  "Producto y cantidad pedida fijos al deslizar en el celular",
  "El orden de picking y los productos desactivados se aplican correctamente",
  "La hoja se actualiza sola por la noche, sin perder capturas"
];

function acercaDe() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();
  const entorno = props.getProperty("MISE_ENV") === "DEV" ? "🧪 DEV (pruebas)" : "🟢 PRODUCCIÓN";
  const esquema = parseInt(props.getProperty(PROP_SCHEMA) || "1", 10);
  const estructura = esquema >= MISE_SCHEMA_TIENDA ? `✅ al día (v${esquema})` : `⏳ se actualiza esta noche (v${esquema} → v${MISE_SCHEMA_TIENDA})`;
  let activadores = "no disponible";
  try {
    const n = ScriptApp.getProjectTriggers().length;
    activadores = n >= 2 ? `✅ ${n} activos` : `⚠️ ${n} (usa 🚀 Configurar)`;
  } catch (e) {}
  let conexion = "";
  try { conexion = _diagnosticarConexionTienda().linea; } catch (e) {}
  const ultimoReset = props.getProperty("LAST_AUTO_RESET_DATE") || "sin registro aún";

  ui.alert(`⚙️ Mise v${MISE_VERSION} · ${MISE_EPOCA}`,
    `Tienda ${BODEGA_NOMBRE} · La Crêpe Parisienne · Grupo MYT\n` +
    `Entorno: ${entorno}\n\n` +
    `🩺 Estado\n• Estructura: ${estructura}\n• Activadores: ${activadores}\n• Último reinicio diario: ${ultimoReset}\n` +
    (conexion ? `• ${conexion.replace(/\n/g, "\n• ")}\n` : "") +
    `\n✨ Novedades\n• ${MISE_NOVEDADES.join("\n• ")}\n\n` +
    `Arquitectura y desarrollo: Ibrahim García (@ultimaibrahim)`,
    ui.ButtonSet.OK);
}

function _actualizarVisibilidadInactivos(sheet) {
  const count = _getProductCount();
  if (count < 1) return;
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sync = ss.getSheetByName(SHEET_SYNC);
  if (!sync) return;
  
  const syncCount = Math.max(0, sync.getLastRow() - 3);
  if (syncCount < 1) return;

  sheet.showRows(DATA_START_ROW, count);
  
  const syncValues = sync.getRange(4, 3, syncCount, 7).getValues(); // Column C (PRODUCTO) to I (ACTIVO)
  const activeMap = {};
  for (let i = 0; i < syncValues.length; i++) {
    const prodName = String(syncValues[i][0]).trim();
    const activo = String(syncValues[i][6]).trim(); // Col I is index 6 relative to Col C
    if (prodName) activeMap[prodName] = activo;
  }
  
  const pedidoProducts = sheet.getRange(DATA_START_ROW, 3, count, 1).getValues();
  
  let startHide = -1;
  let hideCount = 0;
  
  for (let i = 0; i < count; i++) {
    const prodName = String(pedidoProducts[i][0]).trim();
    const isInactive = (activeMap[prodName] === "NO");
    const row = DATA_START_ROW + i;
    
    if (isInactive) {
      if (startHide === -1) {
        startHide = row;
        hideCount = 1;
      } else {
        hideCount++;
      }
    } else {
      if (startHide !== -1) {
        sheet.hideRows(startHide, hideCount);
        startHide = -1;
        hideCount = 0;
      }
    }
  }
  
  if (startHide !== -1) {
    sheet.hideRows(startHide, hideCount);
  }
}

// ── SURTIDO RÁPIDO (MOBILE-FIRST RECEPCIÓN) ───────────────────────────────────
// Columnas: A No · B CATEGORÍA (ocultas) · C PRODUCTO · D CANT. PEDIDA (congeladas A:D)
//           E CANT. RECIBIDA (captura libre) · F ✅ COMPLETO · G ❌ INEXISTENTE · H CANT. FINAL (fórmula)
const COL_SURTIDO_FINAL = 8;

function _estadoRecepcion(recibida, pedida) {
  if (recibida === 0) return "INEXISTENTE";
  if (recibida === pedida) return "COMPLETO";
  return recibida > pedida ? "EXCEDENTE" : "PARCIAL";
}

// CANT. FINAL: ❌ manda 0; si hay número manual se usa; si ✅ se toma lo pedido; si nada, vacío
function _formulaCantFinal(r) {
  return `=IF($G${r}=TRUE,0,IF($E${r}<>"",$E${r},IF($F${r}=TRUE,$D${r},"")))`;
}

// Vista del Surtido (columna B, 1.7.6x): "Queso mozzarella fresc…" ⏎ "[PEDIDO - 5]" en negritas. Texto enriquecido (una
// fórmula no puede poner solo una parte en negritas); es seguro porque el Surtido se regenera desde el Pedido y lo pedido
// no se edita aquí. C (nombre) y D (pedido) siguen siendo la fuente de verdad que leen el descuento y la sincronización.
function _vistaSurtido(nombre, pedido) {
  const n = String(nombre || "").trim();
  const corto = n.length > 24 ? n.slice(0, 23) + "…" : n;
  const etiqueta = `[PEDIDO - ${pedido}]`;
  const texto = `${corto}\n${etiqueta}`;
  return SpreadsheetApp.newRichTextValue().setText(texto)
    .setTextStyle(texto.length - etiqueta.length, texto.length, SpreadsheetApp.newTextStyle().setBold(true).build())
    .build();
}

function _generarSurtidoRapidoInternal(activateSheet) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pSheet = ss.getSheetByName(SHEET_PEDIDO);
  if (!pSheet) return;

  const lr = pSheet.getLastRow();
  if (lr < DATA_START_ROW) {
    try { ss.toast("No hay productos en el pedido.", "❌ Surtido", 4); } catch(e) {}
    return;
  }

  // Leer todos los datos del pedido (10 columnas: No, CATEGORÍA, PRODUCTO, UNIDAD, SALDO, CANT. PEDIR, DIFERENCIA, H, I, J)
  const dataRange = pSheet.getRange(DATA_START_ROW, 1, lr - DATA_START_ROW + 1, _layoutPedido().numCols);
  const data = dataRange.getValues();
  const backgrounds = pSheet.getRange(DATA_START_ROW, 3, lr - DATA_START_ROW + 1, 1).getBackgrounds(); // Col C background

  const filtered = [];
  for (let i = 0; i < data.length; i++) {
    const cantPedir = parseFloat(data[i][5]);
    if (!isNaN(cantPedir) && cantPedir > 0) {
      const no = data[i][0];
      const cat = data[i][1];
      const prod = String(data[i][2]).trim();
      const bgColC = String(backgrounds[i][0] || "").toLowerCase();

      // Consultar información directamente desde el pedido diario (columnas ocultas H e I)
      const cantRecibida = data[i][COL_RECIBIDA - 1]; // Col H (index 7)
      const estado = String(data[i][COL_ESTADO - 1] || "").trim(); // Col I (index 8)
      
      const completo = (estado === "COMPLETO");
      const inexistente = (estado === "INEXISTENTE");

      // Producto recién dado de alta (fondo morado en PRODUCTO) se resalta también en Surtido
      let highlightBg = null;
      if (bgColC === "#e8eaf6" || bgColC === "rgb(232, 234, 246)") {
        highlightBg = "#E8EAF6"; // Lavender
      }

      filtered.push({
        rowIdxInPedido: DATA_START_ROW + i,
        no,
        cat,
        prod,
        cantPedir,
        cantRecibida,
        completo,
        inexistente,
        highlightBg
      });
    }
  }

  // Buscar o crear la pestaña de Surtido Rápido
  const sheetName = SHEET_SURTIDO;
  let sSheet = ss.getSheetByName(sheetName);
  if (sSheet) {
    sSheet.clear();
    const protections = sSheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
    protections.forEach(p => { if (p.canEdit()) p.remove(); });
  } else {
    sSheet = ss.insertSheet(sheetName);
  }

  // Encabezado partido EXACTAMENTE en la frontera congelada (A:B | C:H, 1.7.6w): Google no permite congelar
  // columnas que corten una celda combinada. Primero se deshacen las combinaciones de versiones previas.
  // Solo se congela B = vista "producto + lo pedido" (cabe en un iPhone); C/D (nombre y pedido reales) se ocultan
  // pero el código las sigue leyendo (el nombre identifica al producto).
  sSheet.setFrozenColumns(0);
  sSheet.setFrozenRows(0);
  sSheet.getRange(1, 1, sSheet.getMaxRows(), sSheet.getMaxColumns()).breakApart();

  sSheet.getRange("A1:B1").merge()
    .setValue(`🚚 SURTIDO · ${BODEGA_NOMBRE}`)
    .setBackground("#3D5A47").setFontColor("#FFFFFF").setFontWeight("bold")
    .setFontSize(11).setFontFamily("Arial").setHorizontalAlignment("left").setVerticalAlignment("middle");
  sSheet.getRange("C1:H1").merge().setBackground("#3D5A47");
  sSheet.setRowHeight(1, 30);

  // Fila 2 (1.7.6y): avance en la celda congelada (siempre visible) e indicaciones en C2:H2 (C:D ocultas → se leen en E:H)
  sSheet.getRange("A2:B2").merge()
    .setBackground("#E8F5E9").setFontColor("#1B5E20").setFontWeight("bold").setFontSize(10).setWrap(true)
    .setHorizontalAlignment("left").setVerticalAlignment("middle");
  sSheet.getRange("C2:H2").merge()
    .setValue("Escribe lo que llegó en RECIBIDA, o marca ✅ si llegó completo / ❌ si no llegó.")
    .setBackground("#F5EFE6").setFontColor("#333333").setFontSize(9).setWrap(true)
    .setHorizontalAlignment("left").setVerticalAlignment("middle");
  sSheet.setRowHeight(2, 44);

  // Headers de columnas (Fila 3)
  const headers = ["No", "PRODUCTO · PEDIDO", "PRODUCTO", "CANT. PEDIDA", "RECIBIDA", "✅ COMPLETO", "❌ NO LLEGÓ", "FINAL"];
  sSheet.getRange(3, 1, 1, 8)
    .setValues([headers])
    .setBackground("#3D5A47").setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(9)
    .setHorizontalAlignment("center").setVerticalAlignment("middle");
  sSheet.setRowHeight(3, 28);
  
  // Inmovilización de columnas y filas
  // Congelada solo la vista B: producto + lo pedido siempre visibles, incluso en pantallas chicas (iPhone)
  sSheet.setFrozenRows(3);
  sSheet.setFrozenColumns(2);

  sSheet.setColumnWidth(1, 40);   // No (oculta)
  sSheet.setColumnWidth(2, 165);  // PRODUCTO · PEDIDO (vista, congelada)
  sSheet.setColumnWidth(3, 170);  // PRODUCTO (oculta: identifica al producto)
  sSheet.setColumnWidth(4, 70);   // CANT. PEDIDA (oculta: se ve en la vista)
  sSheet.setColumnWidth(5, 82);   // RECIBIDA (editable)
  sSheet.setColumnWidth(6, 62);   // ✅ COMPLETO
  sSheet.setColumnWidth(7, 62);   // ❌ NO LLEGÓ
  sSheet.setColumnWidth(8, 66);   // FINAL (fórmula)

  // Primero mostrar TODO: clear() conserva qué columnas estaban ocultas (versiones previas ocultaban A:B; la vista B quedaba
  // oculta). Después se oculta solo lo que corresponde.
  sSheet.showColumns(1, sSheet.getMaxColumns());
  sSheet.hideColumns(1);    // No
  sSheet.hideColumns(3, 2); // PRODUCTO y CANT. PEDIDA (los muestra la vista B)

  const rows = Math.max(filtered.length, 1);

  if (filtered.length === 0) {
    sSheet.clearConditionalFormatRules();
    sSheet.getRange("A4:J50").setBackground("#FFFFFF");
    sSheet.getRange("B4")
      .setValue("No hay productos pedidos hoy (CANT. A PEDIR = 0).").setWrap(true)
      .setFontStyle("italic").setFontColor("#C62828").setHorizontalAlignment("left").setVerticalAlignment("middle");
    sSheet.setRowHeight(4, 30);
    sSheet.getRange("D4:H4").setValue("");
  } else {
    const values = [];
    const bgs = [];
    const checkCompleto = [];
    const checkInexistente = [];
    
    const valuesE = [];
    
    for (let i = 0; i < rows; i++) {
      const item = filtered[i];
      const bg = i % 2 === 0 ? "#FAFAFA" : "#FFFFFF";
      
      values.push([
        item.no,
        item.cat,
        item.prod,
        item.cantPedir
      ]);

      // Col E: una sola fuente por fila (✅ / ❌ dejan E vacía; CANT. FINAL resuelve el valor)
      if (item.completo || item.inexistente) {
        valuesE.push([""]);
      } else if (item.cantRecibida !== "" && item.cantRecibida !== null && !isNaN(Number(item.cantRecibida))) {
        valuesE.push([Number(item.cantRecibida)]);
      } else {
        valuesE.push([""]);
      }
      
      const rowBg = Array(8).fill(item.highlightBg || bg);
      if (!item.highlightBg) {
        rowBg[4] = COLORS.blue; // Resaltar CANT. RECIBIDA en azul
        rowBg[5] = "#E8F5E9";  // Resaltar COMPLETO en verde claro
        rowBg[6] = "#FFEBEE";  // Resaltar INEXISTENTE en rojo claro
        rowBg[7] = "#ECEFF1";  // CANT. FINAL (solo lectura)
      }
      bgs.push(rowBg);
      
      checkCompleto.push([item.completo]);
      checkInexistente.push([item.inexistente]);
    }

    // Escribir datos básicos Cols 1-4 (No, Cat, Prod, CantPedir)
    sSheet.getRange(4, 1, rows, 4).setValues(values);
    // Columna B = vista: nombre (recortado con "…" si es largo) y debajo [PEDIDO - n] en negritas
    sSheet.getRange(4, 2, rows, 1).setRichTextValues(values.map(v => [_vistaSurtido(v[2], v[3])]));
    
    // Inyectar valores numéricos puros en Col E (Cero fórmulas, cero congelamiento)
    sSheet.getRange(4, 5, rows, 1).setValues(valuesE);

    // CANT. FINAL: fórmula por fila (inglés, comas)
    const formulasH = [];
    for (let i = 0; i < rows; i++) formulasH.push([_formulaCantFinal(4 + i)]);
    sSheet.getRange(4, COL_SURTIDO_FINAL, rows, 1).setFormulas(formulasH)
      .setNumberFormat("0.####").setFontWeight("bold");

    sSheet.getRange(4, 1, rows, 8).setBackgrounds(bgs)
      .setFontFamily("Calibri").setFontSize(10).setVerticalAlignment("middle");
    
    sSheet.getRange(4, 1, rows, 1).setHorizontalAlignment("center").setFontWeight("bold");
    sSheet.getRange(4, 2, rows, 1).setHorizontalAlignment("center");
    sSheet.getRange(4, 3, rows, 1).setHorizontalAlignment("left");
    sSheet.getRange(4, 4, rows, 1).setHorizontalAlignment("right");
    sSheet.getRange(4, 5, rows, 1).setHorizontalAlignment("right");
    sSheet.getRange(4, 8, rows, 1).setHorizontalAlignment("right");

    // Escribir checkboxes
    sSheet.getRange(4, 6, rows, 1).insertCheckboxes().setValues(checkCompleto).setHorizontalAlignment("center");
    sSheet.getRange(4, 7, rows, 1).insertCheckboxes().setValues(checkInexistente).setHorizontalAlignment("center");

    // Validar entrada numérica en la columna E (Cant. Recibida) permitiendo fórmulas locales
    const valRule = SpreadsheetApp.newDataValidation()
      .requireNumberGreaterThanOrEqualTo(0)
      .setAllowInvalid(true)
      .setHelpText("Ingresa una cantidad mayor o igual a 0.")
      .build();
    sSheet.getRange(4, 5, rows, 1).setDataValidation(valRule);

    // Blindaje de Seguridad Nivel 1 en SURTIDO RÁPIDO:
    // Bloquea toda la hoja y desprotege ÚNICAMENTE Cant. Recibida (Col E / 5) y Checkboxes (Cols F y G / 6 y 7)
    try {
      const sProtections = sSheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
      sProtections.forEach(p => { try { p.remove(); } catch(e) {} });

      const sRangeProtections = sSheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
      sRangeProtections.forEach(p => { try { p.remove(); } catch(e) {} });

      const prot = sSheet.protect().setDescription(`Blindaje Total — ${sheetName}`);
      prot.setWarningOnly(false);

      if (prot.canDomainEdit()) prot.setDomainEdit(false);
      const me = Session.getEffectiveUser();
      prot.removeEditors(prot.getEditors());
      prot.addEditor(me);

      // Desproteger únicamente Col E (Cant. Recibida) y Cols F-G (Checkboxes)
      const unprotRecibida = sSheet.getRange(4, 5, rows, 1);
      const unprotChecks = sSheet.getRange(4, 6, rows, 2);
      prot.setUnprotectedRanges([unprotRecibida, unprotChecks]);
    } catch(e) {}

    // Coloreado de fila completa según CANT. FINAL (H) vs CANT. PEDIDA (D). El orden importa: gana la primera.
    sSheet.clearConditionalFormatRules();
    const rangeS = sSheet.getRange(4, 1, rows, 8); // A4:H
    const _regla = (formula, color) => SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(formula).setBackground(color).setRanges([rangeS]).build();
    sSheet.setConditionalFormatRules([
      _regla('=AND($H4<>"", $H4=$D4)', "#C8E6C9"),  // ✅ Exacto (verde)
      _regla('=AND($H4<>"", $H4=0)',   "#FFCDD2"),  // ❌ No llegó (rojo)
      _regla('=AND($H4<>"", $H4<$D4)', "#FFE0B2"),  // ⚠️ Llegó de menos (naranja)
      _regla('=AND($H4<>"", $H4>$D4)', "#E1F5FE"),  // ➕ Llegó de más (azul)
      _regla('=AND($D4>0, $H4="")',    "#FFF9C4")   // ⏳ Sin registrar (amarillo)
    ]);
  }

  // --- TABLA DE RESUMEN (COLUMNAS J-K, basada en CANT. FINAL) ---
  const lastS = 3 + rows;
  // Avance en vivo en la celda congelada: cuántos productos ya tienen FINAL (registrados) de los pedidos
  sSheet.getRange("A2").setFormula(filtered.length
    ? `="📋 "&SUMPRODUCT((H4:H${lastS}<>"")*1)&" de "&SUMPRODUCT((C4:C${lastS}<>"")*1)&" registrados"`
    : `="📋 Sin productos pedidos"`);
  const rH = `H4:H${lastS}`, rD = `D4:D${lastS}`;
  sSheet.getRange("J3:K3").merge()
    .setValue("RESUMEN SURTIDO")
    .setBackground("#3D5A47").setFontColor("#FFFFFF").setFontWeight("bold")
    .setFontSize(9).setFontFamily("Arial").setHorizontalAlignment("center").setVerticalAlignment("middle");

  // Etiquetas como texto puro (Col J) y conteos como fórmulas (Col K) en llamadas separadas
  sSheet.getRange("J4:J8").setValues([
    ["✅ Exactos"], ["⚠️ De menos"], ["➕ De más"], ["❌ No llegó"], ["⏳ Sin registrar"]
  ]);
  sSheet.getRange("K4:K8").setFormulas([
    [`=SUMPRODUCT((${rH}<>"")*(${rH}=${rD}))`],
    [`=SUMPRODUCT((${rH}<>"")*(${rH}>0)*(${rH}<${rD}))`],
    [`=SUMPRODUCT((${rH}<>"")*(${rH}>${rD}))`],
    [`=SUMPRODUCT((${rH}<>"")*(${rH}=0))`],
    [`=SUMPRODUCT((${rD}>0)*(${rH}=""))`]
  ]);

  sSheet.getRange("J4:K4").setBackground("#C8E6C9");
  sSheet.getRange("J5:K5").setBackground("#FFE0B2");
  sSheet.getRange("J6:K6").setBackground("#E1F5FE");
  sSheet.getRange("J7:K7").setBackground("#FFCDD2");
  sSheet.getRange("J8:K8").setBackground("#FFF9C4");

  sSheet.getRange("J4:J8").setFontWeight("bold").setFontSize(9).setHorizontalAlignment("left").setVerticalAlignment("middle");
  sSheet.getRange("K4:K8").setFontWeight("bold").setFontSize(10).setHorizontalAlignment("center").setVerticalAlignment("middle");
  sSheet.getRange("J3:K8").setBorder(true, true, true, true, true, true, "#CCCCCC", SpreadsheetApp.BorderStyle.SOLID);
  sSheet.setColumnWidth(9, 20);   // Separador
  sSheet.setColumnWidth(10, 120); // Column J width
  sSheet.setColumnWidth(11, 60);  // Column K width

  _estiloTactilSurtido(sSheet, rows);

  // Marcar que surtido está activo
  PropertiesService.getScriptProperties().setProperty("IS_SURTIDO_ACTIVE", "true");

  if (activateSheet) {
    ss.setActiveSheet(sSheet);
  }
}

function generarSurtidoRapido() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return;
  const tId = "generarSurtidoRapido_" + Date.now();
  MiseLogger.time(tId);
  try {
    PropertiesService.getScriptProperties().setProperty("IS_SURTIDO_ACTIVE", "true");
    _generarSurtidoRapidoInternal(true);
    const dur = MiseLogger.timeEnd(tId);
    MiseLogger.info("generarSurtidoRapido", "Hoja de Surtido Rápido generada con éxito.", dur);
  } catch(err) {
    const dur = MiseLogger.timeEnd(tId);
    MiseLogger.error("generarSurtidoRapido", err.message, err, dur);
  } finally {
    lock.releaseLock();
  }
}

function generarSurtidoRapidoSilencioso() {
  _generarSurtidoRapidoInternal(false);
}

// ── BLINDAJE DE SEGURIDAD Y PROTECCIONES (ANTI-MANIPULACIÓN) ─────────────────
function protegerPedidoSeguro() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_PEDIDO);
  if (!sheet) return;
  if (_blindajePedidoAlDia(sheet)) return; // 1.7.7j: no quitar y volver a poner lo que ya está bien

  // 1. Remover protecciones previas
  const sheetProtections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  sheetProtections.forEach(p => { try { p.remove(); } catch(e) {} });

  const rangeProtections = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
  rangeProtections.forEach(p => { try { p.remove(); } catch(e) {} });

  // 2. Crear protección total de la hoja
  const prot = sheet.protect().setDescription(`Blindaje Total — ${SHEET_PEDIDO}`);
  prot.setWarningOnly(false);

  // 2.1. Apagar edición por enlace público / dominio
  try {
    if (prot.canDomainEdit()) prot.setDomainEdit(false);
  } catch(e) {}

  // 2.2. Restringir editores
  try {
    const me = Session.getEffectiveUser();
    prot.removeEditors(prot.getEditors());
    prot.addEditor(me);
  } catch(e) {}

  // 3. DESPROTEGER ÚNICAMENTE:
  // a) Casilla táctil de Fila 2 (F2 = Surtido Rápido)
  // b) Columna F (CANT. A PEDIR) desde fila 4 en adelante
  const count = Math.max(1, _getProductCount());
  const unprotCheckboxFila2 = sheet.getRange("F2");
  const unprotCantPedir = sheet.getRange(DATA_START_ROW, COL_CANT_PEDIR, count, 1);

  prot.setUnprotectedRanges([unprotCheckboxFila2, unprotCantPedir]);
  MiseLogger.info("protegerPedidoSeguro", `${SHEET_PEDIDO} blindado: Únicamente F2 (Surtido Rápido) y Col F (CANT. A PEDIR) quedan editables.`);
}

// ¿El blindaje del Pedido ya es exactamente el esperado? (una protección de hoja, sin protecciones de rango y
// libres solo F2 + F4:F{fin}). Ante cualquier duda (o API no disponible) responde false y se rehace.
function _blindajePedidoAlDia(sheet) {
  try {
    const hoja = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
    if (hoja.length !== 1 || sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE).length) return false;
    if (hoja[0].getDescription() !== `Blindaje Total — ${SHEET_PEDIDO}`) return false;
    const fin = DATA_START_ROW + Math.max(1, _getProductCount()) - 1;
    const esperado = ["F2", `F${DATA_START_ROW}:F${fin}`].join("|");
    const libres = hoja[0].getUnprotectedRanges().map(r => r.getA1Notation()).sort().join("|");
    return libres === esperado;
  } catch (e) {
    return false;
  }
}

// Protege una hoja completa: solo el dueño edita; `libres` = rangos de captura para los usuarios
function _blindarHoja(sheet, desc, libres) {
  if (!sheet) return;
  sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(p => { try { p.remove(); } catch (e) {} });
  const prot = sheet.protect().setDescription(desc);
  prot.setWarningOnly(false);
  prot.removeEditors(prot.getEditors());
  prot.addEditor(Session.getEffectiveUser());
  if (prot.canDomainEdit()) prot.setDomainEdit(false);
  if (libres && libres.length) prot.setUnprotectedRanges(libres);
}

// Hojas técnicas de la tienda: nadie las edita a mano (enlace, bitácoras, respaldos de migración)
function _blindarHojasTecnicasTienda() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.getSheets().filter(sh => /^(_|🗒|🔄)/.test(sh.getName())).forEach(sh => {
    _blindarHoja(sh, `Blindaje técnico — ${sh.getName()}`);
    if (/^_/.test(sh.getName())) { try { sh.hideSheet(); } catch (e) {} }
  });
}

// 🔐 Auditoría: qué protege cada hoja, quién edita y qué queda libre
function _auditarPermisos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheets().map(sh => {
    const p = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET)[0];
    const oculta = sh.isSheetHidden() ? " · oculta" : "";
    if (!p) return `🔓 ${sh.getName()}: SIN PROTECCIÓN${oculta}`;
    const editores = p.getEditors().map(u => u.getEmail()).join(", ") || "nadie";
    const libres = p.getUnprotectedRanges().map(r => r.getA1Notation()).join(", ");
    return `🔒 ${sh.getName()}: edita ${editores}${libres ? " · libre: " + libres : ""}${oculta}`;
  });
}

function auditarPermisos() {
  const lineas = _auditarPermisos();
  MiseLogger.info("auditarPermisos", lineas.join(" | "));
  SpreadsheetApp.getUi().alert("🔐 Auditoría de permisos", lineas.join("\n"), SpreadsheetApp.getUi().ButtonSet.OK);
}

function protegerTodasLasHojasTiendaSeguras() {
  protegerPedidoSeguro();
  try { _blindarHojasTecnicasTienda(); } catch (e) {}
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const surtido = ss.getSheetByName("🚚 SURTIDO RÁPIDO");
    if (surtido) {
      generarSurtidoRapidoSilencioso();
    }
  } catch(e) {}
  SpreadsheetApp.getActive().toast("🔒 Pedido Diario y Surtido Rápido blindados con éxito ✓", "⚙️ Mise", 4);
}

// ── SISTEMA DE TELEMETRÍA Y LOGGING ESTRUCTURADO (MISE LOGGER) ────────────────
const MiseLogger = {
  _timers: {},

  time(label) {
    this._timers[label] = Date.now();
  },

  timeEnd(label) {
    const start = this._timers[label] || Date.now();
    delete this._timers[label];
    return Date.now() - start;
  },

  log(level, fnName, message, durationMs = null, errorObj = null) {
    const timestamp = new Date();
    let email = "—";
    try {
      email = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || "Usuario Móvil";
    } catch(e) {
      email = "Usuario Móvil";
    }

    const stackTrace = errorObj && errorObj.stack ? String(errorObj.stack) : "";
    const msFormatted = durationMs !== null ? `${durationMs} ms` : "—";

    // 1. Emisión a consola V8
    const consoleMsg = `[${level}] [${fnName}] (${msFormatted}) ${message}`;
    if (level === "ERROR" || level === "FATAL") {
      console.error(consoleMsg, { user: email, durationMs, stack: stackTrace });
    } else if (level === "WARN") {
      console.warn(consoleMsg, { user: email, durationMs });
    } else {
      console.log(consoleMsg, { user: email, durationMs });
    }

    // 2. Persistencia en hoja de cálculo _LOGS (Orden Descendente: más nuevo arriba)
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let logSheet = ss.getSheetByName("_LOGS");
      
      if (!logSheet) {
        logSheet = ss.insertSheet("_LOGS");
        try { logSheet.hideSheet(); } catch(e) {}
        logSheet.getRange("A1:G1").merge().setBackground("#3D5A47")
          .setValue(`MISE — REGISTRO DE AUDITORÍA Y TELEMETRÍA (${BODEGA_NOMBRE})`)
          .setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(10).setHorizontalAlignment("center");
        logSheet.getRange(2, 1, 1, 7).setValues([["TIMESTAMP", "USUARIO", "FUNCIÓN", "NIVEL", "DURACIÓN (ms)", "DETALLE", "STACK TRACE"]])
          .setBackground("#7A9E8A").setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(9);
        logSheet.setFrozenRows(2);
      }
      
      const fecha = Utilities.formatDate(timestamp, Session.getScriptTimeZone() || "GMT-6", "yyyy-MM-dd HH:mm:ss");
      logSheet.insertRowBefore(3);
      logSheet.getRange(3, 1, 1, 7).setValues([[fecha, email, fnName, level, durationMs !== null ? durationMs : 0, String(message || ""), stackTrace]]);
      
      // Auto-limpieza si sobrepasa los 500 registros para proteger rendimiento
      const maxLogs = 500;
      const currentRows = logSheet.getLastRow();
      if (currentRows > maxLogs + 2) {
        logSheet.deleteRows(maxLogs + 3, currentRows - (maxLogs + 2));
      }
    } catch(e) {
      console.error("Fallo al escribir en _LOGS: " + e.toString());
    }
  },

  debug(fn, msg, ms = null) { this.log("DEBUG", fn, msg, ms); },
  info(fn, msg, ms = null) { this.log("INFO", fn, msg, ms); },
  warn(fn, msg, ms = null) { this.log("WARN", fn, msg, ms); },
  error(fn, msg, err = null, ms = null) { this.log("ERROR", fn, msg, ms, err); },
  perf(fn, msg, ms) { this.log("PERF", fn, msg, ms); }
};

// ── SISTEMA DE REGISTRO TRANSACCIONAL Y AUDITORÍA DE LOGS ─────────────────────

/**
 * Instala el activador automático por tiempo para ejecutar el reseteo y registro en LOG
 * todos los días entre 00:00 y 01:00 AM.
 */
// Núcleo silencioso: borra TODOS los activadores del proyecto (viejos, duplicados, "sincronizarEstados"
// cada 10 min, funciones inexistentes) y crea exactamente el juego esperado.
function _reiniciarActivadoresTienda() {
  const borrados = ScriptApp.getProjectTriggers().map(t => { const h = t.getHandlerFunction(); ScriptApp.deleteTrigger(t); return h; });
  // 1. Reset diario + LOG_SURTIDO + migración de estructura pendiente (00:00 - 01:00)
  ScriptApp.newTrigger("_resetearPedidoSilencioso").timeBased().everyDays(1).atHour(0).create();
  // 2. Respaldo del reset y reintento de migración (04:00 - 05:00)
  ScriptApp.newTrigger("_checkAutoResetNuevoDia").timeBased().everyDays(1).atHour(4).create();
  // 3–4. Edición y apertura INSTALABLES: corren como el dueño (las cuentas de tienda no pueden escribir
  //      en celdas protegidas; antes esas escrituras fallaban en silencio)
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.newTrigger("onEditTiendaInstalable").forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger("onOpenTiendaInstalable").forSpreadsheet(ss).onOpen().create();
  PropertiesService.getScriptProperties().setProperties({ ONEDIT_INSTALABLE: "1", ONOPEN_INSTALABLE: "1" });
  const creados = ["_resetearPedidoSilencioso (00:00)", "_checkAutoResetNuevoDia (04:00)",
                   "onEditTiendaInstalable (al editar)", "onOpenTiendaInstalable (al abrir)"];
  MiseLogger.info("instalarActivadores", `Borrados (${borrados.length}): [${borrados.join(", ")}]. Creados: ${creados.join(", ")}.`);
  return { borrados, creados };
}

function instalarActivadoresTienda() {
  const r = _reiniciarActivadoresTienda();
  SpreadsheetApp.getUi().alert("⏰ Activadores Reiniciados",
    `Se borraron ${r.borrados.length} activador(es) previos:\n${r.borrados.join("\n") || "(ninguno)"}\n\nQuedaron exactamente:\n• ${r.creados.join("\n• ")}`,
    SpreadsheetApp.getUi().ButtonSet.OK);
}

// Abre un libro desde una URL en cualquier formato (/u/0/, ?usp=, #gid=) o desde su ID pelón.
// IMPORTRANGE es tolerante con el formato; openByUrl no, así que se extrae el ID y se usa openById.
function _abrirLibro(ref) {
  const txt = String(ref || "").trim();
  const m = txt.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  return SpreadsheetApp.openById(m ? m[1] : txt);
}

// onOpen INSTALABLE: reinicio del día (si no ocurrió) y aviso de conexión, con permisos del dueño
function onOpenTiendaInstalable(e) {
  try { _checkAutoResetNuevoDia(); } catch (err) { MiseLogger.error("onOpenTiendaInstalable", err.message); }
  _sincronizarSiCambioCatalogo("apertura");
  try { _actualizarAvisoPedido(); } catch (err) {}
  _latidoTienda("apertura");
}

// ── 🔔 SUSCRIPCIÓN AL CATÁLOGO (1.7.6i) ───────────────────────────────────────────────────
// El catálogo ya llega por el IMPORTRANGE de _SYNC: la tienda calcula su huella localmente (sin abrir
// Bodega) y, si cambió desde la última vez que se aplicó, reordena y oculta inactivos por su cuenta.
// Corre al abrir y en el reset de las 00:00 (no al editar, para no mover filas mientras alguien captura).
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

// Filas de _SYNC, o null si el enlace está cargando o con error (nunca reordenar con datos a medias)
function _leerCatalogoSync() {
  const sync = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SYNC);
  if (!sync || sync.getLastRow() < 4) return null;
  const filas = sync.getRange(4, 1, sync.getLastRow() - 3, 12).getValues();
  const nombres = filas.map(r => String(r[2]).trim()).filter(Boolean);
  if (nombres.length === 0) return null;
  if (filas.some(r => /^(#|loading|cargando)/i.test(String(r[0]).trim()) || /^(#|loading|cargando)/i.test(String(r[2]).trim()))) return null;
  return filas;
}

function _registrarHuellaCatalogo(huella) {
  PropertiesService.getScriptProperties().setProperties({ CATALOGO_HUELLA: huella, CATALOGO_APLICADO_TS: String(Date.now()) });
}

function _sincronizarSiCambioCatalogo(origen) {
  try {
    const filas = _leerCatalogoSync();
    if (!filas) return false;
    const huella = _huellaCatalogo(filas);
    if (PropertiesService.getScriptProperties().getProperty("CATALOGO_HUELLA") === huella) return false;
    ordenarPedido();
    _registrarHuellaCatalogo(huella);
    MiseLogger.info("_sincronizarSiCambioCatalogo", `Catálogo de Bodega cambió (${origen}): pedido reordenado e inactivos aplicados. Huella ${huella}`);
    return true;
  } catch (err) {
    MiseLogger.error("_sincronizarSiCambioCatalogo", err.message);
    return false;
  }
}

// ── 💓 LATIDO (1.7.6g) ─────────────────────────────────────────────────────────────────────
// La tienda deja su estado en su propia hoja técnica _ESTADO (clave/valor); Bodega la LEE para la
// página de estado. Sin activador propio: late en los activadores que ya existen (00:00, 04:00),
// al abrir y al editar (como máximo una escritura cada 10 min; el resto de las veces solo compara la hora).
const SHEET_ESTADO = "_ESTADO";
const LATIDO_INTERVALO_MS = 10 * 60 * 1000;

function _latidoTienda(origen, forzar) {
  try {
    const props = PropertiesService.getScriptProperties();
    const ahora = Date.now();
    const ultimo = parseInt(props.getProperty("LATIDO_TS") || "0", 10);
    if (!forzar && ahora - ultimo < LATIDO_INTERVALO_MS) return false;
    props.setProperty("LATIDO_TS", String(ahora));

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let hoja = ss.getSheetByName(SHEET_ESTADO);
    if (!hoja) {
      hoja = ss.insertSheet(SHEET_ESTADO);
      try { hoja.hideSheet(); } catch (e) {}
      try { _blindarHoja(hoja, "Blindaje técnico — _ESTADO (latido)"); } catch (e) {}
    }
    let activadores = "";
    try { activadores = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction()).join(", "); } catch (e) { activadores = "?"; }
    const sync = ss.getSheetByName(SHEET_SYNC);
    const syncVivo = !!(sync && /IMPORTRANGE/i.test(sync.getRange(4, 1).getFormula()));
    const tsReset = parseInt(props.getProperty("ULTIMO_RESET_TS") || "0", 10);
    const filas = [
      ["CLAVE", "VALOR"],
      ["LIBRO", BODEGA_NOMBRE],
      ["BODEGA_KEY", BODEGA_KEY],
      ["VERSION", MISE_VERSION],
      ["ESQUEMA", `${props.getProperty(PROP_SCHEMA) || "1"}/${MISE_SCHEMA_TIENDA}`],
      ["ENTORNO", props.getProperty("MISE_ENV") || "PROD"],
      ["ULTIMO_LATIDO", new Date(ahora)],
      ["ORIGEN_LATIDO", String(origen || "")],
      ["ULTIMO_RESET", tsReset ? new Date(tsReset) : ""],
      ["ULTIMO_RESET_ERROR", props.getProperty("ULTIMO_RESET_ERROR") || ""],
      ["ACTIVADORES", activadores],
      ["SYNC_VIVO", syncVivo ? "SI" : "NO"],
      ["CATALOGO_HUELLA", props.getProperty("CATALOGO_HUELLA") || ""],
      ["CATALOGO_APLICADO", props.getProperty("CATALOGO_APLICADO_TS") ? new Date(parseInt(props.getProperty("CATALOGO_APLICADO_TS"), 10)) : ""]
    ];
    const lr = hoja.getLastRow();
    if (lr > filas.length) hoja.getRange(filas.length + 1, 1, lr - filas.length, 2).clearContent();
    hoja.getRange(1, 1, filas.length, 2).setValues(filas);
    return true;
  } catch (err) {
    try { MiseLogger.error("_latidoTienda", err.message); } catch (e) {}
    return false;
  }
}

// ── 🔗 CONEXIÓN CON BODEGA (a qué libro apunta, por NOMBRE, y si _SYNC está vivo) ──────────
function _diagnosticarConexionTienda() {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty(`BODEGA_URL_${BODEGA_KEY}`);
  if (!url) return { ok: false, linea: `❌ Sin BODEGA_URL_${BODEGA_KEY} configurada` };
  let nombre = "";
  try { nombre = _abrirLibro(url).getName(); }
  catch (err) { return { ok: false, linea: `❌ No se pudo abrir Bodega (${url.substring(0, 60)}…): ${err.message}` }; }
  const sospechoso = /prueba|domingo|copia|staging|\[dev\]/i.test(nombre) && props.getProperty("MISE_ENV") !== "DEV";
  const sync = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SYNC);
  const vivo = sync && /IMPORTRANGE/i.test(sync.getRange(4, 1).getFormula());
  return {
    ok: !sospechoso && vivo,
    linea: `${sospechoso ? "⚠️" : "✅"} Bodega → "${nombre}"\n${vivo ? "✅" : "❌"} ${SHEET_SYNC} ${vivo ? "enlazado en vivo (IMPORTRANGE)" : "SIN enlace vivo (valores fijos)"}`
  };
}

// ── 🚀 CONFIGURAR ESTE LIBRO (un clic: activadores, estructura, picking y diagnóstico) ──────
function configurarEsteLibroTienda() {
  _abrirMonitor("configurar");
}

function _configurarTiendaCore(rep) {
  const pasos = [];
  const paso = (nombre, fn) => {
    rep.inicio(nombre);
    try { const d = fn(); pasos.push(`✅ ${nombre}${d ? " — " + d : ""}`); rep.fin(nombre, true, d); }
    catch (err) { pasos.push(`❌ ${nombre} — ${err.message}`); rep.fin(nombre, false, err.message); MiseLogger.error("configurarEsteLibro", `${nombre}: ${err.message}`); }
  };
  paso("Activadores", () => { const r = _reiniciarActivadoresTienda(); return `${r.borrados.length} viejos borrados, ${r.creados.length} creados`; });
  paso("Enlace con Bodega", () => { _validarYAutoRepararSyncSilencioso(); _asegurarSyncVivo(); return ""; });
  paso("Estructura", () => {
    const actual = parseInt(PropertiesService.getScriptProperties().getProperty(PROP_SCHEMA) || "1", 10);
    if (actual >= MISE_SCHEMA_TIENDA) return `al día (v${actual})`;
    if (!_migrarEsquemaTienda()) throw new Error("no se pudo actualizar; revisa 🗒 LOG");
    return `v${actual} → v${MISE_SCHEMA_TIENDA} (capturas respaldadas y restauradas)`;
  });
  paso("Orden de picking e inactivos", () => {
    ordenarPedido();
    const filas = _leerCatalogoSync();
    if (filas) _registrarHuellaCatalogo(_huellaCatalogo(filas));
    return "aplicados";
  });
  paso("Latido", () => { _latidoTienda("configurar", true); return "Bodega ya ve este libro al día"; });
  paso("Blindaje", () => {
    protegerPedidoSeguro();
    _blindarHojasTecnicasTienda();
    const abiertas = _auditarPermisos().filter(l => l.startsWith("🔓")).length;
    return abiertas ? `${abiertas} hoja(s) sin protección (ver 🔐 Auditoría)` : "todas las hojas protegidas";
  });
  let con = { ok: false, linea: "" };
  paso("Conexión", () => { con = _diagnosticarConexionTienda(); return con.ok ? "correcta" : "por revisar"; });

  const ok = pasos.every(p => p.startsWith("✅")) && con.ok;
  MiseLogger[ok ? "info" : "warn"]("configurarEsteLibro", pasos.join(" | "));
  return rep.cerrar(ok, ok ? `🚀 ${BODEGA_NOMBRE} lista` : `🚀 ${BODEGA_NOMBRE} configurada con observaciones`, `🔗 ${con.linea}`);
}

// ── MONITOR DE PROGRESO (1.7.7c) ─────────────────────────────────────────────
// Diálogo sin bloqueo (ProgresoDialog.html, el mismo de Bodega): lanza el proceso y consulta su avance en caché.
const PROCESOS_MONITOREADOS = {
  configurar: { titulo: "🚀 Configurar este libro", pasos: 7, fn: (rep) => _configurarTiendaCore(rep) },
  reparar: { titulo: "🔧 Sincronizar catálogo y reparar", pasos: 3, fn: (rep) => _repararSistemaTiendaCore(rep) },
  actualizar: { titulo: "🔄 Actualizar estructura", pasos: 1, fn: (rep) => _aplicarActualizacionCore(rep) }
};

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

// Si _SYNC quedó con valores fijos (sin IMPORTRANGE), restaurar el enlace vivo desde BODEGA_URL
function _asegurarSyncVivo() {
  const sync = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SYNC);
  if (!sync || /IMPORTRANGE/i.test(sync.getRange(4, 1).getFormula())) return;
  const url = PropertiesService.getScriptProperties().getProperty(`BODEGA_URL_${BODEGA_KEY}`);
  if (url) _setupSync(url);
}

// Garantiza el encabezado de 🗒 LOG_SURTIDO en la fila 1 (7 columnas; "EsAdición" retirada en 1.7.6e).
// Si una escritura previa cayó en la fila 1 (hoja vacía + getLastRow()+1), inserta una fila arriba.
function _asegurarEncabezadoLogSurtido(logSheet) {
  if (String(logSheet.getRange(1, 1).getValue()).trim() !== "Fecha") {
    if (logSheet.getLastRow() >= 1) logSheet.insertRowBefore(1);
    logSheet.getRange(1, 1, 1, 7).setValues([["Fecha", "Bodega", "Producto", "Categoría", "Cant.Pedida", "Cant.Recibida", "Estado"]])
      .setBackground("#3D5A47").setFontColor("#FFFFFF").setFontWeight("bold");
    logSheet.setFrozenRows(1);
  }
  if (String(logSheet.getRange(1, 8).getValue()).trim() === "EsAdición") logSheet.getRange(1, 8).clearContent().setBackground(null);
}
