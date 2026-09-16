/**
 * MISE — Bodegas Script v1.10.0 Altair (Conversión de Unidades, Traspasos Inter-Tiendas & Surtido Numérico)
 * Suite Atelier · La Crêpe Parisienne · Grupo MYT
 *
 * INSTALAR EN: Bodegas (Google Sheets)
 * Extensiones → Apps Script → reemplazar todo → guardar → recargar hoja
 *
 * PROPÓSITO: Sistema de inventario operativo para bodega.
 * El bodeguero registra ENT/SAL diario en el KARDEX.
 * El encargado ve saldos en Pedidos Andares / Pedidos Mercado via IMPORTRANGE.
 *
 * HOJAS QUE CREA:
 *   MAESTRO        — catálogo de 131 productos
 *   KARDEX_BA      — movimientos diarios Andares
 *   KARDEX_BM      — movimientos diarios Mercado
 *   VISTA_MOVIL_BA — saldos para IMPORTRANGE (Pedidos Andares)
 *   VISTA_MOVIL_BM — saldos para IMPORTRANGE (Pedidos Mercado)
 *   CADUCIDADES    — vista consolidada de fechas de caducidad
 *   🗒 LOG         — auditoría de operaciones
 */

// ── CONSTANTES ────────────────────────────────────────────────────────────────
const BODEGAS = {
  BA: { key: "BA", nombre: "Andares", kardex: "KARDEX_BA", vista: "VISTA_MOVIL_BA" },
  BM: { key: "BM", nombre: "Mercado", kardex: "KARDEX_BM", vista: "VISTA_MOVIL_BM" }
};

const SHEET_MAESTRO  = "MAESTRO";
const SHEET_LOG      = "🗒 LOG";
const MAESTRO_START  = 4;   // fila donde empiezan datos en MAESTRO
const KARDEX_START   = 7;   // fila donde empiezan datos en KARDEX
const KARDEX_SLD_ANT = 9;   // col I — SALDO ANTERIOR
const KARDEX_SLD_FIN = 30;  // col AD — SLD domingo
const KARDEX_DAYS    = 7;
const DIAS           = ["LUN","MAR","MIE","JUE","VIE","SAB","DOM"];
const MAESTRO_COLS   = 13;  // A-M en MAESTRO (13 columnas tras remover ID_FAMILIA)
const KARDEX_TOTAL_COLS = 30; // A-AD en KARDEX

// ── UTILERÍAS DINÁMICAS DE MAPEO DE ENCABEZADOS ──────────────────────────────
function _colToLetter(col) {
  let letter = "";
  let temp = col;
  while (temp > 0) {
    let rem = (temp - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    temp = Math.floor((temp - rem) / 26);
  }
  return letter;
}

function _getMaestroHeaderMap(sheet) {
  const targetSheet = sheet || SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_MAESTRO);
  if (!targetSheet) return {};
  const lastCol = targetSheet.getLastColumn();
  if (lastCol < 1) return {};
  const headers = targetSheet.getRange(3, 1, 1, lastCol).getValues()[0];
  const map = {};
  headers.forEach((h, idx) => {
    if (h) {
      const colNum = idx + 1;
      const key = String(h).trim().toUpperCase();
      map[key] = { col: colNum, letter: _colToLetter(colNum), index: idx };
    }
  });

  // Resolución canónica de alias tolerante a tildes y variantes operativas (_QC / _Q_)
  const aliasGroups = [
    { canonical: "MÍN_Q_BA", aliases: ["MIN_Q_BA", "MÍN_BA_QC", "MIN_BA_QC", "MIN_QUIOSCO_BA", "MÍN_QUIOSCO_BA"] },
    { canonical: "MÁX_Q_BA", aliases: ["MAX_Q_BA", "MÁX_BA_QC", "MAX_BA_QC", "MAX_QUIOSCO_BA", "MÁX_QUIOSCO_BA"] },
    { canonical: "MÍN_Q_BM", aliases: ["MIN_Q_BM", "MÍN_BM_QC", "MIN_BM_QC", "MIN_QUIOSCO_BM", "MÍN_QUIOSCO_BM"] },
    { canonical: "MÁX_Q_BM", aliases: ["MAX_Q_BM", "MÁX_BM_QC", "MAX_BM_QC", "MAX_QUIOSCO_BM", "MÁX_QUIOSCO_BM"] },
    { canonical: "PICKING_BA", aliases: ["PICKING_BA", "RANKING_BA", "ORDEN_PICKING_BA", "PICKING_QC_BA"] },
    { canonical: "PICKING_BM", aliases: ["PICKING_BM", "RANKING_BM", "ORDEN_PICKING_BM", "PICKING_QC_BM"] },
    { canonical: "MÍN_BA", aliases: ["MIN_BA"] },
    { canonical: "MÁX_BA", aliases: ["MAX_BA"] },
    { canonical: "MÍN_BM", aliases: ["MIN_BM"] },
    { canonical: "MÁX_BM", aliases: ["MAX_BM"] },
    { canonical: "UNIDAD_TIENDA", aliases: ["UNIDAD_TIENDA", "UNIDAD TIENDA", "UNIDAD_PEDIDO", "UNIDAD PEDIDO", "UNIDAD_SUCURSAL"] },
    { canonical: "FACTOR_CONVERSION", aliases: ["FACTOR_CONVERSION", "FACTOR_CONVERSIÓN", "FACTOR", "FACTOR CONVERSION", "FACTOR CONVERSIÓN", "CONVERSION"] }
  ];

  aliasGroups.forEach(g => {
    if (!map[g.canonical]) {
      for (const al of g.aliases) {
        if (map[al]) {
          map[g.canonical] = map[al];
          break;
        }
      }
    }
    if (map[g.canonical]) {
      g.aliases.forEach(al => {
        if (!map[al]) map[al] = map[g.canonical];
      });
    }
  });

  return map;
}

// Mapa ID_FAMILIA → CATEGORÍA
const CATEGORIAS_MAP = {
  'REF': 'REFRIGERADOS',
  'FYV': 'FRUTAS Y VERDURAS',
  'LEC': 'LÁCTEOS',
  'ABR': 'ABARROTES',
  'BEB': 'BEBIDAS',
  'DES': 'DESECHABLES',
  'JAR': 'JARCERÍA',
  'UNT': 'UNTABLES'
};
const CATEGORIAS_LISTA = Object.values(CATEGORIAS_MAP);

// Paleta extraída del xlsx real
const C = {
  dark:    "#3D5A47",
  sage:    "#7A9E8A",
  dkGreen: "#2E5D4B",
  mdGreen: "#4A6E58",
  ltGreen: "#5C8269",
  cream:   "#F5EFE6",
  yellow:  "#FFFCD0",
  iceBlue: "#E3F2FD",
  entBg:   "#E8F5E9",
  salBg:   "#FFEBEE",
  rowA:    "#FAFAFA",
  rowB:    "#FFFFFF",
};

// ── MENÚ ──────────────────────────────────────────────────────────────────────
function onOpen() {
  try {
    migrarEstructuraMaestro13Cols();
    _autoVerificarYAvanzarSemanaSilencioso();
    _ensureTriggersBDG();
  } catch(e) {}
  try {
    const ui = SpreadsheetApp.getUi();
    const menu = ui.createMenu("⚙️ Mise")
      // Operación Diaria y Supervisión Rápida
      .addItem("🚚 Descontar Pedidos de Hoy (Cierre diario)", "descontarSurtidoAutomaticoManualmente")
      .addItem("🔄 Registrar Traspaso entre Sucursales",  "abrirDialogoTraspasoBDGHTML")
      .addItem("⚡ Mise Powerhouse (Catálogo & Picking)", "abrirConstructorPickingHTML")
      .addItem("📅 Sincronizar semana actual (Ambas bodegas)", "configurarSemanaAmbas")
      .addSeparator()
      .addItem("🩺 Diagnosticar y reparar sistema",       "repararYSincronizarSistemaManualmente")
      .addSeparator()
      // Gestión de Semanas y Calendario
      .addSubMenu(ui.createMenu("📅 Gestión Semanal")
        .addItem("📅 Configurar semana — Andares",          "configurarSemanaBA")
        .addItem("📅 Configurar semana — Mercado",          "configurarSemanaBM")
        .addSeparator()
        .addItem("⏩ Avanzar semana — Andares",             "avanzarSemanaBA")
        .addItem("⏩ Avanzar semana — Mercado",             "avanzarSemanaBM")
        .addItem("⏩ Auto-verificar y avanzar semana ahora", "forzarAutoVerificarYAvanzarSemana"))
      // Gestión de Catálogo
      .addSubMenu(ui.createMenu("🛠️ Gestión de Catálogo")
        .addItem("⚡ Registro rápido de movimientos (PC)", "abrirRegistroRapidoHTML")
        .addItem("🗑️ Eliminar productos seleccionados",    "eliminarSeleccionadosMaestro")
        .addItem("🧹 Eliminar productos duplicados",        "eliminarDuplicadosCatalogo"))
      .addSeparator()
      // Cuarentena de Alto Riesgo / Mantenimiento
      .addSubMenu(ui.createMenu("⚠️ Mantenimiento Avanzado y Zona de Riesgo")
        .addSubMenu(ui.createMenu("🚨 Reconstrucción y Respaldo")
          .addItem("🏗️ Reconstruir KARDEX Andares (con respaldo en RAM)", "reconstruirKardexBAConRespaldo")
          .addItem("🏗️ Reconstruir KARDEX Mercado (con respaldo en RAM)", "reconstruirKardexBMConRespaldo")
          .addItem("🏗️ Reconstruir MAESTRO (con respaldo en RAM)",       "reconstruirMaestroConRespaldo")
          .addSeparator()
          .addItem("📊 Recrear VISTA_MOVIL_BA",             "crearVistaMóvilBA")
          .addItem("📊 Recrear VISTA_MOVIL_BM",             "crearVistaMóvilBM"))
        .addSubMenu(ui.createMenu("🧪 Reconciliación Forense y Recuperación")
          .addItem("📥 Preparar plantilla de recuperación semanal", "prepararPlantillaRecuperacionSemana")
          .addItem("⚡ Inyectar datos de recuperación a Kardex y Logs", "procesarInyeccionRecuperacionKardex")
          .addItem("🔄 Reconciliar y descontar toda la semana activa", "reconciliarSemanaCompletaDesdeLogs")
          .addItem("⚡ Reconciliar salidas del Lunes 07 de Septiembre", "reconciliarLunes7SeptiembreManualmente")
          .addItem("🧠 Reconciliador Inteligente de Huérfanos", "abrirReconciliadorInteligenteHTML"))
        .addSubMenu(ui.createMenu("⚙️ Automatizaciones y Triggers")
          .addItem("🚚 Descontar pedidos de ayer (Manual)", "descontarSurtidoHoyManualmente")
          .addItem("⏰ Reinstalar activadores automáticos (23:00 hrs)", "instalarActivadoresNocturnosBDG")
          .addItem("🔗 Configurar conexión con Logs (IMPORTRANGE)", "configurarConexionLogTiendas")
          .addItem("🛡️ Ejecutar mantenimiento semanal (Manual)", "ejecutarMantenimientoSemanalBDG"))
        .addSubMenu(ui.createMenu("🔒 Protección y Seguridad Crítica")
          .addItem("🔒 Blindar catálogo y Kardex (Total)",   "protegerTodasLasHojasSeguras")
          .addSeparator()
          .addItem("⚠️ Restablecer sistema desde cero (Destructivo)", "setupCompleto")))
      .addSeparator()
      .addItem("ℹ️ Acerca de Mise",                        "acercaDe");
    menu.addToUi();
  } catch(e) {}
}

// ── MOTOR AUTORREPARADOR (SELF-HEALING ENGINE) ────────────────────────────────
function repararYSincronizarSistemaManualmente() {
  repararYSincronizarSistema(false);
}

function repararYSincronizarSistema(silent = false) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const maestro = ss.getSheetByName(SHEET_MAESTRO);
  if (!maestro) return;

  let repairsCount = 0;

  try {
    const lr = maestro.getLastRow();
    if (lr >= MAESTRO_START) {
      const count = lr - MAESTRO_START + 1;
      const map = _getMaestroHeaderMap(maestro);

      const cStkBA = map["STOCK_BA"] ? map["STOCK_BA"].col : 9;
      const cStkBM = map["STOCK_BM"] ? map["STOCK_BM"].col : 12;

      // 1. Escanear errores en STOCK_BA y STOCK_BM en MAESTRO
      const rangeStkBA = maestro.getRange(MAESTRO_START, cStkBA, count, 1);
      const rangeStkBM = maestro.getRange(MAESTRO_START, cStkBM, count, 1);

      const valuesStkBA = rangeStkBA.getValues();
      const valuesStkBM = rangeStkBM.getValues();

      const hasErrorBA = valuesStkBA.some(r => String(r[0]).includes("#N/A") || String(r[0]).includes("#REF") || String(r[0]).includes("#ERROR") || String(r[0]).includes("#VALUE"));
      const hasErrorBM = valuesStkBM.some(r => String(r[0]).includes("#N/A") || String(r[0]).includes("#REF") || String(r[0]).includes("#ERROR") || String(r[0]).includes("#VALUE"));

      if (hasErrorBA || hasErrorBM || !silent) {
        _ordenarYRenumerarTodo();
        repairsCount++;
      }

      // 2. Verificar dropdowns y validaciones desprendidas + asegurar columnas de quiosco
      _asegurarColumnasQuioscoEnMaestro(maestro);
      restaurarValidacionesMaestro();

      // 3. Recrear Vistas Móviles
      _buildVista("BA");
      _buildVista("BM");

      // 4. Asegurar activadores nocturnos autónomos
      _ensureTriggersBDG();
    }

    if (!silent) {
      SpreadsheetApp.getActive().toast("🩺 Sistema verificado y autorreparado con éxito ✓", "⚙️ Mise Self-Healing", 4);
      SpreadsheetApp.getUi().alert("🩺 Diagnóstico Completo", "El sistema ha verificado todas las fórmulas, punteros y validaciones de MAESTRO y KARDEX.\n\nTodo se encuentra 100% sincronizado y saludable.", SpreadsheetApp.getUi().ButtonSet.OK);
    } else if (repairsCount > 0) {
      SpreadsheetApp.getActive().toast("🩺 Se detectaron y repararon fórmulas desfasadas automáticamente ✓", "⚙️ Mise Self-Healing", 4);
    }
  } catch (err) {
    if (!silent) {
      SpreadsheetApp.getUi().alert("❌ Error en Diagnóstico", err.toString(), SpreadsheetApp.getUi().ButtonSet.OK);
    }
  }
}

// ── onEdit: REGISTRO TRANSACCIONAL Y ACCIONES ──────────────────────────────────
function onEdit(e) {
  if (!e) return;
  const sheet = e.range.getSheet();
  const name  = sheet.getName();
  const row   = e.range.getRow();
  const col   = e.range.getColumn();

  // 1. Manejo del Dropdown Nativo en MAESTRO (Desactivar/Anular productos y lote)
  if (name === SHEET_MAESTRO) {
    if (row === 2) {
      if (col === 4) { // D2 - Desactivar Seleccionados
        if (e.range.getValue() === true) {
          e.range.setValue(false);
          desactivarSeleccionadosMaestro();
        }
      } else if (col === 6) { // F2 - Activar Seleccionados
        if (e.range.getValue() === true) {
          e.range.setValue(false);
          activarSeleccionadosMaestro();
        }
      } else if (col === 8) { // H2 - Eliminar Seleccionados
        if (e.range.getValue() === true) {
          e.range.setValue(false);
          eliminarSeleccionadosMaestro();
        }
      } else if (col === 10) { // J2 - Limpiar Selección
        if (e.range.getValue() === true) {
          e.range.setValue(false);
          limpiarSeleccionMaestro();
        }
      }
      return;
    }

    // 1.2 Manejo del Dropdown ACTIVO (SÍ / NO) en Columna F (col 6)
    const map = _getMaestroHeaderMap(sheet);
    const cAct = map["ACTIVO"] ? map["ACTIVO"].col : 6;
    if (col === cAct && row >= MAESTRO_START) {
      const val = String(e.range.getValue()).trim().toUpperCase();
      const lock = LockService.getScriptLock();
      if (!lock.tryLock(15000)) return;
      try {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const kardexRow = row - MAESTRO_START + KARDEX_START;
        Object.values(BODEGAS).forEach(b => {
          const kSheet = ss.getSheetByName(b.kardex);
          if (kSheet) {
            if (val === "NO") {
              kSheet.hideRows(kardexRow);
            } else {
              kSheet.showRows(kardexRow);
            }
          }
        });
        // Recrear vistas móviles para reflejar altas/bajas en tiendas
        _buildVista("BA");
        _buildVista("BM");
        sincronizarRemotamenteTiendasPush();
      } finally {
        lock.releaseLock();
      }
    }
    return;
  }

  // 1.5 Manejo de Carga Masiva (Checkbox Confirmar)
  if (name === "➕ AGREGAR_MÚLTIPLES") {
    if (row === 3 && col === 10) { // J3 - Confirmar
      if (e.range.getValue() === true) {
        e.range.setValue(false); // Reset inmediato preventivo contra dobles ejecuciones
        procesarCargaMasiva();
      }
    }
    return;
  }

  // 1.6 Manejo de Edición Masiva (Checkbox Confirmar)
  if (name === "✏️ EDITAR_PRODUCTOS") {
    if (row === 3 && col === 9) { // I3 - Confirmar
      if (e.range.getValue() === true) {
        e.range.setValue(false); // Reset inmediato preventivo contra dobles ejecuciones
        procesarEdicionMasiva();
      }
    }
    return;
  }

  let bodegaKey = null;
  if (name === BODEGAS.BA.kardex)      bodegaKey = "BA";
  else if (name === BODEGAS.BM.kardex) bodegaKey = "BM";
  else return;

  // 2. Manejo de Checkboxes Interactivos (Fila 4 en KARDEX)
  if (row === 4) {
    if (col === 14) { // N4 - Avanzar Semana
      if (e.range.getValue() === true) {
        e.range.setValue(false);
        _avanzarSemana(bodegaKey);
      }
    } else if (col === 17) { // Q4 - Recrear Vista Móvil
      if (e.range.getValue() === true) {
        e.range.setValue(false);
        _buildVista(bodegaKey);
        SpreadsheetApp.getActive().toast(`VISTA_MOVIL_${bodegaKey} recreada`, "⚙️ Mise", 4);
      }
    } else if (col === 20) { // T4 - Agregar Producto
      if (e.range.getValue() === true) {
        e.range.setValue(false);
        agregarProducto();
      }
    } else if (col === 23) { // W4 - Anular Producto
      if (e.range.getValue() === true) {
        e.range.setValue(false);
        anularProducto();
      }
    }
    return;
  }

  if (row < KARDEX_START) return;

  // 3. Solo reaccionar a columnas ENT o SAL para validación rápida
  let tipo = null;
  for (let d = 0; d < KARDEX_DAYS; d++) {
    if (col === 10 + d * 3)     { tipo = "ENT"; break; }
    if (col === 10 + d * 3 + 1) { tipo = "SAL"; break; }
  }
  if (!tipo) return;

  let rawVal = e.value;
  if (rawVal !== undefined && rawVal !== null) {
    const strVal = String(rawVal).trim();
    const cleanVal = strVal.replace(',', '.');
    const num = Number(cleanVal);
    if (!isNaN(num) && num >= 0) {
      e.range.setValue(num);
      return;
    }
  }

  let val = e.range.getValue();
  if (val !== "") {
    if (Object.prototype.toString.call(val) === '[object Date]') {
      e.range.clearContent();
      SpreadsheetApp.getActive().toast(`${tipo} debe ser número ≥ 0 (no se permiten fechas)`, "⚙️ Mise", 4);
      return;
    }
    if (typeof val === "string") {
      const cleanVal = val.replace(',', '.').trim();
      const num = Number(cleanVal);
      if (!isNaN(num) && num >= 0) {
        e.range.setValue(num);
        return;
      }
    }
    const checkVal = Number(val);
    if (isNaN(checkVal) || checkVal < 0) {
      e.range.clearContent();
      SpreadsheetApp.getActive().toast(`${tipo} debe ser número ≥ 0`, "⚙️ Mise", 4);
    }
  }
}

// ── SETUP COMPLETO CORREGIDO SIN ERRORES DE ACCESO ───────────────────────────
function setupCompleto() {
  const ui   = SpreadsheetApp.getUi();
  const pResp = ui.prompt(
    "⚠️ Restablecer sistema (Acción Destructiva)",
    "Esta operación borrará y reconstruirá toda la base de datos de Bodega desde cero.\n\nIngresa la contraseña de administrador para continuar:",
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
    "¿Estás absolutamente seguro de que deseas borrar los históricos y catálogo actual?",
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;

  // Purgar estados de sesión pero PRESERVAR contraseña de administrador
  const props = PropertiesService.getScriptProperties();
  const adminPswProp = props.getProperty("ADMIN_PASSWORD");

  props.deleteAllProperties();
  try { SpreadsheetApp.flush(); } catch(e) {}
  
  if (adminPswProp) props.setProperty("ADMIN_PASSWORD", adminPswProp);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Forzar configuración regional de México para evitar errores de análisis de fórmula (Inglés + comas)
  try { ss.setSpreadsheetLocale('es_MX'); } catch(e) {}
  
  // Hojas del sistema que queremos conservar (incluye 🗒 LOG)
  const systemSheetNames = [SHEET_MAESTRO, SHEET_LOG];
  Object.values(BODEGAS).forEach(b => {
    systemSheetNames.push(b.kardex);
    systemSheetNames.push(b.vista);
  });
  
  ss.getSheets().forEach(s => {
    const name = s.getName();
    if (!systemSheetNames.includes(name)) {
      try { ss.deleteSheet(s); } catch(e) {}
    }
  });

  function getOrCreateSheet(name) {
    let s = ss.getSheetByName(name);
    if (s) {
      s.clear();
      s.clearConditionalFormatRules();
      s.setHiddenGridlines(false);
      s.setFrozenRows(0);
      s.setFrozenColumns(0);
      try { s.showSheet(); } catch(e) {}
    } else {
      s = ss.insertSheet(name);
    }
    return s;
  }

  // 2. MAESTRO
  SpreadsheetApp.getActive().toast("Creando MAESTRO...", "⚙️ Mise", 3);
  const maestro = getOrCreateSheet(SHEET_MAESTRO);
  _buildMaestro(maestro);

  // 3. KARDEX
  SpreadsheetApp.getActive().toast("Creando KARDEX...", "⚙️ Mise", 3);
  Object.values(BODEGAS).forEach(b => {
    const k = getOrCreateSheet(b.kardex);
    _buildKardex(k, b.nombre);
    _poblarKardex(k);
  });

  // 4. VISTAS MÓVIL
  SpreadsheetApp.getActive().toast("Creando VISTAS MÓVIL...", "⚙️ Mise", 3);
  Object.keys(BODEGAS).forEach(key => _buildVista(key));

  _log("setupCompleto", "Sistema creado desde cero");
  ui.alert("✅ Setup completo", `Sistema listo.\n\nPróximos pasos:\n1. ⚙️ Mise → Configurar semana\n2. ⚙️ Mise → Correr tests\n3. Configurar IMPORTRANGE en Pedidos Andares o Pedidos Mercado`, ui.ButtonSet.OK);
}


// ── CONSTRUCCIÓN: MAESTRO ─────────────────────────────────────────────────────
function _aplicarReglasMaestro(maestro) {
  const lr = maestro.getLastRow();
  if (lr < MAESTRO_START) return;
  const count = lr - MAESTRO_START + 1;
  const map = _getMaestroHeaderMap(maestro);

  const lProd = map["PRODUCTO"] ? map["PRODUCTO"].letter : "C";
  const lAct  = map["ACTIVO"]   ? map["ACTIVO"].letter   : "F";
  const lMinBA = map["MÍN_BA"]  ? map["MÍN_BA"].letter  : "G";
  const lMaxBA = map["MÁX_BA"]  ? map["MÁX_BA"].letter  : "H";
  const lStkBA = map["STOCK_BA"] ? map["STOCK_BA"].letter : "I";
  const cStkBA = map["STOCK_BA"] ? map["STOCK_BA"].col    : 9;

  const lMinBM = map["MÍN_BM"]  ? map["MÍN_BM"].letter  : "J";
  const lMaxBM = map["MÁX_BM"]  ? map["MÁX_BM"].letter  : "K";
  const lStkBM = map["STOCK_BM"] ? map["STOCK_BM"].letter : "L";
  const cStkBM = map["STOCK_BM"] ? map["STOCK_BM"].col    : 12;

  const lSel   = map["SELECCIONAR"] ? map["SELECCIONAR"].letter : "M";

  const cfRange = maestro.getRange(MAESTRO_START, 1, count, maestro.getLastColumn());
  const rangeBA = maestro.getRange(MAESTRO_START, cStkBA, count, 1);
  const rangeBM = maestro.getRange(MAESTRO_START, cStkBM, count, 1);

  const selectionRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=$${lSel}${MAESTRO_START}=TRUE`)
    .setBackground("#E3F2FD")
    .setRanges([cfRange])
    .build();
    
  const inactiveRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=$${lAct}${MAESTRO_START}="NO"`)
    .setBackground("#EEEEEE")
    .setFontColor("#9E9E9E")
    .setRanges([cfRange])
    .build();

  const rules = [selectionRule, inactiveRule];
  
  // Rules for STOCK_BA
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=AND($${lMinBA}${MAESTRO_START}>0, IFERROR(VLOOKUP($${lProd}${MAESTRO_START}, INDIRECT("'KARDEX_BA'!$C:$AD"), 28, FALSE), 0) < 0.5*$${lMinBA}${MAESTRO_START})`)
    .setBackground("#FFCDD2").setFontColor("#B71C1C").setRanges([rangeBA]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=AND($${lMinBA}${MAESTRO_START}>0, IFERROR(VLOOKUP($${lProd}${MAESTRO_START}, INDIRECT("'KARDEX_BA'!$C:$AD"), 28, FALSE), 0) < $${lMinBA}${MAESTRO_START}, IFERROR(VLOOKUP($${lProd}${MAESTRO_START}, INDIRECT("'KARDEX_BA'!$C:$AD"), 28, FALSE), 0) >= 0.5*$${lMinBA}${MAESTRO_START})`)
    .setBackground("#FFE0B2").setFontColor("#BF360C").setRanges([rangeBA]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=AND(OR($${lMinBA}${MAESTRO_START}>0, $${lMaxBA}${MAESTRO_START}>0), IFERROR(VLOOKUP($${lProd}${MAESTRO_START}, INDIRECT("'KARDEX_BA'!$C:$AD"), 28, FALSE), 0) >= $${lMinBA}${MAESTRO_START}, IFERROR(VLOOKUP($${lProd}${MAESTRO_START}, INDIRECT("'KARDEX_BA'!$C:$AD"), 28, FALSE), 0) <= $${lMaxBA}${MAESTRO_START})`)
    .setBackground("#C8E6C9").setFontColor("#1B5E20").setRanges([rangeBA]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=AND($${lMaxBA}${MAESTRO_START}>0, IFERROR(VLOOKUP($${lProd}${MAESTRO_START}, INDIRECT("'KARDEX_BA'!$C:$AD"), 28, FALSE), 0) > $${lMaxBA}${MAESTRO_START})`)
    .setBackground("#B3E5FC").setFontColor("#0D47A1").setRanges([rangeBA]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=AND($${lMinBA}${MAESTRO_START}=0, $${lMaxBA}${MAESTRO_START}=0)`)
    .setBackground("#CFD8DC").setFontColor("#37474F").setRanges([rangeBA]).build());

  // Rules for STOCK_BM
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=AND($${lMinBM}${MAESTRO_START}>0, IFERROR(VLOOKUP($${lProd}${MAESTRO_START}, INDIRECT("'KARDEX_BM'!$C:$AD"), 28, FALSE), 0) < 0.5*$${lMinBM}${MAESTRO_START})`)
    .setBackground("#FFCDD2").setFontColor("#B71C1C").setRanges([rangeBM]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=AND($${lMinBM}${MAESTRO_START}>0, IFERROR(VLOOKUP($${lProd}${MAESTRO_START}, INDIRECT("'KARDEX_BM'!$C:$AD"), 28, FALSE), 0) < $${lMinBM}${MAESTRO_START}, IFERROR(VLOOKUP($${lProd}${MAESTRO_START}, INDIRECT("'KARDEX_BM'!$C:$AD"), 28, FALSE), 0) >= 0.5*$${lMinBM}${MAESTRO_START})`)
    .setBackground("#FFE0B2").setFontColor("#BF360C").setRanges([rangeBM]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=AND(OR($${lMinBM}${MAESTRO_START}>0, $${lMaxBM}${MAESTRO_START}>0), IFERROR(VLOOKUP($${lProd}${MAESTRO_START}, INDIRECT("'KARDEX_BM'!$C:$AD"), 28, FALSE), 0) >= $${lMinBM}${MAESTRO_START}, IFERROR(VLOOKUP($${lProd}${MAESTRO_START}, INDIRECT("'KARDEX_BM'!$C:$AD"), 28, FALSE), 0) <= $${lMaxBM}${MAESTRO_START})`)
    .setBackground("#C8E6C9").setFontColor("#1B5E20").setRanges([rangeBM]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=AND($${lMaxBM}${MAESTRO_START}>0, IFERROR(VLOOKUP($${lProd}${MAESTRO_START}, INDIRECT("'KARDEX_BM'!$C:$AD"), 28, FALSE), 0) > $${lMaxBM}${MAESTRO_START})`)
    .setBackground("#B3E5FC").setFontColor("#0D47A1").setRanges([rangeBM]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=AND($${lMinBM}${MAESTRO_START}=0, $${lMaxBM}${MAESTRO_START}=0)`)
    .setBackground("#CFD8DC").setFontColor("#37474F").setRanges([rangeBM]).build());

  maestro.setConditionalFormatRules(rules);
}

function _buildMaestro(sheet) {
  sheet.getRange(1, 1, 1, 13).merge()
    .setValue("MISE — MAESTRO DE PRODUCTOS   |   La Crêpe Parisienne · Grupo MYT")
    .setBackground(C.dark).setFontColor("#FFFFFF").setFontWeight("bold")
    .setFontSize(11).setFontFamily("Arial").setHorizontalAlignment("center");
  sheet.setRowHeight(1, 32);

  // Fila 2: Acciones por Lote
  sheet.getRange(2, 1, 1, 13).clearDataValidations().clearContent().setBackground(C.cream);
  sheet.getRange("A2:B2").merge()
    .setValue("⚠️ Acciones por lote:").setFontWeight("bold").setFontColor(C.dark)
    .setHorizontalAlignment("right").setVerticalAlignment("middle").setFontSize(9);
  sheet.getRange("C2").setValue("Desactivar").setFontWeight("bold").setFontColor(C.dark).setHorizontalAlignment("right").setVerticalAlignment("middle").setFontSize(9);
  sheet.getRange("D2").insertCheckboxes().setValue(false).setBackground(C.yellow);
  sheet.getRange("E2").setValue("Activar").setFontWeight("bold").setFontColor(C.dark).setHorizontalAlignment("right").setVerticalAlignment("middle").setFontSize(9);
  sheet.getRange("F2").insertCheckboxes().setValue(false).setBackground(C.yellow);
  sheet.getRange("G2").setValue("Eliminar Sel.").setFontWeight("bold").setFontColor(C.dark).setHorizontalAlignment("right").setVerticalAlignment("middle").setFontSize(9);
  sheet.getRange("H2").insertCheckboxes().setValue(false).setBackground(C.yellow);
  sheet.getRange("I2").setValue("Limpiar Sel.").setFontWeight("bold").setFontColor(C.dark).setHorizontalAlignment("right").setVerticalAlignment("middle").setFontSize(9);
  sheet.getRange("J2").insertCheckboxes().setValue(false).setBackground(C.yellow);
  sheet.setRowHeight(2, 24);

  sheet.getRange(3, 1, 1, 13)
    .setValues([["No","CATEGORÍA","PRODUCTO","PRESENTACION","UNIDAD","ACTIVO","MÍN_BA","MÁX_BA","STOCK_BA","MÍN_BM","MÁX_BM","STOCK_BM","SELECCIONAR"]])
    .setBackground(C.sage).setFontColor("#FFFFFF").setFontWeight("bold")
    .setFontSize(10).setHorizontalAlignment("center");
  sheet.setRowHeight(3, 26);
  sheet.setFrozenRows(3);
  sheet.setColumnWidth(1, 32);   // No
  sheet.setColumnWidth(2, 140);  // CATEGORÍA
  sheet.setColumnWidth(3, 240);  // PRODUCTO
  sheet.setColumnWidth(4, 140);  // PRESENTACIÓN
  sheet.setColumnWidth(5, 70);   // UNIDAD
  sheet.setColumnWidth(6, 70);   // ACTIVO
  sheet.setColumnWidth(7, 95);   // MÍN_BA
  sheet.setColumnWidth(8, 95);   // MÁX_BA
  sheet.setColumnWidth(9, 110);  // STOCK_BA
  sheet.setColumnWidth(10, 95);  // MÍN_BM
  sheet.setColumnWidth(11, 95);  // MÁX_BM
  sheet.setColumnWidth(12, 110); // STOCK_BM
  sheet.setColumnWidth(13, 110); // SELECCIONAR

  const datos = _catalogo();
  // Poblar datos con CATEGORÍA inferida y SELECCIONAR en falso
  const maestroDatos = datos.map(r => [r[0], CATEGORIAS_MAP[r[1].split('-')[0]] || '', r[2], r[3], r[4], r[5], r[6], r[7], '', 0, 0, '', false]);
  sheet.getRange(MAESTRO_START, 1, datos.length, 13).setValues(maestroDatos);
  
  // Escribir fórmulas iniciales en STOCK_BA y STOCK_BM
  const formulasBA = [];
  const formulasBM = [];
  for (let i = 0; i < datos.length; i++) {
    const rn = MAESTRO_START + i;
    const fBA = `=IFERROR(VLOOKUP(C${rn}, 'KARDEX_BA'!C:AD, 28, FALSE), 0) & IF(AND(G${rn}=0, H${rn}=0), "", IF(VLOOKUP(C${rn}, 'KARDEX_BA'!C:AD, 28, FALSE)<G${rn}, " (-" & (G${rn}-VLOOKUP(C${rn}, 'KARDEX_BA'!C:AD, 28, FALSE)) & ")", IF(VLOOKUP(C${rn}, 'KARDEX_BA'!C:AD, 28, FALSE)>H${rn}, " (+" & (VLOOKUP(C${rn}, 'KARDEX_BA'!C:AD, 28, FALSE)-H${rn}) & ")", " (-)")))`;
    const fBM = `=IFERROR(VLOOKUP(C${rn}, 'KARDEX_BM'!C:AD, 28, FALSE), 0) & IF(AND(J${rn}=0, K${rn}=0), "", IF(VLOOKUP(C${rn}, 'KARDEX_BM'!C:AD, 28, FALSE)<J${rn}, " (-" & (J${rn}-VLOOKUP(C${rn}, 'KARDEX_BM'!C:AD, 28, FALSE)) & ")", IF(VLOOKUP(C${rn}, 'KARDEX_BM'!C:AD, 28, FALSE)>K${rn}, " (+" & (VLOOKUP(C${rn}, 'KARDEX_BM'!C:AD, 28, FALSE)-K${rn}) & ")", " (-)")))`;
    formulasBA.push([fBA]);
    formulasBM.push([fBM]);
  }
  sheet.getRange(MAESTRO_START, 9, datos.length, 1).setFormulas(formulasBA);  // Col I (STOCK_BA)
  sheet.getRange(MAESTRO_START, 12, datos.length, 1).setFormulas(formulasBM); // Col L (STOCK_BM)

  const bgs = datos.map((_, i) => Array(13).fill(i % 2 === 0 ? C.rowA : C.rowB));
  sheet.getRange(MAESTRO_START, 1, datos.length, 13).setBackgrounds(bgs);
  
  // Añadir validación dropdown (SÍ/NO) en columna F (col 6)
  const validationRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["SÍ", "NO"], true)
    .setAllowInvalid(false)
    .setHelpText("Selecciona SÍ o NO para activar/desactivar el producto.")
    .build();
  sheet.getRange(MAESTRO_START, 6, datos.length, 1).setDataValidation(validationRule);

  // Añadir dropdown CATEGORÍA en columna B (col 2) con permisividad para nuevas categorías dinámicas
  const catValidation = SpreadsheetApp.newDataValidation()
    .requireValueInList(CATEGORIAS_LISTA, true)
    .setAllowInvalid(true)
    .setHelpText("Selecciona la categoría del producto o ingresa una nueva.")
    .build();
  sheet.getRange(MAESTRO_START, 2, datos.length, 1).setDataValidation(catValidation);

  // Añadir checkboxes en columna M (col 13)
  sheet.getRange(MAESTRO_START, 13, datos.length, 1).insertCheckboxes().setValue(false);

  // Formatos condicionales
  _aplicarReglasMaestro(sheet);

  // Crear filtro automático en MAESTRO
  const filterRange = sheet.getRange(3, 1, datos.length + 1, 13);
  if (sheet.getFilter()) {
    sheet.getFilter().remove();
  }
  filterRange.createFilter();
}

