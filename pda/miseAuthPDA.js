/**
 * MISE — Pedidos Andares Script v1.9.0 Altair (Optimización Sheets Turbo, Matriz 2D & Cero Lag Móvil)
 * Suite Atelier · La Crêpe Parisienne · Grupo MYT
 *
 * INSTALAR EN: Pedidos Andares (Google Sheets de B-Andares)
 */

// ── BODEGA & CONFIGURACIÓN DINÁMICA DE ENTORNO ──────────────────────────────
const props = PropertiesService.getScriptProperties();
const BODEGA_KEY    = props.getProperty("BODEGA_KEY") || "BA";
const BODEGA_NOMBRE = props.getProperty("BODEGA_NOMBRE") || "Andares";
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
      .addItem("🗑️ Limpiar / Reiniciar pedido",           "resetearPedidoManualmente")
      .addSeparator()
      .addItem("🔧 Reparar formatos y conexión",        "repararSistemaTienda")
      .addSeparator()
      .addItem(`🔗 Configurar conexión con ${BODEGA_NOMBRE}`, "configurarBodega")
      .addSeparator()
      .addItem("🖐️ Ordenar picking",                    "ordenarPedido")
      .addItem("🚚 Surtido Rápido (móvil)",                "generarSurtidoRapido")
      .addSeparator()
      .addItem("🔒 Blindar Pedido y Surtido (Total)",   "protegerTodasLasHojasTiendaSeguras")
      .addSeparator()
      .addItem("⚠️ Restablecer sistema (Destructivo)",     "setupCompleto")
      .addSeparator()
      .addSubMenu(ui.createMenu("🧪 Herramientas Experimentales")
        .addItem("⏰ Activar reseteo automático de medianoche (00:00 AM)", "instalarActivadoresMedianochePDA")
        .addItem("🎲 Generar datos de prueba",             "generarDatosPrueba")
        .addItem("🗒️ Forzar registro en LOG_SURTIDO",     "probadorForzarLogSurtido")
        .addItem("🗑️ Simular Cierre de Día (Reset + Log)", "resetearPedidoManualmente"))
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
    sheet.showColumns(3);      // Mostrar Col C (PRODUCTO)
    sheet.hideColumns(4, 2);   // Ocultar Col D (UNIDAD) y Col E (SALDO TEÓRICO)
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
  sheet.setColumnWidth(3, 260);  // PRODUCTO (VISIBLE)
  sheet.setColumnWidth(4, 65);   // UNIDAD
  sheet.setColumnWidth(5, 110);  // SALDO TEÓRICO
  sheet.setColumnWidth(6, 120);  // CANT. A PEDIR (VISIBLE)
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
    if (!lock.tryLock(5000)) return;

    try {
      // 1. Columna F: ✅ COMPLETO
      if (col === 6) {
        const isComp = (e.range.getValue() === true);
        if (isComp) {
          sheet.getRange(row, 7).setValue(false); // Inexistente = false
          pSheet.getRange(rowInPedido, COL_RECIBIDA).setValue(cantPedir);
          pSheet.getRange(rowInPedido, COL_ESTADO).setValue("COMPLETO");
        } else {
          pSheet.getRange(rowInPedido, COL_RECIBIDA).setValue("");
          pSheet.getRange(rowInPedido, COL_ESTADO).setValue("");
        }
      }
      // 2. Columna G: ❌ INEXISTENTE
      else if (col === 7) {
        const isZero = (e.range.getValue() === true);
        if (isZero) {
          sheet.getRange(row, 6).setValue(false); // Completo = false
          pSheet.getRange(rowInPedido, COL_RECIBIDA).setValue(0);
          pSheet.getRange(rowInPedido, COL_ESTADO).setValue("INEXISTENTE");
        } else {
          pSheet.getRange(rowInPedido, COL_RECIBIDA).setValue("");
          pSheet.getRange(rowInPedido, COL_ESTADO).setValue("");
        }
      }
      // 3. Columna E: CANT. RECIBIDA (Manual)
      else if (col === 5) {
        let val = e.range.getValue();
        if (val !== "") {
          const num = typeof val === "string" ? parseFloat(val.replace(',', '.')) : Number(val);
          if (!isNaN(num) && num >= 0) {
            pSheet.getRange(rowInPedido, COL_RECIBIDA).setValue(num);
            if (num === cantPedir) {
              sheet.getRange(row, 6).setValue(true);
              sheet.getRange(row, 7).setValue(false);
              pSheet.getRange(rowInPedido, COL_ESTADO).setValue("COMPLETO");
            } else if (num === 0) {
              sheet.getRange(row, 6).setValue(false);
              sheet.getRange(row, 7).setValue(true);
              pSheet.getRange(rowInPedido, COL_ESTADO).setValue("INEXISTENTE");
            } else if (num > cantPedir) {
              sheet.getRange(row, 6).setValue(false);
              sheet.getRange(row, 7).setValue(false);
              pSheet.getRange(rowInPedido, COL_ESTADO).setValue("EXCEDENTE");
            } else {
              sheet.getRange(row, 6).setValue(false);
              sheet.getRange(row, 7).setValue(false);
              pSheet.getRange(rowInPedido, COL_ESTADO).setValue("PARCIAL");
            }
          } else {
            sheet.getRange(row, 5).setFormula(`=IF(G${row}=TRUE, 0, IF(F${row}=TRUE, D${row}, ""))`);
            sheet.getRange(row, 6).setValue(false);
            sheet.getRange(row, 7).setValue(false);
            pSheet.getRange(rowInPedido, COL_RECIBIDA).setValue("");
            pSheet.getRange(rowInPedido, COL_ESTADO).setValue("");
          }
        } else {
          // Si borran la celda, re-inyectar la fórmula local
          sheet.getRange(row, 5).setFormula(`=IF(G${row}=TRUE, 0, IF(F${row}=TRUE, D${row}, ""))`);
          sheet.getRange(row, 6).setValue(false);
          sheet.getRange(row, 7).setValue(false);
          pSheet.getRange(rowInPedido, COL_RECIBIDA).setValue("");
          pSheet.getRange(rowInPedido, COL_ESTADO).setValue("");
        }
      }
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

  // Si existe la pestaña de Surtido Rápido, actualizarla en segundo plano silenciosamente
  try {
    const surtido = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("🚚 SURTIDO RÁPIDO");
    if (surtido) {
      generarSurtidoRapidoSilencioso();
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

function _resetearPedidoSilencioso() {
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

    if (prodName && (cantPed > 0 || cantRec > 0 || estado.includes("COMPLETO") || estado.includes("PARCIAL") || estado.includes("INEXISTENTE"))) {
      const cantEfectiva = (cantRec > 0) ? cantRec : (estado === "INEXISTENTE" ? 0 : cantPed);
      logRows.push([
        fechaStr,
        BODEGA_NOMBRE,
        prodName,
        catName,
        cantPed,
        cantEfectiva,
        estado || (cantPed > 0 ? "PEDIDO" : "COMPLETO"),
        esAdicion
      ]);
    }
  }

  if (logRows.length > 0) {
    const startRow = Math.max(logSheet.getLastRow() + 1, 2);
    logSheet.getRange(startRow, 1, logRows.length, 8).setValues(logRows);
  }
}

function _checkAutoResetNuevoDia() {
  try {
    const todayStr = _fmtDate(new Date());
    const props = PropertiesService.getScriptProperties();
    const lastReset = props.getProperty("LAST_AUTO_RESET_DATE");
    if (lastReset !== todayStr) {
      _resetearPedidoSilencioso();
      props.setProperty("LAST_AUTO_RESET_DATE", todayStr);
    }
  } catch(e) {}
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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pedido = ss.getSheetByName(SHEET_PEDIDO);
  const sync = ss.getSheetByName(SHEET_SYNC);
  if (!pedido || !sync) {
    ui.alert("❌ Error", "No se encontraron las pestañas necesarias del sistema.", ui.ButtonSet.OK);
    return;
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    ui.alert("El archivo está ocupado. Intenta de nuevo.");
    return;
  }

  try {
    SpreadsheetApp.getActive().toast("⏳ Reconstruyendo fórmulas, sincronizando productos y protegiendo celdas...", "🔧 Reparar Sistema", 5);
    
    // 1. Asegurar la conexión IMPORTRANGE en _SYNC
    const url = PropertiesService.getScriptProperties().getProperty(`BODEGA_URL_${BODEGA_KEY}`);
    if (!url) {
      ui.alert("❌ Error de Conexión", `No se ha configurado la propiedad BODEGA_URL_${BODEGA_KEY} en las Propiedades del Script.\n\nVe al menú ⚙️ Mise -> Configurar Bodega para enlazar el archivo.`, ui.ButtonSet.OK);
      return;
    }
    const syncFormula = '=IMPORTRANGE("' + url + '", "'  + VISTA_MOVIL + '!A4:L")';
    sync.getRange(4, 1).clearContent();
    sync.getRange(4, 1).setFormula(syncFormula);
    
    // 2. Obtener conteo de productos sincronizados
    const syncCount = Math.max(0, sync.getLastRow() - 3);
    if (syncCount < 1) {
      ui.alert("⚠️ Advertencia", "No se detectaron productos sincronizados desde Bodega. Revisa el enlace con Bodega.", ui.ButtonSet.OK);
      return;
    }
    
    // 3. Resguardo de cantidades existentes (CANT. A PEDIR en Col F y RECIBIDA en Col H por Nombre de Producto)
    const currentCount = _getProductCount();
    const DR = DATA_START_ROW;
    const backupData = {};
    
    if (currentCount > 0) {
      const prodNames = pedido.getRange(DR, 3, currentCount, 1).getValues();
      const cantsPedir = pedido.getRange(DR, COL_CANT_PEDIR, currentCount, 1).getValues();
      const cantsRecibida = pedido.getRange(DR, COL_RECIBIDA, currentCount, 1).getValues();
      
      for (let i = 0; i < currentCount; i++) {
        const name = String(prodNames[i][0] || "").trim();
        if (name) {
          backupData[name] = {
            pedir: cantsPedir[i][0],
            recibida: cantsRecibida[i][0]
          };
        }
      }
    }

    // 4. Reconstrucción Total Limpia de la Hoja (Destruye formatos grises corruptos y regenera estructura)
    _buildPedidoDiario(pedido);
    PropertiesService.getScriptProperties().setProperty("PRODUCT_COUNT", String(syncCount));

    // 5. Ensamblado y escritura en matriz 2D unificada (<100ms)
    const sRef = "'" + SHEET_SYNC + "'";
    const syncNames = ss.getSheetByName(SHEET_SYNC).getRange(4, 3, syncCount, 1).getValues();
    const outputGrid = [];
    const cleanBgs = [];

    for (let i = 0; i < syncCount; i++) {
      const r = DR + i;
      const sr = 4 + i;
      const pName = String(syncNames[i][0] || "").trim();
      const b = backupData[pName] || null;

      outputGrid.push([
        i + 1,                                        // Col A (No)
        '=' + sRef + '!B' + sr,                       // Col B (CATEGORÍA)
        '=' + sRef + '!C' + sr,                       // Col C (PRODUCTO)
        '=' + sRef + '!D' + sr,                       // Col D (UNIDAD)
        '=IFERROR(' + sRef + '!E' + sr + '*1, 0) & IF(AND(' + sRef + '!J' + sr + '=0, ' + sRef + '!K' + sr + '=0), "", IF(' + sRef + '!E' + sr + '<' + sRef + '!J' + sr + ', " (-" & (' + sRef + '!J' + sr + '-' + sRef + '!E' + sr + ') & ")", IF(' + sRef + '!E' + sr + '>' + sRef + '!K' + sr + ', " (+" & (' + sRef + '!E' + sr + '-' + sRef + '!K' + sr + ') & ")", " (-)")))', // Col E
        b && b.pedir !== "" && b.pedir !== null ? b.pedir : "", // Col F (CANT. A PEDIR)
        '=IF(OR(F' + r + '="", H' + r + '=""), "", H' + r + ' - F' + r + ')', // Col G (DIFERENCIA)
        b && b.recibida !== "" && b.recibida !== null ? b.recibida : "", // Col H (RECIBIDA)
        "",                                           // Col I (ESTADO)
        "",                                           // Col J (ADICIÓN)
        '=IF(AND(' + sRef + '!J' + sr + '=0, ' + sRef + '!K' + sr + '=0), "—", ' + sRef + '!J' + sr + ' & "  |  " & ' + sRef + '!K' + sr + ')' // Col K (MÍN | MÁX QUIOSCO)
      ]);

      const rowBg = Array(NUM_COLS).fill(i % 2 === 0 ? COLORS.neutral_a : COLORS.neutral_b);
      rowBg[4] = COLORS.blue;                    // Col E (Saldo Teórico)
      rowBg[COL_CANT_PEDIR - 1] = COLORS.yellow; // Col F (Cant a pedir)
      cleanBgs.push(rowBg);
    }

    // Inyectar en una sola llamada Batch 2D atómica
    const rangeData = pedido.getRange(DR, 1, syncCount, NUM_COLS);
    rangeData.clearContent();
    rangeData.setBackgrounds(cleanBgs);
    rangeData.setFormulas(outputGrid);

    // 6. Aplicar visibilidad, formatos condicionales y protecciones anti-dummies
    _aplicarFormatosCondicionales(pedido);
    _actualizarVisibilidadInactivos(pedido);
    _protegerPedidoDiario(pedido, syncCount);

    SpreadsheetApp.flush();
    const dur = MiseLogger.timeEnd(tId);
    MiseLogger.info("repararSistemaTienda", `Reconstrucción limpia completada: ${syncCount} productos sincronizados y fórmulas reestablecidas.`, dur);
    SpreadsheetApp.getActive().toast("✅ Reconstrucción Limpia Completada", "🔧 Reparar Sistema", 4);
    ui.alert("✅ Sistema Reconstruido y Sanitizado", "Se guardaron tus cantidades de pedido, se reconstruyó la plantilla desde cero eliminando formatos corruptos y se blindaron las celdas.", ui.ButtonSet.OK);
  } catch (err) {
    const dur = MiseLogger.timeEnd(tId);
    MiseLogger.error("repararSistemaTienda", err.message, err, dur);
    SpreadsheetApp.getActive().toast("❌ Error en reparación: " + err.message, "🔧 Reparar Sistema", 5);
  } finally {
    lock.releaseLock();
  }
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

function _aplicarFormatosCondicionales(sheet) {
  sheet.clearConditionalFormatRules();
  const count = _getProductCount();
  if (count < 1) return;
  const range = sheet.getRange(DATA_START_ROW, 1, count, NUM_COLS);
  const rangeE = sheet.getRange(DATA_START_ROW, 5, count, 1);
  const syncName = SHEET_SYNC;
  
  // Regla 1: Alerta adición de última hora (naranja brillante)
  const ruleAdicion = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$J4="🚨 ADICIÓN"')
    .setBackground("#FFD54F")
    .setRanges([range])
    .build();
      
  // Regla 1.5: Inactivos (gris)
  const ruleInactivo = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=INDIRECT("'${SHEET_SYNC}'!$I" & ROW())="NO"`)
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
  
  // Reglas Semáforo en Columna E (SALDO TEÓRICO)
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=AND(INDIRECT("'${syncName}'!J" & ROW())>0, INDIRECT("'${syncName}'!E" & ROW()) < 0.5*INDIRECT("'${syncName}'!J" & ROW()))`)
    .setBackground("#FFCDD2").setFontColor("#B71C1C").setRanges([rangeE]).build());
    
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=AND(INDIRECT("'${syncName}'!J" & ROW())>0, INDIRECT("'${syncName}'!E" & ROW()) < INDIRECT("'${syncName}'!J" & ROW()), INDIRECT("'${syncName}'!E" & ROW()) >= 0.5*INDIRECT("'${syncName}'!J" & ROW()))`)
    .setBackground("#FFE0B2").setFontColor("#BF360C").setRanges([rangeE]).build());
    
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=AND(OR(INDIRECT("'${syncName}'!J" & ROW())>0, INDIRECT("'${syncName}'!K" & ROW())>0), INDIRECT("'${syncName}'!E" & ROW()) >= INDIRECT("'${syncName}'!J" & ROW()), INDIRECT("'${syncName}'!E" & ROW()) <= INDIRECT("'${syncName}'!K" & ROW()))`)
    .setBackground("#C8E6C9").setFontColor("#1B5E20").setRanges([rangeE]).build());
    
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=AND(INDIRECT("'${syncName}'!K" & ROW())>0, INDIRECT("'${syncName}'!E" & ROW()) > INDIRECT("'${syncName}'!K" & ROW()))`)
    .setBackground("#B3E5FC").setFontColor("#0D47A1").setRanges([rangeE]).build());
    
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=AND(INDIRECT("'${syncName}'!J" & ROW())=0, INDIRECT("'${syncName}'!K" & ROW())=0)`)
    .setBackground("#CFD8DC").setFontColor("#37474F").setRanges([rangeE]).build());
      
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
  const sheetName = "🚚 SURTIDO RÁPIDO";
  let sSheet = ss.getSheetByName(sheetName);
  if (sSheet) {
    sSheet.clear();
    const protections = sSheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
    protections.forEach(p => { if (p.canEdit()) p.remove(); });
  } else {
    sSheet = ss.insertSheet(sheetName);
  }

  // Configurar columnas de la hoja
  sSheet.getRange("A1:C1").merge().setBackground("#3D5A47");
  sSheet.getRange("D1:G1").merge()
    .setValue(`MISE — SURTIDO RÁPIDO (${BODEGA_NOMBRE})`)
    .setBackground("#3D5A47").setFontColor("#FFFFFF").setFontWeight("bold")
    .setFontSize(11).setFontFamily("Arial").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sSheet.setRowHeight(1, 30);

  sSheet.getRange("A2:C2").merge().setBackground("#F5EFE6");
  sSheet.getRange("D2:G2").merge()
    .setValue("Instrucciones: Marca ✅ si llegó completo o ❌ si no hay. Cantidad manual si llegó parcial.")
    .setBackground("#F5EFE6").setFontColor("#333333").setFontSize(9)
    .setHorizontalAlignment("center").setVerticalAlignment("middle");
  sSheet.setRowHeight(2, 20);

  // Headers de columnas (Fila 3)
  const headers = ["No", "CATEGORÍA", "PRODUCTO", "CANT. PEDIDA", "CANT. RECIBIDA", "✅ COMPLETO", "❌ INEXISTENTE"];
  sSheet.getRange(3, 1, 1, 7)
    .setValues([headers])
    .setBackground("#3D5A47").setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(9)
    .setHorizontalAlignment("center").setVerticalAlignment("middle");
  sSheet.setRowHeight(3, 28);
  
  // Inmovilización de columnas y filas
  sSheet.setFrozenRows(3);
  sSheet.setFrozenColumns(3);

  sSheet.setColumnWidth(1, 40);   // No
  sSheet.setColumnWidth(2, 125);  // CATEGORÍA
  sSheet.setColumnWidth(3, 210);  // PRODUCTO
  sSheet.setColumnWidth(4, 95);   // CANT. PEDIDA
  sSheet.setColumnWidth(5, 110);  // CANT. RECIBIDA (Editable)
  sSheet.setColumnWidth(6, 95);   // ✅ COMPLETO
  sSheet.setColumnWidth(7, 95);   // ❌ INEXISTENTE
  sSheet.setColumnWidth(8, 40);   // ALERTA (Hidden)

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
    
    const formulasE = [];
    
    for (let i = 0; i < rows; i++) {
      const item = filtered[i];
      const bg = i % 2 === 0 ? "#FAFAFA" : "#FFFFFF";
      const rNum = 4 + i;
      
      values.push([
        item.no,
        item.cat,
        item.prod,
        item.cantPedir
      ]);

      if (item.cantRecibida !== "" && !item.completo && !item.inexistente && !isNaN(Number(item.cantRecibida))) {
        formulasE.push([String(item.cantRecibida)]);
      } else {
        formulasE.push([`=IF(G${rNum}=TRUE, 0, IF(F${rNum}=TRUE, D${rNum}, ""))`]);
      }
      
      const rowBg = Array(7).fill(item.highlightBg || bg);
      if (!item.highlightBg) {
        rowBg[4] = COLORS.blue; // Resaltar CANT. RECIBIDA en azul
        rowBg[5] = "#E8F5E9";  // Resaltar COMPLETO en verde claro
        rowBg[6] = "#FFEBEE";  // Resaltar INEXISTENTE en rojo claro
      }
      bgs.push(rowBg);
      
      checkCompleto.push([item.completo]);
      checkInexistente.push([item.inexistente]);
    }

    // Escribir datos básicos Cols 1-4 (No, Cat, Prod, CantPedir)
    sSheet.getRange(4, 1, rows, 4).setValues(values);
    
    // Inyectar fórmulas dinámicas nativas en Col E (CANT. RECIBIDA instantánea en 0 ms)
    sSheet.getRange(4, 5, rows, 1).setFormulas(formulasE);

    sSheet.getRange(4, 1, rows, 7).setBackgrounds(bgs)
      .setFontFamily("Calibri").setFontSize(10).setVerticalAlignment("middle");
    
    sSheet.getRange(4, 1, rows, 1).setHorizontalAlignment("center").setFontWeight("bold");
    sSheet.getRange(4, 2, rows, 1).setHorizontalAlignment("center");
    sSheet.getRange(4, 3, rows, 1).setHorizontalAlignment("left");
    sSheet.getRange(4, 4, rows, 1).setHorizontalAlignment("right");
    sSheet.getRange(4, 5, rows, 1).setHorizontalAlignment("right");

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

    // Aplicar Reglas de Formato Condicional completas para coloreado de filas
    sSheet.clearConditionalFormatRules();
    const rangeS = sSheet.getRange(4, 1, rows, 7); // A4:G
    
    // 1. Completo / Exacto (Verde suave): Checkbox F es TRUE o E = D (si E > 0)
    const ruleSCompleto = SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=OR($F4=TRUE, AND($E4>0, $E4=$D4))')
      .setBackground("#C8E6C9") // light green
      .setRanges([rangeS])
      .build();
      
    // 2. Inexistente / Cero (Rojo suave): Checkbox G es TRUE o E = 0
    const ruleSInexistente = SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=OR($G4=TRUE, AND($E4<>"", $E4=0))')
      .setBackground("#FFCDD2") // light red
      .setRanges([rangeS])
      .build();

    // 3. Parcial / Menor (Naranja suave): E > 0 y E < D y F es FALSE y G es FALSE
    const ruleSIncompleto = SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($E4>0, $E4<$D4, $F4=FALSE, $G4=FALSE)')
      .setBackground("#FFE0B2") // light orange
      .setRanges([rangeS])
      .build();

    // 4. Excedente / Mayor (Azul claro suave): E > D y F es FALSE y G es FALSE
    const ruleSExcedente = SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($E4>$D4, $F4=FALSE, $G4=FALSE)')
      .setBackground("#E1F5FE") // light cyan/blue
      .setRanges([rangeS])
      .build();

    sSheet.setConditionalFormatRules([ruleSCompleto, ruleSInexistente, ruleSIncompleto, ruleSExcedente]);
  }

  // --- TABLA DE RESUMEN DE PRODUCTOS (COLUMNAS I-J) ---
  sSheet.getRange("I3:J3").merge()
    .setValue("RESUMEN SURTIDO")
    .setBackground("#3D5A47").setFontColor("#FFFFFF").setFontWeight("bold")
    .setFontSize(9).setFontFamily("Arial").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sSheet.setRowHeight(3, 28);

  // Inyectar etiquetas como texto puro (Col I)
  sSheet.getRange("I4:I6").setValues([
    ["✅ Completos"],
    ["⚠️ Incompletos"],
    ["❌ Inexistentes"]
  ]);

  // Inyectar fórmulas dinámicas (Col J)
  sSheet.getRange("J4:J6").setFormulas([
    ["=COUNTIF(F4:F" + (3 + rows) + ", TRUE)"],
    ["=COUNTIFS(D4:D" + (3 + rows) + ", \">0\", E4:E" + (3 + rows) + ", \">0\", F4:F" + (3 + rows) + ", FALSE, G4:G" + (3 + rows) + ", FALSE)"],
    ["=COUNTIF(G4:G" + (3 + rows) + ", TRUE)"]
  ]);

  sSheet.getRange("I4:J4").setBackground("#E8F5E9");
  sSheet.getRange("I5:J5").setBackground("#FFF3E0");
  sSheet.getRange("I6:J6").setBackground("#FFEBEE");
  
  sSheet.getRange("I4:I6").setFontWeight("bold").setFontSize(9).setHorizontalAlignment("left").setVerticalAlignment("middle");
  sSheet.getRange("J4:J6").setFontWeight("bold").setFontSize(10).setHorizontalAlignment("center").setVerticalAlignment("middle");
  sSheet.getRange("I3:J6").setBorder(true, true, true, true, true, true, "#CCCCCC", SpreadsheetApp.BorderStyle.SOLID);
  sSheet.setColumnWidth(9, 120);  // Column I width
  sSheet.setColumnWidth(10, 60);  // Column J width

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
function instalarActivadoresMedianochePDA() {
  const funcionTarget = "_resetearPedidoSilencioso";
  const triggers = ScriptApp.getProjectTriggers();
  let countBorrados = 0;

  // Eliminar activadores previos para evitar duplicados
  triggers.forEach(t => {
    if (t.getHandlerFunction() === funcionTarget || t.getHandlerFunction() === "resetearPedidoManualmente") {
      ScriptApp.deleteTrigger(t);
      countBorrados++;
    }
  });

  // Crear nuevo trigger programado a medianoche (00:00 - 01:00 AM)
  ScriptApp.newTrigger(funcionTarget)
    .timeBased()
    .everyDays(1)
    .atHour(0)
    .create();

  registrarLog("instalarActivadores", "SUCCESS", `Activador nocturno instalado (00:00 AM). Se eliminaron ${countBorrados} activadores viejos.`);
  SpreadsheetApp.getUi().alert(
    "⏰ Activador Automático Configurado",
    `Se ha programado el reseteo diario y guardado en LOG_SURTIDO para ejecutarse automáticamente todos los días entre 00:00 y 01:00 AM.\n\nNo necesitas dejar ninguna pestaña abierta.`,
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}