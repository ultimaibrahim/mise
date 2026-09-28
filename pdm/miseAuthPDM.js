/**
 * MISE — Pedidos Mercado Script v1.7.5h Altair (Configuración en un Clic · Picking y Colores por Producto · Migración Automática de Estructura · Surtido Rápido con CANT. FINAL · Conversión de Unidades, Traspasos Inter-Tiendas & Surtido Numérico)
 * Suite Atelier · La Crêpe Parisienne · Grupo MYT
 *
 * INSTALAR EN: Pedidos Mercado (Google Sheets de B-Mercado)
 */

// ── BODEGA & CONFIGURACIÓN DINÁMICA DE ENTORNO ──────────────────────────────
const props = PropertiesService.getScriptProperties();
const BODEGA_KEY    = props.getProperty("BODEGA_KEY") || "BM";
const BODEGA_NOMBRE = props.getProperty("BODEGA_NOMBRE") || "Mercado";
const VISTA_MOVIL   = `VISTA_MOVIL_${BODEGA_KEY}`;
const SHEET_SYNC    = `_SYNC_${BODEGA_KEY}`;

// ── CONSTANTES ──────────────────────────────────────────────────────────────
const SHEET_PEDIDO   = "📋 PEDIDO DIARIO";
const COL_CANT_PEDIR = 6;   // F — CANT. A PEDIR
const COL_RECIBIDA   = 8;   // H — CANT. RECIBIDA (oculta)
const COL_ESTADO     = 9;   // I — ESTADO (oculta)
const DATA_START_ROW = 4;
const NUM_COLS       = 11;

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
  try {
    _checkAutoResetNuevoDia();
  } catch(e) {}
  try {
    _ensureDailyResetTrigger();
  } catch(e) {}
  try {
    _actualizarAvisoPedido();
  } catch(e) {}
  try {
    const ui = SpreadsheetApp.getUi();
    const menu = ui.createMenu("⚙️ Mise")
      // Operación Diaria
      .addItem("🚀 Configurar este libro (activadores, estructura, picking)", "configurarEsteLibroTienda")
      .addSeparator()
      .addItem("🚚 Generar Surtido Rápido (móvil)",       "generarSurtidoRapido")
      .addItem("🔄 Registrar Traspaso entre Tiendas",     "abrirDialogoTraspasoTiendaHTML")
      .addItem("🖐️ Reordenar lista por picking",          "ordenarPedido")
      .addSeparator()
      .addItem("🔧 Sincronizar catálogo y reparar formato", "repararSistemaTienda")
      .addItem("🔄 Aplicar actualización de estructura pendiente", "aplicarActualizacionPendienteManualmente")
      .addSeparator()
      // Submenú Cuarentena / Zona Avanzada
      .addSubMenu(ui.createMenu("⚠️ Mantenimiento Avanzado y Zona de Riesgo")
        .addSubMenu(ui.createMenu("🚨 Reseteo y Cierre Manual")
          .addItem("🗑️ Limpiar / Reiniciar pedido de hoy", "resetearPedidoManualmente")
          .addItem("⏰ Reiniciar activadores (00:00 y 04:00)", "instalarActivadoresMedianochePDM"))
        .addSubMenu(ui.createMenu("🔒 Blindaje y Permisos")
          .addItem("🔒 Proteger Pedido Diario", "protegerPedidoSeguro")
          .addItem("🛡️ Blindar Pedido y Surtido (Total)", "protegerTodasLasHojasTiendaSeguras"))
        .addSubMenu(ui.createMenu("🧪 Diagnóstico y Pruebas")
          .addItem("🎲 Generar datos aleatorios de prueba", "generarDatosPrueba")
          .addItem("🗒️ Forzar registro en LOG_SURTIDO", "probadorForzarLogSurtido"))
        .addSubMenu(ui.createMenu("⚠️ Configuración Crítica")
          .addItem(`🔗 Configurar conexión con ${BODEGA_NOMBRE}`, "configurarBodega")
          .addItem("⚠️ Restablecer sistema desde cero (Destructivo)", "setupCompleto")))
      .addSeparator()
      .addItem("ℹ️ Acerca de Mise",                        "acercaDe");
    menu.addToUi();
  } catch(e) {}
}

// ── AVISO DE CONEXIÓN / POBLAR DATOS ──────────────────────────────────────────
function _actualizarAvisoPedido() {
  const ss      = SpreadsheetApp.getActiveSpreadsheet();
  const pedido  = ss.getSheetByName(SHEET_PEDIDO);
  let sync      = ss.getSheetByName(SHEET_SYNC);
  if (!pedido) return;
  
  let syncActivo = sync && sync.getLastRow() > 3 &&
    sync.getRange(4, 1).getValue() !== "" &&
    String(sync.getRange(4, 1).getValue()).indexOf("#") !== 0;

  // Autoconexión inicial desde Propiedades del Script
  if (!syncActivo) {
    const props = PropertiesService.getScriptProperties();
    const propKey = `BODEGA_URL_${BODEGA_KEY}`;
    const url = props.getProperty(propKey);
    if (url) {
      try {
        _setupSync(url);
        sync = ss.getSheetByName(SHEET_SYNC);
        syncActivo = sync && sync.getLastRow() > 3 &&
          sync.getRange(4, 1).getValue() !== "" &&
          String(sync.getRange(4, 1).getValue()).indexOf("#") !== 0;
      } catch(err) {}
    }
  }

  if (!syncActivo) {
    pedido.getRange("H4")
      .setValue("⚠️ CONECTAR BDG")
      .setFontColor("#C62828")
      .setFontSize(9)
      .setHorizontalAlignment("center")
      .setFontStyle("italic");
    _aplicarAnchosColumnas(pedido);
    return;
  }

  // Limpiar advertencia en H4
  pedido.getRange("H4").clearContent();

  const count  = sync.getLastRow() - 3; 
  if (count < 1) return;
  const DR     = DATA_START_ROW;
  const sRef   = "'" + SHEET_SYNC + "'";
  
  const existente = pedido.getRange(DR, 3).getValue(); 
  if (existente !== "" && existente !== null) {
    _aplicarAnchosColumnas(pedido);
    _aplicarOcultamientoColumnas(pedido);
    return;
  }

  const outputGrid = [];
  const bgs = [];
  
  for (let i = 0; i < count; i++) {
    const r  = DR + i;
    const sr = 4 + i;
    const bg = i % 2 === 0 ? COLORS.neutral_a : COLORS.neutral_b;

    outputGrid.push([
      i + 1,                                        // Col A (No)
      '=' + sRef + '!B' + sr,                       // Col B (CATEGORÍA)
      '=' + sRef + '!C' + sr,                       // Col C (PRODUCTO)
      '=' + sRef + '!D' + sr,                       // Col D (UNIDAD)
      '=IFERROR(' + sRef + '!E' + sr + '*1, 0) & IF(AND(' + sRef + '!J' + sr + '=0, ' + sRef + '!K' + sr + '=0), "", IF(' + sRef + '!E' + sr + '<' + sRef + '!J' + sr + ', " (-" & (' + sRef + '!J' + sr + '-' + sRef + '!E' + sr + ') & ")", IF(' + sRef + '!E' + sr + '>' + sRef + '!K' + sr + ', " (+" & (' + sRef + '!E' + sr + '-' + sRef + '!K' + sr + ') & ")", " (-)")))', // Col E
      "",                                           // Col F (CANT. A PEDIR)
      '=IF(OR(F' + r + '="", H' + r + '=""), "", H' + r + ' - F' + r + ')', // Col G (DIFERENCIA)
      "",                                           // Col H (RECIBIDA)
      "",                                           // Col I (ESTADO)
      "",                                           // Col J (ADICIÓN)
      '=IF(AND(' + sRef + '!J' + sr + '=0, ' + sRef + '!K' + sr + '=0), "—", ' + sRef + '!J' + sr + ' & "  |  " & ' + sRef + '!K' + sr + ')' // Col K (MÍN | MÁX QUIOSCO)
    ]);

    const rowBg = Array(NUM_COLS).fill(bg);
    rowBg[COL_CANT_PEDIR - 1] = COLORS.yellow; // Col F
    rowBg[4]                  = COLORS.blue;   // Col E
    bgs.push(rowBg);
  }

  // Escribir en una sola llamada Batch 2D de alta velocidad (<100ms)
  const fullRange = pedido.getRange(DR, 1, count, NUM_COLS);
  fullRange.clearContent();
  fullRange.setBackgrounds(bgs);
  fullRange.setFormulas(outputGrid);

  pedido.getRange(DR, 1, count, NUM_COLS)
    .setFontFamily("Calibri").setFontSize(10).setVerticalAlignment("middle");
  
  pedido.getRange(DR, 1, count, 1).setHorizontalAlignment("center"); 
  pedido.getRange(DR, 3, count, 1).setHorizontalAlignment("left");   
  pedido.getRange(DR, 4, count, 1).setHorizontalAlignment("center"); 
  pedido.getRange(DR, 5, count, 1).setHorizontalAlignment("right");  
  pedido.getRange(DR, 7, count, 1).setHorizontalAlignment("center"); 
  pedido.getRange(DR, 11, count, 1).setHorizontalAlignment("center"); 
  
  _aplicarAnchosColumnas(pedido);
  _aplicarOcultamientoColumnas(pedido);
  _aplicarFormatosCondicionales(pedido);
}