// ── CONSTRUCCIÓN: KARDEX COMPLETAMENTE LIMPIO Y SIMÉTRICO ──────────────────
function _buildKardex(sheet, nombre) {
  // Asegurar columnas suficientes (necesita hasta col 30)
  const needed = 30;
  if (sheet.getMaxColumns() < needed) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), Math.max(1, needed - sheet.getMaxColumns()));
  }

  // Fila 1: leyenda semáforo caducidad (Deshabilitada)
  /*
  sheet.getRange(1, 1, 1, 8)
    .setValues([["🔴 CAD","🔴 ≤2d","🟠 ≤7d","🟡 ≤14d","🟤 ≤28d","🔵 ≤60d","🟢 OK","⚪ S/F"]])
    .setFontSize(8).setBackground("#F5F5F5").setFontColor("#666666")
    .setHorizontalAlignment("center");
  sheet.setRowHeight(1, 18);
  */

  // Fila 2: título
  sheet.getRange(2, 1, 1, 3).setBackground(C.dark);
  sheet.getRange(2, 4, 1, 27).merge()
    .setValue(`MISE — KARDEX ${nombre}   |   La Crêpe Parisienne`)
    .setBackground(C.dark).setFontColor("#FFFFFF").setFontWeight("bold")
    .setFontSize(11).setFontFamily("Arial").setHorizontalAlignment("center");
  sheet.setRowHeight(2, 30);

  // Filas 3-4: semana
  const headersSemana = [
    { rangeHeader: "D3:E3", label: "SEMANA" },
    { rangeHeader: "F3:G3", label: "FECHA INI" },
    { rangeHeader: "H3:I3", label: "FECHA FIN" },
    { rangeHeader: "J3:K3", label: "SUCURSAL" }
  ];

  headersSemana.forEach(h => {
    sheet.getRange(h.rangeHeader).merge()
      .setValue(h.label)
      .setFontWeight("bold")
      .setBackground(C.sage)
      .setFontColor("#FFFFFF")
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle")
      .setFontSize(9);
  });

  // Forzar que los datos de la fila 4 compartan alineación vertical intermedia simétrica
  sheet.getRange("D4:K4")
    .setFontFamily("Calibri")
    .setFontSize(10)
    .setVerticalAlignment("middle");

  sheet.getRange('E4').setFormula('=IFERROR(ISOWEEKNUM(G4),"")')
    .setBackground(C.yellow).setHorizontalAlignment("center");
  sheet.getRange("G4").setBackground(C.yellow).setNumberFormat("DD/MMM/YYYY")
    .setHorizontalAlignment("center");
  sheet.getRange('I4').setFormula('=IFERROR(G4+6,"")')
    .setBackground(C.yellow).setNumberFormat("DD/MMM/YYYY").setHorizontalAlignment("center");
  sheet.getRange("K4").setValue(nombre).setBackground(C.yellow).setHorizontalAlignment("center");
  
  sheet.getRange("G4").setDataValidation(
    SpreadsheetApp.newDataValidation().requireDate()
      .setHelpText("LUNES de la semana. Usar ⚙️ Mise → Configurar semana.").build()
  );

  // Botones interactivos (casillas de verificación para UX móvil)
  sheet.getRange("L4:M4").merge().setValue("⚙️ Avanzar Sem.").setHorizontalAlignment("center").setVerticalAlignment("middle").setFontWeight("bold").setFontSize(8).setFontColor("#FFFFFF").setBackground(C.dark);
  sheet.getRange("N4").insertCheckboxes().setValue(false).setBackground(C.yellow).setHorizontalAlignment("center");

  sheet.getRange("O4:P4").merge().setValue("🔄 Recrear Vista").setHorizontalAlignment("center").setVerticalAlignment("middle").setFontWeight("bold").setFontSize(8).setFontColor("#FFFFFF").setBackground(C.dark);
  sheet.getRange("Q4").insertCheckboxes().setValue(false).setBackground(C.yellow).setHorizontalAlignment("center");

  sheet.getRange("R4:S4").merge().setValue("🆕 Nuevo Prod.").setHorizontalAlignment("center").setVerticalAlignment("middle").setFontWeight("bold").setFontSize(8).setFontColor("#FFFFFF").setBackground(C.dark);
  sheet.getRange("T4").insertCheckboxes().setValue(false).setBackground(C.yellow).setHorizontalAlignment("center");

  sheet.getRange("U4:V4").merge().setValue("🚫 Anular Prod.").setHorizontalAlignment("center").setVerticalAlignment("middle").setFontWeight("bold").setFontSize(8).setFontColor("#FFFFFF").setBackground(C.dark);
  sheet.getRange("W4").insertCheckboxes().setValue(false).setBackground(C.yellow).setHorizontalAlignment("center");

  sheet.setRowHeight(3, 22);
  sheet.setRowHeight(4, 22);

  // Fila 5: sección datos + días
  sheet.getRange(5, 1, 1, 3).merge()
    .setValue("DATOS DEL PRODUCTO")
    .setBackground(C.dark).setFontColor("#FFFFFF").setFontWeight("bold")
    .setFontSize(9).setHorizontalAlignment("center");
  sheet.getRange(5, 4, 1, 6).merge()
    .setValue("DATOS DEL PRODUCTO")
    .setBackground(C.dark).setFontColor("#FFFFFF").setFontWeight("bold")
    .setFontSize(9).setHorizontalAlignment("center");
  DIAS.forEach((dia, idx) => {
    const sc = 10 + idx * 3;
    sheet.getRange(5, sc, 1, 3).merge().setValue(dia)
      .setBackground(idx % 2 === 0 ? C.mdGreen : C.ltGreen)
      .setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(9).setHorizontalAlignment("center");
  });
  sheet.setRowHeight(5, 22);

  // Fila 6: headers de columna
  sheet.getRange(6, 1, 1, 9)
    .setValues([["No","CATEGORÍA","PRODUCTO","PRESENTACIÓN","UNIDAD","CADUCIDAD","LOTE","🚦","SALDO\nANT"]])
    .setBackground(C.dark).setFontColor("#FFFFFF").setFontWeight("bold")
    .setFontSize(9).setHorizontalAlignment("center").setVerticalAlignment("middle");
  DIAS.forEach((_, idx) => {
    const sc = 10 + idx * 3;
    sheet.getRange(6, sc).setValue("ENT").setBackground(C.entBg)
      .setFontColor(C.dkGreen).setFontWeight("bold").setFontSize(8).setHorizontalAlignment("center");
    sheet.getRange(6, sc + 1).setValue("SAL").setBackground(C.salBg)
      .setFontColor("#C62828").setFontWeight("bold").setFontSize(8).setHorizontalAlignment("center");
    sheet.getRange(6, sc + 2).setValue("SLD").setBackground(C.dkGreen)
      .setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(8).setHorizontalAlignment("center");
  });
  sheet.setRowHeight(6, 28);
  sheet.setFrozenRows(6);

  // FIX DE ANCHOS: Columnas de cabecera perfectamente equilibradas y holgadas
  sheet.setColumnWidth(1, 45);   // A — No
  sheet.setColumnWidth(2, 140);  // B — CATEGORÍA
  sheet.setColumnWidth(3, 185);  // C — PRODUCTO
  sheet.setColumnWidth(4, 115);  // D — PRESENTACIÓN
  sheet.setColumnWidth(5, 115);  // E — UNIDAD
  sheet.setColumnWidth(6, 115);  // F — CADUCIDAD
  sheet.setColumnWidth(7, 115);  // G — LOTE
  sheet.setColumnWidth(8, 65);   // H — 🚦
  sheet.setColumnWidth(9, 110);  // I — SALDO ANT
  
  for (let d = 0; d < 7; d++) {
    sheet.setColumnWidth(10 + d * 3, 52);
    sheet.setColumnWidth(11 + d * 3, 52);
    sheet.setColumnWidth(12 + d * 3, 62);
  }

  // Formato fecha col F y validación de fecha (Feature deshabilitada)
  sheet.getRange(KARDEX_START, 6, 200, 1).setNumberFormat("DD/MMM/YY");
  /*
  sheet.getRange(KARDEX_START, 6, 200, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireDate()
      .setHelpText("Fecha de caducidad del lote").build()
  );
  */

  // Semáforo col H: formato condicional por texto (alertas stock)
  const cfR = sheet.getRange(KARDEX_START, 8, 200, 1);
  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith("🔴")
      .setBackground("#FFCDD2").setFontColor("#B71C1C").setBold(true).setRanges([cfR]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith("🔵")
      .setBackground("#B3E5FC").setFontColor("#0D47A1").setBold(true).setRanges([cfR]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith("🟢")
      .setBackground("#C8E6C9").setFontColor("#1B5E20").setRanges([cfR]).build(),
  ]);

  sheet.setFrozenColumns(3);
  sheet.hideColumns(6, 2); // Ocultar CADUCIDAD y LOTE (deja 🚦 visible)
  sheet.hideRows(1);       // Ocultar leyenda de caducidades
}

// ── POBLAR KARDEX DESDE MAESTRO ───────────────────────────────────────────────
function _poblarKardex(sheet) {
  const ss      = SpreadsheetApp.getActiveSpreadsheet();
  const maestro = ss.getSheetByName(SHEET_MAESTRO);
  if (!maestro) return;

  const lr   = maestro.getLastRow();
  if (lr < MAESTRO_START) return;

  const map = _getMaestroHeaderMap(maestro);
  const lProd  = map["PRODUCTO"] ? map["PRODUCTO"].letter : "C";
  const lMinBA = map["MÍN_BA"]  ? map["MÍN_BA"].letter  : "G";
  const lMaxBA = map["MÁX_BA"]  ? map["MÁX_BA"].letter  : "H";
  const lMinBM = map["MÍN_BM"]  ? map["MÍN_BM"].letter  : "J";
  const lMaxBM = map["MÁX_BM"]  ? map["MÁX_BM"].letter  : "K";

  // Índices para VLOOKUP desde PRODUCTO
  const idxMinBA = (map["MÍN_BA"] && map["PRODUCTO"]) ? (map["MÍN_BA"].col - map["PRODUCTO"].col + 1) : 5;
  const idxMaxBA = (map["MÁX_BA"] && map["PRODUCTO"]) ? (map["MÁX_BA"].col - map["PRODUCTO"].col + 1) : 6;
  const idxMinBM = (map["MÍN_BM"] && map["PRODUCTO"]) ? (map["MÍN_BM"].col - map["PRODUCTO"].col + 1) : 8;
  const idxMaxBM = (map["MÁX_BM"] && map["PRODUCTO"]) ? (map["MÁX_BM"].col - map["PRODUCTO"].col + 1) : 9;

  // Cols A-E: No, CATEGORÍA, PRODUCTO, PRESENTACIÓN, UNIDAD
  const dataRange = maestro.getRange(MAESTRO_START, 1, lr - MAESTRO_START + 1, maestro.getLastColumn()).getValues();
  const cNo   = map["NO"]           ? map["NO"].index           : 0;
  const cCat  = map["CATEGORÍA"]    ? map["CATEGORÍA"].index    : 1;
  const cProd = map["PRODUCTO"]     ? map["PRODUCTO"].index     : 2;
  const cPres = map["PRESENTACION"] ? map["PRESENTACION"].index : 3;
  const cUni  = map["UNIDAD"]       ? map["UNIDAD"].index       : 4;

  const prods = dataRange.filter(r => r[cNo] !== "" && r[cNo] !== null);
  if (prods.length === 0) return;

  const count = prods.length;

  sheet.getRange(KARDEX_START, 1, count, 5)
    .setValues(prods.map(p => [p[cNo], p[cCat], p[cProd], p[cPres], p[cUni]]));

  // Inyectar fórmulas de semáforo de stock en KARDEX (col H = 8)
  const sheetName = sheet.getName();
  const formulasH = [];
  for (let r = 0; r < count; r++) {
    const rn = KARDEX_START + r;
    let f = "";
    if (sheetName === "KARDEX_BA") {
      f = `=IF(AND(IFERROR(VLOOKUP(C${rn}, MAESTRO!${lProd}:${lMaxBA}, ${idxMinBA}, FALSE), 0)=0, IFERROR(VLOOKUP(C${rn}, MAESTRO!${lProd}:${lMaxBA}, ${idxMaxBA}, FALSE), 0)=0), "", IF(AD${rn}<IFERROR(VLOOKUP(C${rn}, MAESTRO!${lProd}:${lMaxBA}, ${idxMinBA}, FALSE), 0), "🔴 -" & (IFERROR(VLOOKUP(C${rn}, MAESTRO!${lProd}:${lMaxBA}, ${idxMinBA}, FALSE), 0)-AD${rn}), IF(AD${rn}>IFERROR(VLOOKUP(C${rn}, MAESTRO!${lProd}:${lMaxBA}, ${idxMaxBA}, FALSE), 0), "🔵 +" & (AD${rn}-IFERROR(VLOOKUP(C${rn}, MAESTRO!${lProd}:${lMaxBA}, ${idxMaxBA}, FALSE), 0)), "🟢 -")))`;
    } else {
      f = `=IF(AND(IFERROR(VLOOKUP(C${rn}, MAESTRO!${lProd}:${lMaxBM}, ${idxMinBM}, FALSE), 0)=0, IFERROR(VLOOKUP(C${rn}, MAESTRO!${lProd}:${lMaxBM}, ${idxMaxBM}, FALSE), 0)=0), "", IF(AD${rn}<IFERROR(VLOOKUP(C${rn}, MAESTRO!${lProd}:${lMaxBM}, ${idxMinBM}, FALSE), 0), "🔴 -" & (IFERROR(VLOOKUP(C${rn}, MAESTRO!${lProd}:${lMaxBM}, ${idxMinBM}, FALSE), 0)-AD${rn}), IF(AD${rn}>IFERROR(VLOOKUP(C${rn}, MAESTRO!${lProd}:${lMaxBM}, ${idxMaxBM}, FALSE), 0), "🔵 +" & (AD${rn}-IFERROR(VLOOKUP(C${rn}, MAESTRO!${lProd}:${lMaxBM}, ${idxMaxBM}, FALSE), 0)), "🟢 -")))`;
    }
    formulasH.push([f]);
  }
  sheet.getRange(KARDEX_START, 8, count, 1).setFormulas(formulasH);

  // Fórmulas SLD para cada día: SLD = SLDprev + ENT - SAL
  for (let d = 0; d < KARDEX_DAYS; d++) {
    const sldCol  = 12 + d * 3;
    const prevCol = (d === 0) ? 9 : (12 + (d - 1) * 3);
    const entCol  = 10 + d * 3;
    const salCol  = 11 + d * 3;
    const formulas = [];
    for (let r = 0; r < count; r++) {
      const rn = KARDEX_START + r;
      formulas.push(['=' + _col(prevCol) + rn + '+IFERROR(' + _col(entCol) + rn + ',0)-IFERROR(' + _col(salCol) + rn + ',0)']);
    }
    sheet.getRange(KARDEX_START, sldCol, count, 1).setFormulas(formulas);
  }

  // Formato visual filas alternas
  const bgs = prods.map((_, i) => Array(30).fill(i % 2 === 0 ? C.rowA : C.rowB));
  sheet.getRange(KARDEX_START, 1, count, 30).setBackgrounds(bgs);
  sheet.getRange(KARDEX_START, 9, count, 1).setBackgrounds(Array(count).fill([C.iceBlue]));
  // ENT verde, SAL rosa, SLD azul hielo por día
  for (let d = 0; d < KARDEX_DAYS; d++) {
    sheet.getRange(KARDEX_START, 10 + d * 3, count, 1).setBackgrounds(Array(count).fill([C.entBg]));
    sheet.getRange(KARDEX_START, 11 + d * 3, count, 1).setBackgrounds(Array(count).fill([C.salBg]));
    sheet.getRange(KARDEX_START, 12 + d * 3, count, 1).setBackgrounds(Array(count).fill([C.iceBlue]));
  }

  // Formato numérico para datos diarios
  sheet.getRange(KARDEX_START, 10, count, 21).setNumberFormat("0.####");

  // Crear filtro automático en KARDEX
  const kRange = sheet.getRange(6, 1, count + 1, KARDEX_TOTAL_COLS);
  if (sheet.getFilter()) {
    sheet.getFilter().remove();
  }
  kRange.createFilter();
}

// ── CONSTRUCCIÓN: VISTA MÓVIL ─────────────────────────────────────────────────
function crearVistaMóvilBA() { _buildVista("BA"); }
function crearVistaMovilBA() { _buildVista("BA"); }
function crearVistaMóvilBM() { _buildVista("BM"); }
function crearVistaMovilBM() { _buildVista("BM"); }

function _buildVista(key) {
  const bodega = BODEGAS[key];
  const ss     = SpreadsheetApp.getActiveSpreadsheet();

  let sheet = ss.getSheetByName(bodega.vista);
  if (sheet) {
    sheet.clear();
    sheet.clearConditionalFormatRules();
    sheet.setHiddenGridlines(false);
    sheet.setFrozenRows(0);
    const maxRows = sheet.getMaxRows();
    const maxCols = sheet.getMaxColumns();
    if (maxRows > 0 && maxCols > 0) {
      try {
        sheet.getRange(1, 1, maxRows, maxCols).breakAtMerge();
      } catch(e) {}
    }
  } else {
    sheet = ss.insertSheet(bodega.vista);
  }

  // Header — 12 cols (incluye CATEGORÍA, ACTIVO, MÍN/MÁX y PICKING)
  sheet.getRange(1, 1, 1, 12).merge()
    .setValue(`MISE — VISTA MÓVIL · ${bodega.nombre}   |   La Crêpe Parisienne`)
    .setBackground(C.dark).setFontColor("#FFFFFF").setFontWeight("bold")
    .setFontSize(11).setFontFamily("Arial").setHorizontalAlignment("center");
  sheet.setRowHeight(1, 30);

  sheet.getRange(2, 1, 1, 12).merge()
    .setValue("Solo lectura. Fuente del IMPORTRANGE para Pedidos Andares / Pedidos Mercado.")
    .setBackground(C.cream).setFontColor(C.dark).setFontSize(9).setHorizontalAlignment("center");
  sheet.setRowHeight(2, 20);

  sheet.getRange(3, 1, 1, 12)
    .setValues([["No","CATEGORÍA","PRODUCTO","UNIDAD","SALDO ACTUAL","🚦 STOCK","ENT HOY","SAL HOY","ACTIVO","MÍN","MÁX","PICKING"]])
    .setBackground(C.sage).setFontColor("#FFFFFF").setFontWeight("bold")
    .setFontSize(10).setHorizontalAlignment("center");
  sheet.setRowHeight(3, 26);
  sheet.setFrozenRows(3);

  // Poblar desde KARDEX y MAESTRO (con categoría viva de MAESTRO)
  const kardex = ss.getSheetByName(bodega.kardex);
  if (!kardex) return;

  const lr = kardex.getLastRow();
  if (lr < KARDEX_START) return;

  const maestro = ss.getSheetByName(SHEET_MAESTRO);
  if (!maestro) return;
  _asegurarColumnasQuioscoEnMaestro(maestro);
  const mlr     = maestro.getLastRow();
  const map     = _getMaestroHeaderMap(maestro);
  const mData   = maestro.getRange(MAESTRO_START, 1, mlr - MAESTRO_START + 1, maestro.getLastColumn()).getValues();
  
  const cProd = map["PRODUCTO"] ? map["PRODUCTO"].index : 2;
  const cCatM = map["CATEGORÍA"] ? map["CATEGORÍA"].index : 1;
  const cUnTienda = map["UNIDAD_TIENDA"] ? map["UNIDAD_TIENDA"].index : -1;
  const cMin  = (key === "BA") ? (map["MÍN_BA"] ? map["MÍN_BA"].index : 6) : (map["MÍN_BM"] ? map["MÍN_BM"].index : 9);
  const cMax  = (key === "BA") ? (map["MÁX_BA"] ? map["MÁX_BA"].index : 7) : (map["MÁX_BM"] ? map["MÁX_BM"].index : 10);
  const cMinQ = (key === "BA") ? (map["MÍN_Q_BA"] ? map["MÍN_Q_BA"].index : -1) : (map["MÍN_Q_BM"] ? map["MÍN_Q_BM"].index : -1);
  const cMaxQ = (key === "BA") ? (map["MÁX_Q_BA"] ? map["MÁX_Q_BA"].index : -1) : (map["MÁX_Q_BM"] ? map["MÁX_Q_BM"].index : -1);

  const maestroCatMap = {};
  const maestroUnidadTiendaMap = {};
  const minStockMap = {};
  const maxStockMap = {};
  const minQMap = {};
  const maxQMap = {};
  mData.forEach(r => {
    const prodName = String(r[cProd]).trim();
    const catVal   = String(r[cCatM]).trim().toUpperCase();
    const unTienda = cUnTienda !== -1 ? String(r[cUnTienda] || "").trim() : "";
    const minVal   = parseFloat(r[cMin]) || 0;
    const maxVal   = parseFloat(r[cMax]) || 0;
    const minQVal  = cMinQ !== -1 ? (parseFloat(r[cMinQ]) || 0) : minVal;
    const maxQVal  = cMaxQ !== -1 ? (parseFloat(r[cMaxQ]) || 0) : maxVal;
    if (prodName) {
      maestroCatMap[prodName] = catVal;
      if (unTienda) maestroUnidadTiendaMap[prodName] = unTienda;
      minStockMap[prodName]   = minVal;
      maxStockMap[prodName]   = maxVal;
      minQMap[prodName]       = minQVal;
      maxQMap[prodName]       = maxQVal;
    }
  });

  const data  = kardex.getRange(KARDEX_START, 1, lr - KARDEX_START + 1, 30).getValues();
  const prods = data.map((r, i) => {
    const pName = String(r[2]).trim();
    return { 
      no: r[0], 
      cat: maestroCatMap[pName] || String(r[1]).trim().toUpperCase(), 
      nombre: pName, 
      unidad: maestroUnidadTiendaMap[pName] || r[4], 
      saldo: parseFloat(r[29]) || 0, // Col AD (Sunday balance) is column 30, index 29
      srcRow: KARDEX_START + i 
    };
  }).filter(p => p.nombre && p.no);
  const count = prods.length;
  if (count === 0) return;

  const DR  = 4;
  const ref = _quoteName(bodega.kardex);

  // PREPARACIÓN MATRICIAL DE ALTO RENDIMIENTO (Batch I/O consolidado)
  const lMinQ = cMinQ !== -1 ? map[key === "BA" ? "MÍN_Q_BA" : "MÍN_Q_BM"].letter : (map[key === "BA" ? "MÍN_BA" : "MÍN_BM"] ? map[key === "BA" ? "MÍN_BA" : "MÍN_BM"].letter : "G");
  const lMaxQ = cMaxQ !== -1 ? map[key === "BA" ? "MÁX_Q_BA" : "MÁX_Q_BM"].letter : (map[key === "BA" ? "MÁX_BA" : "MÁX_BM"] ? map[key === "BA" ? "MÁX_BA" : "MÁX_BM"].letter : "H");
  const cPicKey = `PICKING_${key}`;
  const lPic = map[cPicKey] ? map[cPicKey].letter : (map["PICKING"] ? map["PICKING"].letter : null);
  const refMaestro = _quoteName(SHEET_MAESTRO);
  const lAct = map["ACTIVO"] ? map["ACTIVO"].letter : "F";
  // Definición de columnas de Entradas y Salidas por día (LUN a DOM en Kardex)
  const entCols = ["J","M","P","S","V","Y","AB"];
  const salCols = ["K","N","Q","T","W","Z","AC"];

  const matrixValues = new Array(count);
  const matrixFormulas = new Array(count);

  for (let i = 0; i < count; i++) {
    const p = prods[i];
    const kr = p.srcRow;
    const mr = kr - KARDEX_START + MAESTRO_START;
    
    // Semáforo estático
    const saldo = p.saldo;
    const min   = minStockMap[p.nombre] || 0;
    const max   = maxStockMap[p.nombre] || 0;
    let semaforo = "⚪";
    if (min !== 0 || max !== 0) {
      if (saldo < 0.5 * min) semaforo = "🔴";
      else if (saldo < min) semaforo = "🟠";
      else if (saldo <= max) semaforo = "🟢";
      else semaforo = "🔵";
    }

    // Fórmulas
    const fSaldo = `=IFERROR(${ref}!AD${kr}*1,0)`;
    const entRefs = entCols.map(c => ref + '!' + c + kr).join(',');
    const fEnt = `=IFERROR(CHOOSE(WEEKDAY(TODAY(),2),${entRefs}),0)`;
    const salRefs = salCols.map(c => ref + '!' + c + kr).join(',');
    const fSal = `=IFERROR(CHOOSE(WEEKDAY(TODAY(),2),${salRefs}),0)`;
    const fAct = `=${refMaestro}!${lAct}${mr}`;
    const fMinQ = `=${refMaestro}!${lMinQ}${mr}`;
    const fMaxQ = `=${refMaestro}!${lMaxQ}${mr}`;
    const fPic = lPic ? `=${refMaestro}!${lPic}${mr}` : p.no;

    // Fila de Valores estáticos (Cols 1, 2, 3, 4, 6)
    matrixValues[i] = [p.no, p.cat, p.nombre, p.unidad, "", semaforo, "", "", "", "", "", ""];

    // Fórmulas por columnas especificas
    matrixFormulas[i] = [fSaldo, fEnt, fSal, fAct, fMinQ, fMaxQ, fPic];
  }

  // 1. Escribir valores estáticos base en todo el rango
  sheet.getRange(DR, 1, count, 12).setValues(matrixValues);

  // 2. Escribir fórmulas dinámicas únicamente en sus respectivas columnas para no borrar el texto
  const fCol5 = matrixFormulas.map(r => [r[0]]); // SALDO
  const fCol7 = matrixFormulas.map(r => [r[1]]); // ENT HOY
  const fCol8 = matrixFormulas.map(r => [r[2]]); // SAL HOY
  const fCol9 = matrixFormulas.map(r => [r[3]]); // ACTIVO
  const fCol10 = matrixFormulas.map(r => [r[4]]); // MÍN
  const fCol11 = matrixFormulas.map(r => [r[5]]); // MÁX
  const fCol12 = matrixFormulas.map(r => [r[6]]); // PICKING

  sheet.getRange(DR, 5, count, 1).setFormulas(fCol5);
  sheet.getRange(DR, 7, count, 1).setFormulas(fCol7);
  sheet.getRange(DR, 8, count, 1).setFormulas(fCol8);
  sheet.getRange(DR, 9, count, 1).setFormulas(fCol9);
  sheet.getRange(DR, 10, count, 1).setFormulas(fCol10);
  sheet.getRange(DR, 11, count, 1).setFormulas(fCol11);
  sheet.getRange(DR, 12, count, 1).setFormulas(fCol12);

  // Formatos numéricos en bloque
  sheet.getRange(DR, 5, count, 1).setNumberFormat("0.####");
  sheet.getRange(DR, 7, count, 2).setNumberFormat("0.####");
  sheet.getRange(DR, 10, count, 2).setNumberFormat("0.####");
  sheet.getRange(DR, 12, count, 1).setNumberFormat("0");

  // Formato
  const bgs = prods.map((_, i) => Array(12).fill(i % 2 === 0 ? C.rowA : C.rowB));
  sheet.getRange(DR, 1, count, 12).setBackgrounds(bgs);
  sheet.getRange(DR, 5, count, 1).setBackgrounds(Array(count).fill([C.iceBlue]));
  sheet.getRange(DR, 7, count, 1).setBackgrounds(Array(count).fill([C.entBg]));
  sheet.getRange(DR, 8, count, 1).setBackgrounds(Array(count).fill([C.salBg]));
  sheet.getRange(DR, 6, count, 1).setHorizontalAlignment("center").setFontWeight("bold");
  sheet.getRange(DR, 3, count, 1).setHorizontalAlignment("left");
  sheet.getRange(DR, 1, count, 12)
    .setFontFamily("Calibri").setFontSize(10).setVerticalAlignment("middle").setHorizontalAlignment("center");

  // CF: SALDO < 1 = fondo rojo
  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(1)
      .setBackground("#FFCDD2").setFontColor("#B71C1C")
      .setRanges([sheet.getRange(DR, 5, count, 1)]).build()
  ]);

  sheet.setColumnWidth(1, 40);  sheet.setColumnWidth(2, 140);
  sheet.setColumnWidth(3, 210); sheet.setColumnWidth(4, 75);
  sheet.setColumnWidth(5, 105); sheet.setColumnWidth(6, 65);
  sheet.setColumnWidth(7, 80);  sheet.setColumnWidth(8, 80);
  sheet.setColumnWidth(9, 70);
  sheet.setColumnWidth(10, 55);
  sheet.setColumnWidth(11, 55);
  sheet.setColumnWidth(12, 60);

  sheet.hideSheet();

  _log("_buildVista", `${bodega.nombre}: ${count} productos`);
}

