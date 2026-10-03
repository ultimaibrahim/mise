/**
 * MISE — Bodegas Script v1.7.7o Altair (Configuración en un Clic · Enlace por Producto · Sin Descuento Fantasma · CANT. FINAL en Descuento · Auto-Avance Semanal Confiable · Hoja de Entradas Móvil · Conversión de Unidades, Traspasos Inter-Tiendas & Surtido Numérico)
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
  BA: { key: "BA", nombre: "Andares", kardex: "📦 Inventario Andares", historial: "🗄 Semanas pasadas Andares", vista: "VISTA_MOVIL_BA" },
  BM: { key: "BM", nombre: "Mercado", kardex: "📦 Inventario Mercado", historial: "🗄 Semanas pasadas Mercado", vista: "VISTA_MOVIL_BM" }
};

const SHEET_MAESTRO  = "📋 Catálogo";
const SHEET_LOG      = "🗒 Registro del sistema";
const SHEET_TRASPASOS = "🔄 Traspasos"; // aquí y no en MiseKardexEngine.js: HOJAS_TECNICAS_BDG la usa al cargar

// ── NOMBRES DE PESTAÑAS (1.7.6o) ─────────────────────────────────────────────────────────────
// Nombres por tarea para el usuario. Las hojas técnicas ocultas (VISTA_MOVIL_*, _SYNC_*, _…) NO cambian: las tiendas
// las leen por IMPORTRANGE. _hoja() acepta el nombre nuevo o el anterior, así el código funciona antes, durante y
// después del renombrado (lo hacen 🚀 Configurar, el onOpen instalable y el cierre de las 23:00).
const NOMBRES_ANTERIORES = {
  "📋 Catálogo": "MAESTRO",
  "📦 Inventario Andares": "KARDEX_BA",
  "📦 Inventario Mercado": "KARDEX_BM",
  "🗄 Semanas pasadas Andares": "HISTORIAL_BA",
  "🗄 Semanas pasadas Mercado": "HISTORIAL_BM",
  "📥 Registrar entradas": "📥 ENTRADAS",
  "🔄 Traspasos": "🔄 TRASPASOS",
  "🗒 Registro del sistema": "🗒 LOG"
};

function _hoja(libro, nombre) {
  if (!libro) return null;
  return libro.getSheetByName(nombre) || (NOMBRES_ANTERIORES[nombre] ? libro.getSheetByName(NOMBRES_ANTERIORES[nombre]) : null);
}

// Nombre vigente de una hoja aunque aún tenga su nombre anterior (para comparar en onEdit, listas, etc.)
function _nombreCanonico(nombre) {
  const nuevo = Object.keys(NOMBRES_ANTERIORES).find(n => NOMBRES_ANTERIORES[n] === nombre);
  return nuevo || nombre;
}

function _renombrarHojasBDG() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hechos = [];
  Object.keys(NOMBRES_ANTERIORES).forEach(nuevo => {
    const vieja = ss.getSheetByName(NOMBRES_ANTERIORES[nuevo]);
    if (vieja && !ss.getSheetByName(nuevo)) { vieja.setName(nuevo); hechos.push(`${NOMBRES_ANTERIORES[nuevo]} → ${nuevo}`); }
  });
  if (hechos.length) Object.keys(_refHojaCache).forEach(k => delete _refHojaCache[k]);
  if (hechos.length) MiseLogger.info("_renombrarHojasBDG", `Pestañas renombradas: ${hechos.join(" · ")}`);
  return hechos;
}
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

// Separa TODAS las combinaciones que toquen el rango, cada una completa (nunca un pedazo).
// breakApart() sobre un rango que corta una combinación falla, y Apps Script aplica las escrituras en
// lote: el error aparece en la SIGUIENTE lectura (fuera de cualquier try/catch local). Caso real: el badge
// de KARDEX_BA rompía el avance de KARDEX_BM al leer su G4.
function _separarCombinaciones(range) {
  range.getMergedRanges().forEach(m => m.breakApart());
  return range;
}

// Abre un libro desde una URL en cualquier formato (/u/0/, ?usp=, #gid=) o desde su ID pelón
function _abrirLibro(ref) {
  const txt = String(ref || "").trim();
  const m = txt.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  return SpreadsheetApp.openById(m ? m[1] : txt);
}

// Mapa NOMBRE (mayúsculas) → fila, para enlazar MAESTRO ↔ KARDEX por producto y no por posición
function _mapaFilasPorProducto(sheet, startRow, colProd) {
  const mapa = {};
  if (!sheet || sheet.getLastRow() < startRow) return mapa;
  sheet.getRange(startRow, colProd, sheet.getLastRow() - startRow + 1, 1).getValues().forEach((r, i) => {
    const n = String(r[0] || "").trim().toUpperCase();
    if (n && mapa[n] === undefined) mapa[n] = startRow + i;
  });
  return mapa;
}

function _getMaestroHeaderMap(sheet) {
  const targetSheet = sheet || _hoja(SpreadsheetApp.getActiveSpreadsheet(), SHEET_MAESTRO);
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
    { canonical: "RECEPCION_PESADA", aliases: ["RECEPCION_PESADA", "RECEPCIÓN_PESADA", "SE_RECIBE_PESADO", "PESADO"] },
    { canonical: "PROVEEDOR", aliases: ["PROVEEDOR", "PROVEEDORES", "SUPPLIER"] },
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
    // Con onOpen instalable (🚀 Configurar), el avance de semana y la hoja de Entradas se hacen allí
    // con 6 min y permisos completos. Sin él (libro no configurado), respaldo con tope de 18 s.
    if (PropertiesService.getScriptProperties().getProperty("ONOPEN_INSTALABLE") !== "1") {
      _autoVerificarYAvanzarSemanaSilencioso(true, 18000);
      _ensureTriggersBDG();
      if (!_hoja(SpreadsheetApp.getActiveSpreadsheet(), SHEET_ENTRADAS)) _prepararHojaEntradas();
    }
  } catch(e) {}
  try {
    const ui = SpreadsheetApp.getUi();
    // Menús (1.7.6t): ⚙️ Mise = uso diario (pocas opciones, el resto en "Más opciones"); 🛠 Técnico = mantenimiento
    // y zona de riesgo; 🧪 Mise DEV = solo si bdg/MiseDevTools.js está en el proyecto (los libros DEV).
    ui.createMenu("⚙️ Mise")
      .addItem("🚀 Configurar este libro", "configurarEsteLibroBDG")
      .addItem("⚡ Mise Powerhouse (catálogo y orden)", "abrirConstructorPickingHTML")
      .addItem("🔄 Registrar traspaso (computadora)", "abrirDialogoTraspasoBDGHTML")
      .addItem("🌐 Página de estado", "abrirPaginaEstado")
      .addSeparator()
      .addSubMenu(ui.createMenu("▸ Más opciones")
        .addSubMenu(ui.createMenu("📅 Semana")
          .addItem("Verificar y avanzar semanas ahora", "forzarAutoVerificarYAvanzarSemana")
          .addItem("Sincronizar semana actual (ambas bodegas)", "configurarSemanaAmbas")
          .addSeparator()
          .addItem("Configurar semana — Andares", "configurarSemanaBA")
          .addItem("Configurar semana — Mercado", "configurarSemanaBM")
          .addItem("Avanzar semana — Andares", "avanzarSemanaBA")
          .addItem("Avanzar semana — Mercado", "avanzarSemanaBM"))
        .addSubMenu(ui.createMenu("🚚 Descuentos")
          .addItem("Descontar pedidos de hoy (cierre)", "descontarSurtidoAutomaticoManualmente")
          .addItem("Descontar pedidos de ayer (desde registros)", "descontarSurtidoAyerManualmente")
          .addItem("Reconciliar días pasados de la semana", "reconciliarSemanaCompletaDesdeLogs"))
        .addSubMenu(ui.createMenu("📋 Catálogo")
          .addItem("⚖️ Llenar factores desde la presentación", "sugerirFactoresDesdePresentacion")
          .addItem("🧹 Eliminar productos duplicados", "eliminarDuplicadosCatalogo")
          .addSubMenu(ui.createMenu("🔢 Orden de picking = orden del Catálogo")
            .addItem("Andares", "restablecerPickingAndares")
            .addItem("Mercado", "restablecerPickingMercado")
            .addItem("Ambas tiendas", "restablecerPickingAmbas"))
          .addItem("🧠 Reconciliador de productos huérfanos", "abrirReconciliadorInteligenteHTML"))
        .addSubMenu(ui.createMenu("🔒 Seguridad")
          .addItem("👥 Administradores", "configurarAdministradores")
          .addItem("🔐 Cambiar contraseña de administrador", "cambiarPasswordAdmin")
          .addItem("🔐 Auditoría de permisos", "auditarPermisos")))
      .addSeparator()
      .addItem("ℹ️ Acerca de Mise", "acercaDe")
      .addToUi();

    ui.createMenu("🛠 Técnico")
      .addItem("🩺 Diagnosticar y reparar sistema", "repararYSincronizarSistemaManualmente")
      .addItem("🩺 Estado del sistema (resumen)", "mostrarEstadoSistema")
      .addItem("📥 Rehacer la hoja Registrar entradas", "prepararHojaEntradasManualmente")
      .addSeparator()
      .addItem("🩺 Diagnosticar activadores", "diagnosticarActivadores")
      .addItem("⏰ Reiniciar activadores", "instalarActivadoresNocturnosBDG")
      .addItem("🛡️ Ejecutar mantenimiento semanal", "ejecutarMantenimientoSemanalManualmente")
      .addItem("🔗 Conexión con los logs de tiendas", "configurarConexionLogTiendas")
      .addItem("🔒 Blindar todas las hojas", "protegerTodasLasHojasSeguras")
      .addSeparator()
      .addSubMenu(ui.createMenu("🏗️ Reconstruir (con respaldo)")
        .addItem("📦 Inventario Andares", "reconstruirKardexBAConRespaldo")
        .addItem("📦 Inventario Mercado", "reconstruirKardexBMConRespaldo")
        .addItem("📋 Catálogo", "reconstruirMaestroConRespaldo")
        .addSeparator()
        .addItem("Vista para Andares (VISTA_MOVIL_BA)", "crearVistaMovilBA")
        .addItem("Vista para Mercado (VISTA_MOVIL_BM)", "crearVistaMovilBM"))
      .addSeparator()
      .addItem("⚠️ Restablecer sistema desde cero (destructivo)", "setupCompleto")
      .addToUi();

    // 🧪 Mise DEV: herramientas de bdg/MiseDevTools.js (solo existen en los libros DEV)
    if (typeof procesarInyeccionRecuperacionKardex === "function") {
      ui.createMenu("🧪 Mise DEV")
        .addItem("Preparar plantilla de recuperación semanal", "prepararPlantillaRecuperacionSemana")
        .addItem("Inyectar datos de recuperación a Inventario y logs", "procesarInyeccionRecuperacionKardex")
        .addSeparator()
        .addItem("🎬 Preparar datos para el video", "prepararDatosVideo")
        .addToUi();
    }
  } catch(e) {}
}

// ── MOTOR AUTORREPARADOR (SELF-HEALING ENGINE) ────────────────────────────────
function repararYSincronizarSistemaManualmente() {
  _abrirMonitor("reparar");
}

// rep (1.7.7c): reporte al monitor de progreso; con rep no hay alertas (el resumen lo muestra el monitor)
function repararYSincronizarSistema(silent = false, rep = null) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const maestro = _hoja(ss, SHEET_MAESTRO);
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

      _pasoMonitor(rep, "Fórmulas y orden del Catálogo", () => {
        if (hasErrorBA || hasErrorBM || !silent) {
          _ordenarYRenumerarTodo();
          repairsCount++;
          return hasErrorBA || hasErrorBM ? "había errores; reconstruidas" : "reordenado y renumerado";
        }
        return "sin errores";
      });

      // 2. Verificar dropdowns y validaciones desprendidas + asegurar columnas de quiosco
      _pasoMonitor(rep, "Columnas y validaciones", () => { _asegurarColumnasQuioscoEnMaestro(maestro); restaurarValidacionesMaestro(); });

      // 3. Recrear Vistas Móviles
      _pasoMonitor(rep, "Vistas móviles", () => { _buildVista("BA"); _buildVista("BM"); });

      // 4. Asegurar activadores nocturnos autónomos
      _pasoMonitor(rep, "Activadores", () => { _ensureTriggersBDG(); });
    }

    if (rep) return { ok: true };
    if (!silent) {
      SpreadsheetApp.getActive().toast("🩺 Sistema verificado y autorreparado con éxito ✓", "⚙️ Mise Self-Healing", 4);
      SpreadsheetApp.getUi().alert("🩺 Diagnóstico Completo", "El sistema ha verificado todas las fórmulas, punteros y validaciones de MAESTRO y KARDEX.\n\nTodo se encuentra 100% sincronizado y saludable.", SpreadsheetApp.getUi().ButtonSet.OK);
    } else if (repairsCount > 0) {
      SpreadsheetApp.getActive().toast("🩺 Se detectaron y repararon fórmulas desfasadas automáticamente ✓", "⚙️ Mise Self-Healing", 4);
    }
  } catch (err) {
    if (rep) return { ok: false, error: err.message };
    if (!silent) {
      SpreadsheetApp.getUi().alert("❌ Error en Diagnóstico", err.toString(), SpreadsheetApp.getUi().ButtonSet.OK);
    }
  }
}

// ── onEdit: REGISTRO TRANSACCIONAL Y ACCIONES ──────────────────────────────────
// onEdit SIMPLE: corre con los permisos de QUIEN EDITA; una cuenta que no es el dueño no puede escribir en
// celdas protegidas (y fallaba en silencio). Con el instalable (corre como el dueño), el simple no hace nada.
function onEdit(e) {
  if (PropertiesService.getScriptProperties().getProperty("ONEDIT_INSTALABLE") === "1") return;
  _onEditBodega(e);
}

function _onEditBodega(e) {
  if (!e) return;
  const sheet = e.range.getSheet();
  const name  = _nombreCanonico(sheet.getName());
  const row   = e.range.getRow();
  const col   = e.range.getColumn();

  // 1. Manejo del Dropdown Nativo en MAESTRO (Desactivar/Anular productos y lote)
  if (name === SHEET_MAESTRO) {

    // 1.2 Manejo del Dropdown ACTIVO (SÍ / NO) en Columna F (col 6)
    const map = _getMaestroHeaderMap(sheet);
    const cAct = map["ACTIVO"] ? map["ACTIVO"].col : 6;
    // 1.1 PRESENTACIÓN escrita (administrador): sugerir unidad de pedido + factor si están vacíos
    if (map["PRESENTACION"] && col === map["PRESENTACION"].col && row >= MAESTRO_START) {
      const r = _aplicarFactoresSugeridos(sheet, row);
      if (r.aplicados.length) SpreadsheetApp.getActive().toast(r.aplicados[0], "⚖️ Factor sugerido", 6);
      else if (r.revisar.length) SpreadsheetApp.getActive().toast(r.revisar[0], "⚖️ Revisar factor", 8);
      return;
    }
    if (col === cAct && row >= MAESTRO_START) {
      const val = String(e.range.getValue()).trim().toUpperCase();
      const lock = LockService.getScriptLock();
      if (!lock.tryLock(15000)) return;
      try {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const cProdM = map["PRODUCTO"] ? map["PRODUCTO"].col : 3;
        const prodKey = String(sheet.getRange(row, cProdM).getValue() || "").trim().toUpperCase();
        Object.values(BODEGAS).forEach(b => {
          const kSheet = _hoja(ss, b.kardex);
          const kardexRow = _mapaFilasPorProducto(kSheet, KARDEX_START, 3)[prodKey];
          if (kSheet && kardexRow) {
            if (val === "NO") {
              kSheet.hideRows(kardexRow);
            } else {
              kSheet.showRows(kardexRow);
            }
          }
        });
        // Recrear vistas móviles: las tiendas reciben ACTIVO vía IMPORTRANGE y lo pintan por producto
        _buildVista("BA");
        _buildVista("BM");
        // El push remoto requiere permisos que un onEdit simple no tiene; si falla, las tiendas
        // ocultan el producto en su siguiente reordenamiento o reset nocturno.
        try { sincronizarRemotamenteTiendasPush(); } catch (ePush) {}
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

  // 1.6 🔎 Stock de bodegas: filtro por proveedor (A2)
  if (name === SHEET_STOCK) {
    if (row === 2 && col === 1) _filtrarHojaStock(sheet);
    return;
  }

  // 1.7 Hoja de Entradas móvil (Checkbox Enviar en D2)
  if (name === SHEET_ENTRADAS) {
    if (row === 2 && col === 1) {
      const n = sheet.getLastRow() - ENTRADAS_START + 1;
      const capt = n > 0 ? sheet.getRange(ENTRADAS_START, 3, n, 2).getValues().some(r => r[0] !== "" || r[1] !== "") : false;
      if (n > 0) sheet.getRange(ENTRADAS_START, 3, n, 2).clearContent();
      _aplicarModoEntradas(sheet, true);
      if (capt) SpreadsheetApp.getActive().toast("Al cambiar de modo se borraron las cantidades escritas (cambian de unidad).", "📥 Registrar entradas", 6);
      return;
    }
    if (row === 2 && col === 4 && e.range.getValue() === true) {
      e.range.setValue(false); // Reset inmediato preventivo contra dobles ejecuciones
      procesarEntradasKardex();
    }
    return;
  }

  let bodegaKey = null;
  if (name === BODEGAS.BA.kardex)      bodegaKey = "BA";
  else if (name === BODEGAS.BM.kardex) bodegaKey = "BM";
  else return;


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
    "Esta operación borrará y reconstruirá toda la base de datos de Bodega desde cero.\n\nIngresa la contraseña de administrador para continuar:")) return;
  
  const resp = ui.alert(
    "⚠️ Confirmación Final",
    "¿Estás absolutamente seguro de que deseas borrar los históricos y catálogo actual?",
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;

  // Purgar estados de sesión pero PRESERVAR la contraseña de administrador y el entorno (DEV/PROD)
  const props = PropertiesService.getScriptProperties();
  const conservar = {};
  ["ADMIN_PASSWORD_HASH", "MISE_ENV"].forEach(k => { const v = props.getProperty(k); if (v) conservar[k] = v; });

  props.deleteAllProperties();
  try { SpreadsheetApp.flush(); } catch(e) {}

  if (Object.keys(conservar).length) props.setProperties(conservar);

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
    const name = _nombreCanonico(s.getName());
    if (!systemSheetNames.includes(name)) {
      try { ss.deleteSheet(s); } catch(e) {}
    }
  });

  function getOrCreateSheet(name) {
    let s = _hoja(ss, name);
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

  MiseLogger.info("setupCompleto", "Sistema creado desde cero");
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
    .whenFormulaSatisfied(`=AND($${lMinBA}${MAESTRO_START}>0, IFERROR(VLOOKUP($${lProd}${MAESTRO_START}, INDIRECT("${_refHoja(BODEGAS.BA.kardex)}!$C:$AD"), 28, FALSE), 0) < 0.5*$${lMinBA}${MAESTRO_START})`)
    .setBackground("#FFCDD2").setFontColor("#B71C1C").setRanges([rangeBA]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=AND($${lMinBA}${MAESTRO_START}>0, IFERROR(VLOOKUP($${lProd}${MAESTRO_START}, INDIRECT("${_refHoja(BODEGAS.BA.kardex)}!$C:$AD"), 28, FALSE), 0) < $${lMinBA}${MAESTRO_START}, IFERROR(VLOOKUP($${lProd}${MAESTRO_START}, INDIRECT("${_refHoja(BODEGAS.BA.kardex)}!$C:$AD"), 28, FALSE), 0) >= 0.5*$${lMinBA}${MAESTRO_START})`)
    .setBackground("#FFE0B2").setFontColor("#BF360C").setRanges([rangeBA]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=AND(OR($${lMinBA}${MAESTRO_START}>0, $${lMaxBA}${MAESTRO_START}>0), IFERROR(VLOOKUP($${lProd}${MAESTRO_START}, INDIRECT("${_refHoja(BODEGAS.BA.kardex)}!$C:$AD"), 28, FALSE), 0) >= $${lMinBA}${MAESTRO_START}, IFERROR(VLOOKUP($${lProd}${MAESTRO_START}, INDIRECT("${_refHoja(BODEGAS.BA.kardex)}!$C:$AD"), 28, FALSE), 0) <= $${lMaxBA}${MAESTRO_START})`)
    .setBackground("#C8E6C9").setFontColor("#1B5E20").setRanges([rangeBA]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=AND($${lMaxBA}${MAESTRO_START}>0, IFERROR(VLOOKUP($${lProd}${MAESTRO_START}, INDIRECT("${_refHoja(BODEGAS.BA.kardex)}!$C:$AD"), 28, FALSE), 0) > $${lMaxBA}${MAESTRO_START})`)
    .setBackground("#B3E5FC").setFontColor("#0D47A1").setRanges([rangeBA]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=AND($${lMinBA}${MAESTRO_START}=0, $${lMaxBA}${MAESTRO_START}=0)`)
    .setBackground("#CFD8DC").setFontColor("#37474F").setRanges([rangeBA]).build());

  // Rules for STOCK_BM
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=AND($${lMinBM}${MAESTRO_START}>0, IFERROR(VLOOKUP($${lProd}${MAESTRO_START}, INDIRECT("${_refHoja(BODEGAS.BM.kardex)}!$C:$AD"), 28, FALSE), 0) < 0.5*$${lMinBM}${MAESTRO_START})`)
    .setBackground("#FFCDD2").setFontColor("#B71C1C").setRanges([rangeBM]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=AND($${lMinBM}${MAESTRO_START}>0, IFERROR(VLOOKUP($${lProd}${MAESTRO_START}, INDIRECT("${_refHoja(BODEGAS.BM.kardex)}!$C:$AD"), 28, FALSE), 0) < $${lMinBM}${MAESTRO_START}, IFERROR(VLOOKUP($${lProd}${MAESTRO_START}, INDIRECT("${_refHoja(BODEGAS.BM.kardex)}!$C:$AD"), 28, FALSE), 0) >= 0.5*$${lMinBM}${MAESTRO_START})`)
    .setBackground("#FFE0B2").setFontColor("#BF360C").setRanges([rangeBM]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=AND(OR($${lMinBM}${MAESTRO_START}>0, $${lMaxBM}${MAESTRO_START}>0), IFERROR(VLOOKUP($${lProd}${MAESTRO_START}, INDIRECT("${_refHoja(BODEGAS.BM.kardex)}!$C:$AD"), 28, FALSE), 0) >= $${lMinBM}${MAESTRO_START}, IFERROR(VLOOKUP($${lProd}${MAESTRO_START}, INDIRECT("${_refHoja(BODEGAS.BM.kardex)}!$C:$AD"), 28, FALSE), 0) <= $${lMaxBM}${MAESTRO_START})`)
    .setBackground("#C8E6C9").setFontColor("#1B5E20").setRanges([rangeBM]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=AND($${lMaxBM}${MAESTRO_START}>0, IFERROR(VLOOKUP($${lProd}${MAESTRO_START}, INDIRECT("${_refHoja(BODEGAS.BM.kardex)}!$C:$AD"), 28, FALSE), 0) > $${lMaxBM}${MAESTRO_START})`)
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
    const fBA = `=IFERROR(VLOOKUP(C${rn}, ${_refHoja(BODEGAS.BA.kardex)}!C:AD, 28, FALSE), 0) & IF(AND(G${rn}=0, H${rn}=0), "", IF(VLOOKUP(C${rn}, ${_refHoja(BODEGAS.BA.kardex)}!C:AD, 28, FALSE)<G${rn}, " (-" & (G${rn}-VLOOKUP(C${rn}, ${_refHoja(BODEGAS.BA.kardex)}!C:AD, 28, FALSE)) & ")", IF(VLOOKUP(C${rn}, ${_refHoja(BODEGAS.BA.kardex)}!C:AD, 28, FALSE)>H${rn}, " (+" & (VLOOKUP(C${rn}, ${_refHoja(BODEGAS.BA.kardex)}!C:AD, 28, FALSE)-H${rn}) & ")", " (-)")))`;
    const fBM = `=IFERROR(VLOOKUP(C${rn}, ${_refHoja(BODEGAS.BM.kardex)}!C:AD, 28, FALSE), 0) & IF(AND(J${rn}=0, K${rn}=0), "", IF(VLOOKUP(C${rn}, ${_refHoja(BODEGAS.BM.kardex)}!C:AD, 28, FALSE)<J${rn}, " (-" & (J${rn}-VLOOKUP(C${rn}, ${_refHoja(BODEGAS.BM.kardex)}!C:AD, 28, FALSE)) & ")", IF(VLOOKUP(C${rn}, ${_refHoja(BODEGAS.BM.kardex)}!C:AD, 28, FALSE)>K${rn}, " (+" & (VLOOKUP(C${rn}, ${_refHoja(BODEGAS.BM.kardex)}!C:AD, 28, FALSE)-K${rn}) & ")", " (-)")))`;
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

  // Filas 2–4: G4 = lunes de la semana (fuente de verdad); título, estado y leyenda los dibuja
  // _actualizarBadgeEstadoSemana y _limpiarEncabezadoInventario (vía _simplificarVistaKardex, al final)
  sheet.getRange("G4").setNumberFormat("DD/MMM/YYYY");

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
  _simplificarVistaKardex(sheet);
  sheet.hideRows(1);       // Ocultar leyenda de caducidades
}

// ── POBLAR KARDEX DESDE MAESTRO ───────────────────────────────────────────────
function _poblarKardex(sheet) {
  const ss      = SpreadsheetApp.getActiveSpreadsheet();
  const maestro = _hoja(ss, SHEET_MAESTRO);
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
  const sheetName = _nombreCanonico(sheet.getName());
  const formulasH = [];
  for (let r = 0; r < count; r++) {
    const rn = KARDEX_START + r;
    let f = "";
    if (sheetName === BODEGAS.BA.kardex) {
      f = _formulaSemaforoKardex(rn, `${lProd}:${lMaxBA}`, idxMinBA, idxMaxBA);
    } else {
      f = _formulaSemaforoKardex(rn, `${lProd}:${lMaxBM}`, idxMinBM, idxMaxBM);
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
function crearVistaMovilBA() { _buildVista("BA"); }
function crearVistaMovilBM() { _buildVista("BM"); }

function _buildVista(key) {
  const bodega = BODEGAS[key];
  const ss     = SpreadsheetApp.getActiveSpreadsheet();

  let sheet = _hoja(ss, bodega.vista);
  if (sheet) {
    sheet.clear();
    sheet.clearConditionalFormatRules();
    sheet.setHiddenGridlines(false);
    sheet.setFrozenRows(0);
    const maxRows = sheet.getMaxRows();
    const maxCols = sheet.getMaxColumns();
    if (maxRows > 0 && maxCols > 0) {
      try {
        sheet.getRange(1, 1, maxRows, maxCols).breakApart();
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
  const kardex = _hoja(ss, bodega.kardex);
  if (!kardex) return;

  const lr = kardex.getLastRow();
  if (lr < KARDEX_START) return;

  const maestro = _hoja(ss, SHEET_MAESTRO);
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

  const maestroRowMap = {};
  mData.forEach((r, i) => { const n = String(r[cProd]).trim().toUpperCase(); if (n && !maestroRowMap[n]) maestroRowMap[n] = MAESTRO_START + i; });
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
  const ref = _refHoja(bodega.kardex);

  // PREPARACIÓN MATRICIAL DE ALTO RENDIMIENTO (Batch I/O consolidado)
  const lMinQ = cMinQ !== -1 ? map[key === "BA" ? "MÍN_Q_BA" : "MÍN_Q_BM"].letter : (map[key === "BA" ? "MÍN_BA" : "MÍN_BM"] ? map[key === "BA" ? "MÍN_BA" : "MÍN_BM"].letter : "G");
  const lMaxQ = cMaxQ !== -1 ? map[key === "BA" ? "MÁX_Q_BA" : "MÁX_Q_BM"].letter : (map[key === "BA" ? "MÁX_BA" : "MÁX_BM"] ? map[key === "BA" ? "MÁX_BA" : "MÁX_BM"].letter : "H");
  const cPicKey = `PICKING_${key}`;
  const lPic = map[cPicKey] ? map[cPicKey].letter : (map["PICKING"] ? map["PICKING"].letter : null);
  // Conversión: la tienda ve saldo/ENT/SAL en SU unidad de pedido (Kardex ÷ factor). Solo si el producto tiene
  // UNIDAD_TIENDA y FACTOR > 0; si no, 1 (misma unidad). Misma regla que el descuento (MiseSmartSync).
  const lUT = map["UNIDAD_TIENDA"] ? map["UNIDAD_TIENDA"].letter : null;
  const lFact = map["FACTOR_CONVERSION"] ? map["FACTOR_CONVERSION"].letter : null;
  const _divisor = (mr) => (lUT && lFact)
    ? `IF(AND(LEN(${refMaestro}!${lUT}${mr})>0, N(${refMaestro}!${lFact}${mr})>0), ${refMaestro}!${lFact}${mr}, 1)` : "1";
  const refMaestro = _refHoja(SHEET_MAESTRO);
  const lAct = map["ACTIVO"] ? map["ACTIVO"].letter : "F";
  // Definición de columnas de Entradas y Salidas por día (LUN a DOM en Kardex)
  const entCols = ["J","M","P","S","V","Y","AB"];
  const salCols = ["K","N","Q","T","W","Z","AC"];

  const matrixValues = new Array(count);
  const matrixFormulas = new Array(count);

  for (let i = 0; i < count; i++) {
    const p = prods[i];
    const kr = p.srcRow;
    const mr = maestroRowMap[p.nombre.toUpperCase()] || (kr - KARDEX_START + MAESTRO_START);
    
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
    const div = _divisor(mr);
    const fSaldo = div === "1" ? `=IFERROR(${ref}!AD${kr}*1,0)` : `=IFERROR(ROUND(${ref}!AD${kr}/${div}, 2),0)`;
    const entRefs = entCols.map(c => ref + '!' + c + kr).join(',');
    const fEnt = div === "1" ? `=IFERROR(CHOOSE(WEEKDAY(TODAY(),2),${entRefs}),0)` : `=IFERROR(ROUND(CHOOSE(WEEKDAY(TODAY(),2),${entRefs})/${div}, 2),0)`;
    const salRefs = salCols.map(c => ref + '!' + c + kr).join(',');
    const fSal = div === "1" ? `=IFERROR(CHOOSE(WEEKDAY(TODAY(),2),${salRefs}),0)` : `=IFERROR(ROUND(CHOOSE(WEEKDAY(TODAY(),2),${salRefs})/${div}, 2),0)`;
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

  MiseLogger.info("_buildVista", `${bodega.nombre}: ${count} productos`);
}

// ── CADUCIDADES (vista simple, sin INDIRECT) ──────────────────────────────────
function crearCaducidades() {
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const NOMBRE = "CADUCIDADES";

  let sheet = _hoja(ss, NOMBRE);
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
    const ks = _hoja(ss, b.kardex);
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
  const maestro = _hoja(ss, SHEET_MAESTRO);
  const lr2     = maestro.getLastRow();
  const mData   = maestro.getRange(MAESTRO_START, 1, lr2 - MAESTRO_START + 1, 6).getValues()
    .filter(r => r[0] !== "");

  const DR    = 4;
  const count = mData.length;
  const refBA = _refHoja(BODEGAS.BA.kardex);
  const refBM = _refHoja(BODEGAS.BM.kardex);

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

  MiseLogger.info("crearCaducidades", `Dual BA+BM. ${count} productos`);

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
  const sheet  = _hoja(ss, bodega.kardex);
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
  const sem = _isoWeek(monday);
  const sun = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  ui.alert(`✅ Semana ${sem} configurada\n${_fmt(monday)} → ${sun instanceof Date ? _fmt(sun) : sun}`);
  MiseLogger.info("configurarSemana", `${bodega.nombre} | Sem ${sem} | ${_fmt(monday)}`);
}

// ── AVANZAR SEMANA ────────────────────────────────────────────────────────────
function avanzarSemanaBA() { _avanzarSemana("BA"); }
function avanzarSemanaBM() { _avanzarSemana("BM"); }

function _avanzarSemana(key) {
  const ui     = SpreadsheetApp.getUi();
  const bodega = BODEGAS[key];
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const sheet  = _hoja(ss, bodega.kardex);
  if (!sheet) { ui.alert(`No existe ${bodega.kardex}.`); return; }

  const d4 = sheet.getRange("G4").getValue();
  if (!(d4 instanceof Date) || isNaN(d4.getTime())) {
    ui.alert("La fecha de inicio (G4) no es válida. Por favor configúrala primero.");
    return;
  }

  const sem = _isoWeek(d4);
  const sun = new Date(d4.getFullYear(), d4.getMonth(), d4.getDate() + 6);
  const resp = ui.alert(
    `📅 Avanzar semana — ${bodega.nombre}`,
    `• Semana ${sem} (${_fmt(d4)} → ${sun instanceof Date ? _fmt(sun) : sun})\n` +
    `• Los saldos finales de domingo se pasarán como saldos iniciales.\n` +
    `• Se guardará el histórico diario en ${bodega.historial} con fechas exactas.\n` +
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

    // 2. Guardar en HISTORIAL horizontal (con respaldo si falla: la semana debe avanzar igual)
    _archivarSemanaSeguro(key, sheet, numRows, d4, sem);

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

    MiseLogger.info("avanzarSemana", `${bodega.nombre} | Semana ${sem} avanzada.`);
    ui.alert(`✅ Semana avanzada en ${bodega.nombre}.`);
  } finally {
    lock.releaseLock();
  }
}

// Archiva la semana; si el HISTORIAL horizontal falla (formato dañado, combinaciones, etc.), guarda los
// mismos datos en _HISTORIAL_RESPALDO (filas simples, sin combinaciones) para no bloquear el avance.
function _archivarSemanaSeguro(key, sheet, numRows, d4, sem) {
  try {
    _guardarHistHorizontal(key, sheet, numRows, d4, sem);
  } catch (err) {
    MiseLogger.error("_archivarSemanaSeguro", `${BODEGAS[key].historial} falló (${err.message}); semana ${sem} respaldada en _HISTORIAL_RESPALDO y el avance continúa.`, err);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let r = _hoja(ss, "_HISTORIAL_RESPALDO");
    if (!r) {
      r = ss.insertSheet("_HISTORIAL_RESPALDO");
      const enc = ["BODEGA", "SEMANA", "LUNES", "PRODUCTO"];
      DIAS.forEach(d => enc.push(`ENT ${d}`, `SAL ${d}`));
      enc.push("SLD FIN");
      r.getRange(1, 1, 1, enc.length).setValues([enc]).setFontWeight("bold");
      r.setFrozenRows(1);
    }
    const kv = sheet.getRange(KARDEX_START, 1, numRows, KARDEX_SLD_FIN).getValues();
    const filas = kv.filter(row => String(row[2]).trim()).map(row => {
      const f = [key, sem, d4, row[2]];
      for (let d = 0; d < KARDEX_DAYS; d++) f.push(row[9 + d * 3] === "" ? 0 : row[9 + d * 3], row[10 + d * 3] === "" ? 0 : row[10 + d * 3]);
      f.push(row[KARDEX_SLD_FIN - 1]);
      return f;
    });
    if (filas.length) r.getRange(r.getLastRow() + 1, 1, filas.length, filas[0].length).setValues(filas);
  }
}

// Columna donde empieza el siguiente bloque semanal del HISTORIAL.
// 1) Limpia bloques HUÉRFANOS: encabezado combinado (fila 2) sin datos debajo, que deja un archivado
//    interrumpido (p. ej., onOpen simple cortado a los 30 s). Si no se limpian, el siguiente bloque cae
//    DENTRO de esa combinación y Google rechaza combinar ("Debes seleccionar todas las celdas…"),
//    bloqueando el avance de semana para siempre.
// 2) Considera el fin de las celdas combinadas además de la última columna con contenido.
function _siguienteColumnaHistorial(hSheet, numRows) {
  const maxCols = hSheet.getMaxColumns();
  const encabezados = hSheet.getRange(1, 4, 4, Math.max(1, maxCols - 3)).getMergedRanges()
    .filter(m => m.getRow() <= 2 && m.getLastRow() >= 2 && m.getColumn() > 3)
    .sort((a, b) => a.getColumn() - b.getColumn());
  for (let i = encabezados.length - 1; i >= 0; i--) {
    const c = encabezados[i].getColumn();
    const ancho = Math.max(15, encabezados[i].getNumColumns());
    const datos = numRows > 0 ? hSheet.getRange(5, c, numRows, ancho).getValues() : [];
    const vacio = datos.every(r => r.every(v => v === "" || v === null));
    if (!vacio) break;
    // Huérfano: deshacer combinaciones y limpiar su zona de encabezado (filas 1–4) HASTA EL FINAL de la hoja.
    // Cada intento fallido insertaba 16 columnas dentro de él y Google lo ensanchaba: puede medir cientos
    // de columnas, así que limpiar solo 16 volvería a "separar parte de una combinación".
    _separarCombinaciones(hSheet.getRange(1, c, 4, maxCols - c + 1)).clearContent().setBackground(null);
    MiseLogger.warn("_siguienteColumnaHistorial", `${hSheet.getName()}: bloque huérfano en columna ${c} limpiado (archivado previo interrumpido).`);
  }
  let finCombinado = 0;
  hSheet.getRange(1, 1, 4, maxCols).getMergedRanges().forEach(m => { finCombinado = Math.max(finCombinado, m.getLastColumn()); });
  return Math.max(hSheet.getLastColumn(), finCombinado, 3) + 1;
}

function _guardarHistHorizontal(key, sheet, numRows, monday, sem) {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  const histName = BODEGAS[key].historial;
  let hSheet = _hoja(ss, histName);
  
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

  const startCol = _siguienteColumnaHistorial(hSheet, numRows);
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

// ── MIGRACIÓN IN-SITU NO DESTRUCTIVA (13 COLUMNAS) ────────────────────────────
function migrarEstructuraMaestro13Cols() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const maestro = _hoja(ss, SHEET_MAESTRO);
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
    MiseLogger.info("migrarEstructuraMaestro13Cols", "Migrado con éxito a 13 columnas preservando datos.");
  }
}

function _col(n) {
  let s = "", c = n;
  while (c > 0) { c--; s = String.fromCharCode(65 + c % 26) + s; c = Math.floor(c / 26); }
  return s;
}

// Referencia de fórmula a una hoja con su nombre REAL actual (nuevo o anterior): nunca #REF! a mitad del renombrado.
// Memorizada por ejecución (se usa dentro de bucles por fila).
const _refHojaCache = {};
// 🚦 semáforo de STOCK del Inventario (col H). Una sola fuente (antes 4 copias): la referencia al Catálogo usa su
// nombre ACTUAL (antes "MAESTRO!" literal: tras renombrar la pestaña la columna quedaba vacía) y Mercado usaba su
// mínimo como máximo.
function _formulaSemaforoKardex(rn, rango, idxMin, idxMax) {
  const ref = _refHoja(SHEET_MAESTRO);
  const mn = `IFERROR(VLOOKUP(C${rn}, ${ref}!${rango}, ${idxMin}, FALSE), 0)`;
  const mx = `IFERROR(VLOOKUP(C${rn}, ${ref}!${rango}, ${idxMax}, FALSE), 0)`;
  return `=IF(AND(${mn}=0, ${mx}=0), "", IF(AD${rn}<${mn}, "🔴 -" & (${mn}-AD${rn}), IF(AD${rn}>${mx}, "🔵 +" & (AD${rn}-${mx}), "🟢 -")))`;
}

function _refHoja(nombre) {
  if (!_refHojaCache[nombre]) {
    const h = _hoja(SpreadsheetApp.getActiveSpreadsheet(), nombre);
    _refHojaCache[nombre] = _quoteName(h ? h.getName() : nombre);
  }
  return _refHojaCache[nombre];
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
      let sheetLog = _hoja(ss, SHEET_LOG);
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

const MISE_VERSION = "1.7.7o";   // debe coincidir con la cabecera (línea 2); lo verifica tests/suites/version.test.js
const MISE_EPOCA   = "Altair";
const MISE_NOVEDADES = [
  "📥 Entradas en la unidad de cada producto (bolsa, caja…) y la fruta en kg exactos: Mise convierte",
  "🔄 Traspasos en la unidad de pedido (domo, caja…): Mise convierte a la unidad de bodega",
  "📦 Inventario: hoy con sus colores y en negritas; los demás días atenuados",
  "📥 Registrar entradas cabe completa en el celular y la casilla Enviar es más grande",
  "Menú más simple: ⚙️ Mise para el día a día y 🛠 Técnico para mantenimiento",
  "📦 Inventario con encabezado claro: semana con fechas y qué significa ENT, SAL y SLD",
  "⏳ 🚀 Configurar muestra cada paso en vivo, en una ventana que no bloquea la hoja",
  "⚡ Powerhouse edita también la unidad de pedido y el factor",
  "⚖️ Escribe la presentación como \"Domo 454 g\" y Mise llena sola la unidad de pedido y el factor",
  "🔄 Traspasos desde el celular: en 📥 Registrar entradas elige el modo (Andares → Mercado o al revés)",
  "⚖️ Las tiendas piden en su unidad (domo, caja, paquete) y Bodega descuenta en la suya (kg, pz)",
  "Pestañas con nombres claros: 📋 Catálogo, 📦 Inventario Andares/Mercado, 📥 Registrar entradas…",
  "📋 Catálogo: solo se puede cambiar ACTIVO y los MÍN/MÁX, con etiquetas y avisos claros (también desde tableta)",
  "Reconciliar la semana ya no toca el pedido en curso de las tiendas",
  "🌐 Página de estado: todo el sistema de un vistazo, también desde el celular",
  "🩺 Estado del sistema: Bodega y tiendas en verde, amarillo o rojo (menú Automatizaciones)",
  "El descuento nocturno ya no resta dos veces si se vuelve a correr",
  "📊 Kardex simplificado: producto, unidad, saldo anterior y días",
  "📥 Entradas valida la semana de cada tienda por separado",
  "Powerhouse más rápido: Andares y Mercado se actualizan en paralelo",
  "Configurar este libro en un clic (🚀)",
  "Hoja 📥 ENTRADAS para registrar mercancía desde el celular",
  "Solo se descuenta lo que la tienda registró como recibido",
  "Picking y productos desactivados se aplican al producto correcto",
  "Andares y Mercado cambian de semana juntos al abrir Bodega"
];

function acercaDe() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();
  const entorno = props.getProperty("MISE_ENV") === "DEV" ? "🧪 DEV (pruebas)" : "🟢 PRODUCCIÓN";
  let activadores = "no disponible";
  try {
    const presentes = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());
    const faltan = ACTIVADORES_ESPERADOS_BDG.filter(f => presentes.indexOf(f) === -1);
    activadores = faltan.length ? `⚠️ faltan ${faltan.length} (usa 🚀 Configurar)` : `✅ ${presentes.length} activos`;
  } catch (e) {}
  let conexiones = [];
  try { conexiones = _diagnosticarConexionesBDG().lineas; } catch (e) {}
  const ultimoCierre = props.getProperty("ULTIMO_CIERRE") || "sin registro aún";

  ui.alert(`⚙️ Mise v${MISE_VERSION} · ${MISE_EPOCA}`,
    `Bodega · La Crêpe Parisienne · Grupo MYT\n` +
    `Entorno: ${entorno}\n\n` +
    `🩺 Estado\n• Activadores: ${activadores}\n• Último cierre nocturno: ${ultimoCierre}\n` +
    (conexiones.length ? `• Tiendas:\n   ${conexiones.join("\n   ")}\n` : "") +
    `\n✨ Novedades\n• ${MISE_NOVEDADES.join("\n• ")}\n\n` +
    `Arquitectura y desarrollo: Ibrahim García (@ultimaibrahim)`,
    ui.ButtonSet.OK);
}

function eliminarDuplicadosCatalogo() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const maestro = _hoja(ss, SHEET_MAESTRO);
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
        const kSheet = _hoja(ss, b.kardex);
        if (kSheet && kardexRow <= kSheet.getLastRow()) {
          kSheet.deleteRow(kardexRow);
        }
      });
      
      // 3. Eliminar de HISTORIAL
      Object.values(BODEGAS).forEach(b => {
        const hSheet = _hoja(ss, BODEGAS[b.key].historial);
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
    MiseLogger.info("eliminarDuplicadosCatalogo", `Eliminados ${duplicateIndices.length} duplicados: ${duplicateNames.join(", ")}`);
  } catch (err) {
    SpreadsheetApp.getActive().toast("❌ Error al limpiar duplicados: " + err.message, "🧹 Limpiar Duplicados", 5);
  } finally {
    lock.releaseLock();
  }
}

function _ordenarYRenumerarTodo() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const maestro = _hoja(ss, SHEET_MAESTRO);
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
  let qSheet = _hoja(ssCuarentena, "⚠️ REVISIÓN_HUÉRFANOS");
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
        SHEET_MAESTRO,
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
  data.sort((a, b) => _compararCatalogo(a[cCat], a[cProd], b[cCat], b[cProd]));
  
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
    const fBA = `=IFERROR(VLOOKUP(${lProd}${rn}, ${_refHoja(BODEGAS.BA.kardex)}!C:AD, 28, FALSE), 0) & IF(AND(${lMinBA}${rn}=0, ${lMaxBA}${rn}=0), "", IF(VLOOKUP(${lProd}${rn}, ${_refHoja(BODEGAS.BA.kardex)}!C:AD, 28, FALSE)<${lMinBA}${rn}, " (-" & (${lMinBA}${rn}-VLOOKUP(${lProd}${rn}, ${_refHoja(BODEGAS.BA.kardex)}!C:AD, 28, FALSE)) & ")", IF(VLOOKUP(${lProd}${rn}, ${_refHoja(BODEGAS.BA.kardex)}!C:AD, 28, FALSE)>${lMaxBA}${rn}, " (+" & (VLOOKUP(${lProd}${rn}, ${_refHoja(BODEGAS.BA.kardex)}!C:AD, 28, FALSE)-${lMaxBA}${rn}) & ")", " (-)")))`;
    const fBM = `=IFERROR(VLOOKUP(${lProd}${rn}, ${_refHoja(BODEGAS.BM.kardex)}!C:AD, 28, FALSE), 0) & IF(AND(${lMinBM}${rn}=0, ${lMaxBM}${rn}=0), "", IF(VLOOKUP(${lProd}${rn}, ${_refHoja(BODEGAS.BM.kardex)}!C:AD, 28, FALSE)<${lMinBM}${rn}, " (-" & (${lMinBM}${rn}-VLOOKUP(${lProd}${rn}, ${_refHoja(BODEGAS.BM.kardex)}!C:AD, 28, FALSE)) & ")", IF(VLOOKUP(${lProd}${rn}, ${_refHoja(BODEGAS.BM.kardex)}!C:AD, 28, FALSE)>${lMaxBM}${rn}, " (+" & (VLOOKUP(${lProd}${rn}, ${_refHoja(BODEGAS.BM.kardex)}!C:AD, 28, FALSE)-${lMaxBM}${rn}) & ")", " (-)")))`;
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
    const kSheet = _hoja(ss, b.kardex);
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
      _separarCombinaciones(kSheet.getRange(5, 10, 1, 21)); // Des-combinar columnas J a AD en fila 5
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
        valRow[7] = _formulaSemaforoKardex(rn, `${lProd}:${lMaxBA}`, idxMinBA, idxMaxBA);
      } else {
        valRow[7] = _formulaSemaforoKardex(rn, `${lProd}:${lMaxBM}`, idxMinBM, idxMaxBM);
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
    kSheet.getRange(KARDEX_START, 9, kLen, 22).setNumberFormat("0.####"); // 1.7.7n: clearFormat() lo había quitado

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

    // 1.7.7n: el clearFormat() de arriba borra también las reglas visuales (negativos en rojo, hoy en negritas, días
    // en gris, semáforo). Se reaplican como en 🚀 Configurar; antes el Inventario quedaba "sin formato" tras una alta
    // o un cambio de categoría en Powerhouse, hasta volver a configurar.
    try { _simplificarVistaKardex(kSheet); } catch (e) { MiseLogger.warn("_ordenarYRenumerarTodo", `Formato de ${b.kardex}: ${e.message}`); }
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
  
  MiseLogger.info("_ordenarYRenumerarTodo", `Re-ordenado y re-numerado: ${data.length} productos`);
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
  const kSheet = _hoja(ss, bodega.kardex);
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
        let qSheet = _hoja(ss, "⚠️ REVISIÓN_HUÉRFANOS");
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
  const maestro = _hoja(ss, SHEET_MAESTRO);
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
  const qSheet = _hoja(ss, "⚠️ REVISIÓN_HUÉRFANOS");
  const maestro = _hoja(ss, SHEET_MAESTRO);
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
    const qSheet = _hoja(ss, "⚠️ REVISIÓN_HUÉRFANOS");
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
  const maestro = _hoja(ss, SHEET_MAESTRO);
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
    _agregarAdministradores(sheetProtection);
  } catch(e) {}
  
  // 3. Desproteger SOLO lo editable desde la hoja (1.7.6o): ACTIVO y los MÍN/MÁX de bodega y quiosco de cada tienda.
  //    Altas, bajas, nombres y picking: ⚡ Powerhouse.
  const lr = Math.max(maestro.getLastRow(), MAESTRO_START);
  const count = lr - MAESTRO_START + 1;
  const map = _getMaestroHeaderMap(maestro);
  const libres = CATALOGO_EDITABLES.filter(k => map[k]).map(k => maestro.getRange(MAESTRO_START, map[k].col, count, 1));
  sheetProtection.setUnprotectedRanges(libres);
  MiseLogger.info("protegerMaestroSeguro", `${SHEET_MAESTRO} blindado: editables ${CATALOGO_EDITABLES.filter(k => map[k]).join(", ")}.`);
}

function protegerKardexSeguro(keyOrSheet) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let kSheet = null;
  let kardexName = "";

  if (typeof keyOrSheet === "string") {
    const bConfig = BODEGAS[keyOrSheet];
    if (bConfig) {
      kSheet = _hoja(ss, bConfig.kardex);
      kardexName = bConfig.kardex;
    } else {
      kSheet = _hoja(ss, keyOrSheet);
      kardexName = keyOrSheet;
    }
  } else if (keyOrSheet && typeof keyOrSheet.getName === "function") {
    kSheet = keyOrSheet;
    kardexName = _nombreCanonico(kSheet.getName());
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
    _agregarAdministradores(sheetProtection);
  } catch(e) {}

  // 3. DESPROTEGER RANGOS INTERACTIVOS OPERATIVOS:
  // a) Fecha inicial (G4) y Botones/Checkboxes interactivos de fila 4 (N4, Q4, T4, W4)
  // b) Columnas numéricas de ENT y SAL de Lunes a Domingo (separadas para máxima compatibilidad móvil)
  // c) Caducidad (Col F) y Lote (Col G) opcionales si se requiere captura
  const lr = Math.max(kSheet.getLastRow(), KARDEX_START);
  const count = lr - KARDEX_START + 1;
  const unprotectedRanges = [];

  // Botones interactivos en fila 4. G4 (fecha de la semana) queda PROTEGIDA: la semana avanza sola y
  // moverla a mano desalinea ENT/SAL con los días reales.
  unprotectedRanges.push(kSheet.getRange("N4")); // Avanzar Sem.
  unprotectedRanges.push(kSheet.getRange("Q4")); // Recrear Vista
  unprotectedRanges.push(kSheet.getRange("T4")); // Nuevo Prod.
  unprotectedRanges.push(kSheet.getRange("W4")); // Anular Prod.

  // (Antes se desprotegían F:G cuando eran CADUCIDAD/LOTE; esas columnas ya no existen como tales.)

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

// ── 📊 KARDEX SIMPLIFICADO: visibles solo PRODUCTO, UNIDAD, SALDO ANT y los 7 días (ENT/SAL/SLD) ─────
// Ocultas: A No · B CATEGORÍA · D PRESENTACIÓN · F CADUCIDAD · G LOTE (+ fecha G4) · H 🚦 (siguen existiendo:
// el código las usa por posición). La semana se lee en el badge (L2) y en E4/I4.
const KARDEX_COLS_OCULTAS = [1, 2, 4, 6, 7, 8];
// Ayudas visuales del Inventario (1.7.6u–v): HOY conserva sus colores (un poco más intensos) y va en negritas; los
// demás días se atenúan (encabezados más claros, números en gris). Solo si la semana activa (G4) incluye hoy. Saldo
// negativo en rojo y ceros atenuados (primero en la lista: en Sheets gana la primera regla que aplica).
function _mezclarConBlanco(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v + (255 - v) * f));
  return "#" + c.map(v => v.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function _reglasVisualesInventario(sheet) {
  const lr = Math.max(sheet.getLastRow(), KARDEX_START);
  const n = lr - KARDEX_START + 1;
  // Se conservan las reglas propias de A:I salvo el semáforo (H), que se rehace aquí para todas las filas actuales
  const previas = (sheet.getConditionalFormatRules() || []).filter(r => {
    try { return r.getRanges().every(rg => rg.getColumn() < 10 && rg.getColumn() !== 8); } catch (e) { return true; }
  });
  const cfH = sheet.getRange(KARDEX_START, 8, n, 1);
  const semaforo = [
    SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith("🔴").setBackground("#FFCDD2").setFontColor("#B71C1C").setBold(true).setRanges([cfH]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith("🔵").setBackground("#B3E5FC").setFontColor("#0D47A1").setBold(true).setRanges([cfH]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith("🟢").setBackground("#C8E6C9").setFontColor("#1B5E20").setRanges([cfH]).build()
  ];
  const semana = "$G$4<=TODAY(), TODAY()<$G$4+7";
  const dia = "INT((COLUMN()-10)/3)";
  const fHoy = `=AND(${semana}, ${dia}=WEEKDAY(TODAY(),2)-1)`;
  const fOtro = `=AND(${semana}, ${dia}<>WEEKDAY(TODAY(),2)-1)`;
  const cols = (desfase) => Array.from({ length: KARDEX_DAYS }, (_, d) => 10 + d * 3 + desfase);
  const rangos = (fila, nFilas, desfase) => cols(desfase).map(c => sheet.getRange(fila, c, nFilas, 1));
  const R = (f) => SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(f);
  const datos = sheet.getRange(KARDEX_START, 10, n, 21);
  const reglas = [
    SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0)
      .setBackground("#FFCDD2").setFontColor("#B71C1C").setBold(true).setRanges(rangos(KARDEX_START, n, 2)).build(),
    SpreadsheetApp.newConditionalFormatRule().whenNumberEqualTo(0)
      .setFontColor("#C9C9C9").setRanges(rangos(KARDEX_START, n, 2)).build(),
    // Datos: hoy en negritas y oscuro; los demás días en gris
    R(fHoy).setFontColor("#1A281F").setBold(true).setRanges([datos]).build(),
    R(fOtro).setFontColor("#9E9E9E").setRanges([datos]).build(),
    // Fila 5 (nombre del día): hoy más intenso; los demás, claros
    R(fHoy).setBackground(C.dkGreen).setFontColor("#FFFFFF").setBold(true).setRanges([sheet.getRange(5, 10, 1, 21)]).build(),
    R(fOtro).setBackground(_mezclarConBlanco(C.mdGreen, 0.55)).setFontColor("#FFFFFF").setRanges([sheet.getRange(5, 10, 1, 21)]).build(),
    // Fila 6 (ENT / SAL / SLD): hoy un poco más saturado y en negritas; los demás, atenuados
    R(fHoy).setBackground("#C8E6C9").setBold(true).setRanges(rangos(6, 1, 0)).build(),
    R(fHoy).setBackground("#FFCDD2").setBold(true).setRanges(rangos(6, 1, 1)).build(),
    R(fHoy).setBackground("#1B4332").setBold(true).setRanges(rangos(6, 1, 2)).build(),
    R(fOtro).setBackground(_mezclarConBlanco(C.entBg, 0.5)).setFontColor("#9E9E9E").setRanges(rangos(6, 1, 0)).build(),
    R(fOtro).setBackground(_mezclarConBlanco(C.salBg, 0.5)).setFontColor("#BDBDBD").setRanges(rangos(6, 1, 1)).build(),
    R(fOtro).setBackground(_mezclarConBlanco(C.dkGreen, 0.55)).setFontColor("#FFFFFF").setRanges(rangos(6, 1, 2)).build()
  ];
  sheet.setConditionalFormatRules(previas.concat(reglas, semaforo)); // semáforo (col H) al final: no compite con los días
}


function _simplificarVistaKardex(sheet) {
  if (!sheet) return;
  sheet.showColumns(1, Math.min(KARDEX_TOTAL_COLS, sheet.getMaxColumns()));
  KARDEX_COLS_OCULTAS.forEach(c => sheet.hideColumns(c));
  try { _reglasVisualesInventario(sheet); } catch (e) { MiseLogger.warn("_simplificarVistaKardex", `Reglas visuales: ${e.message}`); }
  try {
    _limpiarEncabezadoInventario(sheet);
    const key = Object.keys(BODEGAS).find(k => BODEGAS[k].kardex === _nombreCanonico(sheet.getName()));
    if (key) {
      const lunes = _lunesSemanaActivaKardex(SpreadsheetApp.getActiveSpreadsheet(), key);
      _actualizarBadgeEstadoSemana(sheet, key, lunes.getTime() >= _obtenerLunesSemanaActual().getTime());
    }
  } catch (e) {
    MiseLogger.warn("_simplificarVistaKardex", `Encabezado de ${sheet.getName()}: ${e.message}`);
  }
}

// Orden y color de pestañas por uso: captura → consulta → sistema
function _organizarPestanasBDG() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const orden = [[SHEET_ENTRADAS, "#F9A825"], [SHEET_STOCK, "#7A9E8A"], [BODEGAS.BA.kardex, C.sage], [BODEGAS.BM.kardex, C.sage],
                 [SHEET_MAESTRO, C.mdGreen], [BODEGAS.BA.historial, "#B0BEC5"], [BODEGAS.BM.historial, "#B0BEC5"], [SHEET_TRASPASOS, "#B0BEC5"], [SHEET_LOG, "#B0BEC5"]];
  let pos = 1;
  orden.forEach(([n, color]) => {
    const sh = _hoja(ss, n);
    if (!sh) return;
    try { sh.setTabColor(color); ss.setActiveSheet(sh); ss.moveActiveSheet(pos++); } catch (e) {}
  });
  // La hoja 🏠 INICIO se retiró (1.7.6e): si quedó de una versión previa, se elimina
  const inicio = _hoja(ss, "🏠 INICIO");
  if (inicio) { try { ss.deleteSheet(inicio); } catch (e) {} }
  const ent = _hoja(ss, SHEET_ENTRADAS);
  if (ent) ss.setActiveSheet(ent);
}

// Protege una hoja completa: solo el dueño edita; `libres` = rangos de captura para los usuarios
// ── 👥 ADMINISTRADORES (1.7.6r) ─────────────────────────────────────────────────────────────────
// Correos que, además del dueño, editan todo lo protegido (Powerhouse, Catálogo completo, unidades y factores).
// Sin esto, el Powerhouse usado por otra cuenta choca con el blindaje: Google rechaza sus escrituras.
function _administradores() {
  return String(PropertiesService.getScriptProperties().getProperty("ADMINISTRADORES") || "")
    .split(/[,;\s]+/).map(x => x.trim().toLowerCase()).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
}

function _agregarAdministradores(proteccion) {
  _administradores().forEach(correo => { try { proteccion.addEditor(correo); } catch (e) {} });
}

function configurarAdministradores() {
  const ui = SpreadsheetApp.getUi();
  if (!_esDuenoDelLibro()) { ui.alert("👥 Solo el dueño del libro puede definir administradores."); return; }
  const actuales = _administradores();
  const r = ui.prompt("👥 Administradores",
    `Correos (separados por coma) que podrán usar ⚡ Powerhouse y editar todo el Catálogo, además de ti.\n\nActuales: ${actuales.join(", ") || "(ninguno)"}\n\nDeja vacío para quitar a todos.`,
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  PropertiesService.getScriptProperties().setProperty("ADMINISTRADORES", r.getResponseText().trim());
  protegerTodasLasHojasSeguras();
  protegerMaestroSeguro();
  MiseLogger.info("configurarAdministradores", `Administradores: ${_administradores().join(", ") || "(ninguno)"}`);
  ui.alert("✅ Listo", `Administradores: ${_administradores().join(", ") || "(ninguno)"}.\nYa pueden editar las hojas protegidas de Bodega. Para el Powerhouse también necesitan acceso de edición a los libros de Andares y Mercado.`, ui.ButtonSet.OK);
}

function _blindarHoja(sheet, desc, libres) {
  if (!sheet) return;
  sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(p => { try { p.remove(); } catch (e) {} });
  const prot = sheet.protect().setDescription(desc);
  prot.setWarningOnly(false);
  prot.removeEditors(prot.getEditors());
  prot.addEditor(Session.getEffectiveUser());
  _agregarAdministradores(prot);
  if (prot.canDomainEdit()) prot.setDomainEdit(false);
  if (libres && libres.length) prot.setUnprotectedRanges(libres);
}

// Hojas técnicas de Bodega (solo lectura) y cuáles se ocultan para simplificar la vista
const HOJAS_TECNICAS_BDG = ["VISTA_MOVIL_BA", "VISTA_MOVIL_BM", BODEGAS.BA.historial, BODEGAS.BM.historial, "_HISTORIAL_RESPALDO",
  SHEET_LOG, "_DICCIONARIO_ALIAS", "⚠️ REVISIÓN_HUÉRFANOS", "_SYNC_LOG_BA", "_SYNC_LOG_BM", SHEET_TRASPASOS, "_ESTADO_SISTEMA"];
const HOJAS_OCULTAS_BDG = ["VISTA_MOVIL_BA", "VISTA_MOVIL_BM", "_HISTORIAL_RESPALDO", "_DICCIONARIO_ALIAS",
  "⚠️ REVISIÓN_HUÉRFANOS", "_SYNC_LOG_BA", "_SYNC_LOG_BM", "_ESTADO_SISTEMA"];

function _blindarHojasTecnicasBDG() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  HOJAS_TECNICAS_BDG.forEach(n => _blindarHoja(_hoja(ss, n), `Blindaje técnico — ${n}`));
  HOJAS_OCULTAS_BDG.forEach(n => { const sh = _hoja(ss, n); if (sh) try { sh.hideSheet(); } catch (e) {} });
  // 📥 ENTRADAS: solo las cantidades, el día y la casilla Enviar
  const ent = _hoja(ss, SHEET_ENTRADAS);
  if (ent) {
    const filas = Math.max(ent.getMaxRows() - ENTRADAS_START + 1, 1);
    _blindarHoja(ent, "Blindaje — 📥 ENTRADAS", [ent.getRange(ENTRADAS_START, 3, filas, 2), ent.getRange("A2"), ent.getRange("B2:C2"), ent.getRange("D2")]);
  }
  // 🔎 STOCK: solo el filtro de proveedor
  const stk = _hoja(ss, SHEET_STOCK);
  if (stk) _blindarHoja(stk, "Blindaje — 🔎 Stock de bodegas", [stk.getRange("A2")]);
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

function protegerTodasLasHojasSeguras() {
  try { _blindarHojasTecnicasBDG(); } catch (e) { MiseLogger.warn("protegerTodasLasHojasSeguras", e.message); }
  protegerMaestroSeguro();
  protegerKardexSeguro("BA");
  protegerKardexSeguro("BM");
  SpreadsheetApp.getActive().toast("🔒 MAESTRO y KARDEX blindados con éxito ✓", "⚙️ Mise", 4);
}

// ── 📋 CATÁLOGO AMIGABLE (1.7.6o) ─────────────────────────────────────────────────────────────
// Híbrido: en la hoja (tableta) solo se editan ACTIVO y los MÍN/MÁX; altas, bajas, nombres y picking en ⚡ Powerhouse.
// Fila 2 = etiquetas claras por columna (con nota de ayuda); fila 3 = nombres técnicos que usa el código (no cambian).
const CATALOGO_EDITABLES = ["ACTIVO", "MÍN_BA", "MÁX_BA", "MÍN_Q_BA", "MÁX_Q_BA", "MÍN_BM", "MÁX_BM", "MÍN_Q_BM", "MÁX_Q_BM"];
// Visibles (1.7.6q): sin CATEGORÍA (la agrupa el Powerhouse) y con PRESENTACIÓN, de donde se sugiere el factor
const CATALOGO_VISIBLES = ["PRODUCTO", "PRESENTACION", "UNIDAD", ...CATALOGO_EDITABLES, "UNIDAD_TIENDA", "FACTOR_CONVERSION", "RECEPCION_PESADA", "PROVEEDOR"];
const CATALOGO_PARES = [["MÍN_BA", "MÁX_BA"], ["MÍN_Q_BA", "MÁX_Q_BA"], ["MÍN_BM", "MÁX_BM"], ["MÍN_Q_BM", "MÁX_Q_BM"]];
const CATALOGO_ETIQUETAS = {
  "CATEGORÍA": ["Categoría"], "PRODUCTO": ["Producto"], "UNIDAD": ["Unidad\nde bodega"],
  "PRESENTACION": ["Presentación 🔒\n(ej. Domo 454 g)", "Cómo viene el producto, con su contenido: Domo 454 g · Caja 100 pz · Paquete 50 pz · Galón 3.78 lt. Con este formato, Mise llena sola la unidad de pedido y el factor (si están vacíos)."],
  "ACTIVO": ["¿Activo?", "SÍ = se usa (aparece en inventario y en el pedido de las tiendas). NO = se oculta en todo."],
  "MÍN_BA": ["Andares\nbodega · mín.", "Mínimo en la bodega de Andares. Por debajo, el inventario se pinta en naranja o rojo."],
  "MÁX_BA": ["Andares\nbodega · máx.", "Máximo en la bodega de Andares. Por encima, el inventario se pinta en azul."],
  "MÍN_Q_BA": ["Andares\ntienda · mín.", "Mínimo que ve la tienda Andares en su Pedido Diario."],
  "MÁX_Q_BA": ["Andares\ntienda · máx.", "Máximo que ve la tienda Andares en su Pedido Diario."],
  "MÍN_BM": ["Mercado\nbodega · mín.", "Mínimo en la bodega de Mercado. Por debajo, el inventario se pinta en naranja o rojo."],
  "MÁX_BM": ["Mercado\nbodega · máx.", "Máximo en la bodega de Mercado. Por encima, el inventario se pinta en azul."],
  "MÍN_Q_BM": ["Mercado\ntienda · mín.", "Mínimo que ve la tienda Mercado en su Pedido Diario."],
  "MÁX_Q_BM": ["Mercado\ntienda · máx.", "Máximo que ve la tienda Mercado en su Pedido Diario."],
  "UNIDAD_TIENDA": ["Unidad de pedido\n(tienda) 🔒", "Cómo pide la tienda: domo, caja, paquete… Vacío = la tienda pide en la misma unidad que bodega. Solo lo cambia el administrador."],
  "RECEPCION_PESADA": ["Se recibe\npesado (kg) 🔒", "SÍ = en 📥 Registrar entradas se escribe el PESO EXACTO en kg (fruta, verdura, lo que varía). Si el inventario cuenta en domos o piezas, Mise divide entre el peso de cada uno según la presentación (ej. PZA 180 g). Solo lo cambia el administrador."],
  "PROVEEDOR": ["Proveedor 🔒", "Quién surte el producto (CDK, FRUTA, LALA…). Sirve para filtrar 🔎 Stock de bodegas. Se cambia en ⚡ Powerhouse (ficha del producto)."],
  "FACTOR_CONVERSION": ["1 de pedido =\n¿cuánto en bodega? 🔒", "Ejemplos: 1 domo de fresa = 0.454 kg → 0.454 · 1 caja de guantes = 100 pz → 100 · 1 paquete de conos = 50 pz → 50. Vacío = 1. Bodega descuenta pedido × este número. Solo lo cambia el administrador."]
};
const CATALOGO_COLOR = { BA: "#DCEFE3", BM: "#E3E8F5", base: "#F5EFE6" };

// ── ⚖️ FACTOR SUGERIDO DESDE LA PRESENTACIÓN (1.7.6q) ──────────────────────────────────────────
// "Domo 454 g" + unidad de bodega kg → unidad de pedido "domo", factor 0.454. Solo sugiere si la unidad de pedido y el
// factor están VACÍOS (nunca pisa uno puesto); si las unidades no son compatibles (g contra pz), lo marca para revisión.
const UNIDADES_BASE = {
  g: ["masa", 1], gr: ["masa", 1], grs: ["masa", 1], gramos: ["masa", 1], kg: ["masa", 1000], kgs: ["masa", 1000], kilo: ["masa", 1000], kilos: ["masa", 1000],
  ml: ["volumen", 1], l: ["volumen", 1000], lt: ["volumen", 1000], lts: ["volumen", 1000], litro: ["volumen", 1000], litros: ["volumen", 1000],
  pz: ["pieza", 1], pza: ["pieza", 1], pzas: ["pieza", 1], pzs: ["pieza", 1], pieza: ["pieza", 1], piezas: ["pieza", 1], u: ["pieza", 1], unidades: ["pieza", 1],
  hoja: ["pieza", 1], hojas: ["pieza", 1],
  m: ["longitud", 100], mt: ["longitud", 100], mts: ["longitud", 100], metro: ["longitud", 100], metros: ["longitud", 100], cm: ["longitud", 1]
};

function _unidadBase(u) {
  return UNIDADES_BASE[String(u || "").trim().toLowerCase().replace(/\.$/, "")] || null;
}

// Devuelve { unidad, factor } | { revisar: "motivo" } | null (presentación sin contenido: no hay nada que sugerir)
function _sugerirFactorDesdePresentacion(presentacion, unidadBodega) {
  const m = String(presentacion || "").trim().match(/^([\p{L}.]+(?:\s+[\p{L}.]+)*?)\s+(\d+(?:[.,]\d+)?)\s*([\p{L}.]+)$/u);
  if (!m) return null;
  const cantidad = parseFloat(m[2].replace(",", "."));
  const uPres = _unidadBase(m[3]);
  const uBod = _unidadBase(unidadBodega);
  if (!uPres || !uBod) return { revisar: `unidad no reconocida (${m[3]} / ${unidadBodega || "sin unidad de bodega"})` };
  if (uPres[0] !== uBod[0]) {
    return { revisar: uBod[0] === "pieza"
      ? `bodega cuenta por ${unidadBodega}: si la tienda pide la misma pieza, no hace falta factor (déjalo vacío)`
      : `${m[3]} no se puede convertir a ${unidadBodega}` };
  }
  if (!(cantidad > 0)) return { revisar: "cantidad no válida" };
  const factor = Math.round(cantidad * uPres[1] / uBod[1] * 1e6) / 1e6;
  return { unidad: m[1].trim().toLowerCase(), factor };
}

// Recorre el Catálogo (o una fila) y llena unidad de pedido + factor donde ambos estén vacíos
function _aplicarFactoresSugeridos(maestro, soloFila) {
  const map = _getMaestroHeaderMap(maestro);
  const need = ["PRODUCTO", "PRESENTACION", "UNIDAD", "UNIDAD_TIENDA", "FACTOR_CONVERSION"];
  if (need.some(k => !map[k])) return { aplicados: [], revisar: [] };
  const lr = maestro.getLastRow();
  if (lr < MAESTRO_START) return { aplicados: [], revisar: [] };
  const desde = soloFila || MAESTRO_START;
  const n = soloFila ? 1 : lr - MAESTRO_START + 1;
  const datos = maestro.getRange(desde, 1, n, maestro.getLastColumn()).getValues();
  const aplicados = [], revisar = [];
  datos.forEach((r, i) => {
    const prod = String(r[map["PRODUCTO"].index] || "").trim();
    if (!prod) return;
    // Sin unidad de pedido, un factor vacío o de 1 no convierte nada (la columna se creaba con 1 en todos los productos y
    // eso bloqueaba el llenado en PROD): se llena. Un factor distinto de 1 o una unidad ya escrita nunca se pisan.
    const fActual = String(r[map["FACTOR_CONVERSION"].index]).trim();
    if (String(r[map["UNIDAD_TIENDA"].index]).trim() !== "" || (fActual !== "" && parseFloat(fActual.replace(",", ".")) !== 1)) return;
    const s = _sugerirFactorDesdePresentacion(r[map["PRESENTACION"].index], r[map["UNIDAD"].index]);
    if (!s) return;
    if (s.revisar) { revisar.push(`${prod}: ${s.revisar}`); return; }
    maestro.getRange(desde + i, map["UNIDAD_TIENDA"].col).setValue(s.unidad);
    maestro.getRange(desde + i, map["FACTOR_CONVERSION"].col).setValue(s.factor);
    aplicados.push(`${prod}: 1 ${s.unidad} = ${s.factor} ${r[map["UNIDAD"].index]}`);
  });
  if (aplicados.length || revisar.length) {
    MiseLogger.info("_aplicarFactoresSugeridos", `Sugeridos ${aplicados.length}: ${aplicados.join(" · ")}${revisar.length ? ` | Revisar: ${revisar.join(" · ")}` : ""}`);
  }
  return { aplicados, revisar };
}

// ── 🔢 ORDEN DEL CATÁLOGO COMO PICKING POR DEFAULT (1.7.7b) ──────────────────────────────────────
// Copia el orden de filas del 📋 Catálogo (categoría y número) como orden de picking de la(s) tienda(s): un punto de
// partida limpio para después ajustar a mano en ⚡ Powerhouse. Las tiendas lo aplican solas (huella del catálogo) al
// abrirse o a las 00:00; las posiciones del inventario no cambian, así que no hay reordenamiento a distancia.
function _restablecerPickingCatalogo(keys) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const maestro = _hoja(ss, SHEET_MAESTRO);
  if (!maestro || maestro.getLastRow() < MAESTRO_START) return 0;
  const map = _getMaestroHeaderMap(maestro);
  const cProd = map["PRODUCTO"] ? map["PRODUCTO"].index : 2;
  const n = maestro.getLastRow() - MAESTRO_START + 1;
  const prods = maestro.getRange(MAESTRO_START, cProd + 1, n, 1).getValues();
  let rank = 0;
  const ranks = prods.map(r => [String(r[0]).trim() ? ++rank : ""]);
  keys.forEach(k => {
    const m = map[`PICKING_${k}`];
    if (m) maestro.getRange(MAESTRO_START, m.col, n, 1).setValues(ranks);
  });
  MiseLogger.info("restablecerPickingCatalogo", `Picking de ${keys.map(k => BODEGAS[k].nombre).join(" y ")} = orden del Catálogo (${rank} productos).`);
  return rank;
}

function _restablecerPickingConConfirmacion(keys) {
  const ui = SpreadsheetApp.getUi();
  const nombres = keys.map(k => BODEGAS[k].nombre).join(" y ");
  const ok = ui.alert("🔢 Restablecer el orden de picking",
    `El orden de picking de ${nombres} será el mismo del 📋 Catálogo (por categoría y número). Lo personalizado se reemplaza.\n\n` +
    "La tienda lo aplica sola al abrirse o a las 00:00. Después puedes ajustarlo en ⚡ Powerhouse.\n\n¿Continuar?", ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  const n = _restablecerPickingCatalogo(keys);
  ui.alert("✅ Orden restablecido", `${n} productos con el orden del Catálogo en ${nombres}.`, ui.ButtonSet.OK);
}
function restablecerPickingAndares() { _restablecerPickingConConfirmacion(["BA"]); }
function restablecerPickingMercado() { _restablecerPickingConConfirmacion(["BM"]); }
function restablecerPickingAmbas() { _restablecerPickingConConfirmacion(["BA", "BM"]); }

function sugerirFactoresDesdePresentacion() {
  const maestro = _hoja(SpreadsheetApp.getActiveSpreadsheet(), SHEET_MAESTRO);
  const ui = SpreadsheetApp.getUi();
  if (!maestro) return;
  const ok = ui.alert("⚖️ Llenar factores desde la presentación",
    "Se llenará la unidad de pedido y el factor de TODOS los productos que los tengan vacíos y cuya presentación traiga contenido (ej. \"BOL 1 kg\").\n\n" +
    "Desde ese momento las tiendas pedirán y verán su saldo en esa unidad (bolsa, domo, caja…) y Bodega descontará pedido × factor. " +
    "Avisa al personal y revisa los MÍN/MÁX de tienda (van en la unidad de pedido).\n\n¿Continuar?", ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  const r = _aplicarFactoresSugeridos(maestro);
  ui.alert("⚖️ Factores desde la presentación",
    (r.aplicados.length ? `Se llenaron ${r.aplicados.length}:\n• ${r.aplicados.slice(0, 15).join("\n• ")}${r.aplicados.length > 15 ? "\n…" : ""}` : "No había factores por llenar.") +
    (r.revisar.length ? `\n\nRevisar a mano (${r.revisar.length}):\n• ${r.revisar.slice(0, 10).join("\n• ")}` : "") +
    "\n\nSolo se llenan productos con la unidad de pedido y el factor vacíos; los ya puestos no se tocan.", ui.ButtonSet.OK);
}

function _prepararCatalogoAmigable(maestro) {
  const map = _getMaestroHeaderMap(maestro);
  const lastCol = maestro.getLastColumn();
  const lr = Math.max(maestro.getLastRow(), MAESTRO_START);
  const n = lr - MAESTRO_START + 1;

  // 1. Fila 2: etiquetas (antes, botones por lote; se separan sus combinaciones antes de reescribir)
  try { _separarCombinaciones(maestro.getRange(2, 1, 1, lastCol)); SpreadsheetApp.flush(); } catch (e) {}
  const fila2 = maestro.getRange(2, 1, 1, lastCol);
  fila2.clearDataValidations();
  fila2.clearContent();
  fila2.setBackground(CATALOGO_COLOR.base);
  Object.keys(CATALOGO_ETIQUETAS).forEach(k => {
    if (!map[k]) return;
    const [texto, ayuda] = CATALOGO_ETIQUETAS[k];
    const color = /_BA$/.test(k) ? CATALOGO_COLOR.BA : /_BM$/.test(k) ? CATALOGO_COLOR.BM : CATALOGO_COLOR.base;
    const celda = maestro.getRange(2, map[k].col);
    celda.setValue(texto).setFontWeight("bold").setFontSize(10).setWrap(true)
      .setHorizontalAlignment("center").setVerticalAlignment("middle").setBackground(color);
    if (ayuda) celda.setNote(ayuda);
    if (CATALOGO_EDITABLES.includes(k)) maestro.getRange(MAESTRO_START, map[k].col, n, 1).setBackground(color);
  });
  maestro.setRowHeight(2, 46);

  // 2. Validaciones que RECHAZAN lo inválido (con mensaje claro)
  if (map["ACTIVO"]) {
    maestro.getRange(MAESTRO_START, map["ACTIVO"].col, n, 1).setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(["SÍ", "NO"], true).setAllowInvalid(false)
      .setHelpText("Elige SÍ o NO de la lista.").build());
  }
  CATALOGO_PARES.forEach(([kMin, kMax]) => {
    if (!map[kMin] || !map[kMax]) return;
    const lMin = map[kMin].letter, lMax = map[kMax].letter, r = MAESTRO_START;
    maestro.getRange(r, map[kMin].col, n, 1).setDataValidation(SpreadsheetApp.newDataValidation()
      .requireFormulaSatisfied(`=AND(ISNUMBER(${lMin}${r}), ${lMin}${r}>=0, OR(${lMax}${r}="", ${lMin}${r}<=${lMax}${r}))`)
      .setAllowInvalid(false).setHelpText("Escribe un número (0 o más) que no sea mayor que el máximo.").build());
    maestro.getRange(r, map[kMax].col, n, 1).setDataValidation(SpreadsheetApp.newDataValidation()
      .requireFormulaSatisfied(`=AND(ISNUMBER(${lMax}${r}), ${lMax}${r}>=0, OR(${lMin}${r}="", ${lMax}${r}>=${lMin}${r}))`)
      .setAllowInvalid(false).setHelpText("Escribe un número (0 o más) que no sea menor que el mínimo.").build());
  });

  if (map["FACTOR_CONVERSION"]) {
    const lF = map["FACTOR_CONVERSION"].letter;
    maestro.getRange(MAESTRO_START, map["FACTOR_CONVERSION"].col, n, 1).setDataValidation(SpreadsheetApp.newDataValidation()
      .requireFormulaSatisfied(`=AND(ISNUMBER(${lF}${MAESTRO_START}), ${lF}${MAESTRO_START}>0)`)
      .setAllowInvalid(false).setHelpText("Número mayor que 0 (ej. 0.454 o 100). Vacío = 1.").build());
    maestro.setColumnWidth(map["FACTOR_CONVERSION"].col, 110);
  }
  if (map["UNIDAD_TIENDA"]) maestro.setColumnWidth(map["UNIDAD_TIENDA"].col, 110);
  if (map["PROVEEDOR"]) {
    maestro.getRange(MAESTRO_START, map["PROVEEDOR"].col, n, 1).setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(PROVEEDORES_BASE, true).setAllowInvalid(true).setHelpText("Proveedor que surte el producto. Puedes escribir uno nuevo.").build());
  }
  if (map["RECEPCION_PESADA"]) {
    maestro.getRange(MAESTRO_START, map["RECEPCION_PESADA"].col, n, 1).setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(["SÍ", ""], true).setAllowInvalid(false).setHelpText("SÍ = se recibe pesado (kg exactos). Vacío = por presentación.").build());
    maestro.setColumnWidth(map["RECEPCION_PESADA"].col, 100);
  }

  if (map["PRESENTACION"]) maestro.setColumnWidth(map["PRESENTACION"].col, 130);

  // 3. Solo lo útil a la vista: lo técnico (No, categoría, stock, selección, picking) se oculta, y la fila 3
  //    (nombres técnicos: el código los sigue leyendo) también; la fila 2 hace de encabezado
  try { maestro.hideRows(3); } catch (e) {}
  maestro.showColumns(1, lastCol);
  const visibles = new Set(CATALOGO_VISIBLES.filter(k => map[k]).map(k => map[k].col));
  for (let c = 1; c <= lastCol; c++) if (!visibles.has(c)) maestro.hideColumns(c);

  // 4. Tamaños para tableta
  if (map["PRODUCTO"]) maestro.setColumnWidth(map["PRODUCTO"].col, 260);
  if (map["CATEGORÍA"]) maestro.setColumnWidth(map["CATEGORÍA"].col, 120);
  ["UNIDAD", "ACTIVO"].forEach(k => { if (map[k]) maestro.setColumnWidth(map[k].col, 80); });
  CATALOGO_EDITABLES.filter(k => k !== "ACTIVO" && map[k]).forEach(k => maestro.setColumnWidth(map[k].col, 96));
  maestro.setRowHeights(MAESTRO_START, n, 30);
  maestro.getRange(MAESTRO_START, 1, n, lastCol).setFontSize(11).setVerticalAlignment("middle");
}

function restaurarValidacionesMaestro() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const maestro = _hoja(ss, SHEET_MAESTRO);
  if (!maestro) return;
  const lr = maestro.getLastRow();
  if (lr < MAESTRO_START) return;
  const count = lr - MAESTRO_START + 1;
  const map = _getMaestroHeaderMap(maestro);

  const cCat = map["CATEGORÍA"]    ? map["CATEGORÍA"].col    : 2;
  const cAct = map["ACTIVO"]       ? map["ACTIVO"].col       : 6;
  // 1. ACTIVO, MÍN/MÁX, etiquetas, columnas visibles y tamaños: catálogo amigable (1.7.6o)
  try { _prepararCatalogoAmigable(maestro); } catch(e) { MiseLogger.warn("restaurarValidacionesMaestro", `Catálogo amigable: ${e.message}`); }
  
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
  
  
  // 3. Re-aplicar Formato Condicional Dinámico
  try {
    _aplicarReglasMaestro(maestro);
  } catch(e) {}

  SpreadsheetApp.getActive().toast("Catálogo listo: etiquetas, validaciones y columnas ✓", "⚙️ Mise", 4);
}

function procesarCargaMasiva() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tempSheet = _hoja(ss, "➕ AGREGAR_MÚLTIPLES");
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
    const maestro = _hoja(ss, SHEET_MAESTRO);
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
      const kSheet = _hoja(ss, b.kardex);
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
      const histName = BODEGAS[b.key].historial;
      const hSheet = _hoja(ss, histName);
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
    MiseLogger.info("procesarCargaMasiva", `${validRows.length} productos cargados.`);
  } catch (err) {
    // Revertir el checkbox a false en caso de fallo para permitir reintentar
    try { tempSheet.getRange("J3").setValue(false); } catch(e) {}
    SpreadsheetApp.getActive().toast("❌ Error en carga masiva: " + err.message, "⚙️ Agregar productos", 6);
    SpreadsheetApp.getUi().alert("❌ Error en Carga Masiva", "No se completó la operación debido al siguiente error:\n\n" + err.toString() + "\n\nPor favor, revisa tus datos y reintenta.", SpreadsheetApp.getUi().ButtonSet.OK);
    MiseLogger.info("procesarCargaMasiva ERROR", err.toString());
  } finally {
    lock.releaseLock();
  }
}

function procesarEdicionMasiva() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const editSheet = _hoja(ss, "✏️ EDITAR_PRODUCTOS");
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
    const maestro = _hoja(ss, SHEET_MAESTRO);
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
      const kSheet = _hoja(ss, b.kardex);
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
      const hSheet = _hoja(ss, BODEGAS[b.key].historial);
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
    MiseLogger.info("procesarEdicionMasiva", `${validEdits.length} productos actualizados.`);
  } catch (err) {
    // Revertir el checkbox a false en caso de fallo para permitir reintentar
    try { editSheet.getRange("I3").setValue(false); } catch(e) {}
    SpreadsheetApp.getActive().toast("❌ Error en edición masiva: " + err.message, "📝 Editar productos", 6);
    SpreadsheetApp.getUi().alert("❌ Error en Edición Masiva", "No se completó la operación debido al siguiente error:\n\n" + err.toString() + "\n\nPor favor, revisa tus datos y reintenta.", SpreadsheetApp.getUi().ButtonSet.OK);
    MiseLogger.info("procesarEdicionMasiva ERROR", err.toString());
  } finally {
    lock.releaseLock();
  }
}

function obtenerDatosPowerhouse(key = "BA") {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const maestro = _hoja(ss, SHEET_MAESTRO);
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
      unitTienda: map["UNIDAD_TIENDA"] ? String(r[map["UNIDAD_TIENDA"].index] || "").trim() : "",
      factor: map["FACTOR_CONVERSION"] ? (parseFloat(String(r[map["FACTOR_CONVERSION"].index]).replace(",", ".")) || "") : "",
      pesado: map["RECEPCION_PESADA"] ? /^S[IÍ]$/i.test(String(r[map["RECEPCION_PESADA"].index] || "").trim()) : false,
      proveedor: map["PROVEEDOR"] ? String(r[map["PROVEEDOR"].index] || "").trim() : "",
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
// 1.7.7d: los datos viajan dentro del diálogo (una sola ejecución en vez de abrir + pedir datos) y la ventana
// no bloquea la hoja (se puede consultar el Catálogo o el Inventario con Powerhouse abierto).
function abrirConstructorPickingHTML() {
  const t = HtmlService.createTemplateFromFile("PickingDialog");
  t.precarga = _jsonParaHtml(obtenerDatosPowerhouse());
  SpreadsheetApp.getUi().showModelessDialog(t.evaluate().setWidth(1050).setHeight(700), "⚡ Mise Powerhouse (Catálogo & Picking)");
}

// JSON seguro dentro de <script>: "<" escapado para que un nombre con "</script>" no cierre la etiqueta
function _jsonParaHtml(obj) {
  return JSON.stringify(obj).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

// ── ⚡ POWERHOUSE: GUARDADO EN 2 FASES (catálogo → tiendas en paralelo) ─────────────────
// Fase 1 (con candado): MAESTRO + Kardex, solo lo que cambió de verdad.
// Fase 2 (sin candado global, una ejecución por tienda en paralelo desde el diálogo):
//   VISTA_MOVIL_<k> + push a la tienda <k>. Cada tienda toca hojas distintas.
function powerhouseGuardarCatalogo(key, payload) {
  const t0 = Date.now();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(45000)) throw new Error("El archivo de Bodega está ocupado. Intenta de nuevo en unos segundos.");
  try {
    const resumen = _guardarCatalogoPowerhouse(key, payload);
    try { _prepararHojaStock(); } catch (e) { MiseLogger.warn("powerhouseGuardarCatalogo", `🔎 Stock de bodegas: ${e.message}`); }
    const ms = Date.now() - t0;
    MiseLogger.info("powerhouseGuardarCatalogo", `${key}: ${resumen}`, ms);
    return { ms, resumen };
  } finally {
    lock.releaseLock();
  }
}

function powerhouseActualizarTienda(k) {
  const t0 = Date.now();
  _buildVista(k);
  sincronizarRemotamenteTiendasPush(k);
  const ms = Date.now() - t0;
  MiseLogger.info("powerhouseActualizarTienda", `${BODEGAS[k].nombre}: vista y tienda actualizadas.`, ms);
  return { k, nombre: BODEGAS[k].nombre, ms };
}

// Compatibilidad (llamadas antiguas y guardarOrdenPickingHTML): mismas fases, en secuencia
function guardarPowerhouseBatch(key, payload) {
  const r = powerhouseGuardarCatalogo(key, payload);
  ["BA", "BM"].forEach(k => powerhouseActualizarTienda(k));
  MiseLogger.info("guardarPowerhouseBatch", `${key}: ${r.resumen}`);
  return `✅ Se guardaron los cambios del catálogo y la secuencia de picking se sincronizó con las tiendas.`;
}

// Renombra productos en KARDEX_BA/BM por nombre (evita reconstruir los Kardex completos)
function _renombrarEnKardex(renombres) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.values(BODEGAS).forEach(b => {
    const k = _hoja(ss, b.kardex);
    if (!k || k.getLastRow() < KARDEX_START) return;
    const rng = k.getRange(KARDEX_START, 3, k.getLastRow() - KARDEX_START + 1, 1);
    const vals = rng.getValues();
    let n = 0;
    vals.forEach(r => { const nuevo = renombres[String(r[0]).trim().toUpperCase()]; if (nuevo) { r[0] = nuevo; n++; } });
    if (n) rng.setValues(vals);
  });
}

function _guardarCatalogoPowerhouse(key, payload) {
  {
    const tiempos = []; // 1.7.7o: duración de las fases pesadas, al registro
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const maestro = _hoja(ss, SHEET_MAESTRO);
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
      _asegurarFormatoHeadersMaestro(maestro);
    }

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
        if (map["PROVEEDOR"])    rowM[map["PROVEEDOR"].index]    = String(np.proveedor || "").trim().toUpperCase() || _proveedorInicial(prod);

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

    // 2. Procesar Ediciones y Desactivaciones (solo cuenta lo que cambia de verdad: el diálogo manda
    //    el producto completo en cada edición, incluido ACTIVO aunque no se haya tocado)
    const renombres = {};      // NOMBRE VIEJO (mayúsculas) → nombre nuevo
    const cambiosActivo = {};  // NOMBRE (mayúsculas) → "SÍ" | "NO"
    let cambiosCategoria = 0;  // 1.7.7l: un cambio REAL de categoría reacomoda Catálogo e Inventario
    const catEditada = new Set(); // 1.7.7m: productos cuya categoría se cambió en la ficha (manda sobre la del picking)
    const ediciones = payload.ediciones || [];
    const eliminados = payload.eliminados || [];
    if (ediciones.length > 0 || eliminados.length > 0) {
      const lrCurr = maestro.getLastRow();
      const countCurr = lrCurr - MAESTRO_START + 1;
      const mRange = maestro.getRange(MAESTRO_START, 1, countCurr, maestro.getLastColumn());
      const mData = mRange.getValues();
      const mFormulas = mRange.getFormulas(); // STOCK_BA/BM son fórmulas: se reescriben como fórmula, no como número fijo

      const editMap = {};
      ediciones.forEach(e => {
        const pKey = String(e.originalName || e.name || "").trim().toUpperCase();
        if (pKey) editMap[pKey] = e;
      });

      const delSet = new Set(eliminados.map(n => String(n).trim().toUpperCase()));
      const iAct = map["ACTIVO"] ? map["ACTIVO"].index : -1;
      const iProd = map["PRODUCTO"] ? map["PRODUCTO"].index : 2;

      for (let i = 0; i < mData.length; i++) {
        const prodName = String(mData[i][iProd]).trim().toUpperCase();
        const activoAntes = iAct !== -1 ? String(mData[i][iAct]).trim().toUpperCase() : "";
        if (delSet.has(prodName)) {
          if (iAct !== -1) mData[i][iAct] = "NO";
          if (activoAntes !== "NO") cambiosActivo[String(mData[i][iProd]).trim().toUpperCase()] = "NO";
          continue;
        }

        const ed = editMap[prodName];
        if (ed) {
          if (ed.cat !== undefined && map["CATEGORÍA"]) {
            const catNueva = String(ed.cat).trim().toUpperCase();
            if (String(mData[i][map["CATEGORÍA"].index]).trim().toUpperCase() !== catNueva) {
              cambiosCategoria++;
              catEditada.add(String(ed.name !== undefined ? ed.name : mData[i][iProd]).trim().toUpperCase());
            }
            mData[i][map["CATEGORÍA"].index] = catNueva;
          }
          if (ed.name !== undefined && map["PRODUCTO"])    mData[i][map["PRODUCTO"].index] = String(ed.name).trim();
          if (ed.pres !== undefined && map["PRESENTACION"]) mData[i][map["PRESENTACION"].index] = String(ed.pres).trim();
          if (ed.unit !== undefined && map["UNIDAD"])       mData[i][map["UNIDAD"].index] = String(ed.unit).trim().toLowerCase();
          if (ed.unitTienda !== undefined && map["UNIDAD_TIENDA"]) mData[i][map["UNIDAD_TIENDA"].index] = String(ed.unitTienda).trim().toLowerCase();
          if (ed.factor !== undefined && map["FACTOR_CONVERSION"]) {
            const f = parseFloat(String(ed.factor).replace(",", "."));
            mData[i][map["FACTOR_CONVERSION"].index] = f > 0 ? f : ""; // vacío o inválido → sin conversión
          }
          if (ed.pesado !== undefined && map["RECEPCION_PESADA"]) mData[i][map["RECEPCION_PESADA"].index] = ed.pesado ? "SÍ" : "";
          if (ed.proveedor !== undefined && map["PROVEEDOR"]) mData[i][map["PROVEEDOR"].index] = String(ed.proveedor).trim().toUpperCase();
          if (ed.minBa !== undefined && map["MÍN_BA"])     mData[i][map["MÍN_BA"].index] = parseFloat(ed.minBa) || 0;
          if (ed.maxBa !== undefined && map["MÁX_BA"])     mData[i][map["MÁX_BA"].index] = parseFloat(ed.maxBa) || 0;
          if (ed.minBm !== undefined && map["MÍN_BM"])     mData[i][map["MÍN_BM"].index] = parseFloat(ed.minBm) || 0;
          if (ed.maxBm !== undefined && map["MÁX_BM"])     mData[i][map["MÁX_BM"].index] = parseFloat(ed.maxBm) || 0;
          if (ed.minQBa !== undefined && map["MÍN_Q_BA"]) mData[i][map["MÍN_Q_BA"].index] = parseFloat(ed.minQBa) || 0;
          if (ed.maxQBa !== undefined && map["MÁX_Q_BA"]) mData[i][map["MÁX_Q_BA"].index] = parseFloat(ed.maxQBa) || 0;
          if (ed.minQBm !== undefined && map["MÍN_Q_BM"]) mData[i][map["MÍN_Q_BM"].index] = parseFloat(ed.minQBm) || 0;
          if (ed.maxQBm !== undefined && map["MÁX_Q_BM"]) mData[i][map["MÁX_Q_BM"].index] = parseFloat(ed.maxQBm) || 0;
          if (ed.activo !== undefined && map["ACTIVO"])    mData[i][map["ACTIVO"].index] = ed.activo ? "SÍ" : "NO";
          const nuevoNombre = String(mData[i][iProd]).trim();
          if (nuevoNombre.toUpperCase() !== prodName) renombres[prodName] = nuevoNombre;
          const activoDespues = iAct !== -1 ? String(mData[i][iAct]).trim().toUpperCase() : "";
          if (activoDespues !== activoAntes) cambiosActivo[nuevoNombre.toUpperCase()] = activoDespues;
        }
      }
      mRange.setValues(mData.map((fila, i) => fila.map((v, j) => mFormulas[i][j] || v)));
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
        let pName = String(item.name).trim();
        pName = renombres[pName.toUpperCase()] || pName; // el diálogo manda el nombre anterior al renombre
        rankMap[pName] = item.rank || (idx + 1);
        if (item.cat) catMap[pName] = String(item.cat).trim().toUpperCase();
      });
    }

    if (cPicObj) {
      const newColValues = [];
      const newCatValues = [];
      const currentCats = map["CATEGORÍA"] ? maestro.getRange(MAESTRO_START, map["CATEGORÍA"].col, countFinal, 1).getValues() : [];
      const currentRanks = maestro.getRange(MAESTRO_START, cPicObj.col, countFinal, 1).getValues();

      for (let i = 0; i < prodsFinal.length; i++) {
        const pName = String(prodsFinal[i][0]).trim();
        const rank = rankMap[pName] || parseInt(currentRanks[i][0]) || (i + 1); // sin dato: conserva su rank
        newColValues.push([rank]);

        // 1.7.7m: el picking trae la categoría que el diálogo tenía al abrir; si la ficha la cambió, gana la ficha
        // (antes el picking la regresaba a la anterior y el producto nunca cambiaba de grupo)
        const catActual = currentCats[i] ? String(currentCats[i][0]).trim().toUpperCase() : "";
        if (catMap[pName] && !catEditada.has(pName.toUpperCase())) {
          if (catMap[pName] !== catActual) cambiosCategoria++; // movido de grupo desde la pestaña Orden
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

    // Kardex: reconstrucción completa SOLO con altas (necesita filas nuevas). Renombres y cambios de
    // ACTIVO se aplican quirúrgicamente por nombre (antes cada guardado reconstruía ambos Kardex).
    const nRen = Object.keys(renombres).length, nAct = Object.keys(cambiosActivo).length;
    const tK = Date.now();
    let modo = "";
    if (prodsNuevos.length > 0) {
      _ordenarYRenumerarTodo(); modo = "reconstrucción (altas)";
    } else if (cambiosCategoria > 0) {
      // 1.7.7o: un cambio de categoría mueve SOLO el tramo de filas afectado (antes ~45 s reconstruyendo todo)
      if (_reubicarPorCategoria()) modo = "reubicación por categoría";
      else { _ordenarYRenumerarTodo(); modo = "reconstrucción (respaldo de la reubicación)"; }
      if (nRen) _renombrarEnKardex(renombres);
    } else {
      if (nRen) _renombrarEnKardex(renombres);
      if (nAct) {
        Object.values(BODEGAS).forEach(b => {
          const kSheet = _hoja(ss, b.kardex);
          const filas = _mapaFilasPorProducto(kSheet, KARDEX_START, 3);
          Object.keys(cambiosActivo).forEach(n => {
            const r = filas[n];
            if (!r) return;
            if (cambiosActivo[n] === "NO") kSheet.hideRows(r); else kSheet.showRows(r);
          });
        });
      }
    }
    if (modo) tiempos.push(`${modo} ${Date.now() - tK} ms`);
    return `${prodsNuevos.length} altas, ${ediciones.length} ediciones (${nRen} renombres, ${nAct} cambios de activo), picking ${key} guardado` +
      (tiempos.length ? ` · ${tiempos.join(" · ")}` : "");
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
          try { targetSs = _abrirLibro(t.url); } catch(err) {}
        }

        const vistaSheet = _hoja(ss, t.vistaName);
        if (targetSs && vistaSheet) {
          const vLr = vistaSheet.getLastRow();
          const vCount = Math.max(vLr - 3, 0);
          if (vCount < 1) return;

          // 1. Leer los datos frescos calculados en VISTA_MOVIL de Bodega (12 cols: A4:L)
          const datosFrescos = vistaSheet.getRange(4, 1, vCount, 12).getValues();

          // 2. Buscar la hoja de sincronización en la tienda remota (_SYNC_BA, _SYNC_BM o _SYNC)
          let syncSheet = _hoja(targetSs, `_SYNC_${t.key}`) || 
                          _hoja(targetSs, "_SYNC") ||
                          _hoja(targetSs, `_SYNC_${t.key.toLowerCase()}`);
          
          if (!syncSheet) {
            syncSheet = targetSs.getSheets().find(s => s.getName().startsWith("_SYNC"));
          }

          // 3. Reordenar 📋 PEDIDO DIARIO a distancia SOLO si cambiaron las POSICIONES de productos en la vista
          //    (altas/bajas reconstruyen el Kardex y recorren filas: las filas del pedido apuntan a _SYNC por número
          //    de fila y, sin reordenar antes de refrescar, las capturas quedarían en el producto equivocado).
          //    Picking, activos y el cierre nocturno no mueven filas: basta refrescar el enlace y la tienda se
          //    reordena sola por la huella del catálogo (1.7.6i). Menos escritura cruzada y push más rápido.
          const pedidoSheet = _hoja(targetSs, "📋 PEDIDO DIARIO");
          if (pedidoSheet && syncSheet) {
            const nuevos = datosFrescos.map(r => String(r[2]).trim());
            const nPed = Math.max(pedidoSheet.getLastRow() - 3, 0);
            const porNombre = nPed > 0 && !pedidoSheet.getRange(4, 3).getFormula();   // esquema 4: PRODUCTO fijo
            let reordenar;
            if (porNombre) {
              // Las filas no dependen de la posición en _SYNC: solo hay que tocar el pedido si entran o salen productos
              const enPedido = new Set(pedidoSheet.getRange(4, 3, nPed, 1).getValues().map(r => String(r[0]).trim()).filter(Boolean));
              reordenar = nuevos.length !== enPedido.size || nuevos.some(p => !enPedido.has(p));
            } else {
              const nSync = Math.max(syncSheet.getLastRow() - 3, 0);
              const actuales = nSync > 0 ? syncSheet.getRange(4, 3, nSync, 1).getValues().map(r => String(r[0]).trim()) : [];
              reordenar = !(actuales.length === nuevos.length && actuales.every((p, i) => p === nuevos[i]));
            }
            if (reordenar) _reordenarPedidoRemotoDirecto(targetSs, syncSheet, pedidoSheet, datosFrescos);
          }

          // 4. AL FINAL refrescar el enlace vivo (re-escribir la fórmula rompe la caché). NUNCA pisar A4 con
          //    valores: eso borra el IMPORTRANGE y congela saldos/estado en la tienda.
          if (syncSheet) {
            const fActual = syncSheet.getRange(4, 1).getFormula();
            const fSync = /IMPORTRANGE/i.test(fActual) ? fActual
              : `=IMPORTRANGE("${ss.getUrl()}", "${t.vistaName}!A4:L")`;
            syncSheet.getRange(4, 1).clearContent();
            syncSheet.getRange(4, 1).setFormula(fSync);
          }
        }
      } catch(e) {
        MiseLogger.info("sincronizarRemotamenteTiendasPush ERROR", `${t.name}: ${e.toString()}`);
      }
    }
  });
}

// Esquema 4 (1.7.7g): el PRODUCTO (C) es un valor fijo y lo demás se busca POR NOMBRE en _SYNC. Antes cada fila apuntaba
// a un NÚMERO de fila de _SYNC: un alta recorría las filas y la cantidad capturada quedaba junto al producto vecino
// (caso real Canada Dry 600 ml). La MISMA función vive en tienda/miseTienda.js (lo verifica simulacion.test.js).
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

/**
 * Reordena atómicamente y físicamente la tabla del Pedido Diario en un libro de tienda remoto
 */