function _aplicarOcultamientoColumnas(sheet) {
  try {
    sheet.showColumns(1, 11);  // Asegurar estado base limpio hasta Col 11
    sheet.hideColumns(1, 2);   // Ocultar Col A (No) y Col B (CATEGORÍA)
    sheet.showColumns(3, 2);   // Mostrar Col C (PRODUCTO) y Col D (UNIDAD TIENDA)
    sheet.hideColumns(5);      // Ocultar Col E (SALDO TEÓRICO)
    sheet.showColumns(6);      // Mostrar Col F (CANT. A PEDIR)
    sheet.hideColumns(7, 4);   // Ocultar Col G (DIFERENCIA), Col H (RECIBIDA), Col I (ESTADO), Col J (ADICIÓN)
    sheet.showColumns(11);     // Mostrar Col K (MÍN/MÁX QUIOSCO)
    
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
  sheet.setColumnWidth(10, 40);  // J
}

function _getProductCount() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_PEDIDO);
  if (!sheet) return 131;
  const lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) return 131;
  return lastRow - DATA_START_ROW + 1;
}

function invalidarCache() {
  PropertiesService.getScriptProperties().deleteProperty("PRODUCT_COUNT");
  SpreadsheetApp.getActive().toast("Caché invalidado. Listo para recalcular.", "⚙️ Mise", 4);
}

function onEdit(e) {
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
          registrarLog("surtidoRapido", "SUCCESS", "Pestaña de Surtido Rápido generada desde botón F2.");
        } catch(err) {
          registrarLog("surtidoRapido", "ERROR", err.message);
        }
      }
    }
    return;
  }

  if (row < DATA_START_ROW) return;

  // 2. Validaciones rápidas de entrada (F)
  if (col === COL_CANT_PEDIR) {
    let val = e.range.getValue();

    // Si la celda está vacía o es null, limpiamos la alerta de adición y terminamos
    if (val === "" || val === null || val === undefined) {
      sheet.getRange(row, 10).clearContent();
      return;
    }

    if (Object.prototype.toString.call(val) === '[object Date]') {
      e.range.clearContent();
      sheet.getRange(row, 10).clearContent();
      try { SpreadsheetApp.getActive().toast("El valor debe ser un número positivo (no se permiten fechas).", "❌ Mise", 5); } catch(err) {}
      return;
    }

    if (typeof val === "string") {
      const cleanVal = val.replace(',', '.').trim();
      const num = Number(cleanVal);
      if (!isNaN(num)) {
        e.range.setValue(num);
        val = num;
      }
    }

    const checkVal = Number(val);
    if (isNaN(checkVal) || checkVal < 0) {
      e.range.clearContent();
      return;
    }
  }

  // Si existe la pestaña de Surtido Rápido, gestionar adiciones y ajustes sin lag
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
        // Es un producto nuevo (adición real): regenerar para insertarlo en secuencia de picking
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

