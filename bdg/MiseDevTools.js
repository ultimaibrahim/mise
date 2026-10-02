/**
 * 🧪 MISE DEV TOOLS — Bodega
 * Herramientas de desarrollo y recuperación forense. SOLO se suben a DEV (scripts/mise-env.js las excluye de PROD).
 * Su submenú aparece únicamente si este archivo existe en el proyecto. Para una emergencia en PROD se puede subir
 * temporalmente con: node scripts/mise-env.js push prod bdg (tras quitar la exclusión) y retirarlo después.
 */

// ── RECUPERACIÓN HISTÓRICA ASISTIDA (PLANTILLA DE PEGADO RÁPIDO) ──────────────
function prepararPlantillaRecuperacionSemana() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = "📥 RECUPERAR_SEMANA";
  let sheet = _hoja(ss, sheetName);
  if (sheet) {
    try { ss.deleteSheet(sheet); } catch(e) {}
  }
  sheet = ss.insertSheet(sheetName, 0);

  // Obtener lunes de la semana activa
  const kBA = _hoja(ss, BODEGAS.BA.kardex);
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
  const vBA = _hoja(ss, "VISTA_MOVIL_BA");
  const vBM = _hoja(ss, "VISTA_MOVIL_BM");
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
  const recSheet = _hoja(ss, "📥 RECUPERAR_SEMANA");
  if (!recSheet) {
    ui.alert("No se encontró la pestaña '📥 RECUPERAR_SEMANA'. Por favor prepárala primero desde el menú.");
    return;
  }

  const kBA = _hoja(ss, BODEGAS.BA.kardex);
  const kBM = _hoja(ss, BODEGAS.BM.kardex);
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
          let logSheet = _hoja(remoteBA, "🗒 LOG_SURTIDO");
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
          let logSheet = _hoja(remoteBM, "🗒 LOG_SURTIDO");
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