// ── CADUCIDADES (vista simple, sin INDIRECT) ──────────────────────────────────
function crearCaducidades() {
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const NOMBRE = "CADUCIDADES";

  let sheet = ss.getSheetByName(NOMBRE);
  if (sheet) {
    try {
      ss.deleteSheet(sheet);
      sheet = ss.insertSheet(NOMBRE);
    } catch(e) {
      sheet.clear();
      sheet.clearConditionalFormatRules();
      sheet.setHiddenGridlines(false);
      sheet.setFrozenRows(0);
      sheet.setFrozenColumns(0);
    }
  } else {
    sheet = ss.insertSheet(NOMBRE);
  }

  // Layout de columnas:
  // A=No  B=PRODUCTO  C=CAT  D=UND
  // E=CAD_BA  F=LOTE_BA  G=🚦_BA
  // H=SEP (separador visual)
  // I=CAD_BM  J=LOTE_BM  K=🚦_BM
  // L=⚡VENCE PRIMERO (cuál bodega tiene el lote más próximo a vencer)
  const TOTAL_COLS = 12;
  if (sheet.getMaxColumns() < TOTAL_COLS) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), TOTAL_COLS - sheet.getMaxColumns());
  }

  // Fila 1: título completo
  sheet.getRange(1, 1, 1, TOTAL_COLS).merge()
    .setValue("MISE — CADUCIDADES   |   La Crêpe Parisienne · Grupo MYT")
    .setBackground(C.dark).setFontColor("#FFFFFF").setFontWeight("bold")
    .setFontSize(11).setFontFamily("Arial").setHorizontalAlignment("center");
  sheet.setRowHeight(1, 30);

  // Fila 2: leyenda semáforo
  sheet.getRange(2, 1, 1, 8)
    .setValues([["🔴 CAD","🔴 ≤2d","🟠 ≤7d","🟡 ≤14d","🟤 ≤28d","🔵 ≤60d","🟢 OK","⚪ S/F"]])
    .setFontSize(8).setBackground("#F5F5F5").setFontColor("#666666").setHorizontalAlignment("center");
  sheet.setRowHeight(2, 18);

  // Fila 3: headers de sección — dos bloques + separador
  // Bloque info
  sheet.getRange(3, 1, 1, 4)
    .setValues([["No","PRODUCTO","CAT","UND"]])
    .setBackground(C.dark).setFontColor("#FFFFFF").setFontWeight("bold")
    .setFontSize(9).setHorizontalAlignment("center");

  // Bloque Andares
  sheet.getRange(3, 5, 1, 3)
    .setValues([["CADUCIDAD","LOTE","🚦"]])
    .setBackground(C.mdGreen).setFontColor("#FFFFFF").setFontWeight("bold")
    .setFontSize(9).setHorizontalAlignment("center");
  // Encabezado de bodega sobre el bloque
  sheet.getRange("E2:G2").merge()
    .setValue("ANDARES")
    .setBackground(C.mdGreen).setFontColor("#FFFFFF").setFontWeight("bold")
    .setFontSize(9).setHorizontalAlignment("center");

  // Separador columna H
  sheet.getRange(3, 8).setValue("|")
    .setBackground(C.dark).setFontColor(C.dark).setHorizontalAlignment("center");
  sheet.getRange("H2").setValue("|").setBackground(C.dark).setFontColor(C.dark);

  // Bloque Mercado
  sheet.getRange(3, 9, 1, 3)
    .setValues([["CADUCIDAD","LOTE","🚦"]])
    .setBackground(C.ltGreen).setFontColor("#FFFFFF").setFontWeight("bold")
    .setFontSize(9).setHorizontalAlignment("center");
  sheet.getRange("I2:K2").merge()
    .setValue("MERCADO")
    .setBackground(C.ltGreen).setFontColor("#FFFFFF").setFontWeight("bold")
    .setFontSize(9).setHorizontalAlignment("center");

  // Columna ⚡
  sheet.getRange(3, 12).setValue("⚡ VENCE ANTES")
    .setBackground(C.dark).setFontColor("#FFFFFF").setFontWeight("bold")
    .setFontSize(9).setHorizontalAlignment("center");
  sheet.getRange("L2").setValue("⚡").setBackground(C.dark).setFontColor("#FFFFFF")
    .setHorizontalAlignment("center");

  sheet.setRowHeight(2, 20);
  sheet.setRowHeight(3, 26);
  sheet.setFrozenRows(3);

  // Construir mapa separado por bodega: nombre → row en ese KARDEX
  const mapBA = {}, mapBM = {};
  const maps  = { BA: mapBA, BM: mapBM };

  Object.entries(BODEGAS).forEach(([key, b]) => {
    const ks = ss.getSheetByName(b.kardex);
    if (!ks) return;
    const lr = ks.getLastRow();
    if (lr < KARDEX_START) return;
    const rows = ks.getRange(KARDEX_START, 1, lr - KARDEX_START + 1, 3).getValues();
    rows.forEach((row, i) => {
      const nombre = String(row[2]).trim();
      if (nombre) maps[key][nombre] = KARDEX_START + i;
    });
  });

  // Datos desde MAESTRO
  const maestro = ss.getSheetByName(SHEET_MAESTRO);
  const lr2     = maestro.getLastRow();
  const mData   = maestro.getRange(MAESTRO_START, 1, lr2 - MAESTRO_START + 1, 6).getValues()
    .filter(r => r[0] !== "");

  const DR    = 4;
  const count = mData.length;
  const refBA = _quoteName(BODEGAS.BA.kardex);
  const refBM = _quoteName(BODEGAS.BM.kardex);

  mData.forEach((p, i) => {
    const r      = DR + i;
    const nombre = String(p[3]).trim();
    const bg     = i % 2 === 0 ? C.rowA : C.rowB;
    const cat    = String(p[2] || '').trim();

    // Cols A-D: info del producto
    sheet.getRange(r, 1).setValue(p[0]).setBackground(bg).setHorizontalAlignment("center");
    sheet.getRange(r, 2).setValue(nombre).setBackground(bg).setHorizontalAlignment("left");
    sheet.getRange(r, 3).setValue(cat).setBackground(bg).setHorizontalAlignment("center");
    sheet.getRange(r, 4).setValue(p[5]).setBackground(bg).setHorizontalAlignment("center");

    // Cols E-G: B-Andares
    const krBA = mapBA[nombre];
    if (krBA) {
      sheet.getRange(r, 5).setFormula('=IFERROR(' + refBA + '!F' + krBA + ',"")')
        .setNumberFormat("DD/MMM/YY").setBackground(bg);
      sheet.getRange(r, 6).setFormula('=' + refBA + '!G' + krBA).setBackground(bg);
      sheet.getRange(r, 7).setFormula('=' + refBA + '!H' + krBA).setBackground(C.yellow);
    } else {
      sheet.getRange(r, 5).setValue("").setBackground(bg);
      sheet.getRange(r, 6).setValue("").setBackground(bg);
      sheet.getRange(r, 7).setValue("⚪ S/F").setBackground(C.yellow);
    }

    // Col H: separador visual
    sheet.getRange(r, 8).setValue("").setBackground(C.dark);

    // Cols I-K: B-Mercado
    const krBM = mapBM[nombre];
    if (krBM) {
      sheet.getRange(r, 9).setFormula('=IFERROR(' + refBM + '!F' + krBM + ',"")')
        .setNumberFormat("DD/MMM/YY").setBackground(bg);
      sheet.getRange(r, 10).setFormula('=' + refBM + '!G' + krBM).setBackground(bg);
      sheet.getRange(r, 11).setFormula('=' + refBM + '!H' + krBM).setBackground(C.yellow);
    } else {
      sheet.getRange(r, 9).setValue("").setBackground(bg);
      sheet.getRange(r, 10).setValue("").setBackground(bg);
      sheet.getRange(r, 11).setValue("⚪ S/F").setBackground(C.yellow);
    }

    // Col L: ⚡ VENCE ANTES — cuál bodega tiene la caducidad más próxima
    // Fórmula: compara E (BA) e I (BM). Si ambas vacías → "—"
    // Si solo una tiene fecha → esa. Si ambas → la menor.
    const eRef = 'E' + r;
    const iRef = 'I' + r;
    sheet.getRange(r, 12)
      .setFormula('=IF(AND(E' + r + '="",I' + r + '=""),"—",IF(E' + r + '="","Mercado",IF(I' + r + '="","Andares",IF(E' + r + '<=I' + r + ',"Andares","Mercado"))))')
      .setHorizontalAlignment("center").setBackground(bg);
  });

  // Anchos de columna
  sheet.setColumnWidth(1, 32);   // No
  sheet.setColumnWidth(2, 195);  // PRODUCTO
  sheet.setColumnWidth(3, 50);   // CAT
  sheet.setColumnWidth(4, 50);   // UND
  sheet.setColumnWidth(5, 90);   // CAD_BA
  sheet.setColumnWidth(6, 85);   // LOTE_BA
  sheet.setColumnWidth(7, 50);   // 🚦_BA
  sheet.setColumnWidth(8, 8);    // SEP
  sheet.setColumnWidth(9, 90);   // CAD_BM
  sheet.setColumnWidth(10, 85);  // LOTE_BM
  sheet.setColumnWidth(11, 50);  // 🚦_BM
  sheet.setColumnWidth(12, 95);  // ⚡

  // Formato condicional: semáforos BA (col G) y BM (col K)
  const _cfRules = (range) => [
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("🔴 CAD")
      .setBackground("#FFCDD2").setFontColor("#B71C1C").setBold(true).setRanges([range]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("🔴 ≤2d")
      .setBackground("#FFCDD2").setFontColor("#B71C1C").setRanges([range]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("🟠 ≤7d")
      .setBackground("#FFE0B2").setFontColor("#BF360C").setRanges([range]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("🟡 ≤14d")
      .setBackground("#FFF9C4").setFontColor("#F57F17").setRanges([range]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("🟤 ≤28d")
      .setBackground("#EFEBE9").setFontColor("#4E342E").setRanges([range]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("🔵 ≤60d")
      .setBackground("#E3F2FD").setFontColor("#0D47A1").setRanges([range]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("🟢 OK")
      .setBackground("#C8E6C9").setFontColor("#1B5E20").setRanges([range]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("⚪ S/F")
      .setBackground(C.yellow).setFontColor("#555555").setRanges([range]).build(),
  ];

  const cfBA = sheet.getRange(DR, 7, count, 1);
  const cfBM = sheet.getRange(DR, 11, count, 1);
  sheet.setConditionalFormatRules([..._cfRules(cfBA), ..._cfRules(cfBM)]);

  _log("crearCaducidades", `Dual BA+BM. ${count} productos`);

  SpreadsheetApp.getActive().toast(
    `${count} productos con caducidades de ambas bodegas`, "🏷 Caducidades", 5
  );
}

// ── CONFIGURAR SEMANA ─────────────────────────────────────────────────────────
function configurarSemanaBA() { _configurarSemana("BA"); }
function configurarSemanaBM() { _configurarSemana("BM"); }

function _configurarSemana(key) {
  const ui     = SpreadsheetApp.getUi();
  const bodega = BODEGAS[key];
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const sheet  = ss.getSheetByName(bodega.kardex);
  if (!sheet) { ui.alert(`No existe ${bodega.kardex}.`); return; }

  const modo = ui.alert(
    `📅 Configurar semana — ${bodega.nombre}`,
    "[Sí] → número de semana ISO (1–53)\n[No] → cualquier fecha de la semana",
    ui.ButtonSet.YES_NO_CANCEL
  );
  if (modo === ui.Button.CANCEL) return;

  let monday;
  if (modo === ui.Button.YES) {
    const w = ui.prompt("Semana ISO", `Semana actual: ${_isoWeek(new Date())}\nNúmero (1–53):`, ui.ButtonSet.OK_CANCEL);
    if (w.getSelectedButton() !== ui.Button.OK) return;
    const n = parseInt(w.getResponseText().trim());
    if (!n || n < 1 || n > 53) { ui.alert("Número inválido."); return; }
    monday = _mondayOfWeek(n, new Date().getFullYear());
  } else {
    const d = ui.prompt("Fecha", `Hoy: ${_fmt(new Date())}\nDD/MM/YYYY:`, ui.ButtonSet.OK_CANCEL);
    if (d.getSelectedButton() !== ui.Button.OK) return;
    const p = d.getResponseText().trim().split("/");
    if (p.length !== 3) { ui.alert("Formato inválido. Usa DD/MM/YYYY"); return; }
    const date = new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
    if (isNaN(date.getTime())) { ui.alert("Fecha inválida."); return; }
    const dow = date.getDay() || 7;
    monday = new Date(date);
    monday.setDate(date.getDate() - dow + 1);
  }

  sheet.getRange("G4").setValue(monday).setNumberFormat("DD/MMM/YYYY");
  const sem = sheet.getRange("E4").getValue();
  const sun = sheet.getRange("I4").getValue();
  ui.alert(`✅ Semana ${sem} configurada\n${_fmt(monday)} → ${sun instanceof Date ? _fmt(sun) : sun}`);
  _log("configurarSemana", `${bodega.nombre} | Sem ${sem} | ${_fmt(monday)}`);
}

// ── AVANZAR SEMANA ────────────────────────────────────────────────────────────
function avanzarSemanaBA() { _avanzarSemana("BA"); }
function avanzarSemanaBM() { _avanzarSemana("BM"); }

function _avanzarSemana(key) {
  const ui     = SpreadsheetApp.getUi();
  const bodega = BODEGAS[key];
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const sheet  = ss.getSheetByName(bodega.kardex);
  if (!sheet) { ui.alert(`No existe ${bodega.kardex}.`); return; }

  const d4 = sheet.getRange("G4").getValue();
  if (!(d4 instanceof Date) || isNaN(d4.getTime())) {
    ui.alert("La fecha de inicio (G4) no es válida. Por favor configúrala primero.");
    return;
  }

  const sem = sheet.getRange("E4").getValue() || 0;
  const sun = sheet.getRange("I4").getValue();
  const resp = ui.alert(
    `📅 Avanzar semana — ${bodega.nombre}`,
    `• Semana ${sem} (${_fmt(d4)} → ${sun instanceof Date ? _fmt(sun) : sun})\n` +
    `• Los saldos finales de domingo se pasarán como saldos iniciales.\n` +
    `• Se guardará el histórico diario en HISTORIAL_${key} con fechas exactas.\n` +
    `• Se limpiará la semana en curso para iniciar de nuevo.\n\n` +
    `¿Confirmar?`,
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) { ui.alert("Otra operación en progreso."); return; }

  try {
    const lr      = sheet.getLastRow();
    const numRows = lr - KARDEX_START + 1;
    if (numRows < 1) return;

    // 1. Leer saldos finales (col AD = 30)
    const saldosFin = sheet.getRange(KARDEX_START, KARDEX_SLD_FIN, numRows, 1).getValues();
    const saldosAnt = saldosFin.map(r => [typeof r[0] === "number" ? r[0] : 0]);

    // 2. Guardar en HISTORIAL horizontal
    _guardarHistHorizontal(key, sheet, numRows, d4, sem);

    // 3. Escribir saldos finales en SALDO ANT (col I = 9)
    sheet.getRange(KARDEX_START, KARDEX_SLD_ANT, numRows, 1).setValues(saldosAnt);

    // 4. Limpiar celdas de entrada/salida
    for (let d = 0; d < KARDEX_DAYS; d++) {
      sheet.getRange(KARDEX_START, 10 + d * 3, numRows, 1).clearContent();
      sheet.getRange(KARDEX_START, 11 + d * 3, numRows, 1).clearContent();
    }

    // 5. Avanzar G4 por 7 días
    const next = new Date(d4);
    next.setDate(d4.getDate() + 7);
    sheet.getRange("G4").setValue(next).setNumberFormat("DD/MMM/YYYY");

    _log("avanzarSemana", `${bodega.nombre} | Semana ${sem} avanzada.`);
    ui.alert(`✅ Semana avanzada en ${bodega.nombre}.`);
  } finally {
    lock.releaseLock();
  }
}

function _guardarHistHorizontal(key, sheet, numRows, monday, sem) {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  const histName = `HISTORIAL_${key}`;
  let hSheet = ss.getSheetByName(histName);
  
  if (!hSheet) {
    hSheet = ss.insertSheet(histName);
    hSheet.setFrozenColumns(3);
    hSheet.setFrozenRows(4);
    
    hSheet.getRange("A1:C1").merge().setValue(`HISTORIAL DE MOVIMIENTOS — ${BODEGAS[key].nombre}`)
      .setFontWeight("bold").setFontColor("#FFFFFF").setBackground(C.dark).setHorizontalAlignment("center").setVerticalAlignment("middle");
    // NOTA: antes había una línea que pintaba de fondo columnas 4..maxColumns aquí.
    // Se quitó porque el fondo (sin valor) en celdas vacías cuenta como "contenido"
    // para getLastColumn() en Sheets, así que en la primera corrida startCol se
    // calculaba mal (usando el ancho completo del grid, ~26 columnas, en vez de 3)
    // y los datos de la semana 1 terminaban escritos muy lejos a la derecha (col AA+),
    // dando la impresión de que la semana no se guardó / que la ejecución se rompió.
    // El fondo de la fila 1 para cada bloque semanal ya se pinta más abajo (línea ~1276).

    hSheet.getRange("A2:A4").merge().setValue("No").setFontWeight("bold").setFontColor("#FFFFFF").setBackground(C.dark).setHorizontalAlignment("center").setVerticalAlignment("middle");
    hSheet.getRange("B2:B4").merge().setValue("PRODUCTO").setFontWeight("bold").setFontColor("#FFFFFF").setBackground(C.dark).setHorizontalAlignment("center").setVerticalAlignment("middle");
    hSheet.getRange("C2:C4").merge().setValue("UNIDAD").setFontWeight("bold").setFontColor("#FFFFFF").setBackground(C.dark).setHorizontalAlignment("center").setVerticalAlignment("middle");
    
    const prods = sheet.getRange(KARDEX_START, 1, numRows, 5).getValues();
    const histProds = prods.map(p => [p[0], p[2], p[4]]);
    hSheet.getRange(5, 1, numRows, 3).setValues(histProds);
    
    const bgs = histProds.map((_, i) => Array(3).fill(i % 2 === 0 ? C.rowA : C.rowB));
    hSheet.getRange(5, 1, numRows, 3).setBackgrounds(bgs).setFontFamily("Calibri").setFontSize(10).setVerticalAlignment("middle");
    hSheet.getRange(5, 1, numRows, 1).setHorizontalAlignment("center");
    hSheet.getRange(5, 2, numRows, 1).setHorizontalAlignment("left");
    hSheet.getRange(5, 3, numRows, 1).setHorizontalAlignment("center");
    
    hSheet.setColumnWidth(1, 45);
    hSheet.setColumnWidth(2, 210);
    hSheet.setColumnWidth(3, 65);
  }

  const lastRowH = hSheet.getLastRow();
  const numRowsH = lastRowH - 4;
  if (numRowsH < numRows) {
    const diff = numRows - numRowsH;
    hSheet.insertRowsAfter(lastRowH, diff);
    const newProds = sheet.getRange(KARDEX_START + numRowsH, 1, diff, 5).getValues();
    const histNewProds = newProds.map(p => [p[0], p[2], p[4]]);
    hSheet.getRange(lastRowH + 1, 1, diff, 3).setValues(histNewProds);
    
    const bgs = histNewProds.map((_, i) => Array(3).fill((numRowsH + i) % 2 === 0 ? C.rowA : C.rowB));
    hSheet.getRange(lastRowH + 1, 1, diff, 3).setBackgrounds(bgs).setFontFamily("Calibri").setFontSize(10).setVerticalAlignment("middle");
    hSheet.getRange(lastRowH + 1, 1, diff, 1).setHorizontalAlignment("center");
    hSheet.getRange(lastRowH + 1, 3, diff, 1).setHorizontalAlignment("center");
  }

  const startCol = hSheet.getLastColumn() + 1;
  hSheet.insertColumnsAfter(startCol - 1, 16);

  const semStr = `SEMANA ${sem} (${monday.getFullYear()})`;
  hSheet.getRange(2, startCol, 1, 15).merge().setValue(semStr)
    .setFontWeight("bold").setFontColor("#FFFFFF").setBackground(C.dark).setHorizontalAlignment("center").setVerticalAlignment("middle");
  hSheet.getRange(1, startCol, 1, 16).setBackground(C.dark);

  const kardexVals = sheet.getRange(KARDEX_START, 10, numRows, 21).getValues();
  const sldFin = sheet.getRange(KARDEX_START, KARDEX_SLD_FIN, numRows, 1).getValues();
  const histVals = [];

  for (let r = 0; r < numRows; r++) {
    const rowVals = [];
    for (let d = 0; d < KARDEX_DAYS; d++) {
      const entVal = kardexVals[r][d * 3];
      const salVal = kardexVals[r][d * 3 + 1];
      rowVals.push(entVal === "" ? 0 : entVal);
      rowVals.push(salVal === "" ? 0 : salVal);
    }
    histVals.push(rowVals);
  }

  const daysShort = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];
  const mShort = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  for (let d = 0; d < KARDEX_DAYS; d++) {
    const colIdx = startCol + d * 2;
    const dayDate = new Date(monday.getTime() + d * 24 * 60 * 60 * 1000);
    const dayStr = `${daysShort[d]} ${dayDate.getDate()}/${mShort[dayDate.getMonth()]}`;
    
    hSheet.getRange(3, colIdx, 1, 2).merge().setValue(dayStr)
      .setFontWeight("bold").setFontColor("#333333").setBackground(C.cream).setHorizontalAlignment("center").setVerticalAlignment("middle").setFontSize(9);
      
    hSheet.getRange(4, colIdx).setValue("ENT").setFontWeight("bold").setFontColor(C.dkGreen).setBackground(C.entBg).setHorizontalAlignment("center").setFontSize(8);
    hSheet.getRange(4, colIdx + 1).setValue("SAL").setFontWeight("bold").setFontColor("#C62828").setBackground(C.salBg).setHorizontalAlignment("center").setFontSize(8);
    
    hSheet.setColumnWidth(colIdx, 55);
    hSheet.setColumnWidth(colIdx + 1, 55);
  }

  // SLD FIN header
  hSheet.getRange(3, startCol + 14).setValue("SLD FIN")
    .setFontWeight("bold").setFontColor("#333333").setBackground(C.iceBlue).setHorizontalAlignment("center").setVerticalAlignment("middle").setFontSize(9);
  hSheet.getRange(4, startCol + 14).setValue("").setBackground(C.iceBlue);
  hSheet.setColumnWidth(startCol + 14, 65);

  hSheet.getRange(5, startCol, numRows, 14).setValues(histVals);
  hSheet.getRange(5, startCol + 14, numRows, 1).setValues(sldFin);

  const colBgs = [];
  for (let r = 0; r < numRows; r++) {
    const rowBg = [];
    for (let d = 0; d < KARDEX_DAYS; d++) {
      rowBg.push(C.entBg);
      rowBg.push(C.salBg);
    }
    colBgs.push(rowBg);
  }
  hSheet.getRange(5, startCol, numRows, 14).setBackgrounds(colBgs)
    .setFontFamily("Calibri").setFontSize(10).setVerticalAlignment("middle").setHorizontalAlignment("center");
  hSheet.getRange(5, startCol + 14, numRows, 1).setBackgrounds(Array(numRows).fill([C.iceBlue]))
    .setFontFamily("Calibri").setFontSize(10).setVerticalAlignment("middle").setHorizontalAlignment("center");

  // Formato numérico para datos y SLD FIN
  hSheet.getRange(5, startCol, numRows, 15).setNumberFormat("0.####");

  // Configurar columna de separación (16ª columna = startCol + 15)
  const sepColIdx = startCol + 15;
  hSheet.setColumnWidth(sepColIdx, 8);
  hSheet.getRange(2, sepColIdx, numRows + 3, 1).setBackground("#555555");
}

// ── AGREGAR PRODUCTO ──────────────────────────────────────────────────────────
function agregarProducto() {
  const ui      = SpreadsheetApp.getUi();
  const ss      = SpreadsheetApp.getActiveSpreadsheet();
  const maestro = ss.getSheetByName(SHEET_MAESTRO);
  if (!maestro) { ui.alert("No existe MAESTRO."); return; }

  const pResp = ui.prompt("🆕 Nuevo Producto", "Nombre del producto:", ui.ButtonSet.OK_CANCEL);
  if (pResp.getSelectedButton() !== ui.Button.OK) return;
  const prod = pResp.getResponseText().trim();
  if (!prod) return;

  const iResp = ui.prompt("🆕 Nuevo Producto", "ID de familia (ej: REF-019):", ui.ButtonSet.OK_CANCEL);
  if (iResp.getSelectedButton() !== ui.Button.OK) return;
  const idFam = iResp.getResponseText().trim();

  // Inferir categoría del prefijo
  const idFamPrefix = idFam.split('-')[0].toUpperCase();
  const categoria = CATEGORIAS_MAP[idFamPrefix];
  if (!categoria) {
    ui.alert("⚠️ ID de Familia Inválido", `No se pudo determinar la categoría para el prefijo "${idFamPrefix}".\n\nPrefijos válidos:\n- REF (REFRIGERADOS)\n- FYV (FRUTAS Y VERDURAS)\n- LEC (LÁCTEOS)\n- ABR (ABARROTES)\n- BEB (BEBIDAS)\n- DES (DESECHABLES)\n- JAR (JARCERÍA)\n\nEl producto no fue agregado.`, ui.ButtonSet.OK);
    return;
  }

  const uResp = ui.prompt("🆕 Nuevo Producto", "Unidad (kg / lt / pza / paq / g / ml / rol / fco / dom / bol / caj):", ui.ButtonSet.OK_CANCEL);
  if (uResp.getSelectedButton() !== ui.Button.OK) return;
  const unidad = uResp.getResponseText().trim().toLowerCase();
  const unidadesValidas = ["kg", "lt", "pza", "paq", "g", "ml", "rol", "fco", "dom", "bol", "caj"];
  if (!unidadesValidas.includes(unidad)) {
    ui.alert("⚠️ Unidad Inválida", `La unidad "${unidad}" no es válida.\n\nValores válidos: ${unidadesValidas.join(", ")}`, ui.ButtonSet.OK);
    return;
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) { ui.alert("El archivo está ocupado. Intenta de nuevo."); return; }

  try {
    SpreadsheetApp.getActive().toast("⏳ Agregando nuevo producto al catálogo...", "⚙️ Mise", 5);
    const lr    = maestro.getLastRow();
    const nos   = maestro.getRange(MAESTRO_START, 1, lr - MAESTRO_START + 1, 1).getValues();
    const lastNo = nos.reduce((max, r) => Math.max(max, parseInt(r[0]) || 0), 0);
    const newNo = lastNo + 1;
    const newRow = lr + 1;

    // 1. Insertar en MAESTRO
    maestro.getRange(newRow, 1, 1, 14)
      .setValues([[newNo, idFam, categoria, prod, "", unidad, "SÍ", 0, 0, "", 0, 0, "", false]]);
    const rowColor = (newNo % 2 === 1) ? C.rowA : C.rowB;
    maestro.getRange(newRow, 1, 1, 14).setBackground(rowColor);
    
    // Configurar dropdown nativo SÍ/NO
    const validationRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(["SÍ", "NO"], true)
      .setAllowInvalid(false)
      .setHelpText("Selecciona SÍ o NO para activar/desactivar el producto.")
      .build();
    maestro.getRange(newRow, 7).setDataValidation(validationRule);

    // Configurar dropdown CATEGORÍA
    const catValidation = SpreadsheetApp.newDataValidation()
      .requireValueInList(CATEGORIAS_LISTA, true)
      .setAllowInvalid(true)
      .setHelpText("Selecciona la categoría del producto.")
      .build();
    maestro.getRange(newRow, 3).setDataValidation(catValidation);

    // Configurar checkbox de seleccion (columna 14 = N)
    maestro.getRange(newRow, 14).insertCheckboxes().setValue(false);

    // 2. Insertar en KARDEX_BA y KARDEX_BM
    Object.values(BODEGAS).forEach(b => {
      const kSheet = ss.getSheetByName(b.kardex);
      if (kSheet) {
        const lastRowK = kSheet.getLastRow();
        const nextRowK = lastRowK + 1;
        
        kSheet.getRange(nextRowK, 1, 1, 5).setValues([[newNo, categoria, prod, "", unidad]]);
        // kSheet.getRange(nextRowK, 6).setDataValidation(...) (Feature deshabilitada)
        kSheet.getRange(nextRowK, 6).setNumberFormat("DD/MMM/YY");
        
        // kSheet.getRange(nextRowK, 8).setFormula(...) (Feature deshabilitada)
        kSheet.getRange(nextRowK, 9).setValue(0);
        
        for (let d = 0; d < KARDEX_DAYS; d++) {
          const sldCol  = 12 + d * 3;
          const prevCol = 9  + d * 3;
          const entCol  = 10 + d * 3;
          const salCol  = 11 + d * 3;
          
          kSheet.getRange(nextRowK, entCol).setValue("");
          kSheet.getRange(nextRowK, salCol).setValue("");
          const fSld = '=' + _col(prevCol) + nextRowK + '+IFERROR(' + _col(entCol) + nextRowK + ',0)-IFERROR(' + _col(salCol) + nextRowK + ',0)';
          kSheet.getRange(nextRowK, sldCol).setFormula(fSld);
        }
        
        kSheet.getRange(nextRowK, 1, 1, 30).setBackgrounds([Array(30).fill(rowColor)]);
        kSheet.getRange(nextRowK, 9).setBackground(C.iceBlue);
        for (let d = 0; d < KARDEX_DAYS; d++) {
          kSheet.getRange(nextRowK, 10 + d * 3).setBackground(C.entBg);
          kSheet.getRange(nextRowK, 11 + d * 3).setBackground(C.salBg);
          kSheet.getRange(nextRowK, 12 + d * 3).setBackground(C.iceBlue);
        }
      }
    });

    // 3. Insertar en HISTORIAL_BA y HISTORIAL_BM
    Object.values(BODEGAS).forEach(b => {
      const histName = `HISTORIAL_${b.key}`;
      const hSheet = ss.getSheetByName(histName);
      if (hSheet) {
        const lastRowH = hSheet.getLastRow();
        const nextRowH = lastRowH + 1;
        hSheet.getRange(nextRowH, 1, 1, 3).setValues([[newNo, prod, unidad]]).setBackground(rowColor);
        hSheet.getRange(nextRowH, 1, 1, 1).setHorizontalAlignment("center");
        hSheet.getRange(nextRowH, 3, 1, 1).setHorizontalAlignment("center");
      }
    });

    // 4. Re-ordenar y re-numerar todo, luego recrear vistas
    _ordenarYRenumerarTodo();
    _buildVista("BA");
    _buildVista("BM");

    // 5. Recrear Caducidades (Feature deshabilitada)
    // crearCaducidades();

    SpreadsheetApp.getActive().toast("✅ Producto agregado con éxito", "⚙️ Mise", 4);
    ui.alert("✅ Producto agregado", `"${prod}" se ha agregado al catálogo, kardex y hojas de historial.`, ui.ButtonSet.OK);
    _log("agregarProducto", `Producto: ${prod}`);
  } finally {
    lock.releaseLock();
  }
}

function anularProducto() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const maestro = ss.getSheetByName(SHEET_MAESTRO);
  if (!maestro) { ui.alert("No existe MAESTRO."); return; }

  const resp = ui.prompt(
    "🚫 Anular Producto",
    "Ingresa el número (No) o el nombre del producto a anular/desactivar:",
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const input = resp.getResponseText().trim();
  if (!input) return;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) { ui.alert("El archivo está ocupado. Intenta de nuevo."); return; }

  try {
    SpreadsheetApp.getActive().toast("⏳ Desactivando y ocultando producto...", "⚙️ Mise", 5);
    const lr = maestro.getLastRow();
    const data = maestro.getRange(MAESTRO_START, 1, lr - MAESTRO_START + 1, 4).getValues(); // No, ID, CAT, PRODUCTO
    let foundRow = -1;
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]) === input || String(data[i][3]).toLowerCase() === input.toLowerCase()) {
        foundRow = MAESTRO_START + i;
        break;
      }
    }

    if (foundRow === -1) {
      ui.alert("❌ Producto no encontrado. Verifica el número o nombre.");
      return;
    }

    // Cambiar columna ACTIVO (col 7) a NO
    maestro.getRange(foundRow, 7).setValue("NO");
    
    // Ocultar en Kardex
    const kardexRow = foundRow - MAESTRO_START + KARDEX_START;
    Object.values(BODEGAS).forEach(b => {
      const kSheet = ss.getSheetByName(b.kardex);
      if (kSheet) {
        kSheet.hideRows(kardexRow);
      }
    });

    // Recrear vistas
    _buildVista("BA");
    _buildVista("BM");
    // crearCaducidades(); // Feature deshabilitada

    SpreadsheetApp.getActive().toast("✅ Producto anulado con éxito", "⚙️ Mise", 4);
    ui.alert("✅ Producto anulado", "El producto ha sido marcado como inactivo y ocultado de las hojas de operaciones.", ui.ButtonSet.OK);
    _log("anularProducto", `Fila Maestro: ${foundRow}`);
  } finally {
    lock.releaseLock();
  }
}

// ── TESTS ─────────────────────────────────────────────────────────────────────
function runTests() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let ts   = ss.getSheetByName("🧪 TESTS");
  if (!ts) ts = ss.insertSheet("🧪 TESTS");
  else ts.clearContents();

  ts.getRange(1, 1, 1, 4).setValues([["TEST","RESULTADO","DETALLE","TIMESTAMP"]])
    .setFontWeight("bold").setFontColor("#FFFFFF").setBackground(C.dark);
  ts.setColumnWidth(1, 280); ts.setColumnWidth(2, 90);
  ts.setColumnWidth(3, 400); ts.setFrozenRows(1);

  const now     = new Date();
  const results = [];

  function test(name, fn) {
    try {
      const r = fn();
      results.push([name, r.ok ? "✅ PASS" : "❌ FAIL", r.msg || "", now]);
    } catch(e) {
      results.push([name, "💥 ERROR", e.message || String(e), now]);
    }
  }

  test("T01 — MAESTRO existe y tiene datos", () => {
    const m = ss.getSheetByName(SHEET_MAESTRO);
    if (!m) return { ok: false, msg: "No encontrado" };
    const c = m.getLastRow() - MAESTRO_START + 1;
    return { ok: c > 100, msg: `${c} productos` };
  });

  test("T02 — KARDEX_BA existe", () => {
    const s = ss.getSheetByName(BODEGAS.BA.kardex);
    return { ok: !!s, msg: s ? `${s.getLastRow() - KARDEX_START + 1} productos` : "No encontrado" };
  });

  test("T03 — KARDEX_BM existe", () => {
    const s = ss.getSheetByName(BODEGAS.BM.kardex);
    return { ok: !!s, msg: s ? `${s.getLastRow() - KARDEX_START + 1} productos` : "No encontrado" };
  });

  test("T04 — VISTA_MOVIL_BA existe y tiene datos", () => {
    const s = ss.getSheetByName(BODEGAS.BA.vista);
    if (!s) return { ok: false, msg: "No encontrada" };
    return { ok: s.getLastRow() >= 4, msg: `${s.getLastRow() - 3} filas` };
  });

  test("T05 — VISTA_MOVIL_BM existe y tiene datos", () => {
    const s = ss.getSheetByName(BODEGAS.BM.vista);
    if (!s) return { ok: false, msg: "No encontrada" };
    return { ok: s.getLastRow() >= 4, msg: `${s.getLastRow() - 3} filas` };
  });

  test("T06 — CADUCIDADES existe", () => {
    const s = ss.getSheetByName("CADUCIDADES");
    return { ok: !!s, msg: s ? `${s.getLastRow() - 3} productos` : "No encontrada" };
  });

  test("T07 — KARDEX_BA tiene fórmulas SLD (col K fila 7)", () => {
    const s = ss.getSheetByName(BODEGAS.BA.kardex);
    if (!s) return { ok: false, msg: "No encontrado" };
    const f = s.getRange(KARDEX_START, 11).getFormula();
    return { ok: f.includes("="), msg: `K7: ${f.substring(0, 50)}` };
  });

  test("T08 — _mondayOfWeek(1, 2026) = 29/12/2025", () => {
    const m = _mondayOfWeek(1, 2026);
    const ok = m.toDateString() === new Date(2025, 11, 29).toDateString();
    return { ok, msg: `Resultado: ${_fmt(m)}` };
  });

  test("T09 — _isoWeek devuelve 1-53", () => {
    const w = _isoWeek(new Date());
    return { ok: w >= 1 && w <= 53, msg: `Semana actual: ${w}` };
  });

  test("T10 — LOG existe", () => {
    const s = ss.getSheetByName(SHEET_LOG);
    return { ok: !!s, msg: s ? `${s.getLastRow() - 1} entradas` : "No encontrado" };
  });

  ts.getRange(2, 1, results.length, 4).setValues(results);
  results.forEach((r, i) => {
    const bg = r[1].includes("PASS") ? "#C8E6C9" : r[1].includes("FAIL") ? "#FFCDD2" : "#FFE0B2";
    ts.getRange(i + 2, 1, 1, 4).setBackground(bg);
  });

  const passed = results.filter(r => r[1].includes("PASS")).length;
  SpreadsheetApp.getActive().toast(
    `${passed}/${results.length} tests pasaron`, "🧪 Mise Tests", 6
  );
  ss.setActiveSheet(ts);
}

// ── MIGRACIÓN IN-SITU NO DESTRUCTIVA (13 COLUMNAS) ────────────────────────────
function migrarEstructuraMaestro13Cols() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const maestro = ss.getSheetByName(SHEET_MAESTRO);
  if (!maestro) return;

  const headerRange = maestro.getRange(3, 1, 1, maestro.getLastColumn());
  const headers = headerRange.getValues()[0].map(h => String(h).trim().toUpperCase());

  // Verificar si la Columna B (índice 1) es ID_FAMILIA
  if (headers[1] === "ID_FAMILIA") {
    SpreadsheetApp.getActive().toast("⏳ Migrando MAESTRO de 14 a 13 columnas sin perder datos...", "⚙️ Mise", 5);
    
    // Eliminación atómica de Columna B (ID_FAMILIA)
    maestro.deleteColumn(2);
    
    // Actualizar encabezados
    maestro.getRange(1, 1, 1, 13).merge()
      .setValue("MISE — MAESTRO DE PRODUCTOS   |   La Crêpe Parisienne · Grupo MYT")
      .setBackground(C.dark).setFontColor("#FFFFFF").setFontWeight("bold")
      .setFontSize(11).setFontFamily("Arial").setHorizontalAlignment("center");

    maestro.getRange(2, 1, 1, 13).setBackground(C.cream);
    maestro.getRange(3, 1, 1, 13)
      .setValues([["No","CATEGORÍA","PRODUCTO","PRESENTACION","UNIDAD","ACTIVO","MÍN_BA","MÁX_BA","STOCK_BA","MÍN_BM","MÁX_BM","STOCK_BM","SELECCIONAR"]])
      .setBackground(C.sage).setFontColor("#FFFFFF").setFontWeight("bold")
      .setFontSize(10).setHorizontalAlignment("center");

    // Re-ordenar, re-numerar y actualizar Kardex y Vistas dinámicamente
    _ordenarYRenumerarTodo();
    _buildVista("BA");
    _buildVista("BM");

    SpreadsheetApp.getActive().toast("✅ Migración completada. Catálogo preservado al 100%", "⚙️ Mise", 5);
    _log("migrarEstructuraMaestro13Cols", "Migrado con éxito a 13 columnas preservando datos.");
  }
}

// ── UTILIDADES ────────────────────────────────────────────────────────────────
function limpiarProps() {
  PropertiesService.getScriptProperties().deleteAllProperties();
  SpreadsheetApp.getUi().alert("🧹 Propiedades limpiadas.\nYa puedes ejecutar Setup completo.");
}

function _col(n) {
  let s = "", c = n;
  while (c > 0) { c--; s = String.fromCharCode(65 + c % 26) + s; c = Math.floor(c / 26); }
  return s;
}

function _quoteName(name) {
  return /[\s\-áéíóúÁÉÍÓÚüÜñÑ]/.test(name) ? `'${name}'` : name;
}

function _isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const y = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - y) / 86400000) + 1) / 7);
}

function _mondayOfWeek(week, year) {
  const jan4  = new Date(year, 0, 4);
  const dow   = jan4.getDay() || 7;
  const jan4m = new Date(jan4);
  jan4m.setDate(jan4.getDate() - dow + 1);
  const monday = new Date(jan4m);
  monday.setDate(jan4m.getDate() + (week - 1) * 7);
  return monday;
}

function _fmt(date) {
  if (!date || isNaN(date)) return "—";
  return `${String(date.getDate()).padStart(2,"0")}/${String(date.getMonth()+1).padStart(2,"0")}/${date.getFullYear()}`;
}

// ── SISTEMA DE TELEMETRÍA Y LOGGING ESTRUCTURADO (MISE LOGGER) ────────────────
const MiseLogger = {
  _timers: {},

  time(label) {
    this._timers[label] = Date.now();
    return label;
  },

  timeStart(label) {
    this._timers[label] = Date.now();
    return label;
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
      email = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || "[CRON/SYSTEM]";
    } catch(e) {
      email = "[CRON/SYSTEM]";
    }

    const stackTrace = errorObj && errorObj.stack ? String(errorObj.stack) : "";
    const msFormatted = durationMs !== null ? `${durationMs} ms` : "—";

    // 1. Emisión a consola V8 / Google Cloud Logging
    const consoleMsg = `[${level}] [${fnName}] (${msFormatted}) ${message}`;
    if (level === "ERROR" || level === "FATAL") {
      console.error(consoleMsg, { user: email, durationMs, stack: stackTrace });
    } else if (level === "WARN") {
      console.warn(consoleMsg, { user: email, durationMs });
    } else {
      console.log(consoleMsg, { user: email, durationMs });
    }

    // 2. Persistencia en hoja de cálculo 🗒 LOG (Orden Descendente: más nuevo arriba)
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let sheetLog = ss.getSheetByName(SHEET_LOG);
      if (!sheetLog) {
        sheetLog = ss.insertSheet(SHEET_LOG);
        sheetLog.appendRow(["TIMESTAMP", "NIVEL", "FUNCIÓN", "DURACIÓN (ms)", "DETALLE", "USUARIO", "STACK TRACE"]);
        sheetLog.getRange(1, 1, 1, 7).setFontWeight("bold").setFontColor("#FFFFFF").setBackground(C.dark);
        sheetLog.setFrozenRows(1);
        sheetLog.setColumnWidth(1, 160);
        sheetLog.setColumnWidth(2, 80);
        sheetLog.setColumnWidth(3, 160);
        sheetLog.setColumnWidth(4, 100);
        sheetLog.setColumnWidth(5, 350);
        sheetLog.setColumnWidth(6, 160);
        sheetLog.setColumnWidth(7, 300);
      }
      
      sheetLog.insertRowBefore(2);
      sheetLog.getRange(2, 1, 1, 7).setValues([[timestamp, level, fnName, durationMs !== null ? durationMs : 0, String(message || ""), email, stackTrace]]);
      
      // Auto-limpieza de histórico (mantiene los 500 más recientes)
      const maxLogs = 500;
      const currentRows = sheetLog.getLastRow();
      if (currentRows > maxLogs + 1) {
        sheetLog.deleteRows(maxLogs + 2, currentRows - (maxLogs + 1));
      }
    } catch(e) {
      console.error("Fallo al escribir en la hoja 🗒 LOG: " + e.toString());
    }
  },

  debug(fn, msg, ms = null) { this.log("DEBUG", fn, msg, ms); },
  info(fn, msg, ms = null) { this.log("INFO", fn, msg, ms); },
  warn(fn, msg, ms = null) { this.log("WARN", fn, msg, ms); },
  error(fn, msg, err = null, ms = null) { this.log("ERROR", fn, msg, ms, err); },
  perf(fn, msg, ms) { this.log("PERF", fn, msg, ms); }
};

// Wrapper para retrocompatibilidad total con código existente
function _log(fn, msg) {
  MiseLogger.info(fn, msg);
}

// ── CATÁLOGO ──────────────────────────────────────────────────────────────────
function _catalogo() {
  // [No, ID_FAMILIA, PRODUCTO, PRESENTACION, UNIDAD, ACTIVO, MÍN, MÁX]
  return [
    [1,"REF-001","Pepperoni","BOL 500 g","kg","SÍ",0,0],
    [2,"REF-002","Jamón de pavo Lala","PAQ 450 g","kg","SÍ",0,0],
    [3,"REF-003","Prosciutto","PZA 100 g","pza","SÍ",0,0],
    [4,"REF-004","Tocino en trocitos","BOL 567 g","kg","SÍ",0,0],
    [5,"REF-005","Queso mozzarella CDK","BOL 700 g","kg","SÍ",0,0],
    [6,"REF-006","Queso mozzarella fresco Pilarica","PAQ 500 g","kg","SÍ",0,0],
    [7,"REF-007","Queso Philadelphia CDK","MAN 1 kg","kg","SÍ",0,0],
    [8,"REF-008","Queso gouda","BOL 2 kg","kg","SÍ",0,0],
    [9,"REF-009","Mantequilla Asturias","PZA 1 kg","kg","SÍ",0,0],
    [10,"REF-010","Mermelada de manzana CDK","MAN 1 kg","kg","SÍ",0,0],
    [11,"REF-011","Crema batida","MAN 453 g","g","SÍ",0,0],
    [12,"REF-012","Yogurt griego natural","BOT 1 kg","kg","SÍ",0,0],
    [13,"REF-013","Concentrado de guayaba","BOT 1 LT","lt","SÍ",0,0],
    [14,"REF-014","Concentrado de frutos rojos","BOT 1 LT","lt","SÍ",0,0],
    [15,"REF-015","Concentrado de limonada rosa","BOT 1 LT","lt","SÍ",0,0],
    [16,"REF-016","Jugo limón pepino jengibre","BOT 1 LT","lt","SÍ",0,0],
    [17,"REF-017","Concentrado de mango","BOT 1 LT","lt","SÍ",0,0],
    [18,"REF-018","Concentrado de mango maracuyá","BOT 1 LT","lt","SÍ",0,0],
    [19,"FYV-001","Fresa","DOM 454 g","kg","SÍ",0,0],
    [20,"FYV-002","Frambuesa","DOM 170 g","kg","SÍ",0,0],
    [21,"FYV-003","Zarzamora","DOM 170 g","kg","SÍ",0,0],
    [22,"FYV-004","Champiñones","BOL","pza","SÍ",0,0],
    [23,"FYV-005","Tomate cherry","DOM 280 g","g","SÍ",0,0],
    [24,"FYV-006","Limón","PZA","pza","SÍ",0,0],
    [25,"FYV-007","Pepino","PZA","pza","SÍ",0,0],
    [26,"FYV-008","Huevo","DOM 1 kg","kg","SÍ",0,0],
    [27,"FYV-009","Plátano","PZA","pza","SÍ",0,0],
    [28,"FYV-010","Espinaca","PAQ 180 g","g","SÍ",0,0],
    [29,"LEC-001","Leche entera Lala Bar","BOT 2 LT","lt","SÍ",0,0],
    [30,"LEC-002","Leche deslactosada Lala Bar","BOT 1 LT","lt","SÍ",0,0],
    [31,"LEC-003","Leche deslactosada light Lala Bar","BOT 1 LT","lt","SÍ",0,0],
    [32,"LEC-004","Leche light Lala Bar","BOT 1 LT","lt","SÍ",0,0],
    [33,"LEC-005","Leche almendra","BOT 1 LT","lt","SÍ",0,0],
    [34,"LEC-006","Leche avena","BOT 1 LT","lt","SÍ",0,0],
    [35,"ABR-001","Harina LCP","PAQ 1.5 kg","paq","SÍ",0,0],
    [36,"ABR-002","Harina de sarraceno","BOL 1 kg","kg","SÍ",0,0],
    [37,"ABR-003","Nutella","MAN 1 kg","kg","SÍ",0,0],
    [38,"ABR-004","Mermelada de fresa","MAN 1 kg","kg","SÍ",0,0],
    [39,"ABR-005","Mermelada de zarzamora","MAN 1 kg","kg","SÍ",0,0],
    [40,"ABR-006","Cajeta diluida CDK","MAN 1 kg","kg","SÍ",0,0],
    [41,"ABR-007","Lechera untable CDK","MAN 1 kg","kg","SÍ",0,0],
    [42,"ABR-008","Chocolate Turin untable CDK","MAN 1 kg","kg","SÍ",0,0],
    [43,"ABR-009","Chocolate obscuro untable CDK","MAN 1 kg","kg","SÍ",0,0],
    [44,"ABR-010","Gloria untable CDK","MAN 1 kg","kg","SÍ",0,0],
    [45,"ABR-011","Untable de pistache","MAN 1 kg","kg","SÍ",0,0],
    [46,"ABR-012","Crema de pistache CDK","MAN 1 kg","kg","SÍ",0,0],
    [47,"ABR-013","Crema de Lotus untable CDK","MAN 1 kg","kg","SÍ",0,0],
    [48,"ABR-014","Kinder Bueno","PAQ 10 PZA","pza","SÍ",0,0],
    [49,"ABR-015","Chocolate semi amargo Luneta","BOL 1 kg","kg","SÍ",0,0],
    [50,"ABR-016","Enjambre","BOL 700 g","g","SÍ",0,0],
    [51,"ABR-017","Café en grano Postales","BOL 1 kg","kg","SÍ",0,0],
    [52,"ABR-018","Café en grano Postales descaf.","BOL 1 kg","kg","SÍ",0,0],
    [53,"ABR-019","Caramelo con sal Monin","BOT 1.89 LT","lt","SÍ",0,0],
    [54,"ABR-020","Jarabe natural","BOT 1 LT","lt","SÍ",0,0],
    [55,"ABR-021","Jarabe de caramelo","BOT 1 LT","lt","SÍ",0,0],
    [56,"ABR-022","Jarabe de vainilla","BOT 1 LT","lt","SÍ",0,0],
    [57,"ABR-023","Jarabe de avellana","BOT 1 LT","lt","SÍ",0,0],
    [58,"ABR-024","Pistache tostado","BOL 680 g","g","SÍ",0,0],
    [59,"ABR-025","Nuez picada","BOL 1 kg","kg","SÍ",0,0],
    [60,"ABR-026","Bombón mini blanco","BOL 400 g","g","SÍ",0,0],
    [61,"ABR-027","Galleta Ricanelas","PAQ 113 g","g","SÍ",0,0],
    [62,"ABR-028","Galleta Oreo","PAQ 113 g","g","SÍ",0,0],
    [63,"ABR-029","Galleta Lotus Biscoff","PAQ 250 g","g","SÍ",0,0],
    [64,"ABR-030","Base neutra","BOL 1 kg","kg","SÍ",0,0],
    [65,"ABR-031","Té Chai Oregon","BOL 1.3 kg","kg","SÍ",0,0],
    [66,"ABR-032","Té matcha mascabado","BOL 1 kg","kg","SÍ",0,0],
    [67,"ABR-033","Tisana Paso de Ovejas","BOL 1 kg","kg","SÍ",0,0],
    [68,"ABR-034","Tisana Azoyú LCP","BOL 1 kg","kg","SÍ",0,0],
    [69,"ABR-035","Tisana Ixil LCP","BOL 1 kg","kg","SÍ",0,0],
    [70,"ABR-036","Chocolate Abuelita en polvo","BOL 1 kg","kg","SÍ",0,0],
    [71,"ABR-037","Chocolate blanco en polvo Da Vinci","BOL 1.3 kg","kg","SÍ",0,0],
    [72,"ABR-038","Salsa Pesto Barilla","FCO 190 g","g","SÍ",0,0],
    [73,"ABR-039","Salsa para pizza marinara","FCO 680 g","g","SÍ",0,0],
    [74,"ABR-040","Chile chipotle San Marcos","LAT 215 g","g","SÍ",0,0],
    [75,"ABR-041","Splenda en sobre","CAJ 700 PZA","pza","SÍ",0,0],
    [76,"ABR-042","Stevia en sobre","CAJ 400 PZA","pza","SÍ",0,0],
    [77,"ABR-043","Azúcar blanca refinada en sobre","BOL 200 PZA","pza","SÍ",0,0],
    [78,"ABR-044","Azúcar mascabado en sobre","BOL 200 PZA","pza","SÍ",0,0],
    [79,"ABR-045","Aceite de oliva La Fina","BOT 750 ml","ml","SÍ",0,0],
    [80,"ABR-046","Miel de abeja Carlota","FCO 330 ml","ml","SÍ",0,0],
    [81,"ABR-047","Canela en polvo McCormick","BOT 520 g","g","SÍ",0,0],
    [82,"ABR-048","Azúcar blanca","BOL 2 kg","kg","SÍ",0,0],
    [83,"ABR-049","Albahaca seca","PZA 330 g","g","SÍ",0,0],
    [84,"ABR-050","Pimienta negra molida","PZA 510 g","g","SÍ",0,0],
    [85,"ABR-051","Sal fina","BOL 1 kg","kg","SÍ",0,0],
    [86,"BEB-001","Canadá dry","PAQ 12 PZA","pza","SÍ",0,0],
    [87,"BEB-002","Pepsi Regular","PZA 330 ml","pza","SÍ",0,0],
    [88,"BEB-003","Pepsi Light","PZA 330 ml","pza","SÍ",0,0],
    [89,"BEB-004","Manzanita Sol","PZA 330 ml","pza","SÍ",0,0],
    [90,"BEB-005","Perrier","PZA 330 ml","pza","SÍ",0,0],
    [91,"BEB-006","Lipton","PZA 600 ml","pza","SÍ",0,0],
    [92,"BEB-007","Aranciata San Pellegrino","PZA 330 ml","pza","SÍ",0,0],
    [93,"BEB-008","Agua mineral Canada Dry","PAQ 12 PZA","pza","SÍ",0,0],
    [94,"BEB-009","Agua Epura","PAQ 12 PZA","pza","SÍ",0,0],
    [95,"DES-001","Servilleta 24x24 LCP","PAQ 125 PZA","paq","SÍ",0,0],
    [96,"DES-002","Cono para llevar LCP","PAQ 50 PZA","pza","SÍ",0,0],
    [97,"DES-003","Cono crepa individual","PAQ 50 PZA","pza","SÍ",0,0],
    [98,"DES-004","Popote estuchado GDL","PAQ 500 PZA","pza","SÍ",0,0],
    [99,"DES-005","Tapa PET 20 oz transparente","MAN 50 PZA","pza","SÍ",0,0],
    [100,"DES-006","Tapa PET DOM 20 oz","MAN 50 PZA","pza","SÍ",0,0],
    [101,"DES-007","Vaso bebida caliente 16 oz","MAN 50 PZA","pza","SÍ",0,0],
    [102,"DES-008","Tapa PET blanca caliente 16 oz","MAN 50 PZA","pza","SÍ",0,0],
    [103,"DES-009","Vaso expresso 4 oz","PAQ 25 PZA","pza","SÍ",0,0],
    [104,"DES-010","Tapa vaso 4 oz","PAQ 50 PZA","pza","SÍ",0,0],
    [105,"DES-011","Vaso 20 oz frío","MAN 50 PZA","pza","SÍ",0,0],
    [106,"DES-012","Portavaso 4 cavidades","PAQ 50 PZA","pza","SÍ",0,0],
    [107,"DES-013","Fajilla de cartón","PAQ 25 PZA","pza","SÍ",0,0],
    [108,"DES-014","Bolsa mediana LCP","BOL 1 kg","kg","SÍ",0,0],
    [109,"DES-015","Agitador de bambú 18 cm","CAJ 1000 PZA","pza","SÍ",0,0],
    [110,"DES-016","Cuchara desechable","PAQ 50 PZA","pza","SÍ",0,0],
    [111,"DES-017","Etiqueta consumo blanca","ROL 1000 PZA","pza","SÍ",0,0],
    [112,"DES-018","Hoja de polipapel","PAQ 1 kg","kg","SÍ",0,0],
    [113,"DES-019","Manga desechable","ROL 5 PZA","pza","SÍ",0,0],
    [114,"DES-020","Rollo térmico 80x70 mm","PZA","pza","SÍ",0,0],
    [115,"DES-021","Cofia blanca","BOL 100 PZA","pza","SÍ",0,0],
    [116,"DES-022","Rollo bolsa transparente","ROL","pza","SÍ",0,0],
    [117,"DES-023","Toalla en rollo","ROL 180 m","pza","SÍ",0,0],
    [118,"DES-024","Toalla Whiper","ROL","pza","SÍ",0,0],
    [119,"DES-025","Toallas interdobladas","PAQ 150 PZA","pza","SÍ",0,0],
    [120,"DES-026","Cubrebocas tricapa","CAJ 50 PZA","pza","SÍ",0,0],
    [121,"DES-027","Guantes nitrilo chico","PAQ 100 PZA","pza","SÍ",0,0],
    [122,"DES-028","Guantes nitrilo grande","PAQ 100 PZA","pza","SÍ",0,0],
    [123,"DES-029","Bolsa basura compostable gris","PZA","pza","SÍ",0,0],
    [124,"DES-030","Bolsa basura compostable verde","PZA","pza","SÍ",0,0],
    [125,"JAR-001","Fibra esponja Scotch","PZA","pza","SÍ",0,0],
    [126,"JAR-002","Microfibra amarilla","PZA","pza","SÍ",0,0],
    [127,"JAR-003","Microfibra verde","PZA","pza","SÍ",0,0],
    [128,"JAR-004","Microfibra azul","PZA","pza","SÍ",0,0],
    [129,"JAR-005","Piedra pómez para pulir","PZA","pza","SÍ",0,0],
    [130,"JAR-006","Gel sanitizante","BOT 1 LT","lt","SÍ",0,0],
    [131,"JAR-007","Cafiza","BOT 1 kg","kg","SÍ",0,0],
  ];
}

function acercaDe() {
  SpreadsheetApp.getUi().alert(
    "⚙️ Mise — v1.5.0 Altair",
    "Suite Atelier · La Crêpe Parisienne · Grupo MYT\n\n" +
    "Sistema de inventario operativo para bodega.\n" +
    "Quiosco de Picking · Remote Push Auto-Sync · Stock de Quiosco · 2 bodegas · Historial semanal",
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

// ── ACCIONES EN LOTE Y CARGA MASIVA DE BODEGA ────────────────────────────────
function desactivarSeleccionadosMaestro() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const maestro = ss.getSheetByName(SHEET_MAESTRO);
  if (!maestro) return;
  const lr = maestro.getLastRow();
  if (lr < MAESTRO_START) return;
  const count = lr - MAESTRO_START + 1;
  const map = _getMaestroHeaderMap(maestro);
  const cAct = map["ACTIVO"] ? map["ACTIVO"].index : 5;
  const cSel = map["SELECCIONAR"] ? map["SELECCIONAR"].index : 12;

  const rangeMaestro = maestro.getRange(MAESTRO_START, 1, count, maestro.getLastColumn());
  const valuesMaestro = rangeMaestro.getValues();
  
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    SpreadsheetApp.getUi().alert("El archivo está ocupado. Intenta de nuevo.");
    return;
  }
  
  try {
    let affected = 0;
    for (let i = 0; i < count; i++) {
      if (valuesMaestro[i][cSel] === true) {
        valuesMaestro[i][cAct] = "NO";
        valuesMaestro[i][cSel] = false;
        const kardexRow = KARDEX_START + i;
        Object.values(BODEGAS).forEach(b => {
          const kSheet = ss.getSheetByName(b.kardex);
          if (kSheet) kSheet.hideRows(kardexRow);
        });
        affected++;
      }
    }
    if (affected > 0) {
      rangeMaestro.setValues(valuesMaestro);
      _buildVista("BA");
      _buildVista("BM");
      sincronizarRemotamenteTiendasPush();
      SpreadsheetApp.getActive().toast(`Se desactivaron ${affected} productos ✓`, "⚙️ Mise", 4);
    }
  } finally {
    lock.releaseLock();
  }
}

function activarSeleccionadosMaestro() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const maestro = ss.getSheetByName(SHEET_MAESTRO);
  if (!maestro) return;
  const lr = maestro.getLastRow();
  if (lr < MAESTRO_START) return;
  const count = lr - MAESTRO_START + 1;
  const map = _getMaestroHeaderMap(maestro);
  const cAct = map["ACTIVO"] ? map["ACTIVO"].index : 5;
  const cSel = map["SELECCIONAR"] ? map["SELECCIONAR"].index : 12;

  const rangeMaestro = maestro.getRange(MAESTRO_START, 1, count, maestro.getLastColumn());
  const valuesMaestro = rangeMaestro.getValues();
  
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    SpreadsheetApp.getUi().alert("El archivo está ocupado. Intenta de nuevo.");
    return;
  }
  
  try {
    let affected = 0;
    for (let i = 0; i < count; i++) {
      if (valuesMaestro[i][cSel] === true) {
        valuesMaestro[i][cAct] = "SÍ";
        valuesMaestro[i][cSel] = false;
        const kardexRow = KARDEX_START + i;
        Object.values(BODEGAS).forEach(b => {
          const kSheet = ss.getSheetByName(b.kardex);
          if (kSheet) kSheet.showRows(kardexRow);
        });
        affected++;
      }
    }
    if (affected > 0) {
      rangeMaestro.setValues(valuesMaestro);
      _buildVista("BA");
      _buildVista("BM");
      sincronizarRemotamenteTiendasPush();
      // crearCaducidades(); // Feature deshabilitada
      SpreadsheetApp.getActive().toast(`Se activaron ${affected} productos ✓`, "⚙️ Mise", 4);
    }
  } finally {
    lock.releaseLock();
  }
}

function limpiarSeleccionMaestro() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const maestro = ss.getSheetByName(SHEET_MAESTRO);
  if (!maestro) return;
  const lr = maestro.getLastRow();
  if (lr < MAESTRO_START) return;
  const count = lr - MAESTRO_START + 1;
  const map = _getMaestroHeaderMap(maestro);
  const cSel = map["SELECCIONAR"] ? map["SELECCIONAR"].col : 13;
  maestro.getRange(MAESTRO_START, cSel, count, 1).setValue(false);
  SpreadsheetApp.getActive().toast("Selección limpiada ✓", "⚙️ Mise", 3);
}

function eliminarSeleccionadosMaestro() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const maestro = ss.getSheetByName(SHEET_MAESTRO);
  if (!maestro) return;
  const lr = maestro.getLastRow();
  if (lr < MAESTRO_START) return;
  const count = lr - MAESTRO_START + 1;
  const map = _getMaestroHeaderMap(maestro);
  const cSel = map["SELECCIONAR"] ? map["SELECCIONAR"].index : 12;
  const cProd = map["PRODUCTO"] ? map["PRODUCTO"].index : 2;
  const data = maestro.getRange(MAESTRO_START, 1, count, maestro.getLastColumn()).getValues();
  
  // Encontrar filas seleccionadas
  const selectedRows = [];
  for (let i = 0; i < count; i++) {
    if (data[i][cSel] === true) {
      selectedRows.push(i);
    }
  }
  
  if (selectedRows.length === 0) {
    ui.alert("No hay productos seleccionados para eliminar.");
    return;
  }
  
  const nombres = selectedRows.map(i => data[i][cProd]).join(", ");
  const resp = ui.alert(
    "🗑 Eliminar Productos Definitivamente",
    `Se eliminarán ${selectedRows.length} producto(s) de TODAS las hojas (MAESTRO, KARDEX, HISTORIAL, CADUCIDADES):\n\n${nombres}\n\nEsta acción NO se puede deshacer. ¿Continuar?`,
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;
  
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) { ui.alert("El archivo está ocupado."); return; }
  
  try {
    SpreadsheetApp.getActive().toast("⏳ Eliminando productos seleccionados de todas las hojas...", "⚙️ Mise", 5);
    // Eliminar de abajo hacia arriba para no desplazar índices
    for (let i = selectedRows.length - 1; i >= 0; i--) {
      const rowIdx = selectedRows[i];
      const maestroRow = MAESTRO_START + rowIdx;
      const kardexRow = KARDEX_START + rowIdx;
      
      // Eliminar de MAESTRO
      maestro.deleteRow(maestroRow);
      
      // Eliminar de KARDEX
      Object.values(BODEGAS).forEach(b => {
        const kSheet = ss.getSheetByName(b.kardex);
        if (kSheet && kardexRow <= kSheet.getLastRow()) {
          kSheet.deleteRow(kardexRow);
        }
      });
      
      // Eliminar de HISTORIAL
      Object.values(BODEGAS).forEach(b => {
        const hSheet = ss.getSheetByName(`HISTORIAL_${b.key}`);
        const histRow = 4 + rowIdx; // historial starts at row 5 (header rows 1-4)
        if (hSheet && histRow <= hSheet.getLastRow()) {
          hSheet.deleteRow(histRow + 1);
        }
      });
    }
    
    // Re-numerar y re-formatear
    _ordenarYRenumerarTodo();
    
    // Recrear vistas y caducidades
    _buildVista("BA");
    _buildVista("BM");
    // crearCaducidades(); // Feature deshabilitada
    
    SpreadsheetApp.getActive().toast("✅ Eliminación completada", "⚙️ Mise", 4);
    ui.alert("✅ Eliminación completada", `Se eliminaron ${selectedRows.length} producto(s) definitivamente.`, ui.ButtonSet.OK);
    _log("eliminarSeleccionadosMaestro", `Eliminados: ${nombres}`);
  } finally {
    lock.releaseLock();
  }
}

function eliminarDuplicadosCatalogo() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const maestro = ss.getSheetByName(SHEET_MAESTRO);
  if (!maestro) return;
  const lr = maestro.getLastRow();
  if (lr < MAESTRO_START) {
    ui.alert("No hay productos en MAESTRO.");
    return;
  }
  const count = lr - MAESTRO_START + 1;
  const data = maestro.getRange(MAESTRO_START, 1, count, MAESTRO_COLS).getValues();
  
  // Buscar duplicados (Misma Categoría + Producto + Presentación)
  const seenKeys = {};
  const duplicateIndices = [];
  const duplicateNames = [];
  
  for (let i = 0; i < count; i++) {
    const cat = String(data[i][2]).trim().toUpperCase();
    const prod = String(data[i][3]).trim().toUpperCase();
    const pres = String(data[i][4]).trim().toUpperCase();
    const key = `${cat}|${prod}|${pres}`;
    
    if (seenKeys[key]) {
      duplicateIndices.push(i);
      duplicateNames.push(data[i][3]); // Guardar nombre para mostrar al usuario
    } else {
      seenKeys[key] = true;
    }
  }
  
  if (duplicateIndices.length === 0) {
    ui.alert("🧹 Sin duplicados", "No se encontraron productos duplicados en el catálogo.", ui.ButtonSet.OK);
    return;
  }
  
  const resp = ui.alert(
    "🧹 Eliminar Productos Duplicados",
    `Se encontraron ${duplicateIndices.length} producto(s) duplicado(s) en el catálogo:\n\n${duplicateNames.join(", ")}\n\n¿Deseas eliminarlos de todas las hojas (MAESTRO, KARDEX, HISTORIAL) conservando solo el primer registro de cada uno?\n\nEsta acción NO se puede deshacer.`,
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;
  
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    ui.alert("El archivo está ocupado. Inténtalo de nuevo.");
    return;
  }
  
  try {
    SpreadsheetApp.getActive().toast("⏳ Eliminando duplicados de todas las hojas...", "🧹 Limpiar Duplicados", 5);
    
    // Eliminar de abajo hacia arriba para mantener estables los índices de fila
    for (let i = duplicateIndices.length - 1; i >= 0; i--) {
      const rowIdx = duplicateIndices[i];
      const maestroRow = MAESTRO_START + rowIdx;
      const kardexRow = KARDEX_START + rowIdx;
      
      // 1. Eliminar de MAESTRO
      maestro.deleteRow(maestroRow);
      
      // 2. Eliminar de KARDEX
      Object.values(BODEGAS).forEach(b => {
        const kSheet = ss.getSheetByName(b.kardex);
        if (kSheet && kardexRow <= kSheet.getLastRow()) {
          kSheet.deleteRow(kardexRow);
        }
      });
      
      // 3. Eliminar de HISTORIAL
      Object.values(BODEGAS).forEach(b => {
        const hSheet = ss.getSheetByName(`HISTORIAL_${b.key}`);
        const histRow = 4 + rowIdx; // historial starts at row 5
        if (hSheet && histRow <= hSheet.getLastRow()) {
          hSheet.deleteRow(histRow + 1);
        }
      });
    }
    
    // Re-ordenar, re-numerar y actualizar vistas
    _ordenarYRenumerarTodo();
    _buildVista("BA");
    _buildVista("BM");
    
    SpreadsheetApp.getActive().toast("✅ Duplicados eliminados con éxito", "🧹 Limpiar Duplicados", 4);
    ui.alert("✅ Limpieza completada", `Se eliminaron ${duplicateIndices.length} producto(s) duplicado(s) de todas las hojas.`, ui.ButtonSet.OK);
    _log("eliminarDuplicadosCatalogo", `Eliminados ${duplicateIndices.length} duplicados: ${duplicateNames.join(", ")}`);
  } catch (err) {
    SpreadsheetApp.getActive().toast("❌ Error al limpiar duplicados: " + err.message, "🧹 Limpiar Duplicados", 5);
  } finally {
    lock.releaseLock();
  }
}

function _ordenarYRenumerarTodo() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const maestro = ss.getSheetByName(SHEET_MAESTRO);
  if (!maestro) return;
  const lr = maestro.getLastRow();
  if (lr < MAESTRO_START) return;
  const count = lr - MAESTRO_START + 1;
  const map = _getMaestroHeaderMap(maestro);

  const cCat  = map["CATEGORÍA"]    ? map["CATEGORÍA"].index    : 1;
  const cProd = map["PRODUCTO"]     ? map["PRODUCTO"].index     : 2;
  const cPres = map["PRESENTACION"] ? map["PRESENTACION"].index : 3;
  const cUni  = map["UNIDAD"]       ? map["UNIDAD"].index       : 4;
  const cSel  = map["SELECCIONAR"] ? map["SELECCIONAR"].index : 12;
  const lProd = map["PRODUCTO"] ? map["PRODUCTO"].letter : "C";

  const lMinBA = map["MÍN_BA"]   ? map["MÍN_BA"].letter   : "G";
  const lMaxBA = map["MÁX_BA"]   ? map["MÁX_BA"].letter   : "H";
  const cStkBA = map["STOCK_BA"] ? map["STOCK_BA"].col    : 9;
  const idxMinBA = map["MÍN_BA"] && map["PRODUCTO"] ? (map["MÍN_BA"].col - map["PRODUCTO"].col + 1) : 5;
  const idxMaxBA = map["MÁX_BA"] && map["PRODUCTO"] ? (map["MÁX_BA"].col - map["PRODUCTO"].col + 1) : 6;

  const lMinBM = map["MÍN_BM"]   ? map["MÍN_BM"].letter   : "J";
  const lMaxBM = map["MÁX_BM"]   ? map["MÁX_BM"].letter   : "K";
  const cStkBM = map["STOCK_BM"] ? map["STOCK_BM"].col    : 12;
  const idxMinBM = map["MÍN_BM"] && map["PRODUCTO"] ? (map["MÍN_BM"].col - map["PRODUCTO"].col + 1) : 8;
  const idxMaxBM = map["MÁX_BM"] && map["PRODUCTO"] ? (map["MÁX_BM"].col - map["PRODUCTO"].col + 1) : 9;
  
  // 1. Leer datos de MAESTRO y filtrar estrictamente solo productos con CATEGORÍA y NOMBRE válidos
  const rawRange = maestro.getRange(MAESTRO_START, 1, count, maestro.getLastColumn());
  try { rawRange.clearDataValidations(); } catch(e) {}
  const rawData = rawRange.getValues();
  
  // Auditar y enviar huérfanos a Cuarentena antes de purgar
  const ssCuarentena = SpreadsheetApp.getActiveSpreadsheet();
  let qSheet = ssCuarentena.getSheetByName("⚠️ REVISIÓN_HUÉRFANOS");
  if (!qSheet) {
    qSheet = ssCuarentena.insertSheet("⚠️ REVISIÓN_HUÉRFANOS");
    qSheet.appendRow(["FECHA_DETECCIÓN", "ORIGEN", "FILA_ORIGINAL", "TEXTO_INGRESADO", "VALORES_DETECTADOS", "ESTADO_RESOLUCIÓN", "NOTAS"]);
    qSheet.getRange(1, 1, 1, 7).setBackground("#78281F").setFontColor("#FFFFFF").setFontWeight("bold");
    qSheet.setFrozenRows(1);
  }

  const data = [];
  const purgados = [];
  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i];
    const cat = String(row[cCat] || '').trim();
    const prod = String(row[cProd] || '').trim();
    const num = row[0];

    // Criterio estricto de catálogo oficial: Debe tener Nombre y Categoría no vacíos
    if (prod !== "" && cat !== "") {
      data.push(row);
    } else if (prod !== "" || cat !== "") {
      purgados.push(prod || `Fila ${MAESTRO_START + i}`);
      qSheet.appendRow([
        new Date(),
        "MAESTRO",
        MAESTRO_START + i,
        prod || "[Sin Nombre]",
        JSON.stringify(row.filter(c => c !== "")),
        "PURGADO",
        "Insumo huérfano purgado automáticamente del catálogo."
      ]);
    }
  }

  if (purgados.length > 0) {
    MiseLogger.warn("_ordenarYRenumerarTodo", `Purga: Se eliminaron ${purgados.length} filas huérfanas: [${purgados.join(", ")}]`);
  }

  // Si no hay datos válidos, retornar
  if (data.length === 0) return;
  
  const cAct = map["ACTIVO"] ? map["ACTIVO"].index : 5;

  // 2. Ordenar estrictamente por CATEGORÍA (según CATEGORIAS_LISTA) y luego PRODUCTO
  data.sort((a, b) => {
    // 2.1. Categoría
    const catA = String(a[cCat] || '').trim();
    const catB = String(b[cCat] || '').trim();
    const idxA = CATEGORIAS_LISTA.indexOf(catA);
    const idxB = CATEGORIAS_LISTA.indexOf(catB);
    
    if (idxA !== -1 && idxB !== -1) {
      if (idxA !== idxB) return idxA - idxB;
    } else if (idxA !== -1) {
      return -1;
    } else if (idxB !== -1) {
      return 1;
    } else if (catA !== catB) {
      return catA.localeCompare(catB);
    }
    
    // 2.2. Producto
    const prodA = String(a[cProd] || '').trim().toLowerCase();
    const prodB = String(b[cProd] || '').trim().toLowerCase();
    return prodA.localeCompare(prodB);
  });
  
  // 3. Re-numerar y limpiar selección
  for (let i = 0; i < data.length; i++) {
    data[i][0] = i + 1;
    data[i][cSel] = false;
  }
  
  // 4. Limpiar todo el rango original de MAESTRO y reescribir únicamente las filas oficiales válidas
  rawRange.clearContent().clearFormat().clearDataValidations();
  const range = maestro.getRange(MAESTRO_START, 1, data.length, maestro.getLastColumn());
  range.setValues(data);

  // Si había más filas en MAESTRO abajo, limpiar cualquier remanente
  const totalMaxRows = maestro.getMaxRows();
  const endDataRow = MAESTRO_START + data.length - 1;
  if (totalMaxRows > endDataRow) {
    const trailingRows = totalMaxRows - endDataRow;
    try {
      maestro.getRange(endDataRow + 1, 1, trailingRows, maestro.getMaxColumns())
        .clearContent()
        .clearFormat()
        .clearDataValidations()
        .setBackground(null);
    } catch(e) {}
  }
  
  // 5. Inyectar fórmulas dinámicas de stock en MAESTRO (Batch Único)
  const formulasBA = new Array(data.length);
  const formulasBM = new Array(data.length);
  for (let i = 0; i < data.length; i++) {
    const rn = MAESTRO_START + i;
    const fBA = `=IFERROR(VLOOKUP(${lProd}${rn}, 'KARDEX_BA'!C:AD, 26, FALSE), 0) & IF(AND(${lMinBA}${rn}=0, ${lMaxBA}${rn}=0), "", IF(VLOOKUP(${lProd}${rn}, 'KARDEX_BA'!C:AD, 26, FALSE)<${lMinBA}${rn}, " (-" & (${lMinBA}${rn}-VLOOKUP(${lProd}${rn}, 'KARDEX_BA'!C:AD, 26, FALSE)) & ")", IF(VLOOKUP(${lProd}${rn}, 'KARDEX_BA'!C:AD, 26, FALSE)>${lMaxBA}${rn}, " (+" & (VLOOKUP(${lProd}${rn}, 'KARDEX_BA'!C:AD, 26, FALSE)-${lMaxBA}${rn}) & ")", " (-)")))`;
    const fBM = `=IFERROR(VLOOKUP(${lProd}${rn}, 'KARDEX_BM'!C:AD, 26, FALSE), 0) & IF(AND(${lMinBM}${rn}=0, ${lMaxBM}${rn}=0), "", IF(VLOOKUP(${lProd}${rn}, 'KARDEX_BM'!C:AD, 26, FALSE)<${lMinBM}${rn}, " (-" & (${lMinBM}${rn}-VLOOKUP(${lProd}${rn}, 'KARDEX_BM'!C:AD, 26, FALSE)) & ")", IF(VLOOKUP(${lProd}${rn}, 'KARDEX_BM'!C:AD, 26, FALSE)>${lMaxBM}${rn}, " (+" & (VLOOKUP(${lProd}${rn}, 'KARDEX_BM'!C:AD, 26, FALSE)-${lMaxBM}${rn}) & ")", " (-)")))`;
    formulasBA[i] = [fBA];
    formulasBM[i] = [fBM];
  }
  maestro.getRange(MAESTRO_START, cStkBA, data.length, 1).setFormulas(formulasBA);
  maestro.getRange(MAESTRO_START, cStkBM, data.length, 1).setFormulas(formulasBM);
  
  // Formatos visuales en MAESTRO
  const bgs = data.map((_, i) => Array(maestro.getLastColumn()).fill(i % 2 === 0 ? C.rowA : C.rowB));
  range.setBackgrounds(bgs);
  _aplicarReglasMaestro(maestro);
  
  // 6. Reconstruir KARDEX con los datos re-ordenados y LIMPIAR filas sobrantes en KARDEX
  Object.values(BODEGAS).forEach(b => {
    const kSheet = ss.getSheetByName(b.kardex);
    if (!kSheet) return;
    const klr = kSheet.getLastRow();
    if (klr < KARDEX_START) return;
    const kCount = klr - KARDEX_START + 1;
    
    // Leer datos existentes del Kardex (preservar CADUCIDAD, LOTE, SALDO ANT, ENT, SAL)
    const kRange = kSheet.getRange(KARDEX_START, 1, kCount, KARDEX_TOTAL_COLS);
    const kData = kRange.getValues();
    
    const kMap = {};
    const listaOficiales = data.map(d => String(d[cProd] || "").trim()).filter(n => n !== "");
    const aliasDict = (typeof MiseMatchingEngine !== "undefined") ? MiseMatchingEngine.obtenerDiccionarioAlias(ss) : {};

    for (let i = 0; i < kCount; i++) {
      const rowK = kData[i];
      const nombre = String(rowK[2] || "").trim();
      if (nombre) {
        let matchOficial = null;

        if (typeof MiseMatchingEngine !== "undefined") {
          const res = MiseMatchingEngine.evaluarMatch(nombre, listaOficiales, aliasDict);
          if (res.estado === "MATCH" && res.match) {
            matchOficial = res.match;
            // Si es un alias nuevo con alta certeza, registrarlo en el diccionario de aprendizaje
            if (res.score < 1.0) {
              MiseMatchingEngine.registrarAlias(ss, nombre, matchOficial, res.score, "AUTÓNOMO");
            }
          }
        } else {
          const matchDirecto = listaOficiales.find(o => o.toLowerCase() === nombre.toLowerCase());
          if (matchDirecto) matchOficial = matchDirecto;
        }

        if (matchOficial) {
          kMap[matchOficial.toLowerCase()] = rowK;
        } else {
          // Si el producto en Kardex no es oficial ni coincide con margen seguro, mandarlo a cuarentena
          qSheet.appendRow([
            new Date(),
            b.kardex,
            KARDEX_START + i,
            nombre,
            JSON.stringify(rowK.filter(c => c !== "")),
            "PURGADO",
            "Insumo huérfano detectado en Kardex y derivado a cuarentena."
          ]);
        }
      }
    }
    
    const newKData = [];
    for (let i = 0; i < data.length; i++) {
      const prodName = String(data[i][cProd] || "").trim();
      const existing = kMap[prodName.toLowerCase()];
      if (existing) {
        existing[0] = data[i][0];     // No
        existing[1] = data[i][cCat];  // CATEGORÍA
        existing[2] = data[i][cProd]; // PRODUCTO
        existing[3] = data[i][cPres]; // PRESENTACIÓN
        existing[4] = data[i][cUni];  // UNIDAD
        newKData.push(existing);
      } else {
        const row = new Array(KARDEX_TOTAL_COLS).fill('');
        row[0] = data[i][0];     // No
        row[1] = data[i][cCat];  // CATEGORÍA
        row[2] = data[i][cProd]; // PRODUCTO
        row[3] = data[i][cPres]; // PRESENTACIÓN
        row[4] = data[i][cUni];  // UNIDAD
        newKData.push(row);
      }
    }

    // 1. Limpiar físicamente todo el rango anterior del Kardex para erradicar filas huérfanas
    kRange.clearContent().clearFormat();

    // 2. Auto-Reparación de Encabezados en Fila 5 y 6 (Seguro: des-combina antes para evitar error de intervalos combinados)
    try {
      kSheet.getRange(5, 10, 1, 21).breakApart(); // Des-combinar columnas J a AD en fila 5
      DIAS.forEach((dia, idx) => {
        const sc = 10 + idx * 3;
        const rDay = kSheet.getRange(5, sc, 1, 3);
        rDay.merge().setValue(dia)
          .setBackground(idx % 2 === 0 ? C.mdGreen : C.ltGreen)
          .setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(9).setHorizontalAlignment("center");
        kSheet.getRange(6, sc).setValue("ENT").setBackground(C.entBg).setFontColor(C.dkGreen).setFontWeight("bold").setFontSize(8).setHorizontalAlignment("center");
        kSheet.getRange(6, sc + 1).setValue("SAL").setBackground(C.salBg).setFontColor("#C62828").setFontWeight("bold").setFontSize(8).setHorizontalAlignment("center");
        kSheet.getRange(6, sc + 2).setValue("SLD").setBackground(C.dkGreen).setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(8).setHorizontalAlignment("center");
      });
    } catch(e) {}

    // CONSOLIDACIÓN BATCH I/O DE 1-SOLA INVOCACIÓN EN KARDEX
    const kLen = newKData.length;
    const fullKValues = new Array(kLen);
    const fullKBgs = new Array(kLen);

    for (let r = 0; r < kLen; r++) {
      const rn = KARDEX_START + r;
      const rowData = newKData[r];
      
      const valRow = new Array(KARDEX_TOTAL_COLS).fill('');
      valRow[0] = rowData[0]; // No
      valRow[1] = rowData[1]; // CAT
      valRow[2] = rowData[2]; // PROD
      valRow[3] = rowData[3]; // PRES
      valRow[4] = rowData[4]; // UND
      valRow[5] = rowData[5]; // CADUCIDAD
      valRow[6] = rowData[6]; // LOTE

      // Fórmula de Semáforo en Col H
      if (b.key === "BA") {
        valRow[7] = `=IF(AND(IFERROR(VLOOKUP(C${rn}, MAESTRO!${lProd}:${lMaxBA}, ${idxMinBA}, FALSE), 0)=0, IFERROR(VLOOKUP(C${rn}, MAESTRO!${lProd}:${lMaxBA}, ${idxMaxBA}, FALSE), 0)=0), "", IF(AD${rn}<IFERROR(VLOOKUP(C${rn}, MAESTRO!${lProd}:${lMaxBA}, ${idxMinBA}, FALSE), 0), "🔴 -" & (IFERROR(VLOOKUP(C${rn}, MAESTRO!${lProd}:${lMaxBA}, ${idxMinBA}, FALSE), 0)-AD${rn}), IF(AD${rn}>IFERROR(VLOOKUP(C${rn}, MAESTRO!${lProd}:${lMaxBA}, ${idxMaxBA}, FALSE), 0), "🔵 +" & (AD${rn}-IFERROR(VLOOKUP(C${rn}, MAESTRO!${lProd}:${lMaxBA}, ${idxMaxBA}, FALSE), 0)), "🟢 -")))`;
      } else {
        valRow[7] = `=IF(AND(IFERROR(VLOOKUP(C${rn}, MAESTRO!${lProd}:${lMaxBM}, ${idxMinBM}, FALSE), 0)=0, IFERROR(VLOOKUP(C${rn}, MAESTRO!${lProd}:${lMaxBM}, ${idxMinBM}, FALSE), 0)=0), "", IF(AD${rn}<IFERROR(VLOOKUP(C${rn}, MAESTRO!${lProd}:${lMaxBM}, ${idxMinBM}, FALSE), 0), "🔴 -" & (IFERROR(VLOOKUP(C${rn}, MAESTRO!${lProd}:${lMaxBM}, ${idxMinBM}, FALSE), 0)-AD${rn}), IF(AD${rn}>IFERROR(VLOOKUP(C${rn}, MAESTRO!${lProd}:${lMaxBM}, ${idxMinBM}, FALSE), 0), "🔵 +" & (AD${rn}-IFERROR(VLOOKUP(C${rn}, MAESTRO!${lProd}:${lMaxBM}, ${idxMinBM}, FALSE), 0)), "🟢 -")))`;
      }

      valRow[8] = rowData[8]; // SALDO ANT

      for (let d = 0; d < KARDEX_DAYS; d++) {
        valRow[9 + d * 3]  = rowData[9 + d * 3];  // ENT
        valRow[10 + d * 3] = rowData[10 + d * 3]; // SAL
        // Para d=0 (Lunes), el saldo previo es Col I (Saldo Anterior = col 9).
        // Para d>0, el saldo previo es el SLD del día anterior: Col L (12), Col O (15), Col R (18), etc.
        const prevCol = (d === 0) ? 9 : (12 + (d - 1) * 3);
        const entCol  = 10 + d * 3;
        const salCol  = 11 + d * 3;
        valRow[11 + d * 3] = '=' + _col(prevCol) + rn + '+IFERROR(' + _col(entCol) + rn + ',0)-IFERROR(' + _col(salCol) + rn + ',0)'; // SLD
      }
      fullKValues[r] = valRow;

      const bgRow = new Array(KARDEX_TOTAL_COLS).fill(r % 2 === 0 ? C.rowA : C.rowB);
      bgRow[8] = C.iceBlue;
      for (let d = 0; d < KARDEX_DAYS; d++) {
        bgRow[9 + d * 3]  = C.entBg;
        bgRow[10 + d * 3] = C.salBg;
        bgRow[11 + d * 3] = C.iceBlue;
      }
      fullKBgs[r] = bgRow;
    }

    // Inyección de valores limpios oficiales
    const kRangeBatch = kSheet.getRange(KARDEX_START, 1, kLen, KARDEX_TOTAL_COLS);
    kRangeBatch.setValues(fullKValues);
    kRangeBatch.setBackgrounds(fullKBgs);

    // Limpiar cualquier fila residual sobrante abajo en KARDEX
    const totalMaxKRows = kSheet.getMaxRows();
    const endKDataRow = KARDEX_START + kLen - 1;
    if (totalMaxKRows > endKDataRow) {
      const trailingKRows = totalMaxKRows - endKDataRow;
      try {
        kSheet.getRange(endKDataRow + 1, 1, trailingKRows, kSheet.getMaxColumns())
          .clearContent()
          .clearFormat()
          .clearDataValidations()
          .setBackground(null);
      } catch(e) {}
    }

    // Mostrar todas las filas y ocultar limpiamente las que corresponden a productos inactivos (ACTIVO === "NO")
    try {
      kSheet.showRows(KARDEX_START, kLen);
      let startHide = -1;
      let hideCount = 0;
      for (let r = 0; r < data.length; r++) {
        const isInactive = (String(data[r][cAct] || "").trim().toUpperCase() === "NO");
        const row = KARDEX_START + r;
        if (isInactive) {
          if (startHide === -1) {
            startHide = row;
            hideCount = 1;
          } else {
            hideCount++;
          }
        } else {
          if (startHide !== -1) {
            kSheet.hideRows(startHide, hideCount);
            startHide = -1;
            hideCount = 0;
          }
        }
      }
      if (startHide !== -1) {
        kSheet.hideRows(startHide, hideCount);
      }
    } catch(e) {}

    // Recrear filtro de forma segura
    try {
      if (kSheet.getFilter()) {
        kSheet.getFilter().remove();
      }
      kSheet.getRange(6, 1, kLen + 1, KARDEX_TOTAL_COLS).createFilter();
    } catch(e) {}
  });

  try {
    if (maestro.getFilter()) {
      maestro.getFilter().remove();
    }
    maestro.getRange(3, 1, data.length + 1, MAESTRO_COLS).createFilter();
  } catch(e) {}

  // Restaurar validaciones y checkboxes en MAESTRO para la longitud exacta de productos
  try {
    restaurarValidacionesMaestro();
  } catch(e) {}
  
  _log("_ordenarYRenumerarTodo", `Re-ordenado y re-numerado: ${data.length} productos`);
}