function _reordenarPedidoRemotoDirecto(targetSs, syncSheet, pedidoSheet, syncValues = null) {
  try {
    const DATA_START_ROW = 4;
    const COL_CANT_PEDIR = 6;
    // Estructura de la tienda por su ENCABEZADO (misma regla que _layoutPedido en tienda): esquema 3 = A:J con
    // MÍN|MÁX en J; esquema 2 (aún no migra) = A:K con J reservada y MÍN|MÁX en K
    const enc = pedidoSheet.getRange(3, 10, 1, 2).getValues()[0];
    const esquema2 = /MÍN/i.test(String(enc[1])) && !/MÍN/i.test(String(enc[0]));
    const NUM_COLS = esquema2 ? 11 : 10;

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

    const outputData = [];
    const bgs = [];
    const cleanFonts = [];

    for (let i = 0; i < items.length; i++) {
      const r = DATA_START_ROW + i;
      const prodName = String(items[i].vals[2]).trim();
      const prodNo = parseInt(items[i].vals[0]) || (i + 1);

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

      const f = _formulasPedidoPorNombre(r, syncSheet.getName());
      const fila = [
        prodNo,
        f.categoria,
        prodName,                       // PRODUCTO fijo: la identidad de la fila (esquema 4)
        f.unidad,
        f.saldo,
        items[i].vals[5],
        '=IF(OR(F' + r + '="", H' + r + '=""), "", H' + r + ' - F' + r + ')',
        items[i].vals[7] === "" ? "" : items[i].vals[7],
        items[i].vals[8] || "",
        f.minmax
      ];
      if (esquema2) fila.splice(9, 0, ""); // J reservada vacía (ADICIÓN retirada en 1.7.6e)
      outputData.push(fila);
    }

    if (currentCount > 0) {
      pedidoSheet.getRange(DATA_START_ROW, 1, currentCount, NUM_COLS).clearContent();
    }
    pedidoSheet.getRange(DATA_START_ROW, 1, items.length, NUM_COLS).setValues(outputData); // texto no se vuelve #NAME?
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
      MiseLogger.info("_reordenarPedidoRemotoDirecto hideRows ERROR", errHide.toString());
    }
  } catch(e) {
    MiseLogger.info("_reordenarPedidoRemotoDirecto ERROR", e.toString());
  }
}

/**
 * Asegura la existencia y formateo de las columnas de stock de quiosco y picking en MAESTRO
 */
function _asegurarColumnasQuioscoEnMaestro(maestroSheet) {
  const sheet = maestroSheet || _hoja(SpreadsheetApp.getActiveSpreadsheet(), SHEET_MAESTRO);
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
    { key: "FACTOR_CONVERSION", width: 110, isStock: false, defaultVal: "", numberFormat: "0.####" }, // vacío = sin conversión
    { key: "RECEPCION_PESADA", width: 100, isStock: false, defaultVal: "" }, // "SÍ" = en Entradas se escribe el peso exacto en kg
    { key: "PROVEEDOR", width: 110, isStock: false, defaultVal: "" }          // 1.7.7j: filtro de 🔎 Stock de bodegas
  ];

  const lr = sheet.getLastRow();
  const numRows = lr >= MAESTRO_START ? lr - MAESTRO_START + 1 : 0;

  let agregadas = 0;
  requiredCols.forEach(colDef => {
    if (!map[colDef.key]) {
      agregadas++;
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

  // PROVEEDOR recién creado (1.7.7j): valor inicial por producto, solo en celdas vacías
  if (numRows > 0 && map["PROVEEDOR"] && map["PRODUCTO"]) {
    const rngProv = sheet.getRange(MAESTRO_START, map["PROVEEDOR"].col, numRows, 1);
    const prov = rngProv.getValues();
    if (prov.every(r => String(r[0]).trim() === "")) {
      const nombres = sheet.getRange(MAESTRO_START, map["PRODUCTO"].col, numRows, 1).getValues();
      rngProv.setValues(nombres.map(r => [String(r[0]).trim() ? _proveedorInicial(r[0]) : ""]));
    }
  }

  // Solo si cambió la estructura (1.7.7d): antes descombinaba, aplicaba y recombinaba la fila 1 en CADA apertura de Powerhouse
  if (agregadas) _asegurarFormatoHeadersMaestro(sheet);
  return agregadas;
}

/**
 * Formatea automáticamente todas las columnas del header MAESTRO con el verde C.sage institucional
 * y restaura de forma segura los botones de Fila 2 sin romper celdas
 */
function _asegurarFormatoHeadersMaestro(maestroSheet) {
  const sheet = maestroSheet || _hoja(SpreadsheetApp.getActiveSpreadsheet(), SHEET_MAESTRO);
  if (!sheet) return;
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) return;

  // Banner principal en Fila 1 (merge limpio de 1 hasta lastCol)
  try { _separarCombinaciones(sheet.getRange(1, 1, 1, sheet.getMaxColumns())); SpreadsheetApp.flush(); } catch(e) {}
  sheet.getRange(1, 1, 1, lastCol).merge()
    .setValue("MISE — MAESTRO DE PRODUCTOS   |   La Crêpe Parisienne · Grupo MYT")
    .setBackground(C.dark).setFontColor("#FFFFFF").setFontWeight("bold")
    .setFontSize(11).setFontFamily("Arial").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.setRowHeight(1, 32);

  // Fila 2: Centro de Control Táctil (preservación y restauración sagrada de botones)

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
    const sheet = _hoja(SpreadsheetApp.getActiveSpreadsheet(), BODEGAS[key].kardex);
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
// presupuestoMs: tope de tiempo (onOpen simple = 30 s). Si se agota, la bodega pendiente se deja
// completa para la siguiente corrida en vez de quedar a medio avanzar (historial sin G4 movido).
function _autoVerificarYAvanzarSemanaSilencioso(silent = true, presupuestoMs = null) {
  let bodegasAvanzadas = 0;
  const detalles = [];
  const t0 = Date.now();
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hoy = new Date();
    
    Object.keys(BODEGAS).forEach(key => {
      const bodega = BODEGAS[key];
      const sheet = _hoja(ss, bodega.kardex);
      if (!sheet) return;
      
      let d4 = sheet.getRange("G4").getValue();
      if (!d4 || !(d4 instanceof Date) || isNaN(d4.getTime())) {
        const lunesActual = _obtenerLunesSemanaActual();
        sheet.getRange("G4").setValue(lunesActual).setNumberFormat("DD/MMM/YYYY");
        _actualizarBadgeEstadoSemana(sheet, key, true);
        return;
      }
      
      let d4Midnight = new Date(d4.getFullYear(), d4.getMonth(), d4.getDate(), 0, 0, 0);
      let nextMondayTime = d4Midnight.getTime() + 7 * 24 * 60 * 60 * 1000;
      
      // Si ya pasó el fin de semana (Domingo >= 22:00 o posterior a nextMondayTime):
      let iteraciones = 0;
      while ((hoy.getTime() >= nextMondayTime - 2 * 60 * 60 * 1000) && iteraciones < 4) {
        if (presupuestoMs && Date.now() - t0 > presupuestoMs) {
          MiseLogger.warn("_autoVerificarYAvanzarSemanaSilencioso", `${bodega.nombre}: sin tiempo en esta corrida; se avanzará en la siguiente.`);
          break;
        }
        const semAnterior = _isoWeek(d4);
        if (!_ejecutarAvanzarSemanaSilencioso(key, sheet, d4)) {
          MiseLogger.warn("_autoVerificarYAvanzarSemanaSilencioso", `${bodega.nombre}: no se obtuvo el candado; semana NO avanzada.`);
          break;
        }
        bodegasAvanzadas++;
        iteraciones++;
        d4 = sheet.getRange("G4").getValue();
        if (!d4 || !(d4 instanceof Date) || isNaN(d4.getTime())) break;
        d4Midnight = new Date(d4.getFullYear(), d4.getMonth(), d4.getDate(), 0, 0, 0);
        nextMondayTime = d4Midnight.getTime() + 7 * 24 * 60 * 60 * 1000;
        detalles.push(`${bodega.nombre}: Semana ${semAnterior} ➔ ${_fmt(d4)}`);
      }
      const alDia = !(hoy.getTime() >= nextMondayTime - 2 * 60 * 60 * 1000);
      _actualizarBadgeEstadoSemana(sheet, key, alDia);
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
    const donde = (String(e.stack || "").match(/at ([A-Za-z_$][\w$]*)/) || [])[1] || "desconocido";
    MiseLogger.error("_autoVerificarYAvanzarSemanaSilencioso", `${e.message} (en ${donde})`, e);
    if (!silent) {
      SpreadsheetApp.getUi().alert("❌ Error", `Error al verificar semanas: ${e.message}\n\nOcurrió en: ${donde}\n(detalle completo en 🗒 LOG)`, SpreadsheetApp.getUi().ButtonSet.OK);
    }
  }
  return bodegasAvanzadas;
}

// Fila 2 del Inventario (1.7.6s): título · estado de la semana con sus fechas · leyenda de columnas.
// Sin emojis que algunas fuentes no dibujan (el 🟢 salía como un cuadro vacío). La semana sale de G4 (fuente única).
function _actualizarBadgeEstadoSemana(sheet, key, actualizada) {
  try {
    const d4 = sheet.getRange("G4").getValue();
    const lunes = d4 instanceof Date && !isNaN(d4.getTime()) ? d4 : _obtenerLunesSemanaActual();
    const domingo = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + 6);
    const dm = (d) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
    const sem = _isoWeek(lunes);
    // Separar exactamente las combinaciones de D2:AD2 (títulos de versiones previas) antes de reescribir
    _separarCombinaciones(sheet.getRange(2, 4, 1, 27));
    SpreadsheetApp.flush();
    sheet.getRange(2, 1, 1, 30).setBackground(C.dark);
    sheet.getRange(2, 3).setValue(`📦 Inventario ${BODEGAS[key].nombre}`)
      .setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(11).setFontFamily("Arial").setHorizontalAlignment("left");
    sheet.getRange(2, 4, 1, 6).merge()
      .setValue(actualizada ? `✅ Semana ${sem} · ${dm(lunes)} al ${dm(domingo)}` : `⏳ Semana ${sem} · falta avanzar`)
      .setFontWeight("bold").setFontSize(10).setHorizontalAlignment("center").setVerticalAlignment("middle")
      .setBackground(actualizada ? "#C8E6C9" : "#FFF9C4").setFontColor(actualizada ? "#1B5E20" : "#F57F17");
    sheet.getRange(2, 10, 1, 21).merge()
      .setValue("ENT = entró   ·   SAL = salió   ·   SLD = lo que queda")
      .setFontColor("#C8E6C9").setFontSize(10).setHorizontalAlignment("center").setVerticalAlignment("middle");
    sheet.setRowHeight(2, 30);
    // Aplicar YA las escrituras: si algo falla, que falle aquí (atrapado) y no en la siguiente lectura
    SpreadsheetApp.flush();
  } catch(e) {
    MiseLogger.warn("_actualizarBadgeEstadoSemana", `${BODEGAS[key].nombre}: no se pudo dibujar el encabezado (${e.message}); el avance de semana no se afecta.`);
  }
}

// Filas 3–5 del Inventario (1.7.6s): fuera las etiquetas que la simplificación dejó desfasadas (SEMANA/FECHA/SUCURSAL),
// las celdas decorativas E4/I4/K4 y las casillas de acciones (avanzar semana ya es automático; recrear vista lo hace
// 🚀 Configurar; altas/bajas, el Powerhouse). G4 (lunes de la semana) se CONSERVA: es la fuente de verdad.
function _limpiarEncabezadoInventario(sheet) {
  const g4 = sheet.getRange("G4").getValue();
  _separarCombinaciones(sheet.getRange(3, 4, 2, 27));
  SpreadsheetApp.flush();
  const zona = sheet.getRange(3, 4, 2, 27);
  zona.clearDataValidations();
  zona.clearContent();
  zona.setBackground(null);
  if (g4 instanceof Date && !isNaN(g4.getTime())) sheet.getRange("G4").setValue(g4);
  sheet.getRange("G4").setNumberFormat("DD/MMM/YYYY").setDataValidation(SpreadsheetApp.newDataValidation().requireDate()
    .setHelpText("LUNES de la semana. Lo maneja Mise (avance automático o ⚙️ Mise → Configurar semana).").build());
  sheet.hideRows(3, 2);
  // Fila 5: un solo "PRODUCTO" (antes "DATOS DEL PRODUCTO" dos veces)
  sheet.getRange(5, 1).setValue("PRODUCTO");
  sheet.getRange(5, 4).setValue("");
}



function _ejecutarAvanzarSemanaSilencioso(key, sheet, d4) {
  const lock = LockService.getScriptLock();
  const yaTeniaCandado = lock.hasLock();
  if (!yaTeniaCandado && !lock.tryLock(15000)) return false;
  try {
    const lr = sheet.getLastRow();
    const numRows = lr - KARDEX_START + 1;
    if (numRows < 1) return false;

    const sem = _isoWeek(d4 instanceof Date && !isNaN(d4.getTime()) ? d4 : _obtenerLunesSemanaActual());

    // 1. Leer saldos finales (col AD = 30)
    const saldosFin = sheet.getRange(KARDEX_START, KARDEX_SLD_FIN, numRows, 1).getValues();
    const saldosAnt = saldosFin.map(r => [typeof r[0] === "number" ? r[0] : 0]);

    // 2. Guardar en HISTORIAL horizontal (con respaldo si falla: la semana debe avanzar igual)
    _archivarSemanaSeguro(key, sheet, numRows, d4, sem);

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

    _actualizarBadgeEstadoSemana(sheet, key, true);
    MiseLogger.info("autoAvanzarSemanaSilencioso", `${BODEGAS[key].nombre} | Semana ${sem} avanzada automáticamente al ${_fmt(nuevoLunes)}.`);
    return true;
  } finally {
    if (!yaTeniaCandado) lock.releaseLock();
  }
}

function abrirDialogoTraspasoBDGHTML() {
  const html = HtmlService.createHtmlOutputFromFile('TraspasoDialog')
    .setWidth(580)
    .setHeight(540);
  SpreadsheetApp.getUi().showModalDialog(html, "🔄 Registrar Traspaso entre Sucursales (Andares ⇄ Mercado)");
}

function obtenerCatalogoParaTraspaso() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const maestro = _hoja(ss, SHEET_MAESTRO);
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

// ── 🩺 DIAGNÓSTICO DE ACTIVADORES ─────────────────────────────────────────────
// Apps Script no expone la hora programada de un activador; se listan función, tipo y id.
// Solo aparecen los activadores instalados por la cuenta que ejecuta el diagnóstico.
const ACTIVADORES_ESPERADOS_BDG = ["descontarSurtidoAutomatico", "ejecutarMantenimientoSemanalBDG", "onEditBodegaInstalable", "onOpenBodegaInstalable"];

function diagnosticarActivadores() {
  const trig = ScriptApp.getProjectTriggers();
  const lineas = trig.map(t => `• ${t.getHandlerFunction()} — ${t.getEventType()} (${t.getUniqueId()})`);
  const presentes = new Set(trig.map(t => t.getHandlerFunction()));
  const faltantes = ACTIVADORES_ESPERADOS_BDG.filter(f => !presentes.has(f));
  const conteo = {};
  trig.forEach(t => { conteo[t.getHandlerFunction()] = (conteo[t.getHandlerFunction()] || 0) + 1; });
  const duplicados = Object.keys(conteo).filter(f => conteo[f] > 1);

  const resumen = `${trig.length} activador(es) · faltan: ${faltantes.join(", ") || "ninguno"} · duplicados: ${duplicados.join(", ") || "ninguno"}`;
  MiseLogger.info("diagnosticarActivadores", `${resumen} | ${lineas.join(" ")}`);
  try {
    SpreadsheetApp.getUi().alert("🩺 Activadores de Bodega", `${resumen}\n\n${lineas.join("\n") || "(ninguno)"}\n\n` +
      (faltantes.length ? "Usa ⚙️ Mise → 🚀 Configurar este libro." : "Todo en orden."),
      SpreadsheetApp.getUi().ButtonSet.OK);
  } catch(e) {}
  return { total: trig.length, faltantes, duplicados, lineas };
}

// ── 📥 ENTRADAS DE STOCK MÓVIL (AMBAS TIENDAS → KARDEX) ──────────────────────
// Hoja persistente optimizada para la app nativa de Sheets: sin menús ni alerts.
// Captura en UNIDAD de Kardex, suma a la ENT del día elegido (HOY por default)
// y confirma con el checkbox de D2. El resultado se escribe en la fila 3.
const SHEET_ENTRADAS   = "📥 Registrar entradas"; // nombre anterior en NOMBRES_ANTERIORES
const ENTRADAS_START   = 5;      // primera fila de productos
const ENTRADAS_HOY     = "HOY (automático)";
// Modo de la hoja (A2, 1.7.6p): entradas a cada bodega o traspaso entre bodegas (en la unidad del Kardex)
const ENTRADAS_MODOS   = ["📥 Entrada", "🔄 Andares → Mercado", "🔄 Mercado → Andares"];
const ENTRADAS_TRASPASO = { "🔄 Andares → Mercado": { origen: "BA", destino: "BM" }, "🔄 Mercado → Andares": { origen: "BM", destino: "BA" } };

// Distribución para celular (1.7.6v): producto 190 · unidad 56 · cantidades 72 + 72 (≈ 390 px). Fila 1: título A1:C1 y
// "Enviar ⬇" en D1; fila 2: modo (A2) · día (B2:C2, ahora cabe "HOY (automático)") · casilla Enviar grande (D2).
function _layoutEntradas(sheet) {
  [[1, 190], [2, 56], [3, 72], [4, 72]].forEach(([c, w]) => sheet.setColumnWidth(c, w));
  try {
    _separarCombinaciones(sheet.getRange("A1:D2"));
    SpreadsheetApp.flush();
    sheet.getRange("A1:C1").merge().setValue("📥 ENTRADAS Y TRASPASOS")
      .setBackground(C.dark).setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(11)
      .setHorizontalAlignment("center").setVerticalAlignment("middle");
    sheet.getRange("D1").setValue("Enviar ⬇").setBackground(C.dark).setFontColor("#FFFFFF").setFontWeight("bold")
      .setFontSize(9).setHorizontalAlignment("center").setVerticalAlignment("middle");
    const dia = sheet.getRange("B2").getValue();
    sheet.getRange("C2").clearContent();
    sheet.getRange("B2:C2").merge().setBackground(C.yellow).setFontWeight("bold")
      .setHorizontalAlignment("center").setVerticalAlignment("middle");
    if (dia !== "") sheet.getRange("B2").setValue(dia);
    sheet.getRange("D2").setFontSize(22).setBackground(C.yellow).setHorizontalAlignment("center").setVerticalAlignment("middle");
    sheet.setRowHeight(2, 40);
    sheet.setRowHeight(3, 34);
    sheet.getRange(4, 1, 1, 4).setFontSize(9).setWrap(true);
    sheet.getRange("B4").setValue("UNIDAD").setFontSize(8);
    SpreadsheetApp.flush();
  } catch (e) {
    MiseLogger.warn("_layoutEntradas", e.message);
  }
}

function _modoEntradas(sheet) {
  const v = String(sheet.getRange("A2").getValue() || "");
  return ENTRADAS_MODOS.indexOf(v) !== -1 ? v : ENTRADAS_MODOS[0];
}

// Unidades por producto desde el Catálogo (1.7.6w): de bodega (Kardex) y de pedido con su factor. El factor solo
// aplica si hay unidad de pedido (misma regla que el descuento y la vista de tiendas).
function _unidadesCatalogo(ss) {
  const maestro = _hoja(ss, SHEET_MAESTRO);
  const mapa = {};
  if (!maestro || maestro.getLastRow() < MAESTRO_START) return mapa;
  const map = _getMaestroHeaderMap(maestro);
  if (!map["PRODUCTO"]) return mapa;
  maestro.getRange(MAESTRO_START, 1, maestro.getLastRow() - MAESTRO_START + 1, maestro.getLastColumn()).getValues().forEach(r => {
    const nombre = String(r[map["PRODUCTO"].index] || "").trim().toUpperCase();
    if (!nombre) return;
    const pedido = map["UNIDAD_TIENDA"] ? String(r[map["UNIDAD_TIENDA"].index] || "").trim() : "";
    const f = map["FACTOR_CONVERSION"] ? parseFloat(String(r[map["FACTOR_CONVERSION"].index]).replace(",", ".")) : NaN;
    mapa[nombre] = { kardex: map["UNIDAD"] ? String(r[map["UNIDAD"].index] || "").trim() : "",
      pedido, factor: pedido && f > 0 ? f : 1,
      pres: map["PRESENTACION"] ? String(r[map["PRESENTACION"].index] || "").trim() : "",
      pesado: map["RECEPCION_PESADA"] ? /^S[IÍ]$/i.test(String(r[map["RECEPCION_PESADA"].index] || "").trim()) : false };
  });
  return mapa;
}

// ── ⚖️ CONVERSIÓN EN ENTRADAS (1.7.7a) ────────────────────────────────────────────────────────
// Cómo se captura cada producto al recibir del proveedor y cómo pasa a la unidad del inventario:
//  · pesado (fruta, verdura…): kg exactos → si el inventario es de peso, directo; si cuenta domos/piezas, ÷ peso de cada
//    uno según la presentación ("PZA 180 g" → 0.18 kg); las piezas se redondean a entero (es una estimación).
//  · con unidad de pedido: en esa unidad (bol, caj…) × factor.  · sin unidad de pedido: la unidad del inventario.
function _pesoPorUnidadKg(presentacion) {
  const m = String(presentacion || "").trim().match(/(\d+(?:[.,]\d+)?)\s*([\p{L}.]+)$/u);
  if (!m) return null;
  const u = _unidadBase(m[2]);
  if (!u || u[0] !== "masa") return null;
  const kg = parseFloat(m[1].replace(",", ".")) * u[1] / 1000;
  return kg > 0 ? kg : null;
}

function _conversionEntrada(info) {
  if (!info) return { captura: "", aInventario: (q) => q };
  if (info.pesado) {
    const uInv = _unidadBase(info.kardex);
    if (uInv && uInv[0] === "masa") return { captura: "kg", aInventario: (q) => Math.round(q * 1000 / uInv[1] * 1000) / 1000 };
    const p = _pesoPorUnidadKg(info.pres);
    if (!p) return { captura: "kg", error: `falta el peso por unidad en la presentación (ej. "PZA 180 g") para pasar kg a ${info.kardex || "su unidad"}` };
    const entero = uInv && uInv[0] === "pieza";
    return { captura: "kg", aInventario: (q) => entero ? Math.round(q / p) : Math.round(q / p * 100) / 100, detalle: `÷ ${p} kg` };
  }
  if (info.pedido) return { captura: info.pedido, aInventario: (q) => Math.round(q * info.factor * 10000) / 10000 };
  return { captura: info.kardex, aInventario: (q) => q };
}

// Encabezados, colores e instrucción según el modo elegido en A2
function _aplicarModoEntradas(sheet, conMensaje) {
  const modo = _modoEntradas(sheet);
  const tr = ENTRADAS_TRASPASO[modo];
  const n = Math.max(sheet.getLastRow() - ENTRADAS_START + 1, 0);
  const a2 = sheet.getRange("A2");
  a2.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(ENTRADAS_MODOS, true).setAllowInvalid(false).build());
  if (String(a2.getValue()) !== modo) a2.setValue(modo);
  a2.setBackground(C.yellow).setFontWeight("bold").setHorizontalAlignment("center");
  // Unidad: en traspaso, la de pedido (domo, caja… como en las tiendas); en entrada, la de bodega
  if (n) {
    const uni = _unidadesCatalogo(sheet.getParent ? sheet.getParent() : SpreadsheetApp.getActiveSpreadsheet());
    const nombres = sheet.getRange(ENTRADAS_START, 1, n, 2).getValues();
    sheet.getRange(ENTRADAS_START, 2, n, 1).setValues(nombres.map(([p, uActual]) => {
      const u = uni[String(p).trim().toUpperCase()];
      if (!u) return [uActual];
      if (tr) return [u.pedido || u.kardex || uActual];
      const c = _conversionEntrada(u);
      return [c.captura || uActual];
    }));
  }
  if (tr) {
    sheet.getRange(4, 3, 1, 2).setValues([["CANTIDAD", "—"]]).setWrap(true);
    if (n) { sheet.getRange(ENTRADAS_START, 3, n, 1).setBackground("#E3F2FD"); sheet.getRange(ENTRADAS_START, 4, n, 1).setBackground("#EEEEEE"); }
  } else {
    sheet.getRange(4, 3, 1, 2).setValues([["ANDARES", "MERCADO"]]).setWrap(true);
    if (n) sheet.getRange(ENTRADAS_START, 3, n, 2).setBackground(C.entBg);
  }
  sheet.setRowHeight(4, 30);
  if (conMensaje) {
    _estadoEntradas(sheet, tr
      ? `🔄 Traspaso ${BODEGAS[tr.origen].nombre} → ${BODEGAS[tr.destino].nombre}: escribe la CANTIDAD como se pide en tienda (domo, caja… ver UNIDAD) y marca Enviar ⬇.`
      : "ℹ️ Escribe lo que entró en la UNIDAD de cada producto (bol, caj… o kg exactos en fruta) y marca Enviar ⬇. Mise convierte.", "info");
  }
}

// Número capturado: null si vacío, NaN si no es un número ≥ 0
function _numEntrada(v) {
  if (v === "" || v === null) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", ".").trim());
  return (isNaN(n) || n < 0) ? NaN : Math.round(n * 10000) / 10000;
}

function prepararHojaEntradasManualmente() {
  const sheet = _prepararHojaEntradas();
  SpreadsheetApp.setActiveSheet(sheet);
  SpreadsheetApp.getActive().toast("Hoja 📥 ENTRADAS lista para capturar desde el celular ✓", "⚙️ Mise", 5);
}

// Devuelve el lunes de la semana activa del Kardex de una bodega (G4) a las 00:00.
// Cada bodega tiene su propia semana: si una se atrasa, no puede arrastrar a la otra.
function _lunesSemanaActivaKardex(ss, key = "BA") {
  const k = _hoja(ss, BODEGAS[key].kardex);
  let monday = k ? k.getRange("G4").getValue() : null;
  if (!monday || !(monday instanceof Date) || isNaN(monday.getTime())) {
    monday = _obtenerLunesSemanaActual();
  }
  return new Date(monday.getFullYear(), monday.getMonth(), monday.getDate(), 0, 0, 0);
}

// Opciones del selector de día: HOY + LUN..DOM con fecha de la semana activa
function _opcionesDiaEntradas(monday) {
  const opts = [ENTRADAS_HOY];
  for (let d = 0; d < KARDEX_DAYS; d++) {
    const f = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + d);
    opts.push(`${DIAS[d]} ${String(f.getDate()).padStart(2, "0")}/${String(f.getMonth() + 1).padStart(2, "0")}`);
  }
  return opts;
}

// Crea (o re-sincroniza) la hoja. Conserva cantidades capturadas si keepQty = true.
function _prepararHojaEntradas(keepQty = false) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const kBA = _hoja(ss, BODEGAS.BA.kardex);
  if (!kBA) throw new Error(`No existe ${BODEGAS.BA.kardex}.`);

  let sheet = _hoja(ss, SHEET_ENTRADAS);
  if (!sheet) sheet = ss.insertSheet(SHEET_ENTRADAS, 0);
  // Encabezado incompleto (hoja nueva o intento previo interrumpido) → se arma completo
  const esNueva = sheet.getRange(4, 1).getValue() !== "PRODUCTO";

  // Respaldo de cantidades ya capturadas (por nombre de producto)
  const prevQty = {};
  if (keepQty && !esNueva && sheet.getLastRow() >= ENTRADAS_START) {
    sheet.getRange(ENTRADAS_START, 1, sheet.getLastRow() - ENTRADAS_START + 1, 4).getValues().forEach(r => {
      const n = String(r[0]).trim().toUpperCase();
      if (n && (r[2] !== "" || r[3] !== "")) prevQty[n] = [r[2], r[3]];
    });
  }

  // Productos activos en el orden del Kardex (agrupado por categoría)
  const klr = kBA.getLastRow();
  const kData = klr >= KARDEX_START ? kBA.getRange(KARDEX_START, 1, klr - KARDEX_START + 1, 5).getValues() : [];
  const maestro = _hoja(ss, SHEET_MAESTRO);
  const inactivos = new Set();
  if (maestro && maestro.getLastRow() >= MAESTRO_START) {
    const map = _getMaestroHeaderMap(maestro);
    const cProd = map["PRODUCTO"] ? map["PRODUCTO"].index : 2;
    const cAct  = map["ACTIVO"] ? map["ACTIVO"].index : 5;
    maestro.getRange(MAESTRO_START, 1, maestro.getLastRow() - MAESTRO_START + 1, maestro.getLastColumn()).getValues()
      .forEach(r => { if (String(r[cAct]).trim().toUpperCase() === "NO") inactivos.add(String(r[cProd]).trim().toUpperCase()); });
  }
  const prods = kData
    .filter(r => r[0] !== "" && String(r[2]).trim() && !inactivos.has(String(r[2]).trim().toUpperCase()))
    .map(r => {
      const nombre = String(r[2]).trim();
      const q = prevQty[nombre.toUpperCase()] || ["", ""];
      return [nombre, String(r[4] || "").trim(), q[0], q[1]];
    });

  // Limpieza de la zona de datos
  const maxRows = sheet.getMaxRows();
  if (maxRows >= ENTRADAS_START) {
    sheet.getRange(ENTRADAS_START, 1, maxRows - ENTRADAS_START + 1, 4).clearContent().setBackground(null);
  }
  const needed = ENTRADAS_START + prods.length;
  if (maxRows < needed) sheet.insertRowsAfter(maxRows, needed - maxRows);

  if (esNueva) {
    sheet.setFrozenRows(0);
    sheet.setFrozenColumns(0);
    sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).breakApart();
    sheet.getRange("A1:C1").merge().setValue("📥 ENTRADAS Y TRASPASOS")
      .setBackground(C.dark).setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(11)
      .setHorizontalAlignment("center").setVerticalAlignment("middle");
    sheet.setRowHeight(1, 32);

    sheet.getRange("A2").setValue(ENTRADAS_MODOS[0]);
    sheet.getRange("D2").insertCheckboxes().setValue(false);
    sheet.getRange("A2:D2").setBackground(C.cream).setVerticalAlignment("middle");
    sheet.getRange("B2").setBackground(C.yellow);
    sheet.getRange("D2").setBackground(C.yellow);
    sheet.setRowHeight(2, 36);

    sheet.getRange("A3:D3").merge().setBackground("#FFFFFF").setFontSize(9)
      .setHorizontalAlignment("center").setVerticalAlignment("middle").setWrap(true);
    sheet.setRowHeight(3, 30);

    sheet.getRange(4, 1, 1, 4).setValues([["PRODUCTO", "UNIDAD", "ANDARES", "MERCADO"]])
      .setBackground(C.sage).setFontColor("#FFFFFF").setFontWeight("bold").setHorizontalAlignment("center");

    // Solo filas congeladas: los títulos combinados A:D impiden congelar columnas, y las 4 columnas
    // caben en el ancho de un celular (≈ 390 px) sin desplazamiento horizontal.
    sheet.setFrozenRows(4);
    sheet.setColumnWidth(1, 205);  // PRODUCTO: más ancha, con ajuste de texto
    sheet.setColumnWidth(2, 40);   // UNIDAD: 2–3 caracteres (kg, lt, pza)
    sheet.setColumnWidth(3, 72);
    sheet.setColumnWidth(4, 72);
  }

  // Anchos y fila 1–2 al día también en hojas creadas por versiones previas (cabe en ≈ 390 px de celular)
  _layoutEntradas(sheet);

  // Selector de día (se refresca siempre para reflejar las fechas de la semana activa)
  const opts = _opcionesDiaEntradas(_lunesSemanaActivaKardex(ss));
  const dayCell = sheet.getRange("B2");
  const prevVal = dayCell.getValue();
  const prevIdx = prevVal instanceof Date ? (prevVal.getDay() + 6) % 7 : DIAS.indexOf(String(prevVal || "").trim().toUpperCase().substring(0, 3));
  dayCell.setNumberFormat("@"); // 1.7.7k: texto, para que Google no convierta "JUE 01/10" en fecha
  dayCell.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(opts, true).setAllowInvalid(false).build())
    .setValue(keepQty && prevIdx !== -1 ? opts[prevIdx + 1] : ENTRADAS_HOY);

  if (prods.length > 0) {
    const rng = sheet.getRange(ENTRADAS_START, 1, prods.length, 4);
    rng.setValues(prods);
    rng.setBackgrounds(prods.map((_, i) => {
      const base = i % 2 === 0 ? C.rowA : C.rowB;
      return [base, base, C.entBg, C.entBg];
    }));
    sheet.getRange(ENTRADAS_START, 1, prods.length, 1).setWrap(true).setFontSize(11).setVerticalAlignment("middle");
    sheet.getRange(ENTRADAS_START, 2, prods.length, 1).setHorizontalAlignment("center").setFontColor("#757575").setFontSize(9);
    sheet.getRange(ENTRADAS_START, 3, prods.length, 2).setFontSize(12).setVerticalAlignment("middle");
    sheet.setRowHeights(ENTRADAS_START, prods.length, 38); // filas altas: objetivo táctil cómodo en celular
    sheet.getRange(ENTRADAS_START, 3, prods.length, 2).setNumberFormat("0.####").setHorizontalAlignment("center");
  }

  // Modo (A2) y fila 3 = línea de estado: si está vacía, la instrucción del modo en lugar de una fila en blanco
  _aplicarModoEntradas(sheet, esNueva || !String(sheet.getRange("A3").getValue()).trim());
  return sheet;
}

function _estadoEntradas(sheet, msg, tipo) {
  const colores = { ok: ["#E8F5E9", "#1B5E20"], error: ["#FFEBEE", "#B71C1C"], info: ["#FFFFFF", "#546E7A"] };
  const c = colores[tipo] || colores.info;
  sheet.getRange("A3").setValue(msg).setBackground(c[0]).setFontColor(c[1]);
}

// Resuelve el índice de día (0 = LUN) para UNA bodega a partir del selector.
// HOY: valida que hoy caiga en la semana activa de ESA bodega. Día elegido: exige que esa bodega esté en la
// misma semana que muestra el selector (la de Andares), para no escribir en la semana equivocada.
// 1.7.7k: con la hoja en español, Google convierte "JUE 01/10" en FECHA al elegirlo (llegaba un Date y se rechazaba).
// Se acepta la fecha: debe caer dentro de la semana activa.
function _diaEntradasDesdeFecha(ss, fecha, key) {
  const lunes = _lunesSemanaActivaKardex(ss, key);
  const f = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const diff = Math.round((f.getTime() - lunes.getTime()) / 86400000);
  if (diff < 0 || diff > 6) throw new Error(`La fecha de B2 no está en la semana activa de ${BODEGAS[key].nombre}. Elige un día de la lista.`);
  return diff;
}

function _resolverDiaEntradas(ss, seleccion, key = "BA") {
  const nombre = BODEGAS[key].nombre;
  if (seleccion instanceof Date && !isNaN(seleccion.getTime())) {
    if (_lunesSemanaActivaKardex(ss, key).getTime() !== _lunesSemanaActivaKardex(ss, "BA").getTime()) {
      throw new Error(`${nombre} está en otra semana que Andares. Avanza su semana antes de enviar.`);
    }
    return _diaEntradasDesdeFecha(ss, seleccion, key);
  }
  if (seleccion && seleccion !== ENTRADAS_HOY) {
    const idx = DIAS.indexOf(String(seleccion).trim().toUpperCase().substring(0, 3));
    if (idx === -1) throw new Error("Día no válido en B2. Elige uno de la lista.");
    if (_lunesSemanaActivaKardex(ss, key).getTime() !== _lunesSemanaActivaKardex(ss, "BA").getTime()) {
      throw new Error(`${nombre} está en otra semana que Andares. Avanza su semana antes de enviar.`);
    }
    return idx;
  }
  const monday = _lunesSemanaActivaKardex(ss, key);
  const hoy = new Date();
  const hoyClean = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 0, 0, 0);
  const diff = Math.round((hoyClean.getTime() - monday.getTime()) / 86400000);
  if (diff < 0 || diff > 6) {
    throw new Error(`La semana activa de ${nombre} no incluye hoy. Avanza la semana antes de enviar.`);
  }
  return diff;
}

function procesarEntradasKardex() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = _hoja(ss, SHEET_ENTRADAS);
  if (!sheet) return;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    _estadoEntradas(sheet, "⏳ Bodega ocupada por otro proceso. Vuelve a marcar Enviar en unos segundos.", "error");
    return;
  }

  try {
    const lr = sheet.getLastRow();
    if (lr < ENTRADAS_START) {
      _estadoEntradas(sheet, "No hay productos en la lista.", "error");
      return;
    }
    const seleccionDia = sheet.getRange("B2").getValue();

    const rows = sheet.getRange(ENTRADAS_START, 1, lr - ENTRADAS_START + 1, 4).getValues();
    const pedidos = { BA: {}, BM: {} };
    const invalidas = [];
    let capturadas = 0;

    const _num = _numEntrada;
    const tr = ENTRADAS_TRASPASO[_modoEntradas(sheet)];
    if (tr) { _procesarTraspasoEntradas(ss, sheet, rows, seleccionDia, tr); return; }

    // Conversión por producto (1.7.7a: pesado → kg exactos; con unidad de pedido → × factor)
    const uniCat = _unidadesCatalogo(ss);
    const sinConversion = [];
    const convertidas = [];
    rows.forEach((r, i) => {
      const nombre = String(r[0]).trim().toUpperCase();
      if (!nombre) return;
      const conv = _conversionEntrada(uniCat[nombre]);
      [["BA", r[2], 3], ["BM", r[3], 4]].forEach(([key, raw, col]) => {
        const n = _num(raw);
        if (n === null || n === 0) return;
        if (isNaN(n)) { invalidas.push([ENTRADAS_START + i, col]); return; }
        if (conv.error) { invalidas.push([ENTRADAS_START + i, col]); sinConversion.push(`${String(r[0]).trim()}: ${conv.error}`); return; }
        const enInv = conv.aInventario(n);
        if (enInv !== n) convertidas.push(`${String(r[0]).trim()} ${n} ${conv.captura} → ${enInv} ${(uniCat[nombre] || {}).kardex || ""}`.trim());
        pedidos[key][nombre] = (pedidos[key][nombre] || 0) + enInv;
        capturadas++;
      });
    });

    if (sinConversion.length > 0) {
      invalidas.forEach(([row, col]) => sheet.getRange(row, col).setBackground("#FFCDD2"));
      _estadoEntradas(sheet, `❌ No se puede convertir: ${sinConversion.slice(0, 2).join(" · ")}. No se envió nada.`, "error");
      return;
    }
    if (invalidas.length > 0) {
      invalidas.forEach(([row, col]) => sheet.getRange(row, col).setBackground("#FFCDD2"));
      _estadoEntradas(sheet, `❌ ${invalidas.length} celda(s) en rojo no son números ≥ 0. Corrige y vuelve a enviar. No se envió nada.`, "error");
      return;
    }
    if (capturadas === 0) {
      _estadoEntradas(sheet, "No hay cantidades capturadas para enviar.", "info");
      return;
    }

    // Día por bodega (cada una con su semana activa); cualquier bloqueo detiene todo el envío
    const diaPorBodega = {};
    Object.keys(pedidos).forEach(key => {
      if (Object.keys(pedidos[key]).length) diaPorBodega[key] = _resolverDiaEntradas(ss, seleccionDia, key);
    });

    // Validar que todos los productos existan en su Kardex antes de escribir (todo o nada)
    const planes = {};
    const faltantes = [];
    Object.keys(pedidos).forEach(key => {
      const nombres = Object.keys(pedidos[key]);
      if (nombres.length === 0) return;
      const kSheet = _hoja(ss, BODEGAS[key].kardex);
      if (!kSheet) throw new Error(`No existe ${BODEGAS[key].kardex}.`);
      const klr = kSheet.getLastRow();
      const count = klr - KARDEX_START + 1;
      const kProds = kSheet.getRange(KARDEX_START, 3, count, 1).getValues();
      const idxMap = {};
      kProds.forEach((p, i) => { const n = String(p[0]).trim().toUpperCase(); if (n) idxMap[n] = i; });
      nombres.forEach(n => { if (idxMap[n] === undefined) faltantes.push(`${n} (${BODEGAS[key].nombre})`); });
      planes[key] = { kSheet, count, idxMap, nombres };
    });

    if (faltantes.length > 0) {
      _estadoEntradas(sheet, `❌ No están en el Kardex: ${faltantes.slice(0, 3).join(", ")}${faltantes.length > 3 ? "…" : ""}. No se envió nada.`, "error");
      return;
    }

    // Escritura en bloque: 1 lectura + 1 escritura de la columna ENT del día por Kardex
    const resumen = [];
    Object.keys(planes).forEach(key => {
      const { kSheet, count, idxMap, nombres } = planes[key];
      const entCol = 10 + diaPorBodega[key] * 3; // Col 10 = ENT LUN
      const rng = kSheet.getRange(KARDEX_START, entCol, count, 1);
      const vals = rng.getValues();
      nombres.forEach(n => {
        const i = idxMap[n];
        const prev = parseFloat(vals[i][0]) || 0;
        vals[i][0] = Math.round((prev + pedidos[key][n]) * 10000) / 10000;
      });
      rng.setValues(vals);
      resumen.push(`${BODEGAS[key].nombre} ${nombres.length}`);
      MiseLogger.info("procesarEntradasKardex", `${BODEGAS[key].kardex} ENT ${DIAS[diaPorBodega[key]]}: ` +
        nombres.map(n => `${n}+${pedidos[key][n]}`).join(", "));
    });

    // Limpiar capturas y re-sincronizar la lista con el catálogo vigente
    _prepararHojaEntradas(false);
    const hora = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "HH:mm");
    const dias = [...new Set(Object.values(diaPorBodega).map(d => DIAS[d]))].join("/");
    _estadoEntradas(sheet, `✅ ${capturadas} entrada(s) enviadas a ${dias} · ${hora} (${resumen.join(" · ")})` +
      (convertidas.length ? ` · ${convertidas.slice(0, 3).join(" · ")}${convertidas.length > 3 ? "…" : ""}` : ""), "ok");
  } catch (err) {
    MiseLogger.error("procesarEntradasKardex", err.message || String(err), err);
    _estadoEntradas(sheet, `❌ ${err.message || err}`, "error");
  } finally {
    lock.releaseLock();
  }
}

// Traspaso desde 📥 Registrar entradas (1.7.6p): resta del origen (SAL) y suma al destino (ENT) el día elegido, en la
// unidad del Kardex, todo en el libro de Bodega; folio por producto en 🔄 Traspasos. Todo o nada: valida números,
// semana activa de AMBAS bodegas y que el producto exista en ambos Kardex antes de escribir.
function _procesarTraspasoEntradas(ss, sheet, rows, seleccionDia, tr) {
  const items = {};
  const unidades = {};
  const visibles = {};
  const invalidas = [];
  let enD = 0;
  rows.forEach((r, i) => {
    const nombre = String(r[0]).trim().toUpperCase();
    if (!nombre) return;
    if (r[3] !== "" && r[3] !== null) enD++;
    const n = _numEntrada(r[2]);
    if (n === null || n === 0) return;
    if (isNaN(n)) { invalidas.push(ENTRADAS_START + i); return; }
    items[nombre] = (items[nombre] || 0) + n;
    unidades[nombre] = String(r[1] || "");
    visibles[nombre] = String(r[0]).trim();
  });
  if (enD > 0) {
    _estadoEntradas(sheet, "❌ En traspaso solo se usa la columna CANTIDAD. Borra lo escrito en la última columna. No se envió nada.", "error");
    return;
  }
  if (invalidas.length > 0) {
    invalidas.forEach(row => sheet.getRange(row, 3).setBackground("#FFCDD2"));
    _estadoEntradas(sheet, `❌ ${invalidas.length} celda(s) en rojo no son números ≥ 0. Corrige y vuelve a enviar. No se envió nada.`, "error");
    return;
  }
  const nombres = Object.keys(items);
  if (nombres.length === 0) { _estadoEntradas(sheet, "No hay cantidades capturadas para traspasar.", "info"); return; }

  const dia = { [tr.origen]: _resolverDiaEntradas(ss, seleccionDia, tr.origen), [tr.destino]: _resolverDiaEntradas(ss, seleccionDia, tr.destino) };
  const planes = {};
  const faltantes = [];
  [tr.origen, tr.destino].forEach(key => {
    const kSheet = _hoja(ss, BODEGAS[key].kardex);
    if (!kSheet) throw new Error(`No existe ${BODEGAS[key].kardex}.`);
    const count = kSheet.getLastRow() - KARDEX_START + 1;
    const idxMap = {};
    kSheet.getRange(KARDEX_START, 3, count, 1).getValues().forEach((p, i) => { const n = String(p[0]).trim().toUpperCase(); if (n) idxMap[n] = i; });
    nombres.forEach(n => { if (idxMap[n] === undefined) faltantes.push(`${n} (${BODEGAS[key].nombre})`); });
    planes[key] = { kSheet, count, idxMap };
  });
  if (faltantes.length > 0) {
    _estadoEntradas(sheet, `❌ No están en el inventario: ${faltantes.slice(0, 3).join(", ")}${faltantes.length > 3 ? "…" : ""}. No se envió nada.`, "error");
    return;
  }

  // Cantidades capturadas en unidad de pedido → unidad de bodega (× factor)
  const uni = _unidadesCatalogo(ss);
  const factor = (n) => (uni[n] && uni[n].factor) || 1;
  const enKardex = {};
  nombres.forEach(n => { enKardex[n] = Math.round(items[n] * factor(n) * 10000) / 10000; });

  // Origen: SAL del día · Destino: ENT del día (1 lectura + 1 escritura por columna)
  [[tr.origen, 1], [tr.destino, 0]].forEach(([key, desfase]) => {
    const { kSheet, count, idxMap } = planes[key];
    const rng = kSheet.getRange(KARDEX_START, 10 + dia[key] * 3 + desfase, count, 1);
    const vals = rng.getValues();
    nombres.forEach(n => { const i = idxMap[n]; vals[i][0] = Math.round(((parseFloat(vals[i][0]) || 0) + enKardex[n]) * 10000) / 10000; });
    rng.setValues(vals);
  });

  const ahora = new Date();
  const base = "TRP-" + Utilities.formatDate(ahora, Session.getScriptTimeZone(), "yyyyMMdd-HHmmss");
  let usuario = "";
  try { usuario = Session.getActiveUser().getEmail(); } catch (e) {}
  const filas = nombres.map((n, k) => [`${base}-${k + 1}`, ahora, BODEGAS[tr.origen].nombre, BODEGAS[tr.destino].nombre, visibles[n], items[n],
    unidades[n], factor(n), enKardex[n], "📥 Registrar entradas", usuario || "—"]);
  const hojaT = MiseTraspasos._asegurarHojaTraspasos(ss);
  hojaT.getRange(Math.max(hojaT.getLastRow() + 1, 2), 1, filas.length, 11).setValues(filas);
  MiseLogger.info("_procesarTraspasoEntradas", `${base}: ${BODEGAS[tr.origen].nombre} → ${BODEGAS[tr.destino].nombre} ` +
    nombres.map(n => `${n} ${items[n]} ${unidades[n]}${factor(n) !== 1 ? ` (= ${enKardex[n]} en bodega)` : ""}`).join(", "));

  _prepararHojaEntradas(false);
  // 1.7.7f: de vuelta a 📥 Entrada. Si el modo se quedaba en traspaso, lo siguiente que llegara del proveedor se
  // enviaba como traspaso (lo encontró la simulación por roles en DEV).
  sheet.getRange("A2").setValue(ENTRADAS_MODOS[0]);
  _aplicarModoEntradas(sheet, false);
  const hora = Utilities.formatDate(ahora, Session.getScriptTimeZone(), "HH:mm");
  _estadoEntradas(sheet, `✅ ${nombres.length} traspaso(s) ${BODEGAS[tr.origen].nombre} → ${BODEGAS[tr.destino].nombre} (${DIAS[dia[tr.origen]]}) · ${hora} · folio ${base}. La hoja volvió a 📥 Entrada.`, "ok");
}

// ── ISSUES 7 & 8: DESCUENTO AUTOMÁTICO DE INVENTARIO DESDE LOGS Y SAFEGUARD DE SEMANA ──
function reconciliarSemanaCompletaDesdeLogs() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.alert(
    "🔄 Reconciliar días pasados de la semana",
    "Revisa los registros de surtido (🗒 LOG_SURTIDO) de Andares y Mercado de los días PASADOS de la semana activa de cada Kardex.\n\n" +
    "• Descuenta en la columna SAL de cada día solo lo que aún no se había descontado (lo ya aplicado se omite).\n" +
    "• NO toca el pedido en curso de las tiendas ni el día de hoy (hoy lo cierra el descuento de las 23:00).\n\n" +
    "¿Deseas ejecutar la reconciliación ahora?",
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;

  _abrirMonitor("reconciliar");
}

function descontarSurtidoAutomaticoManualmente() {
  _abrirMonitor("descontarHoy");
}

// Recuperación: el cierre de anoche no corrió. Solo desde 🗒 LOG_SURTIDO (la tienda registró lo de ayer en su reset
// de las 00:00); NUNCA toma el pedido en curso, que es el de hoy. Idempotente: lo ya descontado no se repite.
function descontarSurtidoAyerManualmente() {
  _abrirMonitor("descontarAyer");
}

function forzarAutoVerificarYAvanzarSemana() {
  _autoVerificarYAvanzarSemanaSilencioso(false);
}

function descontarSurtidoAutomatico(silent = true) {
  try { _renombrarHojasBDG(); } catch (err) { MiseLogger.warn("descontarSurtidoAutomatico", `Renombrar pestañas: ${err.message}`); }
  // 1. Ejecutar descuento de pedidos de ayer y vaciado de tiendas
  MiseSmartSync.ejecutarDescuento(silent);
  PropertiesService.getScriptProperties().setProperty("ULTIMO_CIERRE",
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm"));

  // 2. Verificar y auto-avanzar semana silenciosamente (ej. lunes en la madrugada)
  try {
    _autoVerificarYAvanzarSemanaSilencioso(true);
  } catch(e) {
    MiseLogger.warn("descontarSurtidoAutomatico", `Error en auto-avance: ${e.message}`);
  }

  // 3. Hoja 📥 ENTRADAS: crearla si falta y re-sincronizarla con el catálogo vigente (conserva capturas);
  //    cada día empieza en modo 📥 Entrada aunque alguien la haya dejado en traspaso
  try {
    const hojaEnt = _hoja(SpreadsheetApp.getActiveSpreadsheet(), SHEET_ENTRADAS);
    if (hojaEnt) hojaEnt.getRange("A2").setValue(ENTRADAS_MODOS[0]);
    _prepararHojaEntradas(true);
  } catch(e) {
    MiseLogger.warn("descontarSurtidoAutomatico", `Error preparando 📥 ENTRADAS: ${e.message}`);
  }
  try { _prepararHojaStock(); } catch (e) { MiseLogger.warn("descontarSurtidoAutomatico", `🔎 Stock de bodegas: ${e.message}`); }

  // 4. 🩺 Resumen de salud (lee el latido de las tiendas) para la página de estado
  try {
    _recolectarEstadoSistema();
  } catch(e) {
    MiseLogger.warn("descontarSurtidoAutomatico", `Error recolectando el estado del sistema: ${e.message}`);
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
    let sheetBA = _hoja(ss, "_SYNC_LOG_BA");
    if (!sheetBA) {
      sheetBA = ss.insertSheet("_SYNC_LOG_BA");
      try { sheetBA.hideSheet(); } catch(e) {}
    }
    sheetBA.getRange("A1").setFormula(`=IMPORTRANGE("${idBA}", "'🗒 LOG_SURTIDO'!A2:H")`);
  }

  const idBM = props.getProperty("PDM_SPREADSHEET_ID");
  if (idBM) {
    let sheetBM = _hoja(ss, "_SYNC_LOG_BM");
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
// Activador semanal (recibe el evento del activador como argumento; por eso el núcleo va aparte)
function ejecutarMantenimientoSemanalBDG() {
  _mantenimientoSemanalCore(null);
}

function ejecutarMantenimientoSemanalManualmente() {
  _abrirMonitor("mantenimiento");
}

function _mantenimientoSemanalCore(rep) {
  const tId = "ejecutarMantenimientoSemanalBDG_" + Date.now();
  MiseLogger.time(tId);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(45000)) {
    MiseLogger.warn("ejecutarMantenimientoSemanalBDG", "Bodega ocupada por otro proceso. Se reintentará.");
    return { ok: false, error: "Bodega ocupada por otro proceso; intenta en un momento." };
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const maestro = _hoja(ss, SHEET_MAESTRO);
    if (!maestro) throw new Error("No se encontró la hoja MAESTRO.");

    let purgasCount = 0;
    const lrM = maestro.getLastRow();

    // ── FASE 1: PURGA DE FILAS CORRUPTAS / METIDAS A LA FUERZA ────────────────
    if (rep) rep.inicio("Revisión del Catálogo");
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

    if (rep) rep.fin("Revisión del Catálogo", true, purgasCount ? `${purgasCount} fila(s) incompleta(s) en el registro` : "sin filas incompletas");

    // ── FASE 2: RE-ORDENAMIENTO, RENUMERACIÓN Y SANEAMIENTO DE FÓRMULAS ───────
    _pasoMonitor(rep, "Orden, numeración y validaciones", () => { _ordenarYRenumerarTodo(); restaurarValidacionesMaestro(); });

    // ── FASE 3: AUTO-AVANCE AUTÓNOMO DE SEMANA (ÚNICAMENTE SI ES DOMINGO O FORZADO) ─
    const hoy = new Date();
    const esDomingo = hoy.getDay() === 0; // 0 = Domingo
    let semanasAvanzadas = 0;

    if (rep) rep.inicio("Semana");
    if (esDomingo) {
      // 1. Descontar pedidos de hoy domingo antes de avanzar la semana
      try {
        MiseSmartSync.ejecutarDescuento(true, hoy);
      } catch(eDesc) {
        MiseLogger.warn("ejecutarMantenimientoSemanalBDG", `Error descontando pedidos de domingo: ${eDesc.message}`);
      }

      // 2. Auto-avanzar semana silenciosamente
      semanasAvanzadas = _autoVerificarYAvanzarSemanaSilencioso(true);
    }
    if (rep) rep.fin("Semana", true, esDomingo ? `domingo: cierre y ${semanasAvanzadas || 0} bodega(s) avanzada(s)` : "sin cambios (solo los domingos)");

    // ── FASE 4: RECONSTRUCCIÓN DE VISTAS Y RE-APLICACIÓN DE BLINDAJE ──────────
    _pasoMonitor(rep, "Vistas y blindaje", () => {
      _buildVista("BA");
      _buildVista("BM");
      protegerTodasLasHojasSeguras();
      Object.values(BODEGAS).forEach(b => _simplificarVistaKardex(_hoja(ss, b.kardex)));
    });

    const dur = MiseLogger.timeEnd(tId);
    MiseLogger.info("ejecutarMantenimientoSemanalBDG", `Mantenimiento Semanal Exitoso: ${purgasCount} filas purgadas, ${semanasAvanzadas} bodegas avanzadas, fórmulas saneadas y blindaje activo.`, dur);
    return { ok: true, purgas: purgasCount, semanas: semanasAvanzadas };

  } catch(err) {
    const dur = MiseLogger.timeEnd(tId);
    MiseLogger.error("ejecutarMantenimientoSemanalBDG", `Error en mantenimiento semanal: ${err.message}`, err, dur);
    return { ok: false, error: err.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Instala los activadores automáticos por tiempo:
 * 1. Descuento diario nocturno de inventario (01:00 AM)
 * 2. Mantenimiento, purga y avance semanal de catálogo (Domingos 11:00 PM)
 */
// Núcleo silencioso: borra TODOS los activadores del proyecto y crea exactamente el juego esperado.
// Apps Script no expone la hora de un activador; recrearlos es la única forma de garantizar el horario.
function _reiniciarActivadoresBDG() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const borrados = ScriptApp.getProjectTriggers().map(t => { const h = t.getHandlerFunction(); ScriptApp.deleteTrigger(t); return h; });
  ScriptApp.newTrigger("descontarSurtidoAutomatico").timeBased().everyDays(1).atHour(23).create();
  ScriptApp.newTrigger("ejecutarMantenimientoSemanalBDG").timeBased().everyWeeks(1)
    .onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(23).create();
  // onEdit INSTALABLE: corre con los permisos de quien lo instaló → puede empujar cambios a las tiendas
  ScriptApp.newTrigger("onEditBodegaInstalable").forSpreadsheet(ss).onEdit().create();
  // onOpen INSTALABLE: avance de semana de ambos Kardex al abrir, con 6 min y permisos completos
  ScriptApp.newTrigger("onOpenBodegaInstalable").forSpreadsheet(ss).onOpen().create();
  PropertiesService.getScriptProperties().setProperties({ ONOPEN_INSTALABLE: "1", ONEDIT_INSTALABLE: "1" });
  const creados = ["descontarSurtidoAutomatico (diario 23:00)", "ejecutarMantenimientoSemanalBDG (domingo 23:00)",
                   "onEditBodegaInstalable (al editar)", "onOpenBodegaInstalable (al abrir)"];
  MiseLogger.info("_reiniciarActivadoresBDG", `Borrados (${borrados.length}): [${borrados.join(", ")}]. Creados: ${creados.join(", ")}.`);
  return { borrados, creados };
}

function instalarActivadoresNocturnosBDG() {
  const r = _reiniciarActivadoresBDG();
  SpreadsheetApp.getUi().alert("⏰ Activadores Reiniciados",
    `Se borraron ${r.borrados.length} activador(es) previos:\n${r.borrados.join("\n") || "(ninguno)"}\n\nQuedaron exactamente:\n• ${r.creados.join("\n• ")}`,
    SpreadsheetApp.getUi().ButtonSet.OK);
}

// onOpen INSTALABLE: al abrir Bodega pone al día AMBOS Kardex (sin el límite de 30 s del simple)
function onOpenBodegaInstalable(e) {
  try { _renombrarHojasBDG(); } catch (err) { MiseLogger.warn("onOpenBodegaInstalable", `Renombrar pestañas: ${err.message}`); }
  try {
    const n = _autoVerificarYAvanzarSemanaSilencioso(true);
    if (n > 0) MiseLogger.info("onOpenBodegaInstalable", `Semana avanzada al abrir: ${n} bodega(s).`);
    if (!_hoja(SpreadsheetApp.getActiveSpreadsheet(), SHEET_ENTRADAS)) _prepararHojaEntradas();
  } catch (err) {
    MiseLogger.error("onOpenBodegaInstalable", err.message, err);
  }
}

// Carril rápido con permisos completos: al cambiar ACTIVO en MAESTRO, empuja a las tiendas al instante.
// (El onEdit simple hace la parte local; un onEdit simple no puede abrir otros libros.)
// onEdit INSTALABLE: toda la lógica de edición con permisos del dueño (incluye el push a tiendas al cambiar
// ACTIVO, las casillas de MAESTRO y KARDEX, y el Enviar de 📥 ENTRADAS aunque lo marque otra cuenta)
function onEditBodegaInstalable(e) {
  try {
    _onEditBodega(e);
  } catch (err) {
    MiseLogger.error("onEditBodegaInstalable", err.message, err);
  }
}


// ── 🔗 DIAGNÓSTICO DE CONEXIONES (a qué libro apunta cada propiedad, por NOMBRE) ──────────
function _diagnosticarConexionesBDG() {
  const props = PropertiesService.getScriptProperties();
  const lineas = [], alertas = [];
  [["Andares", props.getProperty("PDA_SPREADSHEET_ID") || props.getProperty("BODEGA_ID_BA")],
   ["Mercado", props.getProperty("PDM_SPREADSHEET_ID") || props.getProperty("BODEGA_ID_BM")]].forEach(([tienda, id]) => {
    if (!id) { lineas.push(`❌ ${tienda}: sin ID configurado`); alertas.push(tienda); return; }
    try {
      const nombre = SpreadsheetApp.openById(id).getName();
      const sospechoso = /prueba|domingo|copia|staging|\[dev\]/i.test(nombre) && props.getProperty("MISE_ENV") !== "DEV";
      lineas.push(`${sospechoso ? "⚠️" : "✅"} ${tienda} → "${nombre}"`);
      if (sospechoso) alertas.push(tienda);
    } catch (err) {
      lineas.push(`❌ ${tienda}: no se pudo abrir (${id.substring(0, 8)}…)`); alertas.push(tienda);
    }
  });
  return { lineas, alertas };
}

// ── 🚀 CONFIGURAR ESTE LIBRO (un clic: activadores, hojas, vistas, tiendas y diagnóstico) ────
// Menú: abre el monitor de progreso (diálogo sin bloqueo) que ejecuta _configurarBDGCore y muestra cada paso en vivo
function configurarEsteLibroBDG() {
  _abrirMonitor("configurar");
}

function _configurarBDGCore(rep) {
  const pasos = [];
  const paso = (nombre, fn) => {
    rep.inicio(nombre);
    const t0 = Date.now(); // 1.7.7o: cada paso deja su duración en el registro (para saber qué pesa)
    try { const d = fn(); const ms = Date.now() - t0; pasos.push(`✅ ${nombre}${d ? " — " + d : ""} (${(ms / 1000).toFixed(1)} s)`); rep.fin(nombre, true, d); }
    catch (err) { pasos.push(`❌ ${nombre} — ${err.message} (${((Date.now() - t0) / 1000).toFixed(1)} s)`); rep.fin(nombre, false, err.message); MiseLogger.error("configurarEsteLibroBDG", `${nombre}: ${err.message}`, err); }
  };
  paso("Nombres de pestañas", () => { const r = _renombrarHojasBDG(); return r.length ? `${r.length} renombradas` : "al día"; });
  paso("Activadores", () => { const r = _reiniciarActivadoresBDG(); return `${r.borrados.length} viejos borrados, ${r.creados.length} creados`; });
  paso("📋 Catálogo amigable", () => { restaurarValidacionesMaestro(); protegerMaestroSeguro(); return "etiquetas, validaciones y solo ACTIVO + MÍN/MÁX editables"; });
  // (1.7.6z) Configurar YA NO llena factores en masa: cambiar la unidad de pedido de muchos productos a la vez cambia lo
  // que ven las tiendas y cómo se descuenta. Se hace a propósito: al escribir una presentación o desde el menú.
  paso("Hoja 📥 Registrar entradas", () => { _prepararHojaEntradas(true); return "lista"; });
  paso("Hoja 🔎 Stock de bodegas", () => { const n = _prepararHojaStock(); return `${n} productos`; });
  paso("Vistas móviles", () => { _buildVista("BA"); _buildVista("BM"); return "BA y BM reconstruidas"; });
  paso("Tiendas actualizadas", () => { sincronizarRemotamenteTiendasPush(); return "catálogo, picking y activos enviados"; });
  paso("Kardex simplificado", () => { Object.values(BODEGAS).forEach(b => _simplificarVistaKardex(_hoja(SpreadsheetApp.getActiveSpreadsheet(), b.kardex))); return "solo producto, unidad, saldo anterior y días"; });
  paso("Pestañas", () => { _organizarPestanasBDG(); return "ordenadas y coloreadas por uso"; });
  paso("Blindaje", () => {
    protegerTodasLasHojasSeguras();
    const abiertas = _auditarPermisos().filter(l => l.startsWith("🔓")).length;
    return abiertas ? `${abiertas} hoja(s) sin protección (ver 🔐 Auditoría)` : "todas las hojas protegidas";
  });
  let conexiones = { lineas: [], alertas: [] };
  paso("Conexiones", () => { conexiones = _diagnosticarConexionesBDG(); return conexiones.alertas.length ? `${conexiones.alertas.length} por revisar` : "correctas"; });

  const ok = pasos.every(p => p.startsWith("✅")) && conexiones.alertas.length === 0;
  MiseLogger.info("configurarEsteLibroBDG", pasos.join(" | "));
  return rep.cerrar(ok, ok ? "🚀 Bodega lista" : "🚀 Bodega configurada con observaciones",
    conexiones.lineas.length ? `🔗 ${conexiones.lineas.join(" · ")}` : "");
}

// ── 🔎 STOCK DE BODEGAS (1.7.7j) ──────────────────────────────────────────────────────────────
// Consulta para quien hace los pedidos (celular): saldo de cada producto en Andares, Mercado y TOTAL, en dos
// lecturas: la presentación fácil (domos, cajas…) y la unidad del inventario (kg, pza…). Solo lectura.
//  · Saldo EN VIVO por NOMBRE (INDEX/MATCH sobre la columna AD del Inventario): un alta o un picking no lo mueve.
//  · Lo estático (presentación, factor, tipo, proveedor) se rehace al guardar en Powerhouse, en el cierre y en 🚀 Configurar.
//  · A2 filtra por proveedor (oculta filas; "Todos" las muestra).
// Columnas: A producto + presentación · B Andares · C Mercado · D TOTAL · F:J auxiliares ocultas.
const SHEET_STOCK = "🔎 Stock de bodegas";
const STOCK_START = 4;
const STOCK_TODOS = "Todos los proveedores";
const PROVEEDORES_BASE = ["CDK", "FRUTA", "LALA", "PEPSI", "SIGMA", "ABARROTES RAÚL"];

// Proveedor inicial (solo para llenar la columna nueva y las altas sin proveedor); después manda el Catálogo
function _proveedorInicial(nombre) {
  const n = String(nombre || "").trim();
  if (/^(fresa|frambuesa|zarzamora|tomate cherry|pl[aá]tano|lim[oó]n|pepino|champi[ñn]on|espinaca|huevo|mix lechugas)/i.test(n)) return "FRUTA";
  if (/^leche (entera|light|deslactosada)/i.test(n)) return "LALA";
  if (/epura|canada dry/i.test(n)) return "PEPSI";
  if (/^nutella/i.test(n)) return "SIGMA";
  if (/^perrier/i.test(n)) return "ABARROTES RAÚL";
  return "CDK";
}

// Cómo se muestra cada producto: peso (≈ en su presentación) · resto (cajas + piezas) · exacto · simple (una unidad)
function _tipoStock(u) {
  const f = u.factor;
  if (!u.pedido || f === 1 && u.pedido.toLowerCase() === u.kardex.toLowerCase()) return "simple";
  if (u.pesado) return "peso";
  if (f >= 2 && Number.isInteger(f) && !/^(kg|lt|l|g|ml)$/i.test(u.kardex)) return "resto";
  return "exacto";
}

// Fórmula de una celda de saldo. `s` = expresión del saldo en unidad de inventario; fila r (auxiliares G:I)
function _formulaCeldaStock(tipo, r, s, minExpr) {
  const f = `$G${r}`, up = `$H${r}`, uk = `$I${r}`;
  const alerta = minExpr ? `IF(AND(${minExpr}>0, s<${minExpr}), "🔴 ", "")` : `""`;
  const abajo = `ROUND(s, 3) & " " & ${uk}`;
  const cuerpo = {
    simple: `${alerta} & ${abajo}`,
    exacto: `${alerta} & ROUND(s/${f}, 2) & " " & ${up} & CHAR(10) & ${abajo}`,
    peso:   `${alerta} & "≈ " & ROUND(s/${f}, 0) & " " & ${up} & CHAR(10) & ${abajo}`,
    resto:  `${alerta} & IF(s<=0, ${abajo}, INT(s/${f}) & " " & ${up} & IF(MOD(s, ${f})>0, " + " & ROUND(MOD(s, ${f}), 2) & " " & ${uk}, "") & CHAR(10) & ${abajo})`
  }[tipo];
  return `=IFERROR(LET(s, ${s}, ${cuerpo}), "—")`;
}

function _prepararHojaStock() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const kBA = _hoja(ss, BODEGAS.BA.kardex);
  const maestro = _hoja(ss, SHEET_MAESTRO);
  if (!kBA || !maestro || maestro.getLastRow() < MAESTRO_START) return 0;
  let sheet = _hoja(ss, SHEET_STOCK);
  if (!sheet) sheet = ss.insertSheet(SHEET_STOCK, 1);
  const filtroPrevio = String(sheet.getRange("A2").getValue() || "").trim();

  // Catálogo: unidades, proveedor y activos por nombre
  const map = _getMaestroHeaderMap(maestro);
  const mData = maestro.getRange(MAESTRO_START, 1, maestro.getLastRow() - MAESTRO_START + 1, maestro.getLastColumn()).getValues();
  const uni = _unidadesCatalogo(ss);
  const info = {};
  mData.forEach(r => {
    const n = String(r[map["PRODUCTO"].index] || "").trim();
    if (!n) return;
    info[n.toUpperCase()] = {
      activo: !map["ACTIVO"] || String(r[map["ACTIVO"].index]).trim().toUpperCase() !== "NO",
      proveedor: map["PROVEEDOR"] ? String(r[map["PROVEEDOR"].index] || "").trim().toUpperCase() : ""
    };
  });

  // Productos activos en el orden del Inventario (como 📥 Registrar entradas)
  const klr = kBA.getLastRow();
  const kData = klr >= KARDEX_START ? kBA.getRange(KARDEX_START, 1, klr - KARDEX_START + 1, 5).getValues() : [];
  const prods = kData.filter(r => r[0] !== "").map(r => String(r[2]).trim())
    .filter(n => n && info[n.toUpperCase()] && info[n.toUpperCase()].activo);

  // Encabezado
  const cols = Math.max(sheet.getMaxColumns(), 10);
  if (sheet.getMaxColumns() < 10) sheet.insertColumnsAfter(sheet.getMaxColumns(), 10 - sheet.getMaxColumns());
  try { _separarCombinaciones(sheet.getRange(1, 1, 2, cols)); SpreadsheetApp.flush(); } catch (e) {}
  sheet.getRange("A1:D1").merge().setValue("🔎 STOCK DE BODEGAS")
    .setBackground(C.dark).setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(11)
    .setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.setRowHeight(1, 32);
  const proveedores = [STOCK_TODOS, ...[...new Set([...PROVEEDORES_BASE, ...Object.values(info).map(x => x.proveedor).filter(Boolean)])]];
  sheet.getRange("A2").setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(proveedores, true).setAllowInvalid(false).build())
    .setValue(proveedores.indexOf(filtroPrevio) !== -1 ? filtroPrevio : STOCK_TODOS)
    .setBackground(C.yellow).setFontWeight("bold").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.getRange("B2:D2").merge().setValue("◀ filtra por proveedor · arriba: presentación · abajo: inventario")
    .setBackground(C.cream).setFontSize(8).setFontColor("#546E7A").setWrap(true).setVerticalAlignment("middle");
  sheet.setRowHeight(2, 36);
  sheet.getRange(3, 1, 1, 10).setValues([["PRODUCTO", "ANDARES", "MERCADO", "TOTAL", "", "_PRODUCTO", "_FACTOR", "_U_PEDIDO", "_U_INV", "_PROVEEDOR"]])
    .setBackground(C.sage).setFontColor("#FFFFFF").setFontWeight("bold").setHorizontalAlignment("center");
  sheet.setFrozenRows(3);
  [[1, 150], [2, 80], [3, 80], [4, 80]].forEach(([c, w]) => sheet.setColumnWidth(c, w));

  // Datos
  const maxRows = sheet.getMaxRows();
  if (maxRows >= STOCK_START) {
    try { sheet.showRows(STOCK_START, maxRows - STOCK_START + 1); } catch (e) {}
    sheet.getRange(STOCK_START, 1, maxRows - STOCK_START + 1, 10).clearContent().setBackground(null);
  }
  const needed = STOCK_START + prods.length;
  if (maxRows < needed) sheet.insertRowsAfter(maxRows, needed - maxRows);
  if (prods.length) {
    const invA = _refHoja(BODEGAS.BA.kardex), invM = _refHoja(BODEGAS.BM.kardex), cat = _refHoja(SHEET_MAESTRO);
    const saldo = (inv, r) => `IFERROR(INDEX(${inv}!$AD$${KARDEX_START}:$AD, MATCH($F${r}, ${inv}!$C$${KARDEX_START}:$C, 0))*1, 0)`;
    const minDe = (k, r) => map[k] ? `IFERROR(INDEX(${cat}!$${map[k].letter}$${MAESTRO_START}:$${map[k].letter}, MATCH($F${r}, ${cat}!$${map["PRODUCTO"].letter}$${MAESTRO_START}:$${map["PRODUCTO"].letter}, 0))*1, 0)` : "";
    const filas = prods.map((n, i) => {
      const r = STOCK_START + i;
      const u = uni[n.toUpperCase()] || { kardex: "", pedido: "", factor: 1, pres: "", pesado: false };
      const tipo = _tipoStock(u);
      return [
        u.pres ? `${n}\n${u.pres}` : n,
        _formulaCeldaStock(tipo, r, saldo(invA, r), minDe("MÍN_BA", r)),
        _formulaCeldaStock(tipo, r, saldo(invM, r), minDe("MÍN_BM", r)),
        _formulaCeldaStock(tipo, r, `${saldo(invA, r)} + ${saldo(invM, r)}`, ""),
        "", n, u.factor || 1, u.pedido || u.kardex, u.kardex, info[n.toUpperCase()].proveedor
      ];
    });
    const rng = sheet.getRange(STOCK_START, 1, filas.length, 10);
    rng.setValues(filas); // setValues: "=…" queda como fórmula y el texto no se vuelve #NAME?
    rng.setBackgrounds(filas.map((_, i) => { const b = i % 2 === 0 ? C.rowA : C.rowB; return [b, b, b, "#EEF3EF", b, b, b, b, b, b]; }));
    sheet.getRange(STOCK_START, 1, filas.length, 4).setWrap(true).setVerticalAlignment("middle");
    sheet.getRange(STOCK_START, 1, filas.length, 1).setFontSize(10);
    sheet.getRange(STOCK_START, 2, filas.length, 3).setFontSize(10).setHorizontalAlignment("center");
    sheet.setRowHeights(STOCK_START, filas.length, 44);
  }
  try { sheet.hideColumns(5, 6); } catch (e) {}
  _filtrarHojaStock(sheet);
  return prods.length;
}

// Muestra solo los productos del proveedor elegido en A2 (o todos)
function _filtrarHojaStock(sheet) {
  const sh = sheet || _hoja(SpreadsheetApp.getActiveSpreadsheet(), SHEET_STOCK);
  if (!sh) return;
  const n = sh.getLastRow() - STOCK_START + 1;
  if (n < 1) return;
  const filtro = String(sh.getRange("A2").getValue() || "").trim().toUpperCase();
  sh.showRows(STOCK_START, n);
  if (!filtro || filtro === STOCK_TODOS.toUpperCase()) return;
  const prov = sh.getRange(STOCK_START, 10, n, 1).getValues();
  // Ocultar en bloques contiguos (menos llamadas que fila por fila)
  let ini = -1;
  for (let i = 0; i <= n; i++) {
    const ocultar = i < n && String(prov[i][0]).trim().toUpperCase() !== filtro;
    if (ocultar && ini === -1) ini = i;
    if (!ocultar && ini !== -1) { sh.hideRows(STOCK_START + ini, i - ini); ini = -1; }
  }
}


// ── ↕️ REUBICACIÓN POR CATEGORÍA (1.7.7o) ───────────────────────────────────────────────────────
// Orden único del Catálogo y de los Inventarios: categoría (según CATEGORIAS_LISTA, luego alfabética) y producto.
function _compararCatalogo(catA, prodA, catB, prodB) {
  const a = String(catA || "").trim(), b = String(catB || "").trim();
  const ia = CATEGORIAS_LISTA.indexOf(a), ib = CATEGORIAS_LISTA.indexOf(b);
  if (ia !== -1 && ib !== -1) { if (ia !== ib) return ia - ib; }
  else if (ia !== -1) return -1;
  else if (ib !== -1) return 1;
  else if (a !== b) return a.localeCompare(b);
  return String(prodA || "").trim().toLowerCase().localeCompare(String(prodB || "").trim().toLowerCase());
}

// Lleva las referencias de UNA fila (C7, $G7, AD7…) a la fila nueva; las de columna completa (C:AD) no cambian
function _moverFormulaDeFila(f, de, a) {
  if (!f || de === a) return f;
  return f.replace(new RegExp(`(^|[^A-Za-z0-9_$!'])(\\$?[A-Z]{1,3})${de}(?![0-9])`, "g"), `$1$2${a}`);
}

// Reacomoda una hoja ordenada por categoría reescribiendo SOLO el tramo de filas que cambia de lugar: valores y
// fórmulas (llevadas a su fila nueva), sin clearFormat. Colores y formato condicional son de la posición y se
// quedan. Devuelve false si la hoja no es la esperada (lo resuelve la reconstrucción completa).
function _reubicarTramo(sheet, inicio, colNo, colCat, colProd, catDe, ocultarInactivos) {
  const lr = sheet.getLastRow();
  if (lr < inicio) return true;
  const n = lr - inicio + 1;
  const ancho = sheet.getLastColumn();
  const llaves = sheet.getRange(inicio, 1, n, Math.max(colCat, colProd)).getValues();
  const filas = llaves.map((r, i) => ({ i, prod: String(r[colProd - 1]).trim(), cat: catDe(String(r[colProd - 1]).trim(), r[colCat - 1]) }));
  if (filas.some(f => !f.prod)) return false;
  const destino = filas.slice().sort((x, y) => _compararCatalogo(x.cat, x.prod, y.cat, y.prod) || (x.i - y.i));
  let lo = -1, hi = -1;
  destino.forEach((f, j) => { if (f.i !== j) { if (lo === -1) lo = j; hi = j; } });
  const catCambia = filas.some(f => String(llaves[f.i][colCat - 1]).trim().toUpperCase() !== String(f.cat).trim().toUpperCase());
  if (lo === -1 && !catCambia) return true;
  if (lo === -1) { lo = 0; hi = n - 1; }
  const rng = sheet.getRange(inicio, 1, n, ancho);
  const vals = rng.getValues(), forms = rng.getFormulas();
  const salida = [];
  for (let j = lo; j <= hi; j++) {
    const src = destino[j].i, deFila = inicio + src, aFila = inicio + j;
    const fila = vals[src].map((v, c) => forms[src][c] ? _moverFormulaDeFila(forms[src][c], deFila, aFila) : v);
    if (colNo) fila[colNo - 1] = j + 1;
    fila[colCat - 1] = destino[j].cat;
    salida.push(fila);
  }
  sheet.getRange(inicio + lo, 1, salida.length, ancho).setValues(salida);
  if (ocultarInactivos) {
    const k = hi - lo + 1;
    sheet.showRows(inicio + lo, k);
    let ini = -1;
    for (let j = lo; j <= hi + 1; j++) {
      const oc = j <= hi && ocultarInactivos(destino[j].prod);
      if (oc && ini === -1) ini = j;
      if (!oc && ini !== -1) { sheet.hideRows(inicio + ini, j - ini); ini = -1; }
    }
  }
  return true;
}

function _reubicarPorCategoria() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const maestro = _hoja(ss, SHEET_MAESTRO);
  if (!maestro) return false;
  const map = _getMaestroHeaderMap(maestro);
  if (!map["PRODUCTO"] || !map["CATEGORÍA"]) return false;
  try {
    // 1. Catálogo (su propia categoría manda)
    if (!_reubicarTramo(maestro, MAESTRO_START, map["NO"] ? map["NO"].col : 1, map["CATEGORÍA"].col, map["PRODUCTO"].col,
      (p, cat) => String(cat).trim().toUpperCase(), null)) return false;
    // 2. Inventarios: misma categoría que el Catálogo, mismos productos
    const lr = maestro.getLastRow();
    const filasM = maestro.getRange(MAESTRO_START, 1, lr - MAESTRO_START + 1, maestro.getLastColumn()).getValues();
    const catDe = {}, inactivo = {};
    filasM.forEach(r => {
      const n = String(r[map["PRODUCTO"].index]).trim().toUpperCase();
      catDe[n] = String(r[map["CATEGORÍA"].index]).trim().toUpperCase();
      inactivo[n] = map["ACTIVO"] && String(r[map["ACTIVO"].index]).trim().toUpperCase() === "NO";
    });
    for (const b of Object.values(BODEGAS)) {
      const k = _hoja(ss, b.kardex);
      if (!k) continue;
      const nombresK = k.getLastRow() >= KARDEX_START ? k.getRange(KARDEX_START, 3, k.getLastRow() - KARDEX_START + 1, 1).getValues().map(r => String(r[0]).trim().toUpperCase()) : [];
      if (nombresK.length !== filasM.length || nombresK.some(n => !(n in catDe))) return false;
      if (!_reubicarTramo(k, KARDEX_START, 1, 2, 3, (p) => catDe[p.toUpperCase()], (p) => inactivo[p.toUpperCase()])) return false;
    }
    return true;
  } catch (e) {
    MiseLogger.warn("_reubicarPorCategoria", `Se usará la reconstrucción completa: ${e.message}`);
    return false;
  }
}