function sincronizarEstados() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_PEDIDO);
  const sync  = ss.getSheetByName(SHEET_SYNC);
  if (!sheet || !sync) return;

  _validarYAutoRepararSyncSilencioso();

  // Forzar recálculo global re-escribiendo el IMPORTRANGE para romper caché
  const formula = sync.getRange(4, 1).getFormula();
  if (formula) {
    sync.getRange(4, 1).clearContent();
    sync.getRange(4, 1).setFormula(formula);
  } else {
    const props = PropertiesService.getScriptProperties();
    const url = props.getProperty(`BODEGA_URL_${BODEGA_KEY}`);
    if (url) {
      _setupSync(url);
    }
  }

  // Reordenar automáticamente la lista según el nuevo ranking de picking de Bodega
  try {
    ordenarPedido();
  } catch(e) {}

  const syncCount = Math.max(0, sync.getLastRow() - 3);
  const currentCount = _getProductCount();

  if (syncCount > currentCount) {
    const diff = syncCount - currentCount;
    const DR = DATA_START_ROW;
    const sRef = "'" + SHEET_SYNC + "'";

    // Insertar nuevas filas al final de la tabla de pedidos
    const insertStartRow = DR + currentCount;
    sheet.insertRowsAfter(insertStartRow - 1, diff);

    const highlightColor = "#E8EAF6"; // Morado claro para avisar producto nuevo
    const newFormulas = [];
    const newBgs = [];

    for (let i = 0; i < diff; i++) {
      const r = insertStartRow + i;
      const sr = 4 + currentCount + i;
      const prodNo = currentCount + i + 1;

      newFormulas.push([
        prodNo,                                       // Col A (No)
        '=' + sRef + '!B' + sr,                       // Col B (CATEGORÍA)
        '=' + sRef + '!C' + sr,                       // Col C (PRODUCTO)
        '=' + sRef + '!D' + sr,                       // Col D (UNIDAD)
        '=IFERROR(' + sRef + '!E' + sr + '*1, 0) & IF(AND(' + sRef + '!J' + sr + '=0, ' + sRef + '!K' + sr + '=0), "", IF(' + sRef + '!E' + sr + '<' + sRef + '!J' + sr + ', " (-" & (' + sRef + '!J' + sr + '-' + sRef + '!E' + sr + ') & ")", IF(' + sRef + '!E' + sr + '>' + sRef + '!K' + sr + ', " (+" & (' + sRef + '!E' + sr + '-' + sRef + '!K' + sr + ') & ")", " (-)")))', // Col E (SALDO TEÓRICO)
        "",                                           // Col F (CANT. A PEDIR)
        '=IF(OR(F' + r + '="", H' + r + '=""), "", H' + r + ' - F' + r + ')', // Col G (DIFERENCIA)
        "",                                           // Col H
        "",                                           // Col I
        ""                                            // Col J (ADICIÓN)
      ]);

      const rowBg = Array(NUM_COLS).fill(highlightColor);
      rowBg[COL_CANT_PEDIR - 1] = COLORS.yellow; // Col F
      rowBg[4]                  = COLORS.blue;   // Col E
      newBgs.push(rowBg);
    }

    // Escribir en bloque
    sheet.getRange(insertStartRow, 1, diff, NUM_COLS).setFormulas(newFormulas);
    sheet.getRange(insertStartRow, 1, diff, NUM_COLS).setBackgrounds(newBgs);

    sheet.getRange(insertStartRow, 1, diff, NUM_COLS)
      .setFontFamily("Calibri").setFontSize(10).setVerticalAlignment("middle");
    sheet.getRange(insertStartRow, 1, diff, 1).setHorizontalAlignment("center");
    sheet.getRange(insertStartRow, 3, diff, 1).setHorizontalAlignment("left");
    sheet.getRange(insertStartRow, 4, diff, 1).setHorizontalAlignment("center");
    sheet.getRange(insertStartRow, 5, diff, 1).setHorizontalAlignment("right");
    sheet.getRange(insertStartRow, 7, diff, 1).setHorizontalAlignment("center");
    sheet.getRange(insertStartRow, 11, diff, 1).setHorizontalAlignment("center");

    _aplicarFormatosCondicionales(sheet);

    // Mostrar Categoría (Col B) y ocultar No (Col A) para permitir filtrado móvil
    try {
      sheet.hideColumns(1);
      sheet.hideColumns(10);
      sheet.showColumns(2);
      let filter = sheet.getFilter();
      if (filter) filter.remove();
      sheet.getRange(3, 2, syncCount + 1, 6).createFilter(); // B to G (6 columns)
    } catch(err) {}

    // Invalidar caché local e indicar el nuevo conteo de productos
    PropertiesService.getScriptProperties().setProperty("PRODUCT_COUNT", String(syncCount));

    try {
      SpreadsheetApp.getActive().toast(`Se agregaron ${diff} nuevos productos desde Bodega ✓`, "⚙️ Sincronizar", 5);
    } catch(e) {}
  } else {
    try {
      SpreadsheetApp.getActive().toast("Sincronización de stocks completada ✓", "⚙️ Sincronizar", 3);
    } catch(e) {}
  }
  _actualizarVisibilidadInactivos(sheet);
  
  // Actualizar Surtido Rápido silenciosamente si existe
  try {
    const surtido = ss.getSheetByName("🚚 SURTIDO RÁPIDO");
    if (surtido) {
      generarSurtidoRapidoSilencioso();
    }
  } catch (err) {}
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
    const range  = sheet.getRange(DATA_START_ROW, 1, count, NUM_COLS);
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

    // Crear mapa de nombres de producto -> Fila en _SYNC (4-indexed)
    const syncRowMap = {};
    for (let i = 0; i < syncValues.length; i++) {
      const pName = String(syncValues[i][2]).trim(); // Col C = PRODUCTO (index 2)
      if (pName) {
        syncRowMap[pName] = 4 + i;
      }
    }

    const bgs = [];
    const cleanFonts = [];
    const outputData = [];

    const sRef = "'" + SHEET_SYNC + "'";
    for (let i = 0; i < items.length; i++) {
      const r = DATA_START_ROW + i;
      const prodNo = parseInt(items[i].vals[0]) || (i + 1);
      const prodName = String(items[i].vals[2] || "").trim();
      const sr = syncRowMap[prodName] || (prodNo + 3);
      
      // Generar fondos estándar
      const bgRow = i % 2 === 0 ? COLORS.neutral_a : COLORS.neutral_b;
      const rowBg = Array(NUM_COLS).fill(bgRow);
      rowBg[4] = COLORS.blue;                    // Col E
      rowBg[COL_CANT_PEDIR - 1] = COLORS.yellow; // Col F
      bgs.push(rowBg);

      // Tipografía estándar limpia
      const rowFont = Array(NUM_COLS).fill("normal");
      rowFont[COL_CANT_PEDIR - 1] = "bold";
      cleanFonts.push(rowFont);

      // Generar fórmulas y valores limpios (Col G es DIFERENCIA, Col K es MÍN/MÁX QUIOSCO)
      outputData.push([
        prodNo,                                       // Col A (No)
        '=' + sRef + '!B' + sr,                       // Col B (CATEGORÍA)
        '=' + sRef + '!C' + sr,                       // Col C (PRODUCTO)
        '=' + sRef + '!D' + sr,                       // Col D (UNIDAD)
        '=IFERROR(' + sRef + '!E' + sr + '*1, 0) & IF(AND(' + sRef + '!J' + sr + '=0, ' + sRef + '!K' + sr + '=0), "", IF(' + sRef + '!E' + sr + '<' + sRef + '!J' + sr + ', " (-" & (' + sRef + '!J' + sr + '-' + sRef + '!E' + sr + ') & ")", IF(' + sRef + '!E' + sr + '>' + sRef + '!K' + sr + ', " (+" & (' + sRef + '!E' + sr + '-' + sRef + '!K' + sr + ') & ")", " (-)")))', // Col E (SALDO TEÓRICO)
        items[i].vals[5],                             // Col F (CANT. A PEDIR)
        '=IF(OR(F' + r + '="", H' + r + '=""), "", H' + r + ' - F' + r + ')', // Col G (DIFERENCIA)
        items[i].vals[7] === "" ? "" : items[i].vals[7], // Col H (CANT. RECIBIDA)
        items[i].vals[8] || "",                       // Col I (ESTADO)
        items[i].vals[9] || "",                       // Col J (ADICIÓN)
        '=IF(AND(' + sRef + '!J' + sr + '=0, ' + sRef + '!K' + sr + '=0), "—", ' + sRef + '!J' + sr + ' & "  |  " & ' + sRef + '!K' + sr + ')' // Col K (MÍN | MÁX QUIOSCO)
      ]);
    }

    // Escribir en bloque
    range.clearContent();
    sheet.getRange(DATA_START_ROW, 1, count, NUM_COLS).setFormulas(outputData);
    range.setBackgrounds(bgs);
    range.setFontWeights(cleanFonts);

    // Formatear
    sheet.getRange(DATA_START_ROW, 1, count, NUM_COLS)
      .setFontFamily("Calibri").setFontSize(10).setVerticalAlignment("middle");
    sheet.getRange(DATA_START_ROW, 1, count, 1).setHorizontalAlignment("center");
    sheet.getRange(DATA_START_ROW, 3, count, 1).setHorizontalAlignment("left");
    sheet.getRange(DATA_START_ROW, 4, count, 1).setHorizontalAlignment("center");
    sheet.getRange(DATA_START_ROW, 5, count, 1).setHorizontalAlignment("right");
    sheet.getRange(DATA_START_ROW, 7, count, 1).setHorizontalAlignment("center");
    sheet.getRange(DATA_START_ROW, 11, count, 1).setHorizontalAlignment("center");

    _aplicarFormatosCondicionales(sheet);
    _actualizarVisibilidadInactivos(sheet);
    sheet.hideColumns(10);
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

function instalarTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === "sincronizarEstados") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("sincronizarEstados").timeBased().everyMinutes(10).create();
  SpreadsheetApp.getUi().alert("✅ Trigger instalado", "Los estados se sincronizarán cada 10 minutos.", SpreadsheetApp.getUi().ButtonSet.OK);
}

function desinstalarTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === "sincronizarEstados") ScriptApp.deleteTrigger(t); });
  SpreadsheetApp.getActive().toast("Trigger desinstalado.", "⚙️ Mise", 3);
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

function _resetearPedidoSilencioso(e) {
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
  sheet.getRange(DATA_START_ROW, 10, count, 1).clearContent(); // Limpiar Columna J (Adición)
  
  const bgs = [];
  for (let i = 0; i < count; i++) {
    const row = Array(NUM_COLS).fill(i % 2 === 0 ? COLORS.neutral_a : COLORS.neutral_b);
    row[COL_CANT_PEDIR - 1] = COLORS.yellow; // Col F
    row[4]                  = COLORS.blue;   // Col E
    bgs.push(row);
  }
  sheet.getRange(DATA_START_ROW, 1, count, NUM_COLS).setBackgrounds(bgs);

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
  sheet.hideColumns(10); // Asegurar que Columna J esté oculta

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
    logSheet.getRange(1, 1, 1, 8).setValues([["Fecha", "Bodega", "Producto", "Categoría", "Cant.Pedida", "Cant.Recibida", "Estado", "EsAdición"]])
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
    const alerta   = String(row[9] || "").trim();
    const esAdicion = alerta.includes("ADICIÓN") ? "SÍ" : "NO";

    // Misma regla que el descuento de Bodega: solo cuenta lo registrado (número, ✅ o ❌). Sin registro → 0.
    if (prodName && (cantPed > 0 || cantRec > 0 || estado)) {
      const cantEfectiva = (estado === "INEXISTENTE") ? 0
        : (cantRec > 0) ? cantRec
        : (estado === "COMPLETO") ? cantPed : 0;
      logRows.push([
        fechaStr,
        BODEGA_NOMBRE,
        prodName,
        catName,
        cantPed,
        cantEfectiva,
        estado || "SIN_REGISTRO",
        esAdicion
      ]);
    }
  }

  if (logRows.length > 0) {
    const startRow = Math.max(logSheet.getLastRow() + 1, 2);
    logSheet.getRange(startRow, 1, logRows.length, 8).setValues(logRows);
  }
}

function _checkAutoResetNuevoDia(e) {
  try {
    const todayStr = _fmtDate(new Date());
    const props = PropertiesService.getScriptProperties();
    const lastReset = props.getProperty("LAST_AUTO_RESET_DATE");
    if (lastReset !== todayStr) {
      _resetearPedidoSilencioso();
      props.setProperty("LAST_AUTO_RESET_DATE", todayStr);
    }
  } catch(err) {}
  // Respaldo de las 04:00: reintenta una actualización de estructura pendiente
  _migrarSiEsActivador(e);
}

function _fmtDate(date) {
  if (!date || isNaN(date)) return "—";
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}

function avanzarSemanaInfo() {
  SpreadsheetApp.getUi().alert("📅 Avanzar semana","Esta función se ejecuta en el archivo principal Mise_Bodega.");
}

function repararSistemaTienda() {
  const tId = "repararSistemaTienda_" + Date.now();
  MiseLogger.time(tId);
  const ui = SpreadsheetApp.getUi();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    ui.alert("El archivo está ocupado. Intenta de nuevo.");
    return;
  }

  try {
    SpreadsheetApp.getActive().toast("⏳ Reconstruyendo fórmulas, sincronizando productos y protegiendo celdas...", "🔧 Reparar Sistema", 5);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const syncCount = _reconstruirPedidoDiarioCore(_leerCapturasTienda(ss.getSheetByName(SHEET_PEDIDO), ss.getSheetByName(SHEET_SURTIDO)));
    const dur = MiseLogger.timeEnd(tId);
    MiseLogger.info("repararSistemaTienda", `Reconstrucción limpia completada: ${syncCount} productos sincronizados y fórmulas reestablecidas.`, dur);
    SpreadsheetApp.getActive().toast("✅ Reconstrucción Limpia Completada", "🔧 Reparar Sistema", 4);
    ui.alert("✅ Sistema Reconstruido y Sanitizado", "Se guardaron tus cantidades de pedido, se reconstruyó la plantilla desde cero eliminando formatos corruptos y se blindaron las celdas.", ui.ButtonSet.OK);
  } catch (err) {
    const dur = MiseLogger.timeEnd(tId);
    MiseLogger.error("repararSistemaTienda", err.message, err, dur);
    ui.alert("❌ Error en reparación", err.message, ui.ButtonSet.OK);
  } finally {
    lock.releaseLock();
  }
}

// Captura en RAM (por nombre de producto) todo lo que el usuario o el sistema escribió en el día:
// PEDIDO DIARIO F (pedir), H (recibida), I (estado), J (adición) + lo marcado en SURTIDO RÁPIDO (E/F/G),
// que tiene prioridad porque es la captura directa del surtidor.
function _leerCapturasTienda(pedido, surtido) {
  const capturas = {};
  if (pedido && pedido.getLastRow() >= DATA_START_ROW) {
    const n = pedido.getLastRow() - DATA_START_ROW + 1;
    pedido.getRange(DATA_START_ROW, 1, n, 10).getValues().forEach(r => {
      const name = String(r[2] || "").trim();
      if (!name) return;
      const c = { pedir: r[COL_CANT_PEDIR - 1], recibida: r[COL_RECIBIDA - 1], estado: r[COL_ESTADO - 1], adicion: r[9] };
      if ([c.pedir, c.recibida, c.estado, c.adicion].some(v => v !== "" && v !== null)) capturas[name] = c;
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
        const c = capturas[name] || { pedir: ped, recibida: "", estado: "", adicion: "" };
        c.recibida = recibida; c.estado = estado;
        capturas[name] = c;
      }
    });
  }
  return capturas;
}

// Reconstrucción limpia de 📋 PEDIDO DIARIO sin UI (la usan la reparación manual y el motor de migración).
// El llamador debe tener el candado. Lanza Error si la conexión con Bodega no está lista.
function _reconstruirPedidoDiarioCore(backupData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pedido = ss.getSheetByName(SHEET_PEDIDO);
  const sync = ss.getSheetByName(SHEET_SYNC);
  if (!pedido || !sync) throw new Error("No se encontraron las pestañas necesarias del sistema.");

  // 1. Asegurar la conexión IMPORTRANGE en _SYNC
  const url = PropertiesService.getScriptProperties().getProperty(`BODEGA_URL_${BODEGA_KEY}`);
  if (!url) throw new Error(`Falta la propiedad BODEGA_URL_${BODEGA_KEY}. Ve a ⚙️ Mise → Configurar Bodega.`);
  const syncFormula = '=IMPORTRANGE("' + url + '", "'  + VISTA_MOVIL + '!A4:L")';
  if (sync.getRange(4, 1).getFormula() !== syncFormula) {
    sync.getRange(4, 1).clearContent();
    sync.getRange(4, 1).setFormula(syncFormula);
  }

  // 2. Conteo de productos sincronizados
  const syncCount = Math.max(0, sync.getLastRow() - 3);
  if (syncCount < 1) throw new Error("No se detectaron productos sincronizados desde Bodega.");

  // 3. Reconstrucción total limpia de la hoja
  _buildPedidoDiario(pedido);
  PropertiesService.getScriptProperties().setProperty("PRODUCT_COUNT", String(syncCount));

  // 4. Ensamblado en matriz 2D unificada, restaurando capturas por nombre de producto
  const DR = DATA_START_ROW;
  const sRef = "'" + SHEET_SYNC + "'";
  const syncVals = sync.getRange(4, 1, syncCount, 12).getValues();
  const orden = _ordenPickingSync(syncVals);
  const outputGrid = [];
  const cleanBgs = [];
  const _v = (x) => (x !== "" && x !== null && x !== undefined) ? x : "";

  for (let i = 0; i < syncCount; i++) {
    const r = DR + i;
    const sr = 4 + orden[i];
    const pName = String(syncVals[orden[i]][2] || "").trim();
    const b = (backupData && backupData[pName]) || {};

    outputGrid.push([
      i + 1,                                        // Col A (No)
      '=' + sRef + '!B' + sr,                       // Col B (CATEGORÍA)
      '=' + sRef + '!C' + sr,                       // Col C (PRODUCTO)
      '=' + sRef + '!D' + sr,                       // Col D (UNIDAD)
      '=IFERROR(' + sRef + '!E' + sr + '*1, 0) & IF(AND(' + sRef + '!J' + sr + '=0, ' + sRef + '!K' + sr + '=0), "", IF(' + sRef + '!E' + sr + '<' + sRef + '!J' + sr + ', " (-" & (' + sRef + '!J' + sr + '-' + sRef + '!E' + sr + ') & ")", IF(' + sRef + '!E' + sr + '>' + sRef + '!K' + sr + ', " (+" & (' + sRef + '!E' + sr + '-' + sRef + '!K' + sr + ') & ")", " (-)")))', // Col E
      _v(b.pedir),                                  // Col F (CANT. A PEDIR)
      '=IF(OR(F' + r + '="", H' + r + '=""), "", H' + r + ' - F' + r + ')', // Col G (DIFERENCIA)
      _v(b.recibida),                               // Col H (RECIBIDA)
      _v(b.estado),                                 // Col I (ESTADO)
      _v(b.adicion),                                // Col J (ADICIÓN)
      '=IF(AND(' + sRef + '!J' + sr + '=0, ' + sRef + '!K' + sr + '=0), "—", ' + sRef + '!J' + sr + ' & "  |  " & ' + sRef + '!K' + sr + ')' // Col K (MÍN | MÁX QUIOSCO)
    ]);

    const rowBg = Array(NUM_COLS).fill(i % 2 === 0 ? COLORS.neutral_a : COLORS.neutral_b);
    rowBg[4] = COLORS.blue;                    // Col E (Saldo Teórico)
    rowBg[COL_CANT_PEDIR - 1] = COLORS.yellow; // Col F (Cant a pedir)
    cleanBgs.push(rowBg);
  }

  const rangeData = pedido.getRange(DR, 1, syncCount, NUM_COLS);
  rangeData.clearContent();
  rangeData.setBackgrounds(cleanBgs);
  rangeData.setFormulas(outputGrid);

  // 5. Visibilidad, formatos condicionales y protecciones
  _aplicarFormatosCondicionales(pedido);
  _actualizarVisibilidadInactivos(pedido);
  _protegerPedidoDiario(pedido, syncCount);
  SpreadsheetApp.flush();
  return syncCount;
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
const MISE_SCHEMA_TIENDA = 2; // 2 = v1.7.5 (DIFERENCIA intra-fila, Surtido Rápido con CANT. FINAL)
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
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();
  const actual = parseInt(props.getProperty(PROP_SCHEMA) || "1", 10);
  if (actual >= MISE_SCHEMA_TIENDA) {
    ui.alert("✅ Al día", `La estructura ya está en la versión ${actual}.`, ui.ButtonSet.OK);
    return;
  }
  const ok = _migrarEsquemaTienda();
  ui.alert(ok ? "✅ Estructura actualizada" : "⚠️ No se pudo actualizar",
    ok ? `Versión ${actual} → ${MISE_SCHEMA_TIENDA}. Tus capturas se respaldaron y restauraron; revisa 🗒 LOG para el detalle.`
       : "Revisa 🗒 LOG. Se reintentará automáticamente esta noche.", ui.ButtonSet.OK);
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

function setupCompleto() {
  const ui   = SpreadsheetApp.getUi();
  const pResp = ui.prompt(
    "⚠️ Restablecer sistema (Acción Destructiva)",
    "Esta operación borrará y reconstruirá la hoja de Pedido Diario por completo.\n\nIngresa la contraseña de administrador para continuar:",
    ui.ButtonSet.OK_CANCEL
  );
  if (pResp.getSelectedButton() !== ui.Button.OK) return;
  
  const psw = pResp.getResponseText().trim();
  const adminPsw = PropertiesService.getScriptProperties().getProperty("ADMIN_PASSWORD") || "LCP-ADMIN-2026";
  if (psw !== adminPsw) {
    ui.alert("❌ Contraseña incorrecta. Operación abortada.");
    return;
  }
  
  const resp = ui.alert(
    "⚠️ Confirmación Final",
    "¿Estás absolutamente seguro de que deseas borrar y reconstruir el archivo?",
    ui.ButtonSet.YES_NO
  );
  // Purgar estados de sesión pero PRESERVAR configuraciones de infraestructura (BODEGA_URL y ADMIN_PASSWORD)
  const props = PropertiesService.getScriptProperties();
  const bodegaUrl = props.getProperty(`BODEGA_URL_${BODEGA_KEY}`);
  const adminPswProp = props.getProperty("ADMIN_PASSWORD");

  props.deleteAllProperties();
  try { SpreadsheetApp.flush(); } catch(e) {}
  
  if (bodegaUrl) props.setProperty(`BODEGA_URL_${BODEGA_KEY}`, bodegaUrl);
  if (adminPswProp) props.setProperty("ADMIN_PASSWORD", adminPswProp);
  
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
  registrarLog("setupCompleto", "SUCCESS", "Sistema de Pedido Diario reestructurado desde cero.");
}

function _buildPedidoDiario(sheet) {
  if (sheet.getMaxColumns() < NUM_COLS) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), Math.max(1, NUM_COLS - sheet.getMaxColumns()));
  }

  // Banner superior partiendo de la Columna C visible (C1)
  sheet.getRange(1, 1, 1, NUM_COLS).clearContent().setBackground(null);
  sheet.getRange(1, 3, 1, NUM_COLS - 2).clearContent().setBackground("#3D5A47");
  sheet.getRange("C1")
    .setFormula('="MISE — PEDIDO DIARIO · ' + BODEGA_NOMBRE + '   |   La Crêpe Parisienne   ·   " & TEXT(TODAY(),"dd/mmm/yyyy")')
    .setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(10).setFontFamily("Arial").setHorizontalAlignment("left").setVerticalAlignment("middle");
  sheet.setRowHeight(1, 30);

  // Fila 2: Botón Interactivo Único (F2 = 🚚 Surtido Rápido)
  sheet.getRange("A2:ZZ2").setBackground(null).clearContent().clearDataValidations();
  sheet.getRange(2, 1, 1, NUM_COLS).setBackground("#7A9E8A");
  sheet.getRange(3, 1, 1, NUM_COLS).setBackground(null).clearContent().clearDataValidations();

  // Col C: Etiqueta explicativa del botón único
  sheet.getRange("C2").setValue("🚚  Surtido Rápido:").setFontWeight("bold").setFontColor("#FFFFFF").setHorizontalAlignment("right").setVerticalAlignment("middle").setFontSize(9);
  
  // Col F: Casilla táctil interactiva que acciona el Surtido Rápido
  sheet.getRange("F2").insertCheckboxes().setValue(false).setBackground("#FFFCD0");
  sheet.setRowHeight(2, 26);

  // Fila 3: Headers (Encabezados institucionales de la tabla)
  sheet.getRange(3, 1, 1, NUM_COLS)
    .setValues([["No","CATEGORÍA","PRODUCTO","UNIDAD","SALDO TEÓRICO","CANT. A PEDIR","DIFERENCIA","","","","MÍN  |  MÁX"]])
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