// ── 🎬 DATOS PARA EL VIDEO DE LANZAMIENTO (solo DEV) ──────────────────────────
// Deja ambos inventarios en un estado creíble y repetible: saldo anterior y movimientos de lunes a ayer calculados
// desde los mín/máx del Catálogo (algunos productos bajo mínimo para que se vea el semáforo), HOY y días siguientes
// en blanco (ahí entran los flujos reales que se graban) y Pepino/Limón como "se reciben pesados".
function prepararDatosVideo() {
  const ui = SpreadsheetApp.getUi();
  if (ui.alert("🎬 Preparar datos para el video",
    "Solo DEV. Reescribe el saldo anterior y los movimientos de la semana de ambos inventarios (de lunes a ayer), " +
    "deja HOY en blanco, reinicia el pedido y el Surtido de ambas tiendas y marca Pepino y Limón como 'se reciben pesados'.\n\n¿Continuar?", ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const maestro = _hoja(ss, SHEET_MAESTRO);
  _asegurarColumnasQuioscoEnMaestro(maestro);
  const map = _getMaestroHeaderMap(maestro);
  const datos = maestro.getRange(MAESTRO_START, 1, maestro.getLastRow() - MAESTRO_START + 1, maestro.getLastColumn()).getValues();
  const fila = {};
  datos.forEach((r, i) => { fila[String(r[map["PRODUCTO"].index]).trim().toUpperCase()] = i; });

  const pesados = { "PEPINO": "PZA 300 g", "LIMÓN": "PZA 60 g" };
  Object.keys(pesados).forEach(n => {
    const i = fila[n];
    if (i === undefined) return;
    if (!/\d\s*(g|kg)\b/i.test(String(datos[i][map["PRESENTACION"].index]))) maestro.getRange(MAESTRO_START + i, map["PRESENTACION"].col).setValue(pesados[n]);
    maestro.getRange(MAESTRO_START + i, map["RECEPCION_PESADA"].col).setValue("SÍ");
  });

  const azar = (s) => { let x = 2166136261; for (let k = 0; k < s.length; k++) { x ^= s.charCodeAt(k); x = Math.imul(x, 16777619); } return (x >>> 0) / 4294967296; };
  const redondear = (v, u) => /^(g|ml)$/.test(u) ? Math.round(v / 10) * 10 : /^(kg|lt|l)$/.test(u) ? Math.round(v * 2) / 2 : Math.round(v);
  const dow = ((new Date()).getDay() || 7) - 1;
  const resumen = [];
  Object.keys(BODEGAS).forEach(key => {
    const k = _hoja(ss, BODEGAS[key].kardex);
    const n = k.getLastRow() - KARDEX_START + 1;
    if (n < 1) return;
    const prods = k.getRange(KARDEX_START, 3, n, 3).getValues();      // C producto · D presentación · E unidad
    const ant = [], ent = Array.from({ length: 7 }, () => []), sal = Array.from({ length: 7 }, () => []);
    let bajos = 0;
    prods.forEach(([nombre, , unidad]) => {
      const nom = String(nombre || "").trim(), u = String(unidad || "").trim().toLowerCase();
      const i = fila[nom.toUpperCase()];
      const mn = i !== undefined && map[`MÍN_${key}`] ? Number(datos[i][map[`MÍN_${key}`].index]) || 0 : 0;
      const mx = i !== undefined && map[`MÁX_${key}`] ? Number(datos[i][map[`MÁX_${key}`].index]) || 0 : 0;
      const base = mx > 0 ? mx : (/^(g|ml)$/.test(u) ? 800 : /^(kg|lt|l)$/.test(u) ? 4 : 12);
      const bajo = nom && azar(key + nom + "bajo") < 0.2 && mn > 0;
      let saldo = nom ? redondear(base * (bajo ? 0.25 : 0.55 + 0.35 * azar(key + nom)), u) : "";
      ant.push([saldo]);
      for (let d = 0; d < 7; d++) {
        let e = "", s = "";
        if (nom && d < dow) {
          if (d === 0 || azar(key + nom + d + "e") < 0.25) {
            const tope = mx > 0 ? mx * 0.95 - Number(saldo) : Infinity;   // nunca por encima del máximo
            e = redondear(Math.min(base * (0.2 + 0.4 * azar(key + nom + d)), tope), u);
            if (!(e > 0)) e = "";
          }
          s = redondear(base * (0.08 + 0.14 * azar(key + nom + d + "s")), u) || "";
          if (bajo) e = "";
          if (Number(saldo) + Number(e || 0) - Number(s || 0) < 0) s = "";
          saldo = Number(saldo) + Number(e || 0) - Number(s || 0);
        }
        ent[d].push([e]); sal[d].push([s]);
      }
      if (bajo) bajos++;
    });
    k.getRange(KARDEX_START, 9, n, 1).setValues(ant);
    for (let d = 0; d < 7; d++) {
      k.getRange(KARDEX_START, 10 + d * 3, n, 1).setValues(ent[d]);
      k.getRange(KARDEX_START, 11 + d * 3, n, 1).setValues(sal[d]);
    }
    resumen.push(`${BODEGAS[key].nombre}: ${n} productos (${bajos} bajo mínimo)`);
  });
  // Tiendas DEV en blanco, como después del reset de las 00:00 (pedido, recepción y Surtido)
  const props = PropertiesService.getScriptProperties();
  [["BA", "PDA_SPREADSHEET_ID", "BODEGA_ID_BA"], ["BM", "PDM_SPREADSHEET_ID", "BODEGA_ID_BM"]].forEach(([key, p1, p2]) => {
    try {
      const tienda = SpreadsheetApp.openById(props.getProperty(p1) || props.getProperty(p2));
      const ped = tienda.getSheetByName("📋 PEDIDO DIARIO");
      const n = ped.getLastRow() - 3;
      const enc = ped.getRange(3, 1, 1, ped.getLastColumn()).getValues()[0].map(v => String(v).trim().toUpperCase());
      const cPedir = enc.indexOf("CANT. A PEDIR") + 1;
      if (n > 0 && cPedir > 0) [cPedir, cPedir + 2, cPedir + 3].forEach(c => ped.getRange(4, c, n, 1).clearContent());   // F · H recibida · I estado
      ped.getRange(2, cPedir).setValue(false);
      const sur = tienda.getSheetByName("🚚 SURTIDO RÁPIDO");
      if (sur) tienda.deleteSheet(sur);
      resumen.push(`${BODEGAS[key].nombre}: pedido y Surtido en blanco`);
    } catch (e) { resumen.push(`${BODEGAS[key].nombre} (tienda): ${e.message}`); }
  });
  SpreadsheetApp.flush();
  _buildVista("BA"); _buildVista("BM");
  try { sincronizarRemotamenteTiendasPush(); } catch (e) { resumen.push("Tiendas: " + e.message); }
  const hojaEnt = _hoja(ss, SHEET_ENTRADAS);
  if (hojaEnt) hojaEnt.getRange("A2").setValue(ENTRADAS_MODOS[0]);
  _prepararHojaEntradas(true);
  ui.alert("🎬 Datos listos", resumen.join("\n") + "\n\nPepino y Limón: se reciben pesados.", ui.ButtonSet.OK);
}