// ── RECONSTRUCTORES DE HOJAS CON RESPALDO EN MEMORIA (IN-RAM RESILIENT HEALING) ──
function reconstruirKardexBAConRespaldo() {
  _reconstruirKardexConRespaldo("BA");
}

function reconstruirKardexBMConRespaldo() {
  _reconstruirKardexConRespaldo("BM");
}

function _reconstruirKardexConRespaldo(key) {
  const tId = MiseLogger.timeStart(`_reconstruirKardexConRespaldo_${key}`);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const bodega = BODEGAS[key];
  const kSheet = ss.getSheetByName(bodega.kardex);
  if (!kSheet) return;

  const ui = SpreadsheetApp.getUi();
  const confirm = ui.alert(
    `🏗️ Reconstruir ${bodega.kardex}`,
    `Esta acción respaldará todos los saldos y movimientos en memoria RAM, limpiará la estructura completa de la hoja (eliminando celdas rotas o columnas desfasadas) y reconstruirá la cuadrícula con formato perfecto.\n\n¿Deseas continuar?`,
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  try {
    SpreadsheetApp.getActive().toast(`Respaldando datos de ${bodega.kardex} en memoria...`, "🏗️ Reconstructor", 5);

    // 1. RESPALDO TEMPORAL EN MEMORIA RAM
    const klr = kSheet.getLastRow();
    const snapMovimientos = {};
    let fechaIniGuardada = kSheet.getRange("G4").getValue();

    if (klr >= KARDEX_START) {
      const kRange = kSheet.getRange(KARDEX_START, 1, klr - KARDEX_START + 1, kSheet.getLastColumn());
      const kData = kRange.getValues();

      kData.forEach(row => {
        const prod = String(row[2] || "").trim().toLowerCase();
        if (prod) {
          // Guardar Saldo Anterior (Col I = index 8) y los 7 días (ENT, SAL)
          const movs = [];
          for (let d = 0; d < 7; d++) {
            movs.push({
              ent: row[9 + d * 3] !== "" ? row[9 + d * 3] : "",
              sal: row[10 + d * 3] !== "" ? row[10 + d * 3] : ""
            });
          }
          snapMovimientos[prod] = {
            caducidad: row[5] || "",
            lote: row[6] || "",
            saldoAnt: row[8] !== "" ? row[8] : "",
            movs: movs
          };
        }
      });
    }

    // 2. LIMPIEZA TOTAL Y RECONSTRUCCIÓN ESTRUCTURAL DE LA HOJA
    SpreadsheetApp.getActive().toast(`Reconstruyendo cuadrícula y fórmulas de ${bodega.kardex}...`, "🏗️ Reconstructor", 5);
    kSheet.clear();
    kSheet.clearConditionalFormatRules();
    kSheet.setHiddenGridlines(false);
    kSheet.setFrozenRows(0);
    kSheet.setFrozenColumns(0);

    // Re-crear estructura nativa (Filas 1-6 y columnas A-AD)
    _buildKardex(kSheet, bodega.nombre);
    if (fechaIniGuardada && !isNaN(new Date(fechaIniGuardada).getTime())) {
      kSheet.getRange("G4").setValue(fechaIniGuardada);
    } else {
      kSheet.getRange("G4").setValue(new Date());
    }

    // 3. POBLAR DESDE MAESTRO OFICIAL
    _poblarKardex(kSheet);

    // 4. RESTAURAR MOVIMIENTOS DESDE EL RESPALDO EN MEMORIA (CON RECONCILIADOR MATEMÁTICO)
    const newKlr = kSheet.getLastRow();
    if (newKlr >= KARDEX_START) {
      const newCount = newKlr - KARDEX_START + 1;
      const readRange = kSheet.getRange(KARDEX_START, 1, newCount, KARDEX_TOTAL_COLS);
      const readData = readRange.getValues();
      const listaOficiales = readData.map(r => String(r[2] || "").trim()).filter(n => n !== "");
      const aliasDict = (typeof MiseMatchingEngine !== "undefined") ? MiseMatchingEngine.obtenerDiccionarioAlias(ss) : {};

      // Mapear cada elemento del snap a su producto oficial y enviar a cuarentena los no reconocidos
      const snapOficializado = {};
      const noMapeados = [];

      Object.keys(snapMovimientos).forEach(rawProdName => {
        const snap = snapMovimientos[rawProdName];
        let targetOficial = null;

        if (typeof MiseMatchingEngine !== "undefined") {
          const res = MiseMatchingEngine.evaluarMatch(rawProdName, listaOficiales, aliasDict);
          if (res.estado === "MATCH" && res.match) {
            targetOficial = res.match.toLowerCase();
            if (res.score < 1.0) {
              MiseMatchingEngine.registrarAlias(ss, rawProdName, res.match, res.score, "AUTÓNOMO");
            }
          }
        } else {
          const matchDirecto = listaOficiales.find(o => o.toLowerCase() === rawProdName.toLowerCase());
          if (matchDirecto) targetOficial = matchDirecto.toLowerCase();
        }

        if (targetOficial) {
          snapOficializado[targetOficial] = snap;
        } else {
          noMapeados.push({ nombre: rawProdName, snap: snap });
        }
      });

      // Si hubo insumos que no hicieron match con ningún producto oficial, registrarlos en Cuarentena
      if (noMapeados.length > 0) {
        let qSheet = ss.getSheetByName("⚠️ REVISIÓN_HUÉRFANOS");
        if (!qSheet) {
          qSheet = ss.insertSheet("⚠️ REVISIÓN_HUÉRFANOS");
          qSheet.appendRow(["FECHA_DETECCIÓN", "ORIGEN", "FILA_ORIGINAL", "TEXTO_INGRESADO", "VALORES_DETECTADOS", "ESTADO_RESOLUCIÓN", "NOTAS"]);
          qSheet.getRange(1, 1, 1, 7).setBackground("#78281F").setFontColor("#FFFFFF").setFontWeight("bold");
          qSheet.setFrozenRows(1);
        }
        noMapeados.forEach(item => {
          qSheet.appendRow([
            new Date(),
            bodega.kardex,
            "—",
            item.nombre,
            JSON.stringify(item.snap),
            "PURGADO",
            "Insumo huérfano purgado durante la reconstrucción de la hoja."
          ]);
        });
      }

      for (let i = 0; i < newCount; i++) {
        const prod = String(readData[i][2] || "").trim().toLowerCase();
        const snap = snapOficializado[prod];
        if (snap) {
          readData[i][5] = snap.caducidad;
          readData[i][6] = snap.lote;
          readData[i][8] = snap.saldoAnt;
          for (let d = 0; d < 7; d++) {
            readData[i][9 + d * 3]  = snap.movs[d].ent;
            readData[i][10 + d * 3] = snap.movs[d].sal;
          }
        }
      }

      readRange.setValues(readData);
    }

    // 5. RECONSTRUIR VISTA MÓVIL Y BLINDAJE
    _buildVista(key);
    protegerKardexSeguro(kSheet);

    const dur = MiseLogger.timeEnd(tId);
    MiseLogger.info("_reconstruirKardexConRespaldo", `Hoja ${bodega.kardex} reconstruida con éxito y datos restaurados.`, dur);
    ui.alert("✅ Reconstrucción Exitosa", `La hoja ${bodega.kardex} ha sido limpiada y reconstruida desde cero.\n\nTodos los movimientos, fechas y saldos fueron restaurados con éxito desde la memoria RAM.`, ui.ButtonSet.OK);

  } catch(err) {
    const dur = MiseLogger.timeEnd(tId);
    MiseLogger.error("_reconstruirKardexConRespaldo", `Error reconstruyendo ${bodega.kardex}: ${err.message}`, err, dur);
    ui.alert("❌ Error en Reconstrucción", err.message, ui.ButtonSet.OK);
  }
}

function reconstruirMaestroConRespaldo() {
  const tId = MiseLogger.timeStart("reconstruirMaestroConRespaldo");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const maestro = ss.getSheetByName(SHEET_MAESTRO);
  if (!maestro) return;

  const ui = SpreadsheetApp.getUi();
  const confirm = ui.alert(
    "🏗️ Reconstruir MAESTRO",
    "Esta acción respaldará todos los mínimos, máximos y estados en memoria RAM, limpiará la estructura completa de MAESTRO y la reconstruirá con formato y validaciones perfectas.\n\n¿Deseas continuar?",
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  try {
    SpreadsheetApp.getActive().toast("Respaldando catálogo en memoria...", "🏗️ Reconstructor", 5);

    // 1. RESPALDO EN MEMORIA RAM
    const lr = maestro.getLastRow();
    const map = _getMaestroHeaderMap(maestro);
    const snapMaestro = {};

    if (lr >= MAESTRO_START) {
      const rawData = maestro.getRange(MAESTRO_START, 1, lr - MAESTRO_START + 1, maestro.getLastColumn()).getValues();
      const cProd = map["PRODUCTO"] ? map["PRODUCTO"].index : 2;
      const cCat  = map["CATEGORÍA"] ? map["CATEGORÍA"].index : 1;
      const cPres = map["PRESENTACION"] ? map["PRESENTACION"].index : 3;
      const cUni  = map["UNIDAD"] ? map["UNIDAD"].index : 4;
      const cAct  = map["ACTIVO"] ? map["ACTIVO"].index : 5;
      const cMinBA = map["MÍN_BA"] ? map["MÍN_BA"].index : 6;
      const cMaxBA = map["MÁX_BA"] ? map["MÁX_BA"].index : 7;
      const cMinBM = map["MÍN_BM"] ? map["MÍN_BM"].index : 9;
      const cMaxBM = map["MÁX_BM"] ? map["MÁX_BM"].index : 10;

      rawData.forEach(row => {
        const prod = String(row[cProd] || "").trim().toLowerCase();
        if (prod) {
          snapMaestro[prod] = {
            cat: row[cCat] || "",
            prodOriginal: row[cProd] || "",
            pres: row[cPres] || "",
            uni: row[cUni] || "",
            activo: row[cAct] || "SÍ",
            minBA: row[cMinBA] !== "" ? row[cMinBA] : 0,
            maxBA: row[cMaxBA] !== "" ? row[cMaxBA] : 0,
            minBM: row[cMinBM] !== "" ? row[cMinBM] : 0,
            maxBM: row[cMaxBM] !== "" ? row[cMaxBM] : 0
          };
        }
      });
    }

    // 2. LIMPIEZA TOTAL Y CONSTRUCCIÓN DE ESTRUCTURA BASE
    SpreadsheetApp.getActive().toast("Reconstruyendo MAESTRO...", "🏗️ Reconstructor", 5);
    maestro.clear();
    maestro.clearConditionalFormatRules();
    maestro.setHiddenGridlines(false);
    maestro.setFrozenRows(0);
    maestro.setFrozenColumns(0);

    // Asegurar dimensiones de columnas
    if (maestro.getMaxColumns() < 13) {
      maestro.insertColumnsAfter(maestro.getMaxColumns(), 13 - maestro.getMaxColumns());
    }

    // Fila 1: Banner Superior
    maestro.getRange("A1:M1").merge()
      .setValue("MISE — MAESTRO DE PRODUCTOS   |   La Crêpe Parisienne · Grupo MYT")
      .setBackground(C.dark).setFontColor("#FFFFFF").setFontWeight("bold")
      .setFontSize(11).setFontFamily("Arial").setHorizontalAlignment("center").setVerticalAlignment("middle");
    maestro.setRowHeight(1, 32);

    // Fila 2: Acciones por Lote
    maestro.getRange(2, 1, 1, 13).clearDataValidations().clearContent().setBackground(C.cream);
    maestro.getRange("A2:B2").merge()
      .setValue("⚠️ Acciones por lote:").setFontWeight("bold").setFontColor(C.dark)
      .setHorizontalAlignment("right").setVerticalAlignment("middle").setFontSize(9);
    maestro.getRange("C2").setValue("Desactivar").setFontWeight("bold").setFontColor(C.dark).setHorizontalAlignment("right").setVerticalAlignment("middle").setFontSize(9);
    maestro.getRange("D2").insertCheckboxes().setValue(false).setBackground(C.yellow);
    maestro.getRange("E2").setValue("Activar").setFontWeight("bold").setFontColor(C.dark).setHorizontalAlignment("right").setVerticalAlignment("middle").setFontSize(9);
    maestro.getRange("F2").insertCheckboxes().setValue(false).setBackground(C.yellow);
    maestro.getRange("G2").setValue("Eliminar Sel.").setFontWeight("bold").setFontColor(C.dark).setHorizontalAlignment("right").setVerticalAlignment("middle").setFontSize(9);
    maestro.getRange("H2").insertCheckboxes().setValue(false).setBackground(C.yellow);
    maestro.getRange("I2").setValue("Limpiar Sel.").setFontWeight("bold").setFontColor(C.dark).setHorizontalAlignment("right").setVerticalAlignment("middle").setFontSize(9);
    maestro.getRange("J2").insertCheckboxes().setValue(false).setBackground(C.yellow);
    maestro.setRowHeight(2, 24);

    // Fila 3: Encabezados Institucionales
    maestro.getRange(3, 1, 1, 13)
      .setValues([["No","CATEGORÍA","PRODUCTO","PRESENTACION","UNIDAD","ACTIVO","MÍN_BA","MÁX_BA","STOCK_BA","MÍN_BM","MÁX_BM","STOCK_BM","SELECCIONAR"]])
      .setBackground(C.sage).setFontColor("#FFFFFF").setFontWeight("bold")
      .setFontSize(10).setHorizontalAlignment("center");
    maestro.setRowHeight(3, 26);
    maestro.setFrozenRows(3);

    maestro.setColumnWidth(1, 32);   // No
    maestro.setColumnWidth(2, 140);  // CATEGORÍA
    maestro.setColumnWidth(3, 240);  // PRODUCTO
    maestro.setColumnWidth(4, 140);  // PRESENTACIÓN
    maestro.setColumnWidth(5, 70);   // UNIDAD
    maestro.setColumnWidth(6, 70);   // ACTIVO
    maestro.setColumnWidth(7, 95);   // MÍN_BA
    maestro.setColumnWidth(8, 95);   // MÁX_BA
    maestro.setColumnWidth(9, 110);  // STOCK_BA
    maestro.setColumnWidth(10, 95);  // MÍN_BM
    maestro.setColumnWidth(11, 95);  // MÁX_BM
    maestro.setColumnWidth(12, 110); // STOCK_BM
    maestro.setColumnWidth(13, 110); // SELECCIONAR

    // 3. RECONSTRUIR FILAS DESDE EL RESPALDO EN MEMORIA (O FALLBACK _catalogo)
    const prodsSnap = Object.keys(snapMaestro);
    let itemsToBuild = [];

    if (prodsSnap.length > 0) {
      prodsSnap.forEach(pKey => {
        const item = snapMaestro[pKey];
        itemsToBuild.push([
          0,
          item.cat,
          item.prodOriginal,
          item.pres,
          item.uni,
          item.activo || "SÍ",
          item.minBA,
          item.maxBA,
          "",
          item.minBM,
          item.maxBM,
          "",
          false
        ]);
      });
    } else {
      const catBase = _catalogo();
      itemsToBuild = catBase.map(r => [
        r[0],
        CATEGORIAS_MAP[r[1].split('-')[0]] || '',
        r[2],
        r[3],
        r[4],
        r[5] || 'SÍ',
        r[6],
        r[7],
        '',
        0,
        0,
        '',
        false
      ]);
    }

    const count = itemsToBuild.length;
    const dataRange = maestro.getRange(MAESTRO_START, 1, count, 13);
    dataRange.setValues(itemsToBuild);

    // Formatos visuales de fila
    const bgs = itemsToBuild.map((_, i) => Array(13).fill(i % 2 === 0 ? C.rowA : C.rowB));
    dataRange.setBackgrounds(bgs);

    // 4. RESTAURAR VALIDACIONES, ORDENAMIENTO Y BLINDAJE
    restaurarValidacionesMaestro();
    _ordenarYRenumerarTodo();
    protegerMaestroSeguro();

    const dur = MiseLogger.timeEnd(tId);
    MiseLogger.info("reconstruirMaestroConRespaldo", `Hoja MAESTRO reconstruida con éxito (${count} productos preservados).`, dur);
    ui.alert("✅ Reconstrucción Exitosa", `La hoja MAESTRO ha sido reconstruida desde cero.\n\nSe preservaron ${count} productos con sus mínimos, máximos, categorías y estados (SÍ/NO) intactos.`, ui.ButtonSet.OK);

  } catch(err) {
    const dur = MiseLogger.timeEnd(tId);
    MiseLogger.error("reconstruirMaestroConRespaldo", `Error reconstruyendo MAESTRO: ${err.message}`, err, dur);
    ui.alert("❌ Error en Reconstrucción", err.message, ui.ButtonSet.OK);
  }
}

// ── MODAL HTML ASISTIDO: RECONCILIADOR INTELIGENTE (HUMAN-IN-THE-LOOP) ────────
function abrirReconciliadorInteligenteHTML() {
  const html = HtmlService.createHtmlOutput(`
<!DOCTYPE html>
<html>
<head>
  <base target="_top">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background: #F8F9FA; color: #2D3748; }
    .header { margin-bottom: 20px; }
    h2 { margin: 0 0 6px 0; color: #1A365D; font-size: 18px; display: flex; align-items: center; gap: 8px; }
    p { margin: 0; font-size: 13px; color: #718096; }
    .card { background: #FFFFFF; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.06); padding: 16px; margin-bottom: 14px; border-left: 4px solid #3182CE; }
    .card-title { font-weight: bold; font-size: 14px; color: #2B6CB0; margin-bottom: 8px; }
    .card-detail { font-size: 12px; color: #4A5568; margin-bottom: 12px; }
    .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; background: #EBF8FF; color: #2B6CB0; }
    .score-badge { float: right; font-size: 12px; font-weight: bold; color: #2F855A; }
    select { width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid #CBD5E0; font-size: 13px; margin-bottom: 10px; }
    .btn-group { display: flex; gap: 8px; justify-content: flex-end; }
    button { padding: 7px 14px; border-radius: 6px; border: none; font-size: 12px; font-weight: bold; cursor: pointer; transition: 0.2s; }
    .btn-primary { background: #3182CE; color: #FFFFFF; }
    .btn-primary:hover { background: #2B6CB0; }
    .btn-danger { background: #E2E8F0; color: #4A5568; }
    .btn-danger:hover { background: #CBD5E0; }
    .empty-state { text-align: center; padding: 40px 20px; color: #718096; }
    .loading { text-align: center; padding: 30px; font-size: 14px; color: #4A5568; }
  </style>
</head>
<body>
  <div class="header">
    <h2>🧠 Reconciliador Inteligente de Insumos</h2>
    <p>Revisa y resuelve discrepancias de nombres detectadas en Kardex y Cuarentena.</p>
  </div>

  <div id="content">
    <div class="loading">🔍 Escaneando insumos y analizando similitudes...</div>
  </div>

  <script>
    google.script.run.withSuccessHandler(renderizarCasos).obtenerCasosReconciliacion();

    function renderizarCasos(data) {
      const container = document.getElementById("content");
      if (!data || data.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>✨ Todo en Orden</h3><p>No hay insumos pendientes de reconciliación en este momento.</p></div>';
        return;
      }

      let html = '';
      data.forEach((item, idx) => {
        html += \`
          <div class="card" id="card-\${idx}">
            <div class="card-title">
              <span class="badge">\${item.origen}</span> \${item.textoIngresado}
              <span class="score-badge">\${Math.round(item.score * 100)}% Similitud</span>
            </div>
            <div class="card-detail">Valores detectados: <b>\${item.valores}</b></div>
            <label style="font-size:12px; font-weight:bold; color:#4A5568;">Vincular al producto oficial:</label>
            <select id="sel-\${idx}">
              \${item.opciones.map(op => \`<option value="\${op}" \${op === item.candidatoSugerido ? 'selected' : ''}>\${op}</option>\`).join('')}
            </select>
            <div class="btn-group">
              <button class="btn-danger" onclick="ignorarCaso(\${idx}, '\${item.origen}', \${item.filaOriginal})">Mandar a Cuarentena</button>
              <button class="btn-primary" onclick="vincularCaso(\${idx}, '\${item.textoIngresado}', \${item.filaCuarentena})">Vincular y Aprender</button>
            </div>
          </div>
        \`;
      });
      container.innerHTML = html;
    }

    function vincularCaso(idx, textoIngresado, filaCuarentena) {
      const sel = document.getElementById('sel-' + idx);
      const prodOficial = sel.value;
      document.getElementById('card-' + idx).style.opacity = '0.5';
      google.script.run.withSuccessHandler(() => {
        document.getElementById('card-' + idx).remove();
        if (document.querySelectorAll('.card').length === 0) {
          document.getElementById('content').innerHTML = '<div class="empty-state"><h3>✅ Reconciliación Completada</h3><p>Todos los insumos fueron vinculados y aprendidos con éxito.</p></div>';
        }
      }).aprobarVinculacionAlias(textoIngresado, prodOficial, filaCuarentena);
    }

    function ignorarCaso(idx, origen, fila) {
      document.getElementById('card-' + idx).remove();
      if (document.querySelectorAll('.card').length === 0) {
        document.getElementById('content').innerHTML = '<div class="empty-state"><h3>✅ Revisión Finalizada</h3></div>';
      }
    }
  </script>
</body>
</html>
  `)
  .setWidth(650)
  .setHeight(520)
  .setTitle("🧠 Reconciliador Inteligente");

  SpreadsheetApp.getUi().showModalDialog(html, "🧠 Reconciliador Inteligente — Suite Mise");
}

function obtenerCasosReconciliacion() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const qSheet = ss.getSheetByName("⚠️ REVISIÓN_HUÉRFANOS");
  const maestro = ss.getSheetByName(SHEET_MAESTRO);
  if (!qSheet || !maestro || qSheet.getLastRow() < 2) return [];

  const lr = maestro.getLastRow();
  const map = _getMaestroHeaderMap(maestro);
  const cProd = map["PRODUCTO"] ? map["PRODUCTO"].index : 2;
  const listaOficiales = maestro.getRange(MAESTRO_START, 1, lr - MAESTRO_START + 1, maestro.getLastColumn())
    .getValues()
    .map(r => String(r[cProd] || "").trim())
    .filter(n => n !== "");

  const qData = qSheet.getRange(2, 1, qSheet.getLastRow() - 1, 7).getValues();
  const aliasDict = (typeof MiseMatchingEngine !== "undefined") ? MiseMatchingEngine.obtenerDiccionarioAlias(ss) : {};
  const casos = [];

  qData.forEach((row, idx) => {
    const origen = String(row[1] || "");
    const fila = row[2];
    const texto = String(row[3] || "").trim();
    const vals = String(row[4] || "");
    const estado = String(row[5] || "");

    if (estado !== "RESUELTO" && texto && texto !== "[Sin Nombre]") {
      const sTexto = (typeof MiseMatchingEngine !== "undefined") ? MiseMatchingEngine.sanitizarTexto(texto) : texto.toLowerCase();
      
      // Si el alias ya está registrado en _DICCIONARIO_ALIAS, marcarlo automáticamente como RESUELTO en Cuarentena y no mostrarlo
      if (aliasDict[sTexto]) {
        try {
          qSheet.getRange(2 + idx, 6).setValue("RESUELTO");
          qSheet.getRange(2 + idx, 7).setValue(`Vinculado a: ${aliasDict[sTexto]}`);
        } catch(e) {}
        return;
      }

      const matchEval = (typeof MiseMatchingEngine !== "undefined") 
        ? MiseMatchingEngine.evaluarMatch(texto, listaOficiales, aliasDict)
        : { score: 0, candidato: listaOficiales[0] };

      casos.push({
        origen: origen,
        filaOriginal: fila,
        filaCuarentena: 2 + idx,
        textoIngresado: texto,
        valores: vals,
        score: matchEval.score,
        candidatoSugerido: matchEval.match || matchEval.candidato || listaOficiales[0],
        opciones: listaOficiales
      });
    }
  });

  return casos;
}

function aprobarVinculacionAlias(textoIngresado, productoOficial, filaCuarentena) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (typeof MiseMatchingEngine !== "undefined") {
    MiseMatchingEngine.registrarAlias(ss, textoIngresado, productoOficial, 1.0, "MANUAL_HTML");
  }

  // Actualizar estado en la hoja de Cuarentena
  if (filaCuarentena) {
    const qSheet = ss.getSheetByName("⚠️ REVISIÓN_HUÉRFANOS");
    if (qSheet && filaCuarentena <= qSheet.getLastRow()) {
      try {
        qSheet.getRange(filaCuarentena, 6).setValue("RESUELTO");
        qSheet.getRange(filaCuarentena, 7).setValue(`Vinculado manualmente a: ${productoOficial}`);
      } catch(e) {}
    }
  }
  return true;
}

// ── SISTEMA DE BLINDAJE ESTRUCTURAL Y PROTECCIONES (ANTI-MANIPULACIÓN) ────────
function protegerMaestroSeguro() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const maestro = ss.getSheetByName(SHEET_MAESTRO);
  if (!maestro) return;
  
  // 1. Remover protecciones anteriores en esta hoja
  const protections = maestro.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  protections.forEach(p => {
    try { p.remove(); } catch(e) {}
  });
  
  // 2. Crear una nueva protección para toda la hoja MAESTRO
  const sheetProtection = maestro.protect().setDescription("Protección Blindada de MAESTRO");
  sheetProtection.setWarningOnly(false);
  
  // 2.1. APAGAR edición por dominio/enlace abierto ("Cualquiera con el enlace")
  try {
    if (sheetProtection.canDomainEdit()) {
      sheetProtection.setDomainEdit(false);
    }
  } catch(e) {}

  // 2.2. Restringir a que solo el creador/editor efectivo pueda modificarla
  try {
    const me = Session.getEffectiveUser();
    sheetProtection.removeEditors(sheetProtection.getEditors());
    sheetProtection.addEditor(me);
  } catch(e) {}
  
  // 3. Desproteger celdas interactivas:
  // - Checkboxes fila 2: D2 (Desactivar), F2 (Activar), H2 (Eliminar), J2 (Limpiar)
  // - Checkboxes col 13 (SELECCIONAR)
  // - Columna 6 / F (Dropdown ACTIVO SÍ/NO)
  const lr = Math.max(maestro.getLastRow(), MAESTRO_START);
  const count = lr - MAESTRO_START + 1;
  const map = _getMaestroHeaderMap(maestro);
  const cSel = map["SELECCIONAR"] ? map["SELECCIONAR"].col : 13;
  const cAct = map["ACTIVO"] ? map["ACTIVO"].col : 6;

  const rangoSelect = maestro.getRange(MAESTRO_START, cSel, count, 1);
  const rangoActivo = maestro.getRange(MAESTRO_START, cAct, count, 1);
  const checkboxesFila2 = maestro.getRange("D2:J2");
  
  sheetProtection.setUnprotectedRanges([rangoSelect, rangoActivo, checkboxesFila2]);
  MiseLogger.info("protegerMaestroSeguro", "Hoja MAESTRO blindada exitosamente: Checkboxes y selección operativos.");
}

function protegerKardexSeguro(keyOrSheet) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let kSheet = null;
  let kardexName = "";

  if (typeof keyOrSheet === "string") {
    const bConfig = BODEGAS[keyOrSheet];
    if (bConfig) {
      kSheet = ss.getSheetByName(bConfig.kardex);
      kardexName = bConfig.kardex;
    } else {
      kSheet = ss.getSheetByName(keyOrSheet);
      kardexName = keyOrSheet;
    }
  } else if (keyOrSheet && typeof keyOrSheet.getName === "function") {
    kSheet = keyOrSheet;
    kardexName = kSheet.getName();
  }

  if (!kSheet) return;

  // 1. Remover protecciones anteriores (tanto de hoja como de rango)
  const sheetProtections = kSheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  sheetProtections.forEach(p => { try { p.remove(); } catch(e) {} });

  const rangeProtections = kSheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
  rangeProtections.forEach(p => { try { p.remove(); } catch(e) {} });

  // 2. Crear protección total de la hoja
  const sheetProtection = kSheet.protect().setDescription(`Blindaje Total de ${kardexName}`);
  sheetProtection.setWarningOnly(false);

  // 2.1. APAGAR edición por dominio/enlace abierto ("Cualquiera con el enlace")
  try {
    if (sheetProtection.canDomainEdit()) {
      sheetProtection.setDomainEdit(false);
    }
  } catch(e) {}

  // 2.2. Restringir a que solo el creador/editor efectivo pueda modificarla
  try {
    const me = Session.getEffectiveUser();
    sheetProtection.removeEditors(sheetProtection.getEditors());
    sheetProtection.addEditor(me);
  } catch(e) {}

  // 3. DESPROTEGER RANGOS INTERACTIVOS OPERATIVOS:
  // a) Fecha inicial (G4) y Botones/Checkboxes interactivos de fila 4 (N4, Q4, T4, W4)
  // b) Columnas numéricas de ENT y SAL de Lunes a Domingo (separadas para máxima compatibilidad móvil)
  // c) Caducidad (Col F) y Lote (Col G) opcionales si se requiere captura
  const lr = Math.max(kSheet.getLastRow(), KARDEX_START);
  const count = lr - KARDEX_START + 1;
  const unprotectedRanges = [];

  // Botones y selectores interactivos en fila 4
  unprotectedRanges.push(kSheet.getRange("G4")); // Fecha
  unprotectedRanges.push(kSheet.getRange("N4")); // Avanzar Sem.
  unprotectedRanges.push(kSheet.getRange("Q4")); // Recrear Vista
  unprotectedRanges.push(kSheet.getRange("T4")); // Nuevo Prod.
  unprotectedRanges.push(kSheet.getRange("W4")); // Anular Prod.

  // Caducidad (F) y Lote (G)
  unprotectedRanges.push(kSheet.getRange(KARDEX_START, 6, count, 2));

  // ENT y SAL de cada día (Cols J-K, M-N, P-Q, S-T, V-W, Y-Z, AB-AC)
  for (let d = 0; d < KARDEX_DAYS; d++) {
    const entCol = 10 + d * 3;
    const salCol = 11 + d * 3;
    unprotectedRanges.push(kSheet.getRange(KARDEX_START, entCol, count, 1));
    unprotectedRanges.push(kSheet.getRange(KARDEX_START, salCol, count, 1));
  }

  sheetProtection.setUnprotectedRanges(unprotectedRanges);
  MiseLogger.info("protegerKardexSeguro", `${kardexName} blindado: ENT, SAL y Checkboxes fila 4 desprotegidos y 100% operativos.`);
}