// Columnas auxiliares ocultas L:O (ACTIVO, SALDO, MÍN, MÁX) buscadas por NOMBRE en _SYNC.
// Una sola ARRAYFORMULA en L4: ningún escritor de A:K la pisa y siempre corresponde al producto
// de la fila, sin importar el orden de picking. Reemplaza las reglas INDIRECT(... & ROW()).
const COL_AUX = 12; // L
function _asegurarColumnasAuxiliaresPedido(sheet) {
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

function _aplicarFormatosCondicionales(sheet) {
  _asegurarColumnasAuxiliaresPedido(sheet);
  sheet.clearConditionalFormatRules();
  const count = _getProductCount();
  if (count < 1) return;
  const range = sheet.getRange(DATA_START_ROW, 1, count, NUM_COLS);
  const rangeE = sheet.getRange(DATA_START_ROW, 5, count, 1);
  // Regla 1: Alerta adición de última hora (naranja brillante)
  const ruleAdicion = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$J4="🚨 ADICIÓN"')
    .setBackground("#FFD54F")
    .setRanges([range])
    .build();
      
  // Regla 1.5: Inactivos (gris)
  const ruleInactivo = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$L4="NO"')
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

  const rules = [ruleCompleto, ruleParcial, ruleExcedente, ruleAdicion, ruleInexistente, rulePendiente, ruleInactivo];
  
  // Reglas Semáforo en Columna E (SALDO TEÓRICO) — leen L:O de su propia fila (M saldo, N mín, O máx)
  const _sem = (f, bg, fg) => rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(f).setBackground(bg).setFontColor(fg).setRanges([rangeE]).build());
  _sem('=AND($N4>0, $M4<0.5*$N4)',                    "#FFCDD2", "#B71C1C");
  _sem('=AND($N4>0, $M4<$N4, $M4>=0.5*$N4)',          "#FFE0B2", "#BF360C");
  _sem('=AND(OR($N4>0, $O4>0), $M4>=$N4, $M4<=$O4)',  "#C8E6C9", "#1B5E20");
  _sem('=AND($O4>0, $M4>$O4)',                        "#B3E5FC", "#0D47A1");
  _sem('=AND($C4<>"", $N4=0, $O4=0)',                 "#CFD8DC", "#37474F");
      
  sheet.setConditionalFormatRules(rules);
}

function acercaDe() {
  SpreadsheetApp.getUi().alert("⚙️ Mise — v1.6.0 Altair", `Suite Atelier · La Crêpe Parisienne · ${BODEGA_NOMBRE}\n\nQuiosco de Picking · Vista Móvil 3-Cols · Stock de Quiosco · Diseñado para celulares.`, SpreadsheetApp.getUi().ButtonSet.OK);
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
  const dataRange = pSheet.getRange(DATA_START_ROW, 1, lr - DATA_START_ROW + 1, NUM_COLS);
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

      // Detect highlight color (Adición si Col J tiene "🚨 ADICIÓN", o morado si Col C background es morado)
      let highlightBg = null;
      if (data[i][9] === "🚨 ADICIÓN") {
        highlightBg = "#FFD54F"; // Orange addition alert
      } else if (bgColC === "#e8eaf6" || bgColC === "rgb(232, 234, 246)") {
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

  // Encabezado partido EXACTAMENTE en la frontera congelada (A:D | E:H): Google no permite congelar
  // columnas que corten una celda combinada. Primero se deshacen las combinaciones de versiones previas.
  sSheet.setFrozenColumns(0);
  sSheet.setFrozenRows(0);
  sSheet.getRange(1, 1, sSheet.getMaxRows(), sSheet.getMaxColumns()).breakApart();

  sSheet.getRange("A1:D1").merge()
    .setValue(`🚚 SURTIDO RÁPIDO · ${BODEGA_NOMBRE}`)
    .setBackground("#3D5A47").setFontColor("#FFFFFF").setFontWeight("bold")
    .setFontSize(11).setFontFamily("Arial").setHorizontalAlignment("left").setVerticalAlignment("middle");
  sSheet.getRange("E1:H1").merge().setBackground("#3D5A47");
  sSheet.setRowHeight(1, 30);

  sSheet.getRange("A2:D2").merge()
    .setValue("Escribe lo que llegó, o marca ✅ completo / ❌ no llegó ➜")
    .setBackground("#F5EFE6").setFontColor("#333333").setFontSize(8).setWrap(true)
    .setHorizontalAlignment("left").setVerticalAlignment("middle");
  sSheet.getRange("E2:H2").merge().setBackground("#F5EFE6");
  sSheet.setRowHeight(2, 30);

  // Headers de columnas (Fila 3)
  const headers = ["No", "CATEGORÍA", "PRODUCTO", "CANT. PEDIDA", "CANT. RECIBIDA", "✅ COMPLETO", "❌ INEXISTENTE", "CANT. FINAL"];
  sSheet.getRange(3, 1, 1, 8)
    .setValues([headers])
    .setBackground("#3D5A47").setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(9)
    .setHorizontalAlignment("center").setVerticalAlignment("middle");
  sSheet.setRowHeight(3, 28);
  
  // Inmovilización de columnas y filas
  // Congeladas hasta CANT. PEDIDA: producto y cantidad pedida siempre visibles al desplazarse
  sSheet.setFrozenRows(3);
  sSheet.setFrozenColumns(4);

  sSheet.setColumnWidth(1, 40);   // No (oculta)
  sSheet.setColumnWidth(2, 125);  // CATEGORÍA (oculta)
  sSheet.setColumnWidth(3, 170);  // PRODUCTO (angosta: A:D congeladas deben dejar espacio en móvil)
  sSheet.setColumnWidth(4, 70);   // CANT. PEDIDA
  sSheet.setColumnWidth(5, 100);  // CANT. RECIBIDA (Editable)
  sSheet.setColumnWidth(6, 90);   // ✅ COMPLETO
  sSheet.setColumnWidth(7, 90);   // ❌ INEXISTENTE
  sSheet.setColumnWidth(8, 90);   // CANT. FINAL (fórmula)

  sSheet.hideColumns(1, 2); // Ocultar No y Categoría

  const rows = Math.max(filtered.length, 1);

  if (filtered.length === 0) {
    sSheet.clearConditionalFormatRules();
    sSheet.getRange("A4:J50").setBackground("#FFFFFF");
    sSheet.getRange("C4")
      .setValue("No hay productos ordenados para surtir hoy (CANT. A PEDIR = 0).")
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

function generarDatosPrueba() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_PEDIDO);
  if (!sheet) return;
  
  const count = _getProductCount();
  if (count < 1) return;
  
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  
  try {
    const rangeF = sheet.getRange(DATA_START_ROW, COL_CANT_PEDIR, count, 1);
    const valuesF = rangeF.getValues();
    
    // Choose 15-25 random products to order
    const numToOrder = Math.floor(Math.random() * 11) + 15; // 15 to 25
    const selectedIndices = new Set();
    while (selectedIndices.size < numToOrder) {
      selectedIndices.add(Math.floor(Math.random() * count));
    }
    
    selectedIndices.forEach(idx => {
      // Set random quantity to order (integers or decimals)
      const isFloat = Math.random() > 0.5;
      const base = Math.floor(Math.random() * 8) + 1; // 1 to 8
      let val = base;
      if (isFloat) {
        const decimals = [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875];
        val = base + decimals[Math.floor(Math.random() * decimals.length)];
      }
      valuesF[idx][0] = val;
    });
    
    rangeF.setValues(valuesF);
    
    SpreadsheetApp.flush();
    registrarLog("generarDatosPrueba", "SUCCESS", `Se generaron datos de prueba aleatorios para ${numToOrder} productos.`);
    try { SpreadsheetApp.getActive().toast(`Se generaron datos de prueba para ${numToOrder} productos ✓`, "🎲 Prueba", 4); } catch(e) {}
  } catch(err) {
    registrarLog("generarDatosPrueba", "ERROR", err.message);
  } finally {
    lock.releaseLock();
  }
}

function probadorForzarLogSurtido() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_PEDIDO);
  if (!sheet) return;
  _registrarLogSurtidoDiario(ss, sheet);
  SpreadsheetApp.getActive().toast("Evidencias guardadas en 🗒 LOG_SURTIDO ✓", "🧪 Prueba", 4);
}

// ── BLINDAJE DE SEGURIDAD Y PROTECCIONES (ANTI-MANIPULACIÓN) ─────────────────
function protegerPedidoSeguro() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_PEDIDO);
  if (!sheet) return;

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

function protegerTodasLasHojasTiendaSeguras() {
  protegerPedidoSeguro();
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
function registrarLog(accion, estado, detalle) {
  const level = estado === "ERROR" ? "ERROR" : "INFO";
  MiseLogger.log(level, accion, detalle);
}

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
  const creados = ["_resetearPedidoSilencioso (00:00)", "_checkAutoResetNuevoDia (04:00)"];
  registrarLog("instalarActivadores", "SUCCESS", `Borrados (${borrados.length}): [${borrados.join(", ")}]. Creados: ${creados.join(", ")}.`);
  return { borrados, creados };
}

function instalarActivadoresMedianochePDM() {
  const r = _reiniciarActivadoresTienda();
  SpreadsheetApp.getUi().alert("⏰ Activadores Reiniciados",
    `Se borraron ${r.borrados.length} activador(es) previos:\n${r.borrados.join("\n") || "(ninguno)"}\n\nQuedaron exactamente:\n• ${r.creados.join("\n• ")}`,
    SpreadsheetApp.getUi().ButtonSet.OK);
}

// ── 🔗 CONEXIÓN CON BODEGA (a qué libro apunta, por NOMBRE, y si _SYNC está vivo) ──────────
function _diagnosticarConexionTienda() {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty(`BODEGA_URL_${BODEGA_KEY}`);
  if (!url) return { ok: false, linea: `❌ Sin BODEGA_URL_${BODEGA_KEY} configurada` };
  let nombre = "";
  try { nombre = SpreadsheetApp.openByUrl(url).getName(); }
  catch (err) { return { ok: false, linea: "❌ No se pudo abrir el libro de Bodega configurado" }; }
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
  const ui = SpreadsheetApp.getUi();
  const pasos = [];
  const paso = (nombre, fn) => {
    try { const d = fn(); pasos.push(`✅ ${nombre}${d ? " — " + d : ""}`); }
    catch (err) { pasos.push(`❌ ${nombre} — ${err.message}`); registrarLog("configurarEsteLibro", "ERROR", `${nombre}: ${err.message}`); }
  };
  paso("Activadores", () => { const r = _reiniciarActivadoresTienda(); return `${r.borrados.length} viejos borrados, ${r.creados.length} creados`; });
  paso("Enlace con Bodega", () => { _validarYAutoRepararSyncSilencioso(); _asegurarSyncVivo(); return ""; });
  paso("Estructura", () => {
    const actual = parseInt(PropertiesService.getScriptProperties().getProperty(PROP_SCHEMA) || "1", 10);
    if (actual >= MISE_SCHEMA_TIENDA) return `al día (v${actual})`;
    if (!_migrarEsquemaTienda()) throw new Error("no se pudo actualizar; revisa 🗒 LOG");
    return `v${actual} → v${MISE_SCHEMA_TIENDA} (capturas respaldadas y restauradas)`;
  });
  paso("Orden de picking e inactivos", () => { ordenarPedido(); return "aplicados"; });
  let con = { ok: false, linea: "" };
  paso("Conexión", () => { con = _diagnosticarConexionTienda(); return con.ok ? "correcta" : "por revisar"; });

  const ok = pasos.every(p => p.startsWith("✅")) && con.ok;
  registrarLog("configurarEsteLibro", ok ? "SUCCESS" : "WARN", pasos.join(" | "));
  ui.alert(ok ? `🚀 ${BODEGA_NOMBRE} lista` : `🚀 ${BODEGA_NOMBRE} configurada con observaciones`,
    `${pasos.join("\n")}\n\n🔗 ${con.linea}`, ui.ButtonSet.OK);
}

// Si _SYNC quedó con valores fijos (sin IMPORTRANGE), restaurar el enlace vivo desde BODEGA_URL
function _asegurarSyncVivo() {
  const sync = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SYNC);
  if (!sync || /IMPORTRANGE/i.test(sync.getRange(4, 1).getFormula())) return;
  const url = PropertiesService.getScriptProperties().getProperty(`BODEGA_URL_${BODEGA_KEY}`);
  if (url) _setupSync(url);
}

// ── MÓDULO DE TRASPASOS INTER-TIENDAS (MOBILE-FIRST) ─────────────────────────
function abrirDialogoTraspasoTiendaHTML() {
  const html = HtmlService.createHtmlOutputFromFile('TraspasoTiendaDialog')
    .setWidth(450)
    .setHeight(560);
  SpreadsheetApp.getUi().showModalDialog(html, `🔄 Registrar Traspaso — ${BODEGA_NOMBRE}`);
}

function obtenerCatalogoParaTraspasoTienda() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sync = ss.getSheetByName(SHEET_SYNC);
  const items = [];

  if (sync && sync.getLastRow() >= 4) {
    const sData = sync.getRange(4, 1, sync.getLastRow() - 3, 12).getValues();
    sData.forEach(r => {
      const act = String(r[8] || "").trim().toUpperCase();
      if (act === "NO") return;
      const name = String(r[2] || "").trim();
      if (!name) return;
      const cat = String(r[1] || "").trim();
      const unit = String(r[3] || "").trim();
      items.push({
        name: name,
        cat: cat,
        unit: unit
      });
    });
  }

  // Si no hay datos en _SYNC, leer directamente de PEDIDO DIARIO
  if (items.length === 0) {
    const pedido = ss.getSheetByName(SHEET_PEDIDO);
    if (pedido && pedido.getLastRow() >= 4) {
      const pData = pedido.getRange(4, 1, pedido.getLastRow() - 3, 5).getValues();
      pData.forEach(r => {
        const name = String(r[2] || "").trim();
        if (!name) return;
        items.push({
          name: name,
          cat: String(r[1] || "").trim(),
          unit: String(r[3] || "").trim()
        });
      });
    }
  }

  return {
    miBodegaKey: BODEGA_KEY,
    miBodegaNombre: BODEGA_NOMBRE,
    contraparteKey: (BODEGA_KEY === "BA") ? "BM" : "BA",
    contraparteNombre: (BODEGA_KEY === "BA") ? "Mercado" : "Andares",
    productos: items
  };
}