function protegerTodasLasHojasSeguras() {
  protegerMaestroSeguro();
  protegerKardexSeguro("BA");
  protegerKardexSeguro("BM");
  SpreadsheetApp.getActive().toast("🔒 MAESTRO y KARDEX blindados con éxito ✓", "⚙️ Mise", 4);
}

function restaurarValidacionesMaestro() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const maestro = ss.getSheetByName(SHEET_MAESTRO);
  if (!maestro) return;
  const lr = maestro.getLastRow();
  if (lr < MAESTRO_START) return;
  const count = lr - MAESTRO_START + 1;
  const map = _getMaestroHeaderMap(maestro);

  const cCat = map["CATEGORÍA"]    ? map["CATEGORÍA"].col    : 2;
  const cAct = map["ACTIVO"]       ? map["ACTIVO"].col       : 6;
  const cSel = map["SELECCIONAR"] ? map["SELECCIONAR"].col : 13;
  
  // 1. Restaurar Dropdown ACTIVO (col 6 / F)
  try {
    const rangeAct = maestro.getRange(MAESTRO_START, cAct, count, 1);
    rangeAct.clearDataValidations();
    const validationRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(["SÍ", "NO"], true)
      .setAllowInvalid(true)
      .setHelpText("Selecciona SÍ o NO para activar/desactivar el producto.")
      .build();
    rangeAct.setDataValidation(validationRule);
  } catch(e) {}
  
  // 1.5. Extraer categorías únicas existentes en la hoja + CATEGORIAS_LISTA base
  try {
    const catRange = maestro.getRange(MAESTRO_START, cCat, count, 1);
    catRange.clearDataValidations();
    
    const existingCats = catRange.getValues()
      .map(r => String(r[0] || "").trim())
      .filter(c => c !== "");
    
    const allCategories = Array.from(new Set([...CATEGORIAS_LISTA, ...existingCats]));
    
    if (allCategories.length > 0) {
      const catValidation = SpreadsheetApp.newDataValidation()
        .requireValueInList(allCategories, true)
        .setAllowInvalid(true)
        .setHelpText("Selecciona la categoría del producto.")
        .build();
      catRange.setDataValidation(catValidation);
    }
  } catch(e) {}
  
  // 2. Restaurar Checkboxes SELECCIONAR (col 13 / M)
  try {
    maestro.getRange(MAESTRO_START, cSel, count, 1).insertCheckboxes();
  } catch(e) {}
  
  // 3. Re-aplicar Formato Condicional Dinámico
  try {
    _aplicarReglasMaestro(maestro);
  } catch(e) {}

  // 4. Restaurar Centro de Control Táctil (Botones por lote en Fila 2)
  try {
    _restaurarFila2AccionesLote(maestro, maestro.getLastColumn());
  } catch(e) {}

  SpreadsheetApp.getActive().toast("Validaciones y botones de MAESTRO restaurados ✓", "⚙️ Mise", 4);
}

function crearHojaCargaMasiva() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("➕ AGREGAR_MÚLTIPLES");
  if (sheet) {
    ss.setActiveSheet(sheet);
    SpreadsheetApp.getUi().alert("Ya existe la hoja '➕ AGREGAR_MÚLTIPLES'. Termina de llenarla o bórrala antes de crear otra.");
    return;
  }
  
  sheet = ss.insertSheet("➕ AGREGAR_MÚLTIPLES");
  
  // Headers
  sheet.getRange("A1:J1").merge()
    .setValue("MISE — AGREGAR PRODUCTOS EN LOTE")
    .setBackground(C.dark).setFontColor("#FFFFFF").setFontWeight("bold")
    .setFontSize(11).setFontFamily("Arial").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.setRowHeight(1, 30);
  
  sheet.getRange("A2:J2").merge()
    .setValue("Instrucciones: Completa las columnas B a J. Llena tantas filas como productos quieras agregar.")
    .setBackground(C.cream).setFontColor("#333333").setFontSize(9)
    .setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.setRowHeight(2, 20);
  
  sheet.getRange("A3:I3").merge()
    .setValue("Confirmar Carga de Productos:").setFontWeight("bold").setFontSize(9)
    .setHorizontalAlignment("right").setVerticalAlignment("middle").setBackground(C.sage).setFontColor("#FFFFFF");
  sheet.getRange("J3").insertCheckboxes().setValue(false).setBackground(C.yellow).setHorizontalAlignment("center");
  sheet.setRowHeight(3, 24);
  
  sheet.getRange("A4:J4")
    .setValues([["No", "CATEGORÍA (Obligatorio)", "PRODUCTO (Obligatorio)", "PRESENTACIÓN (Obligatorio)", "UNIDAD (Obligatorio)", "ID FAMILIA (Opcional)", "MÍN BA", "MÁX BA", "MÍN BM", "MÁX BM"]])
    .setBackground(C.dark).setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(9)
    .setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.setRowHeight(4, 26);
  
  sheet.setFrozenRows(4);
  
  // Pre-poblar 50 filas
  const rows = 50;
  const colA = [];
  const bgs = [];
  for (let i = 0; i < rows; i++) {
    colA.push([i + 1]);
    bgs.push(Array(10).fill(i % 2 === 0 ? C.rowA : C.rowB));
  }
  sheet.getRange(5, 1, rows, 1).setValues(colA);
  sheet.getRange(5, 1, rows, 10).setBackgrounds(bgs)
    .setFontFamily("Calibri").setFontSize(10).setVerticalAlignment("middle");
  sheet.getRange(5, 1, rows, 1).setHorizontalAlignment("center");
  sheet.getRange(5, 2, rows, 1).setHorizontalAlignment("center");
  sheet.getRange(5, 5, rows, 1).setHorizontalAlignment("center");
  sheet.getRange(5, 6, rows, 1).setHorizontalAlignment("center");
  
  // Dropdown de categorías en columna B (col 2)
  const catValidation = SpreadsheetApp.newDataValidation()
    .requireValueInList(CATEGORIAS_LISTA, true)
    .setAllowInvalid(false)
    .setHelpText("Selecciona una categoría válida.")
    .build();
  sheet.getRange(5, 2, rows, 1).setDataValidation(catValidation);
  
  // Dropdown de unidades en columna E (col 5)
  const unitValidation = SpreadsheetApp.newDataValidation()
    .requireValueInList(["kg", "lt", "pza", "paq", "g", "ml", "rol", "fco", "dom", "bol", "caj"], true)
    .setAllowInvalid(false)
    .setHelpText("Selecciona una unidad válida.")
    .build();
  sheet.getRange(5, 5, rows, 1).setDataValidation(unitValidation);
  
  sheet.setColumnWidth(1, 40);
  sheet.setColumnWidth(2, 180);
  sheet.setColumnWidth(3, 220);
  sheet.setColumnWidth(4, 180);
  sheet.setColumnWidth(5, 140);
  sheet.setColumnWidth(6, 160);
  sheet.setColumnWidth(7, 75);
  sheet.setColumnWidth(8, 75);
  sheet.setColumnWidth(9, 75);
  sheet.setColumnWidth(10, 75);
  
  ss.setActiveSheet(sheet);
}

function procesarCargaMasiva() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tempSheet = ss.getSheetByName("➕ AGREGAR_MÚLTIPLES");
  if (!tempSheet) return;
  
  const lastRowT = tempSheet.getLastRow();
  if (lastRowT < 5) {
    SpreadsheetApp.getUi().alert("No hay productos para cargar.");
    tempSheet.getRange("J3").setValue(false);
    return;
  }
  
  const rawData = tempSheet.getRange(5, 1, lastRowT - 4, 10).getValues();
  const validRows = [];
  for (let i = 0; i < rawData.length; i++) {
    const cat = String(rawData[i][1]).trim();
    const prod = String(rawData[i][2]).trim();
    const pres = String(rawData[i][3]).trim();
    const unit = String(rawData[i][4]).trim();
    const idFam = String(rawData[i][5]).trim();
    const minBa = parseFloat(rawData[i][6]) || 0;
    const maxBa = parseFloat(rawData[i][7]) || 0;
    const minBm = parseFloat(rawData[i][8]) || 0;
    const maxBm = parseFloat(rawData[i][9]) || 0;
    
    if (prod !== "") {
      if (cat === "" || pres === "" || unit === "") {
        SpreadsheetApp.getUi().alert(`Error en fila ${i + 5}: El producto "${prod}" debe tener CATEGORÍA, PRESENTACIÓN y UNIDAD obligatoriamente.`);
        tempSheet.getRange("J3").setValue(false);
        return;
      }
      validRows.push({ cat, prod, pres, unit, idFam, minBa, maxBa, minBm, maxBm });
    }
  }
  
  if (validRows.length === 0) {
    SpreadsheetApp.getUi().alert("No se encontraron productos para cargar. Escribe al menos el nombre del producto en la columna C.");
    tempSheet.getRange("J3").setValue(false);
    return;
  }
  
  const proceed = SpreadsheetApp.getUi().alert(
    "➕ Confirmar Adición de Productos",
    `¿Confirmas agregar ${validRows.length} productos nuevos en lote al catálogo, kardex y hojas de historial?`,
    SpreadsheetApp.getUi().ButtonSet.YES_NO
  );
  if (proceed !== SpreadsheetApp.getUi().Button.YES) {
    tempSheet.getRange("J3").setValue(false);
    return;
  }
  
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    SpreadsheetApp.getUi().alert("El archivo está ocupado. Intenta de nuevo.");
    tempSheet.getRange("J3").setValue(false);
    return;
  }
  
  try {
    SpreadsheetApp.getActive().toast("⏳ Paso 1/4: Registrando productos en MAESTRO...", "⚙️ Agregar productos", 5);
    const maestro = ss.getSheetByName(SHEET_MAESTRO);
    const lrM = maestro.getLastRow();
    const nos = maestro.getRange(MAESTRO_START, 1, lrM - MAESTRO_START + 1, 1).getValues();
    let lastNo = nos.reduce((max, r) => Math.max(max, parseInt(r[0]) || 0), 0);
    
    const map = _getMaestroHeaderMap(maestro);
    const cCat = map["CATEGORÍA"] ? map["CATEGORÍA"].col : 2;
    const cAct = map["ACTIVO"]    ? map["ACTIVO"].col    : 6;
    const cSel = map["SELECCIONAR"] ? map["SELECCIONAR"].col : 13;

    const maestroRows = [];
    const bgsM = [];
    
    const newProductsData = []; // Para procesar en los Kardex
    
    for (let i = 0; i < validRows.length; i++) {
      const item = validRows[i];
      const newNo = ++lastNo;
      maestroRows.push([newNo, item.cat, item.prod, item.pres, item.unit, "SÍ", item.minBa, item.maxBa, "", item.minBm, item.maxBm, "", false]);
      
      const rowColor = (newNo % 2 === 1) ? C.rowA : C.rowB;
      bgsM.push(Array(maestro.getLastColumn()).fill(rowColor));
      
      newProductsData.push({ newNo, item, rowColor });
    }
    
    // 1. Escribir en MAESTRO
    const startRowM = lrM + 1;
    maestro.getRange(startRowM, 1, validRows.length, maestro.getLastColumn()).setValues(maestroRows);
    maestro.getRange(startRowM, 1, validRows.length, maestro.getLastColumn()).setBackgrounds(bgsM);
    
    // Agregar validación y checkboxes en MAESTRO
    const validationRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(["SÍ", "NO"], true)
      .setAllowInvalid(false)
      .setHelpText("Selecciona SÍ o NO para activar/desactivar el producto.")
      .build();
    maestro.getRange(startRowM, cAct, validRows.length, 1).setDataValidation(validationRule);
    const catValidationCM = SpreadsheetApp.newDataValidation()
      .requireValueInList(CATEGORIAS_LISTA, true)
      .setAllowInvalid(true)
      .setHelpText("Selecciona la categoría del producto.")
      .build();
    maestro.getRange(startRowM, cCat, validRows.length, 1).setDataValidation(catValidationCM);
    maestro.getRange(startRowM, cSel, validRows.length, 1).insertCheckboxes().setValue(false);
    
    SpreadsheetApp.getActive().toast("⏳ Paso 2/4: Extendiendo KARDEX de Andares y Mercado...", "⚙️ Agregar productos", 5);
    // 2. Insertar en KARDEX_BA y KARDEX_BM
    Object.values(BODEGAS).forEach(b => {
      const kSheet = ss.getSheetByName(b.kardex);
      if (kSheet) {
        const lastRowK = kSheet.getLastRow();
        const startRowK = lastRowK + 1;
        
        // Escribimos toda la fila del Kardex (30 columnas) en Batch 2D
        const fullKardexRows = [];
        const bgsK = [];
        
        for (let i = 0; i < newProductsData.length; i++) {
          const np = newProductsData[i];
          const row = new Array(KARDEX_TOTAL_COLS).fill("");
          
          // Estáticos
          row[0] = np.newNo;
          row[1] = np.item.cat;
          row[2] = np.item.prod;
          row[3] = np.item.pres;
          row[4] = np.item.unit;
          // Caducidad (5), Lote (6), Alerta Stock (7) vacíos.
          // Saldo Inicial (8) es 0
          row[8] = 0;
          
          // Fórmulas de Saldos de los 7 días
          const rn = startRowK + i;
          for (let d = 0; d < KARDEX_DAYS; d++) {
            const prevCol = 9  + d * 3;
            const entCol  = 10 + d * 3;
            const salCol  = 11 + d * 3;
            const sldColIdx = 11 + d * 3; // 0-indexed: Col L es 11
            row[sldColIdx] = '=' + _col(prevCol) + rn + '+IFERROR(' + _col(entCol) + rn + ',0)-IFERROR(' + _col(salCol) + rn + ',0)';
          }
          
          fullKardexRows.push(row);
          
          const rowColor = np.rowColor;
          const bgRow = Array(KARDEX_TOTAL_COLS).fill(rowColor);
          bgRow[8] = C.iceBlue; // Saldo Inicial
          for (let d = 0; d < KARDEX_DAYS; d++) {
            bgRow[9 + d * 3] = C.entBg;  // ENT
            bgRow[10 + d * 3] = C.salBg; // SAL
            bgRow[11 + d * 3] = C.iceBlue; // SLD
          }
          bgsK.push(bgRow);
        }
        
        // Escribir bloque completo en Kardex
        kSheet.getRange(startRowK, 1, validRows.length, KARDEX_TOTAL_COLS).setValues(fullKardexRows);
        kSheet.getRange(startRowK, 6, validRows.length, 1).setNumberFormat("DD/MMM/YY");
        kSheet.getRange(startRowK, 1, validRows.length, KARDEX_TOTAL_COLS).setBackgrounds(bgsK);
      }
    });
    
    SpreadsheetApp.getActive().toast("⏳ Paso 3/4: Creando históricos de consumo...", "⚙️ Agregar productos", 5);
    // 3. Insertar en HISTORIAL_BA y HISTORIAL_BM
    Object.values(BODEGAS).forEach(b => {
      const histName = `HISTORIAL_${b.key}`;
      const hSheet = ss.getSheetByName(histName);
      if (hSheet) {
        const lastRowH = hSheet.getLastRow();
        const startRowH = lastRowH + 1;
        
        const histRows = [];
        const bgsH = [];
        for (let i = 0; i < newProductsData.length; i++) {
          const np = newProductsData[i];
          histRows.push([np.newNo, np.item.prod, np.item.unit]);
          bgsH.push(Array(3).fill(np.rowColor));
        }
        
        hSheet.getRange(startRowH, 1, validRows.length, 3).setValues(histRows);
        hSheet.getRange(startRowH, 1, validRows.length, 3).setBackgrounds(bgsH);
        hSheet.getRange(startRowH, 1, validRows.length, 1).setHorizontalAlignment("center");
        hSheet.getRange(startRowH, 3, validRows.length, 1).setHorizontalAlignment("center");
      }
    });
    
    SpreadsheetApp.getActive().toast("⏳ Paso 4/4: Re-ordenando catálogo y recreando vistas...", "⚙️ Agregar productos", 5);
    // 4. Re-ordenar y re-numerar todo, luego recrear vistas
    _ordenarYRenumerarTodo();
    _buildVista("BA");
    _buildVista("BM");
    
    // 6. Eliminar hoja temporal
    try {
      ss.deleteSheet(tempSheet);
    } catch(e) {}
    
    SpreadsheetApp.getActive().toast(`✅ Se agregaron ${validRows.length} productos con éxito`, "⚙️ Agregar productos", 4);
    SpreadsheetApp.getUi().alert("✅ Carga masiva completada", `Se agregaron ${validRows.length} productos nuevos con éxito.`, SpreadsheetApp.getUi().ButtonSet.OK);
    _log("procesarCargaMasiva", `${validRows.length} productos cargados.`);
  } catch (err) {
    // Revertir el checkbox a false en caso de fallo para permitir reintentar
    try { tempSheet.getRange("J3").setValue(false); } catch(e) {}
    SpreadsheetApp.getActive().toast("❌ Error en carga masiva: " + err.message, "⚙️ Agregar productos", 6);
    SpreadsheetApp.getUi().alert("❌ Error en Carga Masiva", "No se completó la operación debido al siguiente error:\n\n" + err.toString() + "\n\nPor favor, revisa tus datos y reintenta.", SpreadsheetApp.getUi().ButtonSet.OK);
    _log("procesarCargaMasiva ERROR", err.toString());
  } finally {
    lock.releaseLock();
  }
}

function crearHojaEdicionMasiva() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const maestro = ss.getSheetByName(SHEET_MAESTRO);
  if (!maestro) return;
  
  const lr = maestro.getLastRow();
  if (lr < MAESTRO_START) {
    SpreadsheetApp.getUi().alert("No hay productos en MAESTRO.");
    return;
  }
  
  // Obtener seleccionados
  const count = lr - MAESTRO_START + 1;
  const map = _getMaestroHeaderMap(maestro);
  const data = maestro.getRange(MAESTRO_START, 1, count, maestro.getLastColumn()).getValues();

  const cNo    = map["NO"]           ? map["NO"].index           : 0;
  const cCat   = map["CATEGORÍA"]    ? map["CATEGORÍA"].index    : 1;
  const cProd  = map["PRODUCTO"]     ? map["PRODUCTO"].index     : 2;
  const cPres  = map["PRESENTACION"] ? map["PRESENTACION"].index : 3;
  const cUni   = map["UNIDAD"]       ? map["UNIDAD"].index       : 4;
  const cMinBA = map["MÍN_BA"]      ? map["MÍN_BA"].index      : 6;
  const cMaxBA = map["MÁX_BA"]      ? map["MÁX_BA"].index      : 7;
  const cMinBM = map["MÍN_BM"]      ? map["MÍN_BM"].index      : 9;
  const cMaxBM = map["MÁX_BM"]      ? map["MÁX_BM"].index      : 10;
  const cSel   = map["SELECCIONAR"] ? map["SELECCIONAR"].index : 12;

  const selectedProds = [];
  for (let i = 0; i < count; i++) {
    if (data[i][cSel] === true) {
      selectedProds.push({
        no: data[i][cNo],
        cat: data[i][cCat],
        prod: data[i][cProd],
        pres: data[i][cPres],
        unit: data[i][cUni],
        minBa: data[i][cMinBA],
        maxBa: data[i][cMaxBA],
        minBm: data[i][cMinBM],
        maxBm: data[i][cMaxBM]
      });
    }
  }
  
  if (selectedProds.length === 0) {
    SpreadsheetApp.getUi().alert("No has seleccionado ningún producto. Primero marca las casillas de la columna 'SELECCIONAR' en MAESTRO.");
    return;
  }
  
  let editSheet = ss.getSheetByName("✏️ EDITAR_PRODUCTOS");
  if (editSheet) {
    try {
      ss.deleteSheet(editSheet);
      editSheet = ss.insertSheet("✏️ EDITAR_PRODUCTOS");
    } catch(e) {
      editSheet.clear();
      editSheet.clearConditionalFormatRules();
      editSheet.setHiddenGridlines(false);
      editSheet.setFrozenRows(0);
      editSheet.setFrozenColumns(0);
    }
  } else {
    editSheet = ss.insertSheet("✏️ EDITAR_PRODUCTOS");
  }
  
  // Headers (10 columnas: A-J)
  editSheet.getRange("A1:J1").merge()
    .setValue("MISE — EDICIÓN MASIVA DE PRODUCTOS")
    .setBackground(C.dark).setFontColor("#FFFFFF").setFontWeight("bold")
    .setFontSize(11).setFontFamily("Arial").setHorizontalAlignment("center").setVerticalAlignment("middle");
  editSheet.setRowHeight(1, 30);
  
  editSheet.getRange("A2:J2").merge()
    .setValue("Instrucciones: Modifica los campos que desees. Las columnas CATEGORÍA, PRODUCTO, PRESENTACIÓN y UNIDAD son obligatorias. Deja la columna A (No) intacta.")
    .setBackground(C.cream).setFontColor("#333333").setFontSize(9)
    .setHorizontalAlignment("center").setVerticalAlignment("middle");
  editSheet.setRowHeight(2, 20);
  
  editSheet.getRange("A3:H3").merge()
    .setValue("Confirmar Edición de Productos:").setFontWeight("bold").setFontSize(9)
    .setHorizontalAlignment("right").setVerticalAlignment("middle").setBackground(C.sage).setFontColor("#FFFFFF");
  editSheet.getRange("I3").insertCheckboxes().setValue(false).setBackground(C.yellow).setHorizontalAlignment("center");
  editSheet.getRange("J3").setValue("").setBackground(C.cream);
  editSheet.setRowHeight(3, 24);
  
  editSheet.getRange("A4:J4")
    .setValues([["No (No editar)", "CATEGORÍA (Obligatorio)", "PRODUCTO (Obligatorio)", "PRESENTACIÓN (Obligatorio)", "UNIDAD (Obligatorio)", "ID FAMILIA (Opcional)", "MÍN BA", "MÁX BA", "MÍN BM", "MÁX BM"]])
    .setBackground(C.dark).setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(9)
    .setHorizontalAlignment("center").setVerticalAlignment("middle");
  editSheet.setRowHeight(4, 26);
  
  editSheet.setFrozenRows(4);
  
  // Poblar productos seleccionados (10 columnas)
  const editRows = [];
  const bgs = [];
  selectedProds.forEach((p, idx) => {
    editRows.push([p.no, p.cat, p.prod, p.pres, p.unit, p.idFam, p.minBa, p.maxBa, p.minBm, p.maxBm]);
    bgs.push(Array(10).fill(idx % 2 === 0 ? C.rowA : C.rowB));
  });
  
  const startRow = 5;
  editSheet.getRange(startRow, 1, selectedProds.length, 10).setValues(editRows);
  editSheet.getRange(startRow, 1, selectedProds.length, 10).setBackgrounds(bgs)
    .setFontFamily("Calibri").setFontSize(10).setVerticalAlignment("middle");
  editSheet.getRange(startRow, 1, selectedProds.length, 1).setHorizontalAlignment("center").setFontWeight("bold").setFontColor("#C62828");
  editSheet.getRange(startRow, 2, selectedProds.length, 1).setHorizontalAlignment("center");
  editSheet.getRange(startRow, 6, selectedProds.length, 1).setHorizontalAlignment("center");
  editSheet.getRange(startRow, 7, selectedProds.length, 4).setHorizontalAlignment("center");
  
  // Dropdown de categorías en columna B (col 2)
  const catValidation = SpreadsheetApp.newDataValidation()
    .requireValueInList(CATEGORIAS_LISTA, true)
    .setAllowInvalid(false)
    .setHelpText("Selecciona una categoría válida.")
    .build();
  editSheet.getRange(startRow, 2, selectedProds.length, 1).setDataValidation(catValidation);

  // Dropdown de unidades en columna E (col 5)
  const unitValidation = SpreadsheetApp.newDataValidation()
    .requireValueInList(["kg", "lt", "pza", "paq", "g", "ml", "rol", "fco", "dom", "bol", "caj"], true)
    .setAllowInvalid(false)
    .setHelpText("Selecciona una unidad válida.")
    .build();
  editSheet.getRange(startRow, 5, selectedProds.length, 1).setDataValidation(unitValidation);
  
  editSheet.setColumnWidth(1, 100);
  editSheet.setColumnWidth(2, 180);
  editSheet.setColumnWidth(3, 220);
  editSheet.setColumnWidth(4, 180);
  editSheet.setColumnWidth(5, 140);
  editSheet.setColumnWidth(6, 140);
  editSheet.setColumnWidth(7, 90);
  editSheet.setColumnWidth(8, 90);
  editSheet.setColumnWidth(9, 90);
  editSheet.setColumnWidth(10, 90);
  
  // Proteger la primera columna para advertir que no debe ser modificada
  try {
    const protection = editSheet.getRange(startRow, 1, selectedProds.length, 1).protect()
      .setDescription("No editar el identificador No.");
    protection.removeEditors(protection.getEditors());
    if (protection.canDomainEdit()) protection.setDomainEdit(false);
  } catch(e) {}
  
  ss.setActiveSheet(editSheet);
}

function procesarEdicionMasiva() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const editSheet = ss.getSheetByName("✏️ EDITAR_PRODUCTOS");
  if (!editSheet) return;
  
  const lastRowE = editSheet.getLastRow();
  if (lastRowE < 5) {
    SpreadsheetApp.getUi().alert("No hay productos para guardar.");
    editSheet.getRange("I3").setValue(false);
    return;
  }
  
  const rawData = editSheet.getRange(5, 1, lastRowE - 4, 10).getValues();
  const validEdits = [];
  for (let i = 0; i < rawData.length; i++) {
    const no = parseInt(rawData[i][0]);
    const cat = String(rawData[i][1]).trim();
    const prod = String(rawData[i][2]).trim();
    const pres = String(rawData[i][3]).trim();
    const unit = String(rawData[i][4]).trim();
    const idFam = String(rawData[i][5]).trim();
    const minBa = parseFloat(rawData[i][6]) || 0;
    const maxBa = parseFloat(rawData[i][7]) || 0;
    const minBm = parseFloat(rawData[i][8]) || 0;
    const maxBm = parseFloat(rawData[i][9]) || 0;
    
    if (isNaN(no) || no <= 0) {
      SpreadsheetApp.getUi().alert(`Error en fila ${i + 5}: El identificador "No" no es válido. No debiste modificar la primera columna.`);
      editSheet.getRange("I3").setValue(false);
      return;
    }
    
    if (cat === "" || prod === "" || pres === "" || unit === "") {
      SpreadsheetApp.getUi().alert(`Error en fila ${i + 5}: Los campos CATEGORÍA, PRODUCTO, PRESENTACIÓN y UNIDAD son obligatorios.`);
      editSheet.getRange("I3").setValue(false);
      return;
    }
    
    validEdits.push({ no, cat, prod, pres, unit, idFam, minBa, maxBa, minBm, maxBm });
  }
  
  const proceed = SpreadsheetApp.getUi().alert(
    "📝 Guardar Cambios de Edición",
    `¿Confirmas guardar los cambios de ${validEdits.length} productos y actualizar el catálogo, kardex e historial?`,
    SpreadsheetApp.getUi().ButtonSet.YES_NO
  );
  if (proceed !== SpreadsheetApp.getUi().Button.YES) {
    editSheet.getRange("I3").setValue(false);
    return;
  }
  
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    SpreadsheetApp.getUi().alert("El archivo está ocupado. Intenta de nuevo.");
    editSheet.getRange("I3").setValue(false);
    return;
  }
  
  try {
    SpreadsheetApp.getActive().toast("⏳ Paso 1/4: Actualizando datos en MAESTRO...", "📝 Editar productos", 5);
    const maestro = ss.getSheetByName(SHEET_MAESTRO);
    const lrM = maestro.getLastRow();
    if (lrM >= MAESTRO_START) {
      const map = _getMaestroHeaderMap(maestro);
      const cCat = map["CATEGORÍA"]    ? map["CATEGORÍA"].index    : 1;
      const cProd = map["PRODUCTO"]     ? map["PRODUCTO"].index     : 2;
      const cPres = map["PRESENTACION"] ? map["PRESENTACION"].index : 3;
      const cUni  = map["UNIDAD"]       ? map["UNIDAD"].index       : 4;
      const cMinBA = map["MÍN_BA"]      ? map["MÍN_BA"].index      : 6;
      const cMaxBA = map["MÁX_BA"]      ? map["MÁX_BA"].index      : 7;
      const cMinBM = map["MÍN_BM"]      ? map["MÍN_BM"].index      : 9;
      const cMaxBM = map["MÁX_BM"]      ? map["MÁX_BM"].index      : 10;
      const cSel   = map["SELECCIONAR"] ? map["SELECCIONAR"].index : 12;

      const rangeM = maestro.getRange(MAESTRO_START, 1, lrM - MAESTRO_START + 1, maestro.getLastColumn());
      const dataM = rangeM.getValues();
      for (let i = 0; i < validEdits.length; i++) {
        const item = validEdits[i];
        const idx = item.no - 1;
        if (idx >= 0 && idx < dataM.length) {
          dataM[idx][cCat]   = item.cat;
          dataM[idx][cProd]  = item.prod;
          dataM[idx][cPres]  = item.pres;
          dataM[idx][cUni]   = item.unit;
          dataM[idx][cMinBA] = item.minBa;
          dataM[idx][cMaxBA] = item.maxBa;
          dataM[idx][cMinBM] = item.minBm;
          dataM[idx][cMaxBM] = item.maxBm;
          dataM[idx][cSel]   = false; // Desmarcar
        }
      }
      rangeM.setValues(dataM);
    }
    
    SpreadsheetApp.getActive().toast("⏳ Paso 2/4: Actualizando KARDEX de Andares y Mercado...", "📝 Editar productos", 5);
    // 2. Actualizar KARDEX_BA y KARDEX_BM (No, CATEGORÍA, PRODUCTO, PRESENTACIÓN, UNIDAD)
    Object.values(BODEGAS).forEach(b => {
      const kSheet = ss.getSheetByName(b.kardex);
      if (kSheet) {
        const lrK = kSheet.getLastRow();
        if (lrK >= KARDEX_START) {
          const rangeK = kSheet.getRange(KARDEX_START, 1, lrK - KARDEX_START + 1, 5);
          const dataK = rangeK.getValues();
          for (let i = 0; i < validEdits.length; i++) {
            const item = validEdits[i];
            const idx = item.no - 1;
            if (idx >= 0 && idx < dataK.length) {
              dataK[idx][1] = item.cat;
              dataK[idx][2] = item.prod;
              dataK[idx][3] = item.pres;
              dataK[idx][4] = item.unit;
            }
          }
          rangeK.setValues(dataK);
        }
      }
    });
    
    SpreadsheetApp.getActive().toast("⏳ Paso 3/4: Sincronizando históricos de consumo...", "📝 Editar productos", 5);
    // 3. Actualizar HISTORIAL_BA y HISTORIAL_BM (No, PRODUCTO, UNIDAD)
    Object.values(BODEGAS).forEach(b => {
      const hSheet = ss.getSheetByName(`HISTORIAL_${b.key}`);
      if (hSheet) {
        const lrH = hSheet.getLastRow();
        if (lrH >= 5) {
          const rangeH = hSheet.getRange(5, 1, lrH - 4, 3);
          const dataH = rangeH.getValues();
          for (let i = 0; i < validEdits.length; i++) {
            const item = validEdits[i];
            const idx = item.no - 1;
            if (idx >= 0 && idx < dataH.length) {
              dataH[idx][1] = item.prod;
              dataH[idx][2] = item.unit;
            }
          }
          rangeH.setValues(dataH);
        }
      }
    });
    
    SpreadsheetApp.getActive().toast("⏳ Paso 4/4: Re-ordenando catálogo y recreando vistas...", "📝 Editar productos", 5);
    // 4. Re-ordenar y re-numerar todo, luego recrear vistas
    _ordenarYRenumerarTodo();
    _buildVista("BA");
    _buildVista("BM");
    
    // 6. Eliminar hoja temporal
    try {
      ss.deleteSheet(editSheet);
    } catch(e) {}
    
    SpreadsheetApp.getActive().toast(`✅ Se actualizaron ${validEdits.length} productos con éxito`, "📝 Editar productos", 4);
    SpreadsheetApp.getUi().alert("✅ Edición masiva completada", `Se actualizaron ${validEdits.length} productos con éxito.`, SpreadsheetApp.getUi().ButtonSet.OK);
    _log("procesarEdicionMasiva", `${validEdits.length} productos actualizados.`);
  } catch (err) {
    // Revertir el checkbox a false en caso de fallo para permitir reintentar
    try { editSheet.getRange("I3").setValue(false); } catch(e) {}
    SpreadsheetApp.getActive().toast("❌ Error en edición masiva: " + err.message, "📝 Editar productos", 6);
    SpreadsheetApp.getUi().alert("❌ Error en Edición Masiva", "No se completó la operación debido al siguiente error:\n\n" + err.toString() + "\n\nPor favor, revisa tus datos y reintenta.", SpreadsheetApp.getUi().ButtonSet.OK);
    _log("procesarEdicionMasiva ERROR", err.toString());
  } finally {
    lock.releaseLock();
  }
}

function obtenerDatosPowerhouse(key = "BA") {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const maestro = ss.getSheetByName(SHEET_MAESTRO);
  if (!maestro) return { items: [], categorias: CATEGORIAS_LISTA, unidades: ["kg", "lt", "pza", "paq", "g", "ml", "rol", "fco", "dom", "bol", "caj"] };

  _asegurarColumnasQuioscoEnMaestro(maestro);

  const lr = maestro.getLastRow();
  if (lr < MAESTRO_START) return { items: [], categorias: CATEGORIAS_LISTA, unidades: ["kg", "lt", "pza", "paq", "g", "ml", "rol", "fco", "dom", "bol", "caj"] };

  const map = _getMaestroHeaderMap(maestro);
  const mData = maestro.getRange(MAESTRO_START, 1, lr - MAESTRO_START + 1, maestro.getLastColumn()).getValues();

  const cNo    = map["NO"]           ? map["NO"].index           : 0;
  const cCat   = map["CATEGORÍA"]    ? map["CATEGORÍA"].index    : 1;
  const cProd  = map["PRODUCTO"]     ? map["PRODUCTO"].index     : 2;
  const cPres  = map["PRESENTACION"] ? map["PRESENTACION"].index : 3;
  const cUni   = map["UNIDAD"]       ? map["UNIDAD"].index       : 4;
  const cAct   = map["ACTIVO"]       ? map["ACTIVO"].index       : 5;
  const cMinBA = map["MÍN_BA"]      ? map["MÍN_BA"].index      : 6;
  const cMaxBA = map["MÁX_BA"]      ? map["MÁX_BA"].index      : 7;
  const cMinBM = map["MÍN_BM"]      ? map["MÍN_BM"].index      : 9;
  const cMaxBM = map["MÁX_BM"]      ? map["MÁX_BM"].index      : 10;

  const cMinQBA = map["MÍN_Q_BA"] ? map["MÍN_Q_BA"].index : -1;
  const cMaxQBA = map["MÁX_Q_BA"] ? map["MÁX_Q_BA"].index : -1;
  const cMinQBM = map["MÍN_Q_BM"] ? map["MÍN_Q_BM"].index : -1;
  const cMaxQBM = map["MÁX_Q_BM"] ? map["MÁX_Q_BM"].index : -1;

  const cPicBA = map["PICKING_BA"] ? map["PICKING_BA"].index : (map["PICKING"] ? map["PICKING"].index : -1);
  const cPicBM = map["PICKING_BM"] ? map["PICKING_BM"].index : (map["PICKING"] ? map["PICKING"].index : -1);

  const items = [];
  mData.forEach((r, idx) => {
    const prodName = String(r[cProd] || "").trim();
    if (!prodName) return;

    const no = parseInt(r[cNo]) || (idx + 1);
    const cat = String(r[cCat] || "SIN CATEGORÍA").trim();
    const pres = String(r[cPres] || "").trim();
    const unit = String(r[cUni] || "pza").trim().toLowerCase();
    const activo = String(r[cAct] || "SÍ").trim().toUpperCase() !== "NO";
    const minBa = parseFloat(r[cMinBA]) || 0;
    const maxBa = parseFloat(r[cMaxBA]) || 0;
    const minBm = parseFloat(r[cMinBM]) || 0;
    const maxBm = parseFloat(r[cMaxBM]) || 0;

    const minQBa = cMinQBA !== -1 ? (parseFloat(r[cMinQBA]) || 0) : 0;
    const maxQBa = cMaxQBA !== -1 ? (parseFloat(r[cMaxQBA]) || 0) : 0;
    const minQBm = cMinQBM !== -1 ? (parseFloat(r[cMinQBM]) || 0) : 0;
    const maxQBm = cMaxQBM !== -1 ? (parseFloat(r[cMaxQBM]) || 0) : 0;

    const rankBA = cPicBA !== -1 ? (parseInt(r[cPicBA]) || (idx + 1)) : (idx + 1);
    const rankBM = cPicBM !== -1 ? (parseInt(r[cPicBM]) || (idx + 1)) : (idx + 1);

    items.push({
      id: idx + 1,
      no: no,
      name: prodName,
      cat: cat,
      pres: pres,
      unit: unit,
      activo: activo,
      minBa: minBa,
      maxBa: maxBa,
      minBm: minBm,
      maxBm: maxBm,
      minQBa: minQBa,
      maxQBa: maxQBa,
      minQBm: minQBm,
      maxQBm: maxQBm,
      rankBA: rankBA,
      rankBM: rankBM,
      rank: key === "BM" ? rankBM : rankBA
    });
  });

  return {
    items: items,
    categorias: Array.from(new Set([...CATEGORIAS_LISTA, ...items.map(it => it.cat)])).filter(Boolean),
    unidades: ["kg", "lt", "pza", "paq", "g", "ml", "rol", "fco", "dom", "bol", "caj"]
  };
}

/**
 * Abre el Modal Powerhouse Unificado de Catálogo y Picking (HTML)
 */
function abrirConstructorPickingHTML() {
  const html = HtmlService.createHtmlOutputFromFile('PickingDialog')
    .setWidth(1050)
    .setHeight(700);

  SpreadsheetApp.getUi().showModalDialog(html, "⚡ Mise Powerhouse (Catálogo & Picking)");
}

// Alias de conveniencia
function abrirPowerhouse() {
  abrirConstructorPickingHTML();
}

function obtenerProductosPickingHTML(key) {
  const data = obtenerDatosPowerhouse(key);
  const items = data.items.map(it => ({ name: it.name, cat: it.cat, rank: it.rank }));
  items.sort((a, b) => a.rank - b.rank);
  return items;
}

function guardarPowerhouseBatch(key, payload) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(45000)) {
    throw new Error("El archivo de Bodega está ocupado. Intenta de nuevo en unos segundos.");
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const maestro = ss.getSheetByName(SHEET_MAESTRO);
    if (!maestro) throw new Error("No se encontró la hoja MAESTRO.");

    _asegurarColumnasQuioscoEnMaestro(maestro);
    const lrM = maestro.getLastRow();
    const map = _getMaestroHeaderMap(maestro);

    let cPicKey = `PICKING_${key}`;
    let cPicObj = map[cPicKey] || map["PICKING"];
    if (!cPicObj) {
      const lastCol = maestro.getLastColumn();
      const newCol = lastCol + 1;
      maestro.getRange(3, newCol).setValue(cPicKey);
      cPicObj = { col: newCol, index: newCol - 1 };
    }
    _asegurarFormatoHeadersMaestro(maestro);

    // 1. Procesar Altas
    const prodsNuevos = payload.nuevos || [];
    if (prodsNuevos.length > 0) {
      const lastColM = maestro.getLastColumn();
      const maestroNewRows = [];
      const bgsNew = [];

      for (let i = 0; i < prodsNuevos.length; i++) {
        const np = prodsNuevos[i];
        const newNo = lrM - MAESTRO_START + 1 + i + 1;
        const cat = String(np.cat || "ABARROTES").trim().toUpperCase();
        const prod = String(np.name || np.prod || "").trim();
        const pres = String(np.pres || "").trim();
        const unit = String(np.unit || "pza").trim().toLowerCase();
        const minBa = parseFloat(np.minBa) || 0;
        const maxBa = parseFloat(np.maxBa) || 0;
        const minBm = parseFloat(np.minBm) || 0;
        const maxBm = parseFloat(np.maxBm) || 0;
        const minQBa = parseFloat(np.minQBa) || 0;
        const maxQBa = parseFloat(np.maxQBa) || 0;
        const minQBm = parseFloat(np.minQBm) || 0;
        const maxQBm = parseFloat(np.maxQBm) || 0;

        if (!prod) continue;

        const rowM = new Array(lastColM).fill("");
        if (map["NO"])           rowM[map["NO"].index]           = newNo;
        if (map["CATEGORÍA"])    rowM[map["CATEGORÍA"].index]    = cat;
        if (map["PRODUCTO"])     rowM[map["PRODUCTO"].index]     = prod;
        if (map["PRESENTACION"]) rowM[map["PRESENTACION"].index] = pres;
        if (map["UNIDAD"])       rowM[map["UNIDAD"].index]       = unit;
        if (map["ACTIVO"])       rowM[map["ACTIVO"].index]       = "SÍ";
        if (map["MÍN_BA"])      rowM[map["MÍN_BA"].index]      = minBa;
        if (map["MÁX_BA"])      rowM[map["MÁX_BA"].index]      = maxBa;
        if (map["MÍN_BM"])      rowM[map["MÍN_BM"].index]      = minBm;
        if (map["MÁX_BM"])      rowM[map["MÁX_BM"].index]      = maxBm;
        if (map["MÍN_Q_BA"])    rowM[map["MÍN_Q_BA"].index]    = minQBa;
        if (map["MÁX_Q_BA"])    rowM[map["MÁX_Q_BA"].index]    = maxQBa;
        if (map["MÍN_Q_BM"])    rowM[map["MÍN_Q_BM"].index]    = minQBm;
        if (map["MÁX_Q_BM"])    rowM[map["MÁX_Q_BM"].index]    = maxQBm;
        if (map["SELECCIONAR"])  rowM[map["SELECCIONAR"].index]  = false;
        if (map["PICKING_BA"])   rowM[map["PICKING_BA"].index]   = newNo;
        if (map["PICKING_BM"])   rowM[map["PICKING_BM"].index]   = newNo;

        maestroNewRows.push(rowM);
        const rowColor = (newNo % 2 === 1) ? C.rowA : C.rowB;
        bgsNew.push(Array(lastColM).fill(rowColor));
      }

      if (maestroNewRows.length > 0) {
        const startRowM = maestro.getLastRow() + 1;
        maestro.getRange(startRowM, 1, maestroNewRows.length, lastColM).setValues(maestroNewRows);
        maestro.getRange(startRowM, 1, maestroNewRows.length, lastColM).setBackgrounds(bgsNew);
      }
    }

    // 2. Procesar Ediciones y Desactivaciones
    const ediciones = payload.ediciones || [];
    const eliminados = payload.eliminados || [];
    if (ediciones.length > 0 || eliminados.length > 0) {
      const lrCurr = maestro.getLastRow();
      const countCurr = lrCurr - MAESTRO_START + 1;
      const mRange = maestro.getRange(MAESTRO_START, 1, countCurr, maestro.getLastColumn());
      const mData = mRange.getValues();

      const editMap = {};
      ediciones.forEach(e => {
        const pKey = String(e.originalName || e.name || "").trim().toUpperCase();
        if (pKey) editMap[pKey] = e;
      });

      const delSet = new Set(eliminados.map(n => String(n).trim().toUpperCase()));

      for (let i = 0; i < mData.length; i++) {
        const prodName = String(mData[i][map["PRODUCTO"] ? map["PRODUCTO"].index : 2]).trim().toUpperCase();
        if (delSet.has(prodName)) {
          if (map["ACTIVO"]) mData[i][map["ACTIVO"].index] = "NO";
          continue;
        }

        const ed = editMap[prodName];
        if (ed) {
          if (ed.cat !== undefined && map["CATEGORÍA"])    mData[i][map["CATEGORÍA"].index] = String(ed.cat).trim().toUpperCase();
          if (ed.name !== undefined && map["PRODUCTO"])    mData[i][map["PRODUCTO"].index] = String(ed.name).trim();
          if (ed.pres !== undefined && map["PRESENTACION"]) mData[i][map["PRESENTACION"].index] = String(ed.pres).trim();
          if (ed.unit !== undefined && map["UNIDAD"])       mData[i][map["UNIDAD"].index] = String(ed.unit).trim().toLowerCase();
          if (ed.minBa !== undefined && map["MÍN_BA"])     mData[i][map["MÍN_BA"].index] = parseFloat(ed.minBa) || 0;
          if (ed.maxBa !== undefined && map["MÁX_BA"])     mData[i][map["MÁX_BA"].index] = parseFloat(ed.maxBa) || 0;
          if (ed.minBm !== undefined && map["MÍN_BM"])     mData[i][map["MÍN_BM"].index] = parseFloat(ed.minBm) || 0;
          if (ed.maxBm !== undefined && map["MÁX_BM"])     mData[i][map["MÁX_BM"].index] = parseFloat(ed.maxBm) || 0;
          if (ed.minQBa !== undefined && map["MÍN_Q_BA"]) mData[i][map["MÍN_Q_BA"].index] = parseFloat(ed.minQBa) || 0;
          if (ed.maxQBa !== undefined && map["MÁX_Q_BA"]) mData[i][map["MÁX_Q_BA"].index] = parseFloat(ed.maxQBa) || 0;
          if (ed.minQBm !== undefined && map["MÍN_Q_BM"]) mData[i][map["MÍN_Q_BM"].index] = parseFloat(ed.minQBm) || 0;
          if (ed.maxQBm !== undefined && map["MÁX_Q_BM"]) mData[i][map["MÁX_Q_BM"].index] = parseFloat(ed.maxQBm) || 0;
          if (ed.activo !== undefined && map["ACTIVO"])    mData[i][map["ACTIVO"].index] = ed.activo ? "SÍ" : "NO";
        }
      }
      mRange.setValues(mData);
    }

    // 3. Procesar Picking
    const lrFinal = maestro.getLastRow();
    const countFinal = lrFinal - MAESTRO_START + 1;
    const prodsFinal = maestro.getRange(MAESTRO_START, map["PRODUCTO"] ? map["PRODUCTO"].col : 3, countFinal, 1).getValues();
    const rankMap = {};
    const catMap = {};
    const pickingList = payload.picking || payload;

    if (Array.isArray(pickingList)) {
      pickingList.forEach((item, idx) => {
        const pName = String(item.name).trim();
        rankMap[pName] = item.rank || (idx + 1);
        if (item.cat) catMap[pName] = String(item.cat).trim().toUpperCase();
      });
    }

    if (cPicObj) {
      const newColValues = [];
      const newCatValues = [];
      const currentCats = map["CATEGORÍA"] ? maestro.getRange(MAESTRO_START, map["CATEGORÍA"].col, countFinal, 1).getValues() : [];

      for (let i = 0; i < prodsFinal.length; i++) {
        const pName = String(prodsFinal[i][0]).trim();
        const rank = rankMap[pName] || (i + 1);
        newColValues.push([rank]);

        if (catMap[pName]) {
          newCatValues.push([catMap[pName]]);
        } else {
          newCatValues.push([currentCats[i] ? currentCats[i][0] : ""]);
        }
      }

      maestro.getRange(MAESTRO_START, cPicObj.col, countFinal, 1).setValues(newColValues).setNumberFormat("0");
      if (map["CATEGORÍA"]) {
        try { maestro.getRange(MAESTRO_START, map["CATEGORÍA"].col, countFinal, 1).clearDataValidations(); } catch(e) {}
        maestro.getRange(MAESTRO_START, map["CATEGORÍA"].col, countFinal, 1).setValues(newCatValues);
      }
    }

    // Reordenar si hubo altas o si hubo bajas/desactivaciones para sincronizar y ocultar filas en Kardex
    const huboBajasOEdicionActivo = eliminados.length > 0 || ediciones.some(e => e.activo !== undefined);
    if (prodsNuevos.length > 0 || huboBajasOEdicionActivo) {
      _ordenarYRenumerarTodo();
    }

    // Reconstruir VISTAS_MOVILES
    _buildVista("BA");
    _buildVista("BM");

    // Sincronizar tiendas remotas
    sincronizarRemotamenteTiendasPush(null, rankMap);

    _log("guardarPowerhouseBatch", `${key}: Catálogo y picking sincronizados exitosamente.`);
    return `✅ Se guardaron los cambios del catálogo y la secuencia de picking se sincronizó con las tiendas.`;
  } finally {
    lock.releaseLock();
  }
}

// Wrapper de compatibilidad para guardarOrdenPickingHTML
function guardarOrdenPickingHTML(key, payload) {
  return guardarPowerhouseBatch(key, { picking: payload });
}

/**
 * Auto-Sincronización Remota Push (BDG -> PDA & PDM)
 * Abre silenciosamente los libros de Pedidos Andares y Pedidos Mercado
 * para reaplicar formatos, refrescar fórmulas y ordenar los pedidos en caliente.
 */
function sincronizarRemotamenteTiendasPush(sourceKey = null, sourceRankMap = null) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const props = PropertiesService.getScriptProperties();
  const targets = [
    { 
      key: "BA", 
      name: "Andares", 
      id: props.getProperty("PDA_SPREADSHEET_ID") || props.getProperty("BODEGA_ID_BA"), 
      url: props.getProperty("BODEGA_URL_BA") || props.getProperty("PDA_SPREADSHEET_URL"), 
      vistaName: BODEGAS.BA.vista 
    },
    { 
      key: "BM", 
      name: "Mercado", 
      id: props.getProperty("PDM_SPREADSHEET_ID") || props.getProperty("BODEGA_ID_BM"), 
      url: props.getProperty("BODEGA_URL_BM") || props.getProperty("PDM_SPREADSHEET_URL"), 
      vistaName: BODEGAS.BM.vista 
    }
  ];

  targets.forEach(t => {
    // Si se especificó una clave origen, solo sincronizar la tienda correspondiente
    if (sourceKey && t.key !== sourceKey) return;

    if (t.id || t.url) {
      try {
        let targetSs = null;
        if (t.id) {
          try { targetSs = SpreadsheetApp.openById(t.id); } catch(err) {}
        }
        if (!targetSs && t.url) {
          try { targetSs = SpreadsheetApp.openByUrl(t.url); } catch(err) {}
        }

        const vistaSheet = ss.getSheetByName(t.vistaName);
        if (targetSs && vistaSheet) {
          const vLr = vistaSheet.getLastRow();
          const vCount = Math.max(vLr - 3, 0);
          if (vCount < 1) return;

          // 1. Leer los datos frescos calculados en VISTA_MOVIL de Bodega (12 cols: A4:L)
          const datosFrescos = vistaSheet.getRange(4, 1, vCount, 12).getValues();

          // 2. Buscar la hoja de sincronización en la tienda remota (_SYNC_BA, _SYNC_BM o _SYNC)
          let syncSheet = targetSs.getSheetByName(`_SYNC_${t.key}`) || 
                          targetSs.getSheetByName("_SYNC") ||
                          targetSs.getSheetByName(`_SYNC_${t.key.toLowerCase()}`);
          
          if (!syncSheet) {
            syncSheet = targetSs.getSheets().find(s => s.getName().startsWith("_SYNC"));
          }

          if (syncSheet) {
            syncSheet.getRange(4, 1, vCount, 12).setValues(datosFrescos);
          }

          // 3. REORDENAMIENTO FÍSICO EN VIVO: Reordenar la pestaña 📋 PEDIDO DIARIO remota
          const pedidoSheet = targetSs.getSheetByName("📋 PEDIDO DIARIO");
          if (pedidoSheet && syncSheet) {
            _reordenarPedidoRemotoDirecto(targetSs, syncSheet, pedidoSheet, datosFrescos);
          }
        }
      } catch(e) {
        _log("sincronizarRemotamenteTiendasPush ERROR", `${t.name}: ${e.toString()}`);
      }
    }
  });
}

/**
 * Reordena atómicamente y físicamente la tabla del Pedido Diario en un libro de tienda remoto
 */
function _reordenarPedidoRemotoDirecto(targetSs, syncSheet, pedidoSheet, syncValues = null) {
  try {
    const DATA_START_ROW = 4;
    const NUM_COLS = 11;
    const COL_CANT_PEDIR = 6;

    const COLORS = {
      yellow:    "#FFFCD0",
      blue:      "#D0E8FF",
      neutral_a: "#FAFAFA",
      neutral_b: "#FFFFFF"
    };

    if (!syncValues) {
      const syncCount = Math.max(syncSheet.getLastRow() - 3, 0);
      if (syncCount < 1) return;
      syncValues = syncSheet.getRange(4, 1, syncCount, 12).getValues();
    }

    const activeMap = {};
    const pickingMap = {};
    for (let i = 0; i < syncValues.length; i++) {
      const prodName = String(syncValues[i][2]).trim();
      const activo   = String(syncValues[i][8]).trim();
      const picking  = parseInt(syncValues[i][11]) || 0;
      if (prodName) {
        activeMap[prodName]  = activo;
        pickingMap[prodName] = picking;
      }
    }

    const currentCount = Math.max(pedidoSheet.getLastRow() - 3, 0);
    const totalCatalogCount = syncValues.length;
    
    // Leer valores existentes si los hay para conservar cantidades ingresadas previamente
    const existingValuesMap = {};
    if (currentCount > 0) {
      const existingVals = pedidoSheet.getRange(DATA_START_ROW, 1, currentCount, NUM_COLS).getValues();
      existingVals.forEach(r => {
        const pName = String(r[2] || "").trim();
        if (pName) existingValuesMap[pName] = r;
      });
    }

    const items = [];
    for (let i = 0; i < syncValues.length; i++) {
      const pName = String(syncValues[i][2]).trim();
      const pNo   = parseInt(syncValues[i][0]) || (i + 1);
      const pCat  = String(syncValues[i][1]).trim();
      
      const existing = existingValuesMap[pName];
      if (existing) {
        items.push({ vals: existing });
      } else {
        // Insumo nuevo recién dado de alta: inicializar fila en tienda
        const newRow = new Array(NUM_COLS).fill("");
        newRow[0] = pNo;
        newRow[1] = pCat;
        newRow[2] = pName;
        newRow[5] = ""; // CANT. A PEDIR vacía
        items.push({ vals: newRow });
      }
    }

    // Ordenar strictly según la Secuencia de Picking de Quiosco (Col L de _SYNC)
    items.sort((a, b) => {
      const nameA = String(a.vals[2] || "").trim();
      const nameB = String(b.vals[2] || "").trim();

      const rankA = pickingMap[nameA] !== undefined ? pickingMap[nameA] : 9999;
      const rankB = pickingMap[nameB] !== undefined ? pickingMap[nameB] : 9999;
      if (rankA !== rankB) return rankA - rankB;

      const catA = String(a.vals[1] || "").trim();
      const catB = String(b.vals[1] || "").trim();
      if (catA !== catB) return catA.localeCompare(catB);

      const numA = parseInt(a.vals[0]) || 0;
      const numB = parseInt(b.vals[0]) || 0;
      return numA - numB;
    });

    const syncRowMap = {};
    for (let i = 0; i < syncValues.length; i++) {
      const pName = String(syncValues[i][2]).trim();
      if (pName) {
        syncRowMap[pName] = 4 + i;
      }
    }

    const sRef = "'" + syncSheet.getName() + "'";
    const outputData = [];
    const bgs = [];
    const cleanFonts = [];

    for (let i = 0; i < items.length; i++) {
      const r = DATA_START_ROW + i;
      const prodName = String(items[i].vals[2]).trim();
      const prodNo = parseInt(items[i].vals[0]) || (i + 1);
      const sr = syncRowMap[prodName] || (prodNo + 3);

      const isInactive = (activeMap[prodName] === "NO");

      // Fondos
      const bgRow = i % 2 === 0 ? COLORS.neutral_a : COLORS.neutral_b;
      const rowBg = Array(NUM_COLS).fill(bgRow);
      rowBg[4] = COLORS.blue;
      rowBg[COL_CANT_PEDIR - 1] = COLORS.yellow;
      bgs.push(rowBg);

      // Tipografía
      const rowFont = Array(NUM_COLS).fill(isInactive ? "italic" : "normal");
      rowFont[COL_CANT_PEDIR - 1] = "bold";
      cleanFonts.push(rowFont);

      outputData.push([
        prodNo,
        '=' + sRef + '!B' + sr,
        '=' + sRef + '!C' + sr,
        '=' + sRef + '!D' + sr,
        '=IFERROR(' + sRef + '!E' + sr + '*1, 0) & IF(AND(' + sRef + '!J' + sr + '=0, ' + sRef + '!K' + sr + '=0), "", IF(' + sRef + '!E' + sr + '<' + sRef + '!J' + sr + ', " (-" & (' + sRef + '!J' + sr + '-' + sRef + '!E' + sr + ') & ")", IF(' + sRef + '!E' + sr + '>' + sRef + '!K' + sr + ', " (+" & (' + sRef + '!E' + sr + '-' + sRef + '!K' + sr + ') & ")", " (-)")))',
        items[i].vals[5],
        '=IF(OR(F' + r + '="", H' + r + '=""), "", H' + r + ' - F' + r + ')',
        items[i].vals[7] === "" ? "" : items[i].vals[7],
        items[i].vals[8] || "",
        items[i].vals[9] || "",
        '=IF(AND(' + sRef + '!J' + sr + '=0, ' + sRef + '!K' + sr + '=0), "—", ' + sRef + '!J' + sr + ' & "  |  " & ' + sRef + '!K' + sr + ')'
      ]);
    }

    if (currentCount > 0) {
      pedidoSheet.getRange(DATA_START_ROW, 1, currentCount, NUM_COLS).clearContent();
    }
    pedidoSheet.getRange(DATA_START_ROW, 1, items.length, NUM_COLS).setFormulas(outputData);
    pedidoSheet.getRange(DATA_START_ROW, 1, items.length, NUM_COLS).setBackgrounds(bgs);
    pedidoSheet.getRange(DATA_START_ROW, 1, items.length, NUM_COLS).setFontWeights(cleanFonts);

    // Ocultar filas inactivas (ACTIVO === "NO") in-place en la hoja de tienda remota
    try {
      pedidoSheet.showRows(DATA_START_ROW, items.length);
      let startHide = -1;
      let hideCount = 0;
      for (let i = 0; i < items.length; i++) {
        const prodName = String(items[i].vals[2] || "").trim();
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
            pedidoSheet.hideRows(startHide, hideCount);
            startHide = -1;
            hideCount = 0;
          }
        }
      }
      if (startHide !== -1) {
        pedidoSheet.hideRows(startHide, hideCount);
      }
    } catch(errHide) {
      _log("_reordenarPedidoRemotoDirecto hideRows ERROR", errHide.toString());
    }
  } catch(e) {
    _log("_reordenarPedidoRemotoDirecto ERROR", e.toString());
  }
}

/**
 * Restaura y protege estrictamente el centro de control táctil de Fila 2 en MAESTRO
 */
function _restaurarFila2AccionesLote(sheet, lastCol) {
  const colCount = Math.max(lastCol || sheet.getLastColumn(), 13);
  sheet.getRange(2, 1, 1, colCount).setBackground(C.cream);

  // A2:B2 - Etiqueta de acciones
  try { sheet.getRange("A2:B2").breakAtMerge(); } catch(e) {}
  sheet.getRange("A2:B2").merge()
    .setValue("⚠️ Acciones por lote:").setFontWeight("bold").setFontColor(C.dark)
    .setHorizontalAlignment("right").setVerticalAlignment("middle").setFontSize(9);

  // C2 y D2 - Desactivar
  sheet.getRange("C2").setValue("Desactivar").setFontWeight("bold").setFontColor(C.dark)
    .setHorizontalAlignment("right").setVerticalAlignment("middle").setFontSize(9);
  sheet.getRange("D2").insertCheckboxes().setValue(false).setBackground(C.yellow);

  // E2 y F2 - Activar
  sheet.getRange("E2").setValue("Activar").setFontWeight("bold").setFontColor(C.dark)
    .setHorizontalAlignment("right").setVerticalAlignment("middle").setFontSize(9);
  sheet.getRange("F2").insertCheckboxes().setValue(false).setBackground(C.yellow);

  // G2 y H2 - Eliminar Sel.
  sheet.getRange("G2").setValue("Eliminar Sel.").setFontWeight("bold").setFontColor(C.dark)
    .setHorizontalAlignment("right").setVerticalAlignment("middle").setFontSize(9);
  sheet.getRange("H2").insertCheckboxes().setValue(false).setBackground(C.yellow);

  // I2 y J2 - Limpiar Sel.
  sheet.getRange("I2").setValue("Limpiar Sel.").setFontWeight("bold").setFontColor(C.dark)
    .setHorizontalAlignment("right").setVerticalAlignment("middle").setFontSize(9);
  sheet.getRange("J2").insertCheckboxes().setValue(false).setBackground(C.yellow);

  sheet.setRowHeight(2, 24);
}

/**
 * Asegura la existencia y formateo de las columnas de stock de quiosco y picking en MAESTRO
 */
function _asegurarColumnasQuioscoEnMaestro(maestroSheet) {
  const sheet = maestroSheet || SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_MAESTRO);
  if (!sheet) return;

  const map = _getMaestroHeaderMap(sheet);
  const requiredCols = [
    { key: "MÍN_Q_BA", width: 95, isStock: true },
    { key: "MÁX_Q_BA", width: 95, isStock: true },
    { key: "MÍN_Q_BM", width: 95, isStock: true },
    { key: "MÁX_Q_BM", width: 95, isStock: true },
    { key: "PICKING_BA", width: 90, isStock: false },
    { key: "PICKING_BM", width: 90, isStock: false },
    { key: "UNIDAD_TIENDA", width: 100, isStock: false, defaultVal: "" },
    { key: "FACTOR_CONVERSION", width: 110, isStock: false, defaultVal: 1, numberFormat: "0.####" }
  ];

  const lr = sheet.getLastRow();
  const numRows = lr >= MAESTRO_START ? lr - MAESTRO_START + 1 : 0;

  requiredCols.forEach(colDef => {
    if (!map[colDef.key]) {
      const newCol = sheet.getLastColumn() + 1;
      sheet.getRange(3, newCol)
        .setValue(colDef.key)
        .setBackground(C.sage)
        .setFontColor("#FFFFFF")
        .setFontWeight("bold")
        .setFontSize(10)
        .setHorizontalAlignment("center")
        .setVerticalAlignment("middle");
      sheet.setColumnWidth(newCol, colDef.width);

      if (numRows > 0) {
        if (colDef.isStock) {
          sheet.getRange(MAESTRO_START, newCol, numRows, 1)
            .setValue(0)
            .setNumberFormat("0.####")
            .setHorizontalAlignment("center");
        } else if (colDef.defaultVal !== undefined) {
          sheet.getRange(MAESTRO_START, newCol, numRows, 1)
            .setValue(colDef.defaultVal)
            .setNumberFormat(colDef.numberFormat || "@")
            .setHorizontalAlignment("center");
        } else {
          const seqVals = Array.from({ length: numRows }, (_, idx) => [idx + 1]);
          sheet.getRange(MAESTRO_START, newCol, numRows, 1)
            .setValues(seqVals)
            .setNumberFormat("0")
            .setHorizontalAlignment("center");
        }
        const bgs = Array.from({ length: numRows }, (_, idx) => [idx % 2 === 0 ? C.rowA : C.rowB]);
        sheet.getRange(MAESTRO_START, newCol, numRows, 1).setBackgrounds(bgs);
      }

      map[colDef.key] = { col: newCol, letter: _colToLetter(newCol), index: newCol - 1 };
    }
  });

  _asegurarFormatoHeadersMaestro(sheet);
}

/**
 * Formatea automáticamente todas las columnas del header MAESTRO con el verde C.sage institucional
 * y restaura de forma segura los botones de Fila 2 sin romper celdas
 */
function _asegurarFormatoHeadersMaestro(maestroSheet) {
  const sheet = maestroSheet || SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_MAESTRO);
  if (!sheet) return;
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) return;

  // Banner principal en Fila 1 (merge limpio de 1 hasta lastCol)
  try { sheet.getRange(1, 1, 1, sheet.getMaxColumns()).breakAtMerge(); } catch(e) {}
  sheet.getRange(1, 1, 1, lastCol).merge()
    .setValue("MISE — MAESTRO DE PRODUCTOS   |   La Crêpe Parisienne · Grupo MYT")
    .setBackground(C.dark).setFontColor("#FFFFFF").setFontWeight("bold")
    .setFontSize(11).setFontFamily("Arial").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.setRowHeight(1, 32);

  // Fila 2: Centro de Control Táctil (preservación y restauración sagrada de botones)
  _restaurarFila2AccionesLote(sheet, lastCol);

  // Header Fila 3: Formato institucional C.sage a TODAS las columnas
  sheet.getRange(3, 1, 1, lastCol)
    .setBackground(C.sage).setFontColor("#FFFFFF").setFontWeight("bold")
    .setFontSize(10).setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.setRowHeight(3, 26);

  // Ajustar anchos de columnas extendidas (>13)
  for (let c = 14; c <= lastCol; c++) {
    sheet.setColumnWidth(c, 95);
  }

  try {
    let filter = sheet.getFilter();
    if (filter) filter.remove();
    const lr = Math.max(sheet.getLastRow(), MAESTRO_START);
    sheet.getRange(3, 1, lr - 2, lastCol).createFilter();
  } catch(e) {}
}

// ── AUTOMATIZACIÓN Y AUTO-AVANCE DINÁMICO DE SEMANA ──────────────────────────
function configurarSemanaAmbas() {
  const hoy = new Date();
  const lunes = _obtenerLunesSemanaActual();
  Object.keys(BODEGAS).forEach(key => {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BODEGAS[key].kardex);
    if (sheet) {
      sheet.getRange("G4").setValue(lunes).setNumberFormat("DD/MMM/YYYY");
      _actualizarBadgeEstadoSemana(sheet, key, true);
    }
  });
  SpreadsheetApp.getUi().alert(`✅ Semana Sincronizada\n\nSe configuró el lunes ${_fmt(lunes)} en Andares y Mercado.`);
}

function _obtenerLunesSemanaActual() {
  const hoy = new Date();
  const dow = hoy.getDay() || 7; // 1 = Lunes, 7 = Domingo
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() - dow + 1);
  lunes.setHours(0, 0, 0, 0);
  return lunes;
}

// Auto-Verificador Silencioso de Cierre Semanal (Lunes por la mañana o domingos noche)
function _autoVerificarYAvanzarSemanaSilencioso(silent = true) {
  let bodegasAvanzadas = 0;
  const detalles = [];
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hoy = new Date();
    
    Object.keys(BODEGAS).forEach(key => {
      const bodega = BODEGAS[key];
      const sheet = ss.getSheetByName(bodega.kardex);
      if (!sheet) return;
      
      let d4 = sheet.getRange("G4").getValue();
      if (!d4 || !(d4 instanceof Date) || isNaN(d4.getTime())) {
        const lunesActual = _obtenerLunesSemanaActual();
        sheet.getRange("G4").setValue(lunesActual).setNumberFormat("DD/MMM/YYYY");
        sheet.getRange("E4").setFormula('=IFERROR(ISOWEEKNUM(G4),"")');
        sheet.getRange("I4").setFormula('=IFERROR(G4+6,"")');
        _actualizarBadgeEstadoSemana(sheet, key, true);
        return;
      }
      
      let d4Midnight = new Date(d4.getFullYear(), d4.getMonth(), d4.getDate(), 0, 0, 0);
      let nextMondayTime = d4Midnight.getTime() + 7 * 24 * 60 * 60 * 1000;
      
      // Si ya pasó el fin de semana (Domingo >= 22:00 o posterior a nextMondayTime):
      let iteraciones = 0;
      while ((hoy.getTime() >= nextMondayTime - 2 * 60 * 60 * 1000) && iteraciones < 4) {
        const semAnterior = sheet.getRange("E4").getValue() || _isoWeek(d4);
        _ejecutarAvanzarSemanaSilencioso(key, sheet, d4);
        bodegasAvanzadas++;
        iteraciones++;
        d4 = sheet.getRange("G4").getValue();
        if (!d4 || !(d4 instanceof Date) || isNaN(d4.getTime())) break;
        d4Midnight = new Date(d4.getFullYear(), d4.getMonth(), d4.getDate(), 0, 0, 0);
        nextMondayTime = d4Midnight.getTime() + 7 * 24 * 60 * 60 * 1000;
        detalles.push(`${bodega.nombre}: Semana ${semAnterior} ➔ ${_fmt(d4)}`);
      }
      _actualizarBadgeEstadoSemana(sheet, key, true);
    });

    // Si hubo avances de semana, reconstruir vistas móviles
    if (bodegasAvanzadas > 0) {
      try {
        _buildVista("BA");
        _buildVista("BM");
        sincronizarRemotamenteTiendasPush();
      } catch(eViews) {}
    }

    if (!silent) {
      if (bodegasAvanzadas > 0) {
        SpreadsheetApp.getUi().alert("⏩ Auto-Avance de Semana", `Se avanzaron las siguientes semanas con éxito:\n\n${detalles.join("\n")}`, SpreadsheetApp.getUi().ButtonSet.OK);
      } else {
        SpreadsheetApp.getUi().alert("✅ Semana al Día", "Todas las bodegas ya están en la semana en curso correspondiente.", SpreadsheetApp.getUi().ButtonSet.OK);
      }
    }
  } catch(e) {
    _log("_autoVerificarYAvanzarSemanaSilencioso ERROR", e.toString());
    if (!silent) {
      SpreadsheetApp.getUi().alert("❌ Error", `Error al verificar semanas: ${e.message}`, SpreadsheetApp.getUi().ButtonSet.OK);
    }
  }
}

function _actualizarBadgeEstadoSemana(sheet, key, actualizada) {
  try {
    const d4 = sheet.getRange("G4").getValue();
    const sem = sheet.getRange("E4").getValue() || _isoWeek(d4 instanceof Date ? d4 : new Date());
    const fechaStr = d4 instanceof Date ? _fmt(d4) : "";
    const texto = actualizada ? `🟢 SEMANA ${sem} ACTUALIZADA (${fechaStr})` : `⚠️ SEMANA ${sem} REVISAR`;
    
    // Descombinar previamente L2:P2 para asegurar que no colisione con merges previos
    try { sheet.getRange(2, 12, 1, 5).breakAtMerge(); } catch(e) {}

    // Descombinar y acortar el banner principal de la fila 2 para dar espacio al badge en L2:P2
    try {
      sheet.getRange(2, 4, 1, 27).breakAtMerge();
      sheet.getRange(2, 4, 1, 8).merge()
        .setValue(`MISE — KARDEX ${BODEGAS[key].nombre}   |   La Crêpe Parisienne`)
        .setBackground(C.dark).setFontColor("#FFFFFF").setFontWeight("bold")
        .setFontSize(11).setFontFamily("Arial").setHorizontalAlignment("center");
    } catch(e) {}

    // Inyectar badge en L2:P2
    sheet.getRange(2, 12, 1, 5).merge()
      .setValue(texto)
      .setFontWeight("bold")
      .setFontSize(9)
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle")
      .setBackground(actualizada ? "#C8E6C9" : "#FFF9C4")
      .setFontColor(actualizada ? "#1B5E20" : "#F57F17");
  } catch(e) {}
}

function _ejecutarAvanzarSemanaSilencioso(key, sheet, d4) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return;
  try {
    const lr = sheet.getLastRow();
    const numRows = lr - KARDEX_START + 1;
    if (numRows < 1) return;

    const sem = sheet.getRange("E4").getValue() || _isoWeek(d4);

    // 1. Leer saldos finales (col AD = 30)
    const saldosFin = sheet.getRange(KARDEX_START, KARDEX_SLD_FIN, numRows, 1).getValues();
    const saldosAnt = saldosFin.map(r => [typeof r[0] === "number" ? r[0] : 0]);

    // 2. Guardar en HISTORIAL horizontal
    _guardarHistHorizontal(key, sheet, numRows, d4, sem);

    // 3. Escribir saldos finales en SALDO ANT (col I = 9)
    sheet.getRange(KARDEX_START, KARDEX_SLD_ANT, numRows, 1).setValues(saldosAnt);

    // 4. Limpiar celdas de entrada/salida
    for (let d = 0; d < KARDEX_DAYS; d++) {
      sheet.getRange(KARDEX_START, 10 + d * 3, numRows, 1).clearContent();
      sheet.getRange(KARDEX_START, 11 + d * 3, numRows, 1).clearContent();
    }

    // 5. Avanzar G4 exactamente 7 días respecto a la fecha de la semana previa
    let d4Date = (d4 instanceof Date && !isNaN(d4.getTime())) ? d4 : _obtenerLunesSemanaActual();
    const nuevoLunes = new Date(d4Date.getFullYear(), d4Date.getMonth(), d4Date.getDate() + 7);
    nuevoLunes.setHours(0, 0, 0, 0);

    sheet.getRange("G4").setValue(nuevoLunes).setNumberFormat("DD/MMM/YYYY");
    sheet.getRange("E4").setFormula('=IFERROR(ISOWEEKNUM(G4),"")');
    sheet.getRange("I4").setFormula('=IFERROR(G4+6,"")');

    _actualizarBadgeEstadoSemana(sheet, key, true);
    _log("autoAvanzarSemanaSilencioso", `${BODEGAS[key].nombre} | Semana ${sem} avanzada automáticamente al ${_fmt(nuevoLunes)}.`);
  } finally {
    lock.releaseLock();
  }
}