function registrarTraspasoTiendaRPC(payload) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    throw new Error("El sistema de traspasos está ocupado. Intenta de nuevo.");
  }

  try {
    const props = PropertiesService.getScriptProperties();
    const bdgUrl = props.getProperty(`BODEGA_URL_${BODEGA_KEY}`) || props.getProperty("BODEGA_URL_BA") || props.getProperty("BODEGA_URL_BM");
    const bdgId = props.getProperty("BODEGA_SPREADSHEET_ID") || props.getProperty("BDG_SPREADSHEET_ID");

    let bdgSs = null;
    if (bdgId) {
      try { bdgSs = SpreadsheetApp.openById(bdgId); } catch(e) {}
    }
    if (!bdgSs && bdgUrl) {
      try { bdgSs = SpreadsheetApp.openByUrl(bdgUrl); } catch(e) {}
    }

    if (!bdgSs) {
      throw new Error(`No se pudo conectar con el archivo de Bodega Central para registrar el traspaso.`);
    }

    // Asegurar usuario
    const userEmail = Session.getActiveUser().getEmail() || `Encargado ${BODEGA_NOMBRE}`;
    const payloadEnriquecido = {
      origen: payload.origen,
      destino: payload.destino,
      producto: payload.producto,
      cantidad: parseFloat(payload.cantidad),
      unidad: payload.unidad,
      motivo: payload.motivo || "Traspaso inter-tiendas",
      usuario: userEmail
    };

    // 1. Ejecutar registro autoritativo en BDG mediante importación directa en libro
    const res = bdgSs.getName() ? (function() {
      // Registrar fila en 🔄 TRASPASOS de BDG
      let traspasosSheet = bdgSs.getSheetByName("🔄 TRASPASOS");
      if (!traspasosSheet) {
        traspasosSheet = bdgSs.insertSheet("🔄 TRASPASOS");
        traspasosSheet.getRange(1, 1, 1, 11).setValues([[
          "FOLIO", "FECHA_HORA", "ORIGEN", "DESTINO", "PRODUCTO", "CANTIDAD", "UNIDAD", "FACTOR_KARDEX", "CANT_KARDEX", "MOTIVO", "USUARIO"
        ]]).setBackground("#3D5A47").setFontColor("#FFFFFF").setFontWeight("bold");
        traspasosSheet.setRowHeight(1, 28);
        traspasosSheet.setFrozenRows(1);
      }

      // Buscar factores y actualizar Kardex
      const hoy = new Date();
      const dow = hoy.getDay();
      const dIdx = dow === 0 ? 6 : dow - 1;
      const entColIdx = 10 + dIdx * 3;
      const salColIdx = 10 + dIdx * 3 + 1;

      const normKey = String(payload.producto).toLowerCase().replace(/\s+/g, "").replace(/cdk/g, "").replace(/[()]/g, "").trim();

      // Factor de conversión desde MAESTRO
      let factorConversion = 1;
      const mSheet = bdgSs.getSheetByName("MAESTRO");
      if (mSheet && mSheet.getLastRow() >= 4) {
        const mHeaders = mSheet.getRange(3, 1, 1, mSheet.getLastColumn()).getValues()[0].map(h => String(h).trim().toUpperCase());
        const cFact = mHeaders.findIndex(h => h.includes("FACTOR"));
        const cProd = mHeaders.indexOf("PRODUCTO");
        if (cFact !== -1 && cProd !== -1) {
          const mData = mSheet.getRange(4, 1, mSheet.getLastRow() - 3, mSheet.getLastColumn()).getValues();
          for (let i = 0; i < mData.length; i++) {
            const pNorm = String(mData[i][cProd]).toLowerCase().replace(/\s+/g, "").replace(/cdk/g, "").replace(/[()]/g, "").trim();
            if (pNorm === normKey) {
              let fVal = mData[i][cFact];
              if (typeof fVal === "string") fVal = fVal.replace(',', '.').trim();
              const numF = parseFloat(fVal);
              if (!isNaN(numF) && numF > 0) factorConversion = numF;
              break;
            }
          }
        }
      }

      const cantKardex = Math.round(payload.cantidad * factorConversion * 1000) / 1000;

      // Actualizar Kardex Origen y Destino en BDG
      const kOri = bdgSs.getSheetByName(payload.origen === "BA" ? "KARDEX_BA" : "KARDEX_BM");
      const kDes = bdgSs.getSheetByName(payload.destino === "BA" ? "KARDEX_BA" : "KARDEX_BM");

      if (kOri && kDes) {
        const dataOri = kOri.getRange(7, 3, kOri.getLastRow() - 6, 1).getValues();
        const dataDes = kDes.getRange(7, 3, kDes.getLastRow() - 6, 1).getValues();

        for (let i = 0; i < dataOri.length; i++) {
          if (String(dataOri[i][0]).toLowerCase().replace(/\s+/g, "").replace(/cdk/g, "").replace(/[()]/g, "").trim() === normKey) {
            const rowO = 7 + i;
            const curSal = parseFloat(kOri.getRange(rowO, salColIdx).getValue()) || 0;
            kOri.getRange(rowO, salColIdx).setValue(curSal + cantKardex);
            break;
          }
        }

        for (let i = 0; i < dataDes.length; i++) {
          if (String(dataDes[i][0]).toLowerCase().replace(/\s+/g, "").replace(/cdk/g, "").replace(/[()]/g, "").trim() === normKey) {
            const rowD = 7 + i;
            const curEnt = parseFloat(kDes.getRange(rowD, entColIdx).getValue()) || 0;
            kDes.getRange(rowD, entColIdx).setValue(curEnt + cantKardex);
            break;
          }
        }
      }

      const folio = "TRP-" + Utilities.formatDate(hoy, "GMT-6", "yyyyMMdd-HHmmss");
      const fechaStr = Utilities.formatDate(hoy, "GMT-6", "yyyy-MM-dd HH:mm:ss");
      const nextRow = traspasosSheet.getLastRow() + 1;
      const logRow = [
        folio,
        fechaStr,
        payload.origen === "BA" ? "Andares" : "Mercado",
        payload.destino === "BA" ? "Andares" : "Mercado",
        payload.producto,
        payload.cantidad,
        payload.unidad,
        factorConversion,
        cantKardex,
        payload.motivo,
        userEmail
      ];
      traspasosSheet.getRange(nextRow, 1, 1, 11).setValues([logRow]);

      return {
        success: true,
        folio: folio,
        mensaje: `Traspaso registrado: ${payload.cantidad} ${payload.unidad} de ${payload.origen} a ${payload.destino}`
      };
    })() : null;

    registrarLog("registrarTraspasoTienda", "SUCCESS", `Folio ${res ? res.folio : 'OK'}: ${payload.cantidad} ${payload.unidad} [${payload.producto}]`);

    return res || { success: true, mensaje: "Traspaso aplicado." };
  } finally {
    lock.releaseLock();
  }
}