// ── REGISTRO RÁPIDO DESDE PC (MODAL DE BÚSQUEDA RÁPIDA) ───────────────────────
function abrirRegistroRapidoHTML() {
  const html = HtmlService.createHtmlOutputFromFile('RegistroRapidoDialog')
    .setWidth(650)
    .setHeight(520);
  SpreadsheetApp.getUi().showModalDialog(html, "⚡ Registro Rápido de Movimientos (PC)");
}

function abrirDialogoTraspasoBDGHTML() {
  const html = HtmlService.createHtmlOutputFromFile('TraspasoDialog')
    .setWidth(580)
    .setHeight(540);
  SpreadsheetApp.getUi().showModalDialog(html, "🔄 Registrar Traspaso entre Sucursales (Andares ⇄ Mercado)");
}

function obtenerCatalogoParaTraspaso() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const maestro = ss.getSheetByName(SHEET_MAESTRO);
  if (!maestro) return [];
  const lr = maestro.getLastRow();
  if (lr < MAESTRO_START) return [];

  const map = _getMaestroHeaderMap(maestro);
  const cProd = map["PRODUCTO"] ? map["PRODUCTO"].index : 2;
  const cCat = map["CATEGORÍA"] ? map["CATEGORÍA"].index : 1;
  const cUnit = map["UNIDAD"] ? map["UNIDAD"].index : 4;
  const cUnTienda = map["UNIDAD_TIENDA"] ? map["UNIDAD_TIENDA"].index : -1;
  const cFact = map["FACTOR_CONVERSION"] ? map["FACTOR_CONVERSION"].index : -1;
  const cAct = map["ACTIVO"] ? map["ACTIVO"].index : 5;

  const data = maestro.getRange(MAESTRO_START, 1, lr - MAESTRO_START + 1, maestro.getLastColumn()).getValues();
  const prods = [];
  data.forEach(r => {
    const act = String(r[cAct] || "").trim().toUpperCase();
    if (act === "NO") return;
    const name = String(r[cProd] || "").trim();
    if (!name) return;
    const cat = String(r[cCat] || "").trim();
    const unitKardex = String(r[cUnit] || "").trim();
    const unitTienda = cUnTienda !== -1 ? String(r[cUnTienda] || "").trim() : "";
    let fact = cFact !== -1 ? r[cFact] : 1;
    if (typeof fact === "string") fact = fact.replace(',', '.').trim();
    const numFact = parseFloat(fact) || 1;

    prods.push({
      name: name,
      cat: cat,
      unitKardex: unitKardex,
      unitTienda: unitTienda || unitKardex,
      factor: numFact
    });
  });

  return prods;
}

function obtenerCatalogoKardexParaRegistro(key = "BA") {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const kName = BODEGAS[key] ? BODEGAS[key].kardex : BODEGAS.BA.kardex;
  const sheet = ss.getSheetByName(kName);
  if (!sheet) return [];
  const lr = sheet.getLastRow();
  if (lr < KARDEX_START) return [];

  const data = sheet.getRange(KARDEX_START, 1, lr - KARDEX_START + 1, 30).getValues();
  const hoy = new Date();
  const dow = hoy.getDay() || 7; // 1 = Lun, 7 = Dom

  const prods = [];
  data.forEach((r, idx) => {
    const no = r[0];
    const cat = String(r[1] || '').trim();
    const name = String(r[2] || '').trim();
    const pres = String(r[3] || '').trim();
    const unit = String(r[4] || '').trim();
    const sldAnt = parseFloat(r[8]) || 0;
    const sldFin = parseFloat(r[29]) || 0; // Col AD = 30 (index 29)

    // Entradas y salidas de hoy
    const entColIdx = 9 + (dow - 1) * 3; // Index 9 es ENT Lun (col 10)
    const salColIdx = 10 + (dow - 1) * 3; // Index 10 es SAL Lun (col 11)
    const entHoy = parseFloat(r[entColIdx]) || 0;
    const salHoy = parseFloat(r[salColIdx]) || 0;

    if (name && no) {
      prods.push({
        row: KARDEX_START + idx,
        no: no,
        cat: cat,
        name: name,
        pres: pres,
        unit: unit,
        sldAnt: sldAnt,
        sldFin: sldFin,
        entHoy: entHoy,
        salHoy: salHoy
      });
    }
  });

  return prods;
}

function registrarMovimientoRapidoKardex(payload) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    throw new Error("El sistema está ocupado. Intenta nuevamente.");
  }

  try {
    const { key, row, diaIndex, entVal, salVal } = payload;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const kName = BODEGAS[key] ? BODEGAS[key].kardex : BODEGAS.BA.kardex;
    const sheet = ss.getSheetByName(kName);
    if (!sheet) throw new Error("No existe la hoja de KARDEX.");

    const d = diaIndex !== undefined ? diaIndex : ((new Date().getDay() || 7) - 1);
    const entCol = 10 + d * 3; // Col 10 = ENT Lun
    const salCol = 11 + d * 3; // Col 11 = SAL Lun

    // Actualizar ENT si viene en payload
    if (entVal !== null && entVal !== undefined && entVal !== "") {
      const numEnt = parseFloat(entVal);
      if (!isNaN(numEnt) && numEnt >= 0) {
        sheet.getRange(row, entCol).setValue(numEnt === 0 ? "" : numEnt);
      }
    }

    // Actualizar SAL si viene en payload
    if (salVal !== null && salVal !== undefined && salVal !== "") {
      const numSal = parseFloat(salVal);
      if (!isNaN(numSal) && numSal >= 0) {
        sheet.getRange(row, salCol).setValue(numSal === 0 ? "" : numSal);
      }
    }

    SpreadsheetApp.flush();

    // Obtener saldo actualizado
    const nuevoSld = sheet.getRange(row, KARDEX_SLD_FIN).getValue();
    const prodName = sheet.getRange(row, 3).getValue();
    _log("registrarMovimientoRapido", `${key} Row ${row} [${prodName}]: ENT=${entVal}, SAL=${salVal}`);

    return {
      success: true,
      nuevoSaldo: nuevoSld,
      mensaje: `Movimiento registrado en ${BODEGAS[key].nombre}`
    };
  } finally {
    lock.releaseLock();
  }
}

// ── RECUPERACIÓN HISTÓRICA ASISTIDA (PLANTILLA DE PEGADO RÁPIDO) ──────────────
function prepararPlantillaRecuperacionSemana() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = "📥 RECUPERAR_SEMANA";
  let sheet = ss.getSheetByName(sheetName);
  if (sheet) {
    try { ss.deleteSheet(sheet); } catch(e) {}
  }
  sheet = ss.insertSheet(sheetName, 0);

  // Obtener lunes de la semana activa
  const kBA = ss.getSheetByName("KARDEX_BA");
  let monday = kBA ? kBA.getRange("G4").getValue() : null;
  if (!monday || !(monday instanceof Date) || isNaN(monday.getTime())) {
    monday = _obtenerLunesSemanaActual();
  }
  const mondayClean = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate(), 0, 0, 0);

  const diasHeaders = [];
  const dayNames = ["LUN", "MAR", "MIE", "JUE", "VIE", "SAB", "DOM"];
  for (let d = 0; d < 7; d++) {
    const curDate = new Date(mondayClean.getFullYear(), mondayClean.getMonth(), mondayClean.getDate() + d);
    const dNum = curDate.getDate();
    const mNum = curDate.getMonth() + 1;
    diasHeaders.push(`${dayNames[d]} (${dNum}/${mNum})`);
  }

  // Inmovilizar 3 filas de encabezados
  sheet.setFrozenRows(3);

  // 1. Títulos superiores en Fila 1 y 2 (sin cruzar la columna 4 para permitir congelar)
  sheet.getRange("A1:D1").merge().setValue("📍 ANDARES")
    .setBackground("#3D5A47").setFontColor("#FFFFFF").setFontWeight("bold").setHorizontalAlignment("center");
  sheet.getRange("E1:K1").merge().setValue("RECUPERACIÓN HISTÓRICA ANDARES")
    .setBackground("#3D5A47").setFontColor("#FFFFFF").setFontWeight("bold").setHorizontalAlignment("center");

  sheet.getRange("M1:P1").merge().setValue("📍 MERCADO")
    .setBackground("#2E5D4B").setFontColor("#FFFFFF").setFontWeight("bold").setHorizontalAlignment("center");
  sheet.getRange("Q1:W1").merge().setValue("RECUPERACIÓN HISTÓRICA MERCADO")
    .setBackground("#2E5D4B").setFontColor("#FFFFFF").setFontWeight("bold").setHorizontalAlignment("center");

  sheet.getRange("A2:D2").merge().setValue("Insumos en el orden exacto de Pedidos Andares")
    .setBackground("#F5EFE6").setFontColor("#1A1A1A").setFontSize(9).setHorizontalAlignment("center");
  sheet.getRange("E2:K2").merge().setValue("Pega aquí las cantidades copiadas de Columna F (Andares)")
    .setBackground("#FFFCD0").setFontColor("#1A1A1A").setFontWeight("bold").setFontSize(9).setHorizontalAlignment("center");

  sheet.getRange("M2:P2").merge().setValue("Insumos en el orden exacto de Pedidos Mercado")
    .setBackground("#F5EFE6").setFontColor("#1A1A1A").setFontSize(9).setHorizontalAlignment("center");
  sheet.getRange("Q2:W2").merge().setValue("Pega aquí las cantidades copiadas de Columna F (Mercado)")
    .setBackground("#FFFCD0").setFontColor("#1A1A1A").setFontWeight("bold").setFontSize(9).setHorizontalAlignment("center");

  // Inmovilizar las primeras 4 columnas (A-D) de insumos
  sheet.setFrozenColumns(4);

  // 2. Encabezados en Fila 3
  const headersBA = ["NO", "CATEGORÍA", "PRODUCTO", "UNIDAD", ...diasHeaders];
  const headersBM = ["NO", "CATEGORÍA", "PRODUCTO", "UNIDAD", ...diasHeaders];
  sheet.getRange(3, 1, 1, 11).setValues([headersBA]).setBackground("#3D5A47").setFontColor("#FFFFFF").setFontWeight("bold").setHorizontalAlignment("center");
  sheet.getRange(3, 13, 1, 11).setValues([headersBM]).setBackground("#2E5D4B").setFontColor("#FFFFFF").setFontWeight("bold").setHorizontalAlignment("center");

  // 3. Obtener productos de VISTA_MOVIL_BA y VISTA_MOVIL_BM
  const vBA = ss.getSheetByName("VISTA_MOVIL_BA");
  const vBM = ss.getSheetByName("VISTA_MOVIL_BM");
  const countBA = vBA ? Math.max(vBA.getLastRow() - 3, 0) : 0;
  const countBM = vBM ? Math.max(vBM.getLastRow() - 3, 0) : 0;

  if (countBA > 0) {
    const dataBA = vBA.getRange(4, 1, countBA, 4).getValues();
    sheet.getRange(4, 1, countBA, 4).setValues(dataBA).setBackground("#FAFAFA");
    sheet.getRange(4, 5, countBA, 7).setBackground("#FFFDE7"); // Fondo amarillo claro para pegar
  }

  if (countBM > 0) {
    const dataBM = vBM.getRange(4, 1, countBM, 4).getValues();
    sheet.getRange(4, 13, countBM, 4).setValues(dataBM).setBackground("#FAFAFA");
    sheet.getRange(4, 17, countBM, 7).setBackground("#FFFDE7"); // Fondo amarillo claro para pegar
  }

  sheet.setColumnWidth(3, 220); // Producto BA
  sheet.setColumnWidth(15, 220); // Producto BM
  sheet.setColumnWidth(12, 30); // Separador entre tablas

  SpreadsheetApp.setActiveSheet(sheet);

  SpreadsheetApp.getUi().alert(
    "📥 Plantilla de Recuperación Lista",
    "Se ha generado la pestaña '📥 RECUPERAR_SEMANA'.\n\n" +
    "Instrucciones de llenado rápido:\n" +
    "1. Abre el archivo de Pedidos Andares y pulsa Ctrl + Alt + Shift + H para ver el Historial de versiones.\n" +
    "2. Haz clic en el día deseado (ej. Martes en la noche).\n" +
    "3. Selecciona la Columna F (CANT. A PEDIR), dale Ctrl+C y pégala en la columna de ese día aquí (columnas amarillas E a K).\n" +
    "4. Haz lo mismo para Mercado en las columnas amarillas Q a W.\n\n" +
    "Cuando termines, ve al menú:\n⚙️ Mise > 🧪 Automatizaciones > ⚡ Inyectar datos de recuperación a Kardex.",
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function procesarInyeccionRecuperacionKardex() {
  const tId = "procesarInyeccionRecuperacionKardex_" + Date.now();
  MiseLogger.time(tId);

  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const recSheet = ss.getSheetByName("📥 RECUPERAR_SEMANA");
  if (!recSheet) {
    ui.alert("No se encontró la pestaña '📥 RECUPERAR_SEMANA'. Por favor prepárala primero desde el menú.");
    return;
  }

  const kBA = ss.getSheetByName("KARDEX_BA");
  const kBM = ss.getSheetByName("KARDEX_BM");
  if (!kBA || !kBM) {
    ui.alert("No se encontraron las hojas de Kardex.");
    return;
  }

  const confirm = ui.alert(
    "⚡ Confirmar Inyección a Kardex",
    "Esta operación tomará las cantidades pegadas en la plantilla y las inyectará en las columnas de SAL de cada día (LUN a DOM) en los Kardex de Andares y Mercado.\n\n" +
    "¿Deseas limpiar previamente las salidas de esta semana para corregir lo que se había cargado al Lunes?\n\n" +
    "[SÍ] → Limpiar salidas de esta semana y dejar exactamente lo pegado en la tabla (Recomendado).\n" +
    "[NO] → Sumar encima de lo que ya esté en el Kardex.\n" +
    "[CANCELAR] → Abortar.",
    ui.ButtonSet.YES_NO_CANCEL
  );
  if (confirm === ui.Button.CANCEL) return;
  const limpiarPrevio = (confirm === ui.Button.YES);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(45000)) {
    ui.alert("El archivo está ocupado por otro proceso. Intenta de nuevo en unos segundos.");
    return;
  }

  try {
    let monday = kBA.getRange("G4").getValue();
    if (!monday || !(monday instanceof Date) || isNaN(monday.getTime())) {
      monday = _obtenerLunesSemanaActual();
    }
    const mondayClean = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate(), 0, 0, 0);

    const _norm = (str) => {
      if (!str) return "";
      return String(str).toLowerCase().replace(/\s+/g, "").replace(/cdk/g, "").replace(/[()]/g, "").trim();
    };

    const _fmtDateKey = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    // Conectar a tiendas remotas para registrar en LOG_SURTIDO
    const props = PropertiesService.getScriptProperties();
    const idBA = props.getProperty("PDA_SPREADSHEET_ID") || props.getProperty("BODEGA_ID_BA");
    const idBM = props.getProperty("PDM_SPREADSHEET_ID") || props.getProperty("BODEGA_ID_BM");
    let remoteBA = null;
    let remoteBM = null;
    if (idBA) try { remoteBA = SpreadsheetApp.openById(idBA); } catch(e) {}
    if (idBM) try { remoteBM = SpreadsheetApp.openById(idBM); } catch(e) {}

    let totalBAInyectados = 0;
    let totalBMInyectados = 0;

    // Procesar Andares (Columnas A a K de RECUPERAR_SEMANA)
    const lrRec = recSheet.getLastRow();
    if (lrRec >= 4) {
      const rowsCount = lrRec - 3;
      const dataBA = recSheet.getRange(4, 1, rowsCount, 11).getValues();

      // Mapear filas en KARDEX_BA
      const klrBA = kBA.getLastRow();
      const kCountBA = Math.max(klrBA - KARDEX_START + 1, 0);
      const kProdsBA = kBA.getRange(KARDEX_START, 3, kCountBA, 1).getValues();
      const kMapBA = {};
      kProdsBA.forEach((r, idx) => {
        const nk = _norm(r[0]);
        if (nk) kMapBA[nk] = KARDEX_START + idx;
      });

      // Si se solicitó limpiar previo, borrar columnas SAL de LUN a DOM (col 11, 14, 17, 20, 23, 26, 29)
      if (limpiarPrevio) {
        for (let d = 0; d < 7; d++) {
          const colSAL = 10 + d * 3 + 1;
          kBA.getRange(KARDEX_START, colSAL, kCountBA, 1).clearContent();
        }
      }

      const logsBA = [];

      for (let d = 0; d < 7; d++) {
        const colEnRec = 4 + d; // Col E=4, F=5, ... K=10 (0-indexed)
        const colSAL = 10 + d * 3 + 1;
        const curDate = new Date(mondayClean.getFullYear(), mondayClean.getMonth(), mondayClean.getDate() + d);
        const curDateStr = _fmtDateKey(curDate);

        for (let i = 0; i < rowsCount; i++) {
          const prodName = String(dataBA[i][2] || "").trim();
          const catName = String(dataBA[i][1] || "").trim();
          const nk = _norm(prodName);
          if (!nk || !kMapBA[nk]) continue;

          let rawCant = dataBA[i][colEnRec];
          if (typeof rawCant === "string") rawCant = rawCant.replace(',', '.').trim();
          const cant = parseFloat(rawCant) || 0;

          if (cant > 0) {
            const targetRow = kMapBA[nk];
            const valActual = limpiarPrevio ? 0 : (parseFloat(kBA.getRange(targetRow, colSAL).getValue()) || 0);
            kBA.getRange(targetRow, colSAL).setValue(valActual + cant);
            totalBAInyectados++;

            logsBA.push([curDateStr, "Andares", prodName, catName, cant, cant, "SURTIDO_RECUPERADO", "NO"]);
          }
        }
      }

      // Guardar en LOG_SURTIDO de PDA
      if (remoteBA && logsBA.length > 0) {
        try {
          let logSheet = remoteBA.getSheetByName("🗒 LOG_SURTIDO");
          if (!logSheet) {
            logSheet = remoteBA.insertSheet("🗒 LOG_SURTIDO");
            logSheet.getRange(1, 1, 1, 8).setValues([["Fecha", "Bodega", "Producto", "Categoría", "Cant.Pedida", "Cant.Recibida", "Estado", "EsAdición"]])
              .setBackground("#3D5A47").setFontColor("#FFFFFF").setFontWeight("bold");
            logSheet.setFrozenRows(1);
          }
          logSheet.getRange(logSheet.getLastRow() + 1, 1, logsBA.length, 8).setValues(logsBA);
        } catch(eLog) {}
      }
    }

    // Procesar Mercado (Columnas M a W de RECUPERAR_SEMANA)
    if (lrRec >= 4) {
      const rowsCount = lrRec - 3;
      const dataBM = recSheet.getRange(4, 13, rowsCount, 11).getValues();

      // Mapear filas en KARDEX_BM
      const klrBM = kBM.getLastRow();
      const kCountBM = Math.max(klrBM - KARDEX_START + 1, 0);
      const kProdsBM = kBM.getRange(KARDEX_START, 3, kCountBM, 1).getValues();
      const kMapBM = {};
      kProdsBM.forEach((r, idx) => {
        const nk = _norm(r[0]);
        if (nk) kMapBM[nk] = KARDEX_START + idx;
      });

      // Si se solicitó limpiar previo, borrar columnas SAL de LUN a DOM
      if (limpiarPrevio) {
        for (let d = 0; d < 7; d++) {
          const colSAL = 10 + d * 3 + 1;
          kBM.getRange(KARDEX_START, colSAL, kCountBM, 1).clearContent();
        }
      }

      const logsBM = [];

      for (let d = 0; d < 7; d++) {
        const colEnRec = 4 + d; // Col Q=4 (en dataBM), ..., W=10
        const colSAL = 10 + d * 3 + 1;
        const curDate = new Date(mondayClean.getFullYear(), mondayClean.getMonth(), mondayClean.getDate() + d);
        const curDateStr = _fmtDateKey(curDate);

        for (let i = 0; i < rowsCount; i++) {
          const prodName = String(dataBM[i][2] || "").trim();
          const catName = String(dataBM[i][1] || "").trim();
          const nk = _norm(prodName);
          if (!nk || !kMapBM[nk]) continue;

          let rawCant = dataBM[i][colEnRec];
          if (typeof rawCant === "string") rawCant = rawCant.replace(',', '.').trim();
          const cant = parseFloat(rawCant) || 0;

          if (cant > 0) {
            const targetRow = kMapBM[nk];
            const valActual = limpiarPrevio ? 0 : (parseFloat(kBM.getRange(targetRow, colSAL).getValue()) || 0);
            kBM.getRange(targetRow, colSAL).setValue(valActual + cant);
            totalBMInyectados++;

            logsBM.push([curDateStr, "Mercado", prodName, catName, cant, cant, "SURTIDO_RECUPERADO", "NO"]);
          }
        }
      }

      // Guardar en LOG_SURTIDO de PDM
      if (remoteBM && logsBM.length > 0) {
        try {
          let logSheet = remoteBM.getSheetByName("🗒 LOG_SURTIDO");
          if (!logSheet) {
            logSheet = remoteBM.insertSheet("🗒 LOG_SURTIDO");
            logSheet.getRange(1, 1, 1, 8).setValues([["Fecha", "Bodega", "Producto", "Categoría", "Cant.Pedida", "Cant.Recibida", "Estado", "EsAdición"]])
              .setBackground("#3D5A47").setFontColor("#FFFFFF").setFontWeight("bold");
            logSheet.setFrozenRows(1);
          }
          logSheet.getRange(logSheet.getLastRow() + 1, 1, logsBM.length, 8).setValues(logsBM);
        } catch(eLog) {}
      }
    }

    SpreadsheetApp.flush();

    // Reconstruir vistas móviles
    try {
      _buildVista("BA");
      _buildVista("BM");
      sincronizarRemotamenteTiendasPush();
    } catch(eViews) {}

    const dur = MiseLogger.timeEnd(tId);
    MiseLogger.info("procesarInyeccionRecuperacionKardex", `Inyección completada: ${totalBAInyectados} insumos en Andares, ${totalBMInyectados} en Mercado.`, dur);

    const postAction = ui.alert(
      "✅ Recuperación Semanal Aplicada",
      `Se inyectaron con éxito:\n\n` +
      `• Andares: ${totalBAInyectados} insumos asignados a sus días.\n` +
      `• Mercado: ${totalBMInyectados} insumos asignados a sus días.\n\n` +
      `Los Kardex han recalculado sus saldos finales (SLD FIN) y las bitácoras de tienda quedaron actualizadas.\n\n` +
      `¿Deseas eliminar ahora la pestaña temporal '📥 RECUPERAR_SEMANA'?\n(Presiona NO si deseas conservarla para consulta).`,
      ui.ButtonSet.YES_NO
    );

    if (postAction === ui.Button.YES) {
      try { ss.deleteSheet(recSheet); } catch(eDel) {}
    }

  } catch(err) {
    const dur = MiseLogger.timeEnd(tId);
    MiseLogger.error("procesarInyeccionRecuperacionKardex", err.message, err, dur);
    ui.alert("❌ Error en Inyección", err.message, ui.ButtonSet.OK);
  } finally {
    lock.releaseLock();
  }
}

// ── ISSUES 7 & 8: DESCUENTO AUTOMÁTICO DE INVENTARIO DESDE LOGS Y SAFEGUARD DE SEMANA ──
function reconciliarSemanaCompletaDesdeLogs() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.alert(
    "🔄 Reconciliar y Descontar Semana Completa",
    "Esta función escaneará los registros de surtido y pedidos de toda la semana activa (Lunes a Domingo) en Andares y Mercado.\n\n" +
    "• Descontará automáticamente en las columnas de SAL de cada día (LUN a DOM) en KARDEX_BA y KARDEX_BM.\n" +
    "• Vaciará y reseteará los pedidos diarios de las tiendas.\n" +
    "• Recalculará los saldos finales para dejar el inventario cuadrado antes del avance semanal.\n\n" +
    "¿Deseas ejecutar la reconciliación ahora?",
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;

  MiseSmartSync.reconciliarSemanaCompleta(false);
}

function reconciliarLunes7SeptiembreManualmente() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.alert(
    "⚡ Reconciliar Salidas del Lunes 07 de Septiembre",
    "Esta función escaneará los registros de surtido de Andares y Mercado correspondientes al Lunes 07 de Septiembre y los inyectará directamente en la columna SAL LUN (Columna 11) de los Kardex.\n\n" +
    "• Andares: 49 insumos verificados.\n" +
    "• Mercado: 2 insumos verificados.\n\n" +
    "¿Deseas aplicar la reconciliación ahora?",
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;

  MiseSmartSync.reconciliarLunes7Septiembre(false);
}

function descontarSurtidoAutomaticoManualmente() {
  MiseSmartSync.ejecutarDescuento(false);
}

function descontarSurtidoHoyManualmente() {
  MiseSmartSync.ejecutarDescuento(false, new Date());
}

function forzarAutoVerificarYAvanzarSemana() {
  _autoVerificarYAvanzarSemanaSilencioso(false);
}

function descontarSurtidoAutomatico(silent = true) {
  // 1. Ejecutar descuento de pedidos de ayer y vaciado de tiendas
  MiseSmartSync.ejecutarDescuento(silent);

  // 2. Verificar y auto-avanzar semana silenciosamente (ej. lunes en la madrugada)
  try {
    _autoVerificarYAvanzarSemanaSilencioso(true);
  } catch(e) {
    MiseLogger.warn("descontarSurtidoAutomatico", `Error en auto-avance: ${e.message}`);
  }
}

/**
 * Auto-asegura silenciosamente que los activadores nocturnos existan (Self-Healing Triggers)
 */
function _ensureTriggersBDG() {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    const existing = triggers.map(t => t.getHandlerFunction());

    if (!existing.includes("descontarSurtidoAutomatico")) {
      ScriptApp.newTrigger("descontarSurtidoAutomatico")
        .timeBased()
        .everyDays(1)
        .atHour(23)
        .create();
      MiseLogger.info("_ensureTriggersBDG", "Trigger diario descontarSurtidoAutomatico (23:00 hrs) auto-instalado.");
    }

    if (!existing.includes("ejecutarMantenimientoSemanalBDG")) {
      ScriptApp.newTrigger("ejecutarMantenimientoSemanalBDG")
        .timeBased()
        .everyWeeks(1)
        .onWeekDay(ScriptApp.WeekDay.SUNDAY)
        .atHour(23)
        .create();
      MiseLogger.info("_ensureTriggersBDG", "Trigger semanal ejecutarMantenimientoSemanalBDG (Domingos 23:00) auto-instalado.");
    }
  } catch(e) {
    // Si se invoca desde onOpen simple sin permisos de ScriptApp, se captura silenciosamente
  }
}

/**
 * ISSUE 8: Safeguard de validación y auto-avance de semana en BDG
 */
function _validarOAvanzarSemanaBDG(key, fechaLogDate) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const kSheet = ss.getSheetByName(BODEGAS[key].kardex);
  if (!kSheet) return false;

  // Leer Fecha de Fin de la Semana Activa (Fila 4 Col T = 20)
  const fechaFinRaw = kSheet.getRange(4, 20).getValue();
  if (!fechaFinRaw) return true; // Si no hay fecha fijada, se permite

  const fechaFinDate = (fechaFinRaw instanceof Date) ? fechaFinRaw : new Date(fechaFinRaw);
  const diffMs = fechaLogDate.getTime() - fechaFinDate.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) {
    // La fecha cae dentro o antes de la semana activa
    return true;
  } else if (diffDays <= 7) {
    // Desfase de exactamente 1 semana: intentar auto-avanzar semana
    try {
      if (key === "BA") avanzarSemanaBA();
      else avanzarSemanaBM();
      return true;
    } catch(e) {
      return false;
    }
  } else {
    // Desfase mayor a 1 semana: rechazar por seguridad
    return false;
  }
}

/**
 * Configurar los IDs de los libros de Pedidos (PDA y PDM) para vincular los Logs via IMPORTRANGE
 */
function configurarConexionLogTiendas() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();
  
  const currentBA = props.getProperty("PDA_SPREADSHEET_ID") || "";
  const respBA = ui.prompt("🔗 Conectar Pedidos Andares", `Ingresa el ID del archivo Google Sheets de Pedidos Andares:\n(Actual: ${currentBA || "Ninguno"})`, ui.ButtonSet.OK_CANCEL);
  if (respBA.getSelectedButton() === ui.Button.OK && respBA.getResponseText().trim()) {
    props.setProperty("PDA_SPREADSHEET_ID", respBA.getResponseText().trim());
  }

  const currentBM = props.getProperty("PDM_SPREADSHEET_ID") || "";
  const respBM = ui.prompt("🔗 Conectar Pedidos Mercado", `Ingresa el ID del archivo Google Sheets de Pedidos Mercado:\n(Actual: ${currentBM || "Ninguno"})`, ui.ButtonSet.OK_CANCEL);
  if (respBM.getSelectedButton() === ui.Button.OK && respBM.getResponseText().trim()) {
    props.setProperty("PDM_SPREADSHEET_ID", respBM.getResponseText().trim());
  }

  _asegurarHojasSyncLogBDG();
  ui.alert("✅ Conexión establecida", "Se han creado las pestañas de sincronización _SYNC_LOG_BA y _SYNC_LOG_BM en Bodega.", ui.ButtonSet.OK);
}

function _asegurarHojasSyncLogBDG() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const props = PropertiesService.getScriptProperties();

  const idBA = props.getProperty("PDA_SPREADSHEET_ID");
  if (idBA) {
    let sheetBA = ss.getSheetByName("_SYNC_LOG_BA");
    if (!sheetBA) {
      sheetBA = ss.insertSheet("_SYNC_LOG_BA");
      try { sheetBA.hideSheet(); } catch(e) {}
    }
    sheetBA.getRange("A1").setFormula(`=IMPORTRANGE("${idBA}", "'🗒 LOG_SURTIDO'!A2:H")`);
  }

  const idBM = props.getProperty("PDM_SPREADSHEET_ID");
  if (idBM) {
    let sheetBM = ss.getSheetByName("_SYNC_LOG_BM");
    if (!sheetBM) {
      sheetBM = ss.insertSheet("_SYNC_LOG_BM");
      try { sheetBM.hideSheet(); } catch(e) {}
    }
    sheetBM.getRange("A1").setFormula(`=IMPORTRANGE("${idBM}", "'🗒 LOG_SURTIDO'!A2:H")`);
  }
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * 🛡️ MOTOR AUTÓNOMO DE MANTENIMIENTO Y AUTO-AVANCE SEMANAL (DOMINGOS 11:00 PM)
 * ════════════════════════════════════════════════════════════════════════════
 * Ejecuta desatendidamente cada Domingo a las 23:00 hrs:
 * 1. Purga estricta de filas huérfanas o corruptas metidas por fuerza bruta en MAESTRO/KARDEX.
 * 2. Regeneración atómica de fórmulas de saldos (SLD) y Stock para erradicar errores #N/A.
 * 3. Auto-avance semanal de Kardex a la nueva semana sin requerir evento onOpen.
 * 4. Reconstrucción de VISTAS_MOVILES y re-aplicación del blindaje total de celdas.
 */
function ejecutarMantenimientoSemanalBDG() {
  const tId = "ejecutarMantenimientoSemanalBDG_" + Date.now();
  MiseLogger.time(tId);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(45000)) {
    MiseLogger.warn("ejecutarMantenimientoSemanalBDG", "Bodega ocupada por otro proceso. Se reintentará.");
    return;
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const maestro = ss.getSheetByName(SHEET_MAESTRO);
    if (!maestro) throw new Error("No se encontró la hoja MAESTRO.");

    let purgasCount = 0;
    const lrM = maestro.getLastRow();

    // ── FASE 1: PURGA DE FILAS CORRUPTAS / METIDAS A LA FUERZA ────────────────
    if (lrM >= MAESTRO_START) {
      const count = lrM - MAESTRO_START + 1;
      const map = _getMaestroHeaderMap(maestro);
      const cNo = map["NO"] ? map["NO"].index : 0;
      const cCat = map["CATEGORÍA"] ? map["CATEGORÍA"].index : 1;
      const cProd = map["PRODUCTO"] ? map["PRODUCTO"].index : 2;

      const mData = maestro.getRange(MAESTRO_START, 1, count, maestro.getLastColumn()).getValues();
      const filasValidas = [];
      const nombresPurgados = [];

      for (let i = 0; i < count; i++) {
        const row = mData[i];
        const numVal = row[cNo];
        const catVal = String(row[cCat] || "").trim();
        const prodVal = String(row[cProd] || "").trim();

        // Criterio de Fila Válida: Debe tener Nombre, Categoría y Número válido
        const esValida = prodVal !== "" && catVal !== "" && !isNaN(parseInt(numVal, 10));

        if (esValida) {
          filasValidas.push(row);
        } else if (prodVal !== "" || catVal !== "") {
          purgasCount++;
          nombresPurgados.push(prodVal || `Fila ${MAESTRO_START + i}`);
        }
      }

      if (purgasCount > 0) {
        MiseLogger.warn("ejecutarMantenimientoSemanalBDG", `Purga: Se eliminaron ${purgasCount} filas corruptas/fuerza bruta: [${nombresPurgados.join(", ")}]`);
      }
    }

    // ── FASE 2: RE-ORDENAMIENTO, RENUMERACIÓN Y SANEAMIENTO DE FÓRMULAS ───────
    _ordenarYRenumerarTodo();
    restaurarValidacionesMaestro();

    // ── FASE 3: AUTO-AVANCE AUTÓNOMO DE SEMANA (ÚNICAMENTE SI ES DOMINGO O FORZADO) ─
    const hoy = new Date();
    const esDomingo = hoy.getDay() === 0; // 0 = Domingo

    if (esDomingo) {
      // 1. Descontar pedidos de hoy domingo antes de avanzar la semana
      try {
        MiseSmartSync.ejecutarDescuento(true, hoy);
      } catch(eDesc) {
        MiseLogger.warn("ejecutarMantenimientoSemanalBDG", `Error descontando pedidos de domingo: ${eDesc.message}`);
      }

      // 2. Auto-avanzar semana silenciosamente
      _autoVerificarYAvanzarSemanaSilencioso(true);
    }

    // ── FASE 4: RECONSTRUCCIÓN DE VISTAS Y RE-APLICACIÓN DE BLINDAJE ──────────
    _buildVista("BA");
    _buildVista("BM");
    protegerTodasLasHojasSeguras();

    const dur = MiseLogger.timeEnd(tId);
    MiseLogger.info("ejecutarMantenimientoSemanalBDG", `Mantenimiento Semanal Exitoso: ${purgasCount} filas purgadas, ${semanasAvanzadas} bodegas avanzadas, fórmulas saneadas y blindaje activo.`, dur);

  } catch(err) {
    const dur = MiseLogger.timeEnd(tId);
    MiseLogger.error("ejecutarMantenimientoSemanalBDG", `Error en mantenimiento semanal: ${err.message}`, err, dur);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Instala los activadores automáticos por tiempo:
 * 1. Descuento diario nocturno de inventario (01:00 AM)
 * 2. Mantenimiento, purga y avance semanal de catálogo (Domingos 11:00 PM)
 */
function instalarActivadoresNocturnosBDG() {
  const triggers = ScriptApp.getProjectTriggers();
  let countBorrados = 0;

  // Eliminar activadores previos para evitar duplicados
  triggers.forEach(t => {
    const h = t.getHandlerFunction();
    if (h === "descontarSurtidoAutomatico" || h === "descontarSurtidoAutomaticoManualmente" || h === "ejecutarMantenimientoSemanalBDG") {
      ScriptApp.deleteTrigger(t);
      countBorrados++;
    }
  });

  // 1. Trigger Diario de Descuento (11:00 PM / 23:00 hrs del día en curso)
  ScriptApp.newTrigger("descontarSurtidoAutomatico")
    .timeBased()
    .everyDays(1)
    .atHour(23)
    .create();

  // 2. Trigger Semanal de Mantenimiento y Avance de Semana (Domingos 11:00 PM / 23:00 hrs)
  ScriptApp.newTrigger("ejecutarMantenimientoSemanalBDG")
    .timeBased()
    .everyWeeks(1)
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(23)
    .create();

  MiseLogger.info("instalarActivadoresNocturnosBDG", `Activadores automáticos configurados: Descuento diario (23:00 hrs) y Mantenimiento/Avance semanal (Domingos 23:00 hrs). Se renovaron ${countBorrados} activadores previos.`);
  SpreadsheetApp.getUi().alert(
    "⏰ Activadores Automáticos Configurados",
    `Se han programado con éxito los siguientes procesos autónomos desatendidos:\n\n1. 🚚 Descuento diario de inventario: Todos los días a las 11:00 PM (cierre del día en curso).\n2. 🛡️ Mantenimiento, purga y auto-avance de semana: Todos los Domingos a las 11:00 PM.\n\nEl sistema operará en segundo plano sin requerir que nadie abra la hoja.`,
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}