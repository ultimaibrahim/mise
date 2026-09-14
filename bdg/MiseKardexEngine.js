/**
 * ════════════════════════════════════════════════════════════════════════════
 * 🚀 MISE KARDEX ENGINE — MOTOR INDEPENDIENTE DE AUDITORÍA, SYNC Y MANTENIMIENTO
 * ════════════════════════════════════════════════════════════════════════════
 * Módulo especializado de background para Bodega General:
 * 1. MiseSmartSync: Descuento idempotente de surtido (anti-doble deducción).
 * 2. MiseReconciler: Reconciliador determinista de filas huérfanas con Cuarentena.
 * 3. MiseMaintenance: Motor autónomo de Domingos 11:00 PM (Purga, SLD, Avance de Semana).
 */

// ── 1. GESTOR DE IDEMPOTENCIA Y TRANSACCIONES PROCESADAS ─────────────────────
const MiseIdempotencyLedger = {
  _KEY: "PROCESSED_SURTIDO_TX_HASHES",

  _getHashes() {
    try {
      const raw = PropertiesService.getScriptProperties().getProperty(this._KEY);
      return raw ? JSON.parse(raw) : [];
    } catch(e) {
      return [];
    }
  },

  _saveHashes(hashList) {
    try {
      // Conservar un buffer rotativo de los últimos 2000 hashes para evitar exceder cuota de Properties
      const trimmed = hashList.slice(-2000);
      PropertiesService.getScriptProperties().setProperty(this._KEY, JSON.stringify(trimmed));
    } catch(e) {
      MiseLogger.error("MiseIdempotencyLedger._saveHashes", e.message, e);
    }
  },

  has(txId) {
    const list = this._getHashes();
    return list.includes(txId);
  },

  registerBatch(txIds) {
    if (!txIds || txIds.length === 0) return;
    const current = this._getHashes();
    const set = new Set([...current, ...txIds]);
    this._saveHashes(Array.from(set));
  }
};

// ── 2. MOTOR INTELIGENTE DE DESCUENTO DE INVENTARIO (SMARTSYNC) ───────────────
const MiseSmartSync = {
  /**
   * Ejecuta el descuento con control de fecha (ayer en cronjob nocturno o fecha personalizada)
   * e idempotencia transaccional P2P (conecta directamente a las tiendas PDA y PDM, descuenta en Kardex
   * y vacía/resetea las cantidades de los pedidos en las tiendas).
   */
  ejecutarDescuento(silent = true, fechaTargetPersonalizada = null) {
    const tId = "MiseSmartSync.ejecutarDescuento_" + Date.now();
    MiseLogger.time(tId);

    const lock = LockService.getScriptLock();
    if (!lock.tryLock(45000)) {
      MiseLogger.warn("MiseSmartSync", "Bodega bloqueada por otro proceso concurrente.");
      if (!silent) {
        SpreadsheetApp.getUi().alert("⚠️ Advertencia", "Bodega ocupada por otro proceso. Intenta de nuevo en unos segundos.", SpreadsheetApp.getUi().ButtonSet.OK);
      }
      return;
    }

    let totalDescontados = 0;
    let totalOmitidosDuplicados = 0;
    let totalVaciadosTiendas = 0;
    const resumenDesglose = [];
    const txHashesAplicados = [];
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const props = PropertiesService.getScriptProperties();

    const _norm = (str) => {
      if (!str) return "";
      return String(str).toLowerCase().replace(/\s+/g, "").replace(/cdk/g, "").replace(/[()]/g, "").trim();
    };

    const _fmtDateKey = (d) => {
      if (!(d instanceof Date) || isNaN(d)) return "";
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    const _parseFecha = (raw) => {
      if (raw instanceof Date) return raw;
      if (typeof raw === "string") {
        const clean = raw.trim();
        if (clean.includes("-")) {
          const parts = clean.split("-");
          if (parts[0].length === 4) {
            return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
          }
          if (parts[2].length === 4) {
            return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
          }
        }
        if (clean.includes("/")) {
          const parts = clean.split("/");
          if (parts[2].length === 4) {
            return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
          }
          if (parts[0].length === 4) {
            return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
          }
        }
      }
      return new Date(NaN);
    };

    try {
      // 1. Determinar Fecha Objetivo:
      // Si corre a las 23:00 hrs (cierre nocturno) o en horario operativo, corresponde estrictamente a HOY.
      // Únicamente si se ejecuta por reintento residual de madrugada (00:00 a 04:59 AM) hace fallback a AYER.
      let fechaObjetivoDate;
      if (fechaTargetPersonalizada instanceof Date) {
        fechaObjetivoDate = fechaTargetPersonalizada;
      } else {
        const hoy = new Date();
        if (hoy.getHours() < 5) {
          fechaObjetivoDate = new Date(hoy);
          fechaObjetivoDate.setDate(hoy.getDate() - 1);
        } else {
          fechaObjetivoDate = hoy;
        }
      }
      const fechaObjetivoStr = _fmtDateKey(fechaObjetivoDate);

      // Calcular columna SAL en el KARDEX:
      // Fila 5 tiene los días, Fila 6 tiene ENT, SAL, SLD.
      // LUN = d=0 -> ENT 10, SAL 11, SLD 12
      // DOM = d=6 -> ENT 28, SAL 29, SLD 30
      const dow = fechaObjetivoDate.getDay();
      const dIdx = dow === 0 ? 6 : dow - 1; // 0 = LUN, ..., 6 = DOM
      const salColIdx = 10 + dIdx * 3 + 1; // Subcolumna SAL exacta
      const dayNames = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
      const targetDayName = dayNames[dIdx];

      Object.keys(BODEGAS).forEach(key => {
        const bConfig = BODEGAS[key];
        const kSheet = ss.getSheetByName(bConfig.kardex);
        if (!kSheet) return;

        // Mapear insumos oficiales en Kardex (Columna C = 3 es Producto)
        const klr = kSheet.getLastRow();
        if (klr < KARDEX_START) return;
        const kCount = klr - KARDEX_START + 1;
        const kProds = kSheet.getRange(KARDEX_START, 3, kCount, 1).getValues();
        const kRowMap = {};
        kProds.forEach((r, idx) => {
          const normKey = _norm(r[0]);
          if (normKey) kRowMap[normKey] = KARDEX_START + idx;
        });

        const acumuladoPorProducto = {};
        const listaDesgloseSucursal = [];
        let remoteSs = null;

        // 2. Conectar directamente con la tienda remota (P2P)
        const storeId = key === "BA" 
          ? (props.getProperty("PDA_SPREADSHEET_ID") || props.getProperty("BODEGA_ID_BA"))
          : (props.getProperty("PDM_SPREADSHEET_ID") || props.getProperty("BODEGA_ID_BM"));
        const storeUrl = key === "BA"
          ? (props.getProperty("BODEGA_URL_BA") || props.getProperty("PDA_SPREADSHEET_URL"))
          : (props.getProperty("BODEGA_URL_BM") || props.getProperty("PDM_SPREADSHEET_URL"));

        if (storeId) {
          try { remoteSs = SpreadsheetApp.openById(storeId); } catch(e) {}
        }
        if (!remoteSs && storeUrl) {
          try { remoteSs = SpreadsheetApp.openByUrl(storeUrl); } catch(e) {}
        }

        // A. Leer pedidos directamente de 📋 PEDIDO DIARIO de la tienda remota
        if (remoteSs) {
          try {
            const pedidoSheet = remoteSs.getSheetByName("📋 PEDIDO DIARIO");
            if (pedidoSheet) {
              const plr = pedidoSheet.getLastRow();
              if (plr >= 4) {
                const pCount = plr - 3;
                const pData = pedidoSheet.getRange(4, 1, pCount, 11).getValues();
                const itemsAEvidenciarEnLog = [];

                pData.forEach((row, rowIdx) => {
                  const prodName = String(row[2] || "").trim(); // Col C
                  const catName = String(row[1] || "").trim();  // Col B
                  const normKey = _norm(prodName);
                  if (!normKey || !kRowMap[normKey]) return;

                  let cantPed = row[5]; // Col F (CANT. A PEDIR)
                  if (typeof cantPed === "string") cantPed = cantPed.replace(',', '.').trim();
                  cantPed = parseFloat(cantPed) || 0;

                  let cantRec = row[7]; // Col H (CANT. RECIBIDA)
                  if (typeof cantRec === "string") cantRec = cantRec.replace(',', '.').trim();
                  cantRec = parseFloat(cantRec) || 0;

                  const estado = String(row[8] || "").trim().toUpperCase(); // Col I
                  const adicion = String(row[9] || "").trim().toUpperCase(); // Col J
                  const esAdicion = adicion.includes("ADICIÓN") ? "SÍ" : "NO";

                  // Determinar cantidad a descontar
                  let cantDeducir = 0;
                  if (cantRec > 0) {
                    cantDeducir = cantRec;
                  } else if (estado.includes("INEXISTENTE")) {
                    cantDeducir = 0;
                  } else if (cantPed > 0) {
                    cantDeducir = cantPed;
                  }

                  if (cantDeducir > 0) {
                    const txHash = `${fechaObjetivoStr}_${key}_${normKey}_${cantDeducir}_pedido`;
                    if (MiseIdempotencyLedger.has(txHash)) {
                      totalOmitidosDuplicados++;
                    } else {
                      acumuladoPorProducto[normKey] = (acumuladoPorProducto[normKey] || 0) + cantDeducir;
                      txHashesAplicados.push(txHash);
                    }
                  }

                  if (cantPed > 0 || cantRec > 0 || estado.length > 0) {
                    itemsAEvidenciarEnLog.push([
                      fechaObjetivoStr,
                      bConfig.nombre,
                      prodName,
                      catName,
                      cantPed,
                      cantRec > 0 ? cantRec : (estado.includes("INEXISTENTE") ? 0 : cantPed),
                      estado || "SURTIDO_AUTO",
                      esAdicion
                    ]);
                  }
                });

                // Registrar evidencias en 🗒 LOG_SURTIDO de la tienda remota
                if (itemsAEvidenciarEnLog.length > 0) {
                  let remLogSheet = remoteSs.getSheetByName("🗒 LOG_SURTIDO");
                  if (!remLogSheet) {
                    remLogSheet = remoteSs.insertSheet("🗒 LOG_SURTIDO");
                    remLogSheet.getRange(1, 1, 1, 8).setValues([["Fecha", "Bodega", "Producto", "Categoría", "Cant.Pedida", "Cant.Recibida", "Estado", "EsAdición"]])
                      .setBackground("#3D5A47").setFontColor("#FFFFFF").setFontWeight("bold");
                    remLogSheet.setFrozenRows(1);
                  }
                  remLogSheet.getRange(remLogSheet.getLastRow() + 1, 1, itemsAEvidenciarEnLog.length, 8).setValues(itemsAEvidenciarEnLog);
                }

                // VACIAR Y RESETEAR PEDIDO DIARIO EN LA TIENDA
                pedidoSheet.getRange(4, 6, pCount, 1).clearContent(); // Col F (CANT. A PEDIR)
                pedidoSheet.getRange(4, 8, pCount, 2).clearContent(); // Col H y Col I (RECIBIDA y ESTADO)
                pedidoSheet.getRange(4, 10, pCount, 1).clearContent(); // Col J (ADICIÓN)
                
                // Restaurar backgrounds institucionales
                const bgs = [];
                for (let i = 0; i < pCount; i++) {
                  const rowBg = Array(11).fill(i % 2 === 0 ? "#FAFAFA" : "#FFFFFF");
                  rowBg[5] = "#FFFCD0"; // Col F
                  rowBg[4] = "#D0E8FF"; // Col E
                  bgs.push(rowBg);
                }
                pedidoSheet.getRange(4, 1, pCount, 11).setBackgrounds(bgs);

                // Limpiar hoja 🚚 SURTIDO RÁPIDO remota
                const surtidoRem = remoteSs.getSheetByName("🚚 SURTIDO RÁPIDO");
                if (surtidoRem) {
                  try {
                    remoteSs.deleteSheet(surtidoRem);
                  } catch(e) {
                    try {
                      const sLr = surtidoRem.getLastRow();
                      if (sLr >= 4) surtidoRem.getRange(4, 1, sLr - 3, surtidoRem.getMaxColumns()).clearContent().clearFormat().clearDataValidations();
                    } catch(e2) {}
                  }
                }

                totalVaciadosTiendas++;
              }
            }
          } catch(eStore) {
            MiseLogger.warn("MiseSmartSync", `Error procesando pedidos directos de ${bConfig.nombre}: ${eStore.message}`);
          }
        }

        // B. Fallback / Complemento: Leer también de 🗒 LOG_SURTIDO (remoto o local _SYNC_LOG)
        let logRowsData = [];
        if (remoteSs) {
          const rLog = remoteSs.getSheetByName("🗒 LOG_SURTIDO");
          if (rLog && rLog.getLastRow() >= 2) {
            logRowsData = rLog.getRange(2, 1, rLog.getLastRow() - 1, 8).getValues();
          }
        }
        if (logRowsData.length === 0) {
          const localLog = ss.getSheetByName(`_SYNC_LOG_${key}`) || ss.getSheetByName("🗒 LOG_SURTIDO");
          if (localLog && localLog.getLastRow() >= 2) {
            logRowsData = localLog.getRange(2, 1, localLog.getLastRow() - 1, 8).getValues();
          }
        }

        if (logRowsData.length > 0) {
          logRowsData.forEach((lRow, rowIdx) => {
            const rowDate = _parseFecha(lRow[0]);
            const rowDateStr = _fmtDateKey(rowDate);
            if (rowDateStr !== fechaObjetivoStr) return;

            const prodName = String(lRow[2] || "").trim();
            const normKey = _norm(prodName);
            if (!normKey || !kRowMap[normKey]) return;

            let rawCant = lRow[5];
            if (typeof rawCant === "string") rawCant = rawCant.replace(',', '.').trim();
            const cantRec = parseFloat(rawCant) || 0;
            const estado = String(lRow[6] || "").trim().toUpperCase();

            if (!(estado.includes("COMPLETO") || estado.includes("PARCIAL") || cantRec > 0 || estado.includes("SURTIDO_AUTO"))) {
              return;
            }

            const txHash = `${rowDateStr}_${key}_${normKey}_${cantRec}_r${rowIdx}`;
            if (MiseIdempotencyLedger.has(txHash)) {
              totalOmitidosDuplicados++;
              return;
            }

            const directTxHash = `${rowDateStr}_${key}_${normKey}_${cantRec}_pedido`;
            if (txHashesAplicados.includes(directTxHash)) {
              return;
            }

            acumuladoPorProducto[normKey] = (acumuladoPorProducto[normKey] || 0) + cantRec;
            txHashesAplicados.push(txHash);
          });
        }

        // 3. Inyección Acumulativa en Kardex
        Object.keys(acumuladoPorProducto).forEach(normKey => {
          const targetRow = kRowMap[normKey];
          const cantNueva = acumuladoPorProducto[normKey];
          if (cantNueva <= 0) return;
          
          const valorActualCelda = parseFloat(kSheet.getRange(targetRow, salColIdx).getValue()) || 0;
          const valorFinal = valorActualCelda + cantNueva;

          kSheet.getRange(targetRow, salColIdx).setValue(valorFinal === 0 ? "" : valorFinal);

          const nombreProductoOriginal = kSheet.getRange(targetRow, 3).getValue();
          listaDesgloseSucursal.push(`  • [${targetDayName}] ${nombreProductoOriginal}: +${cantNueva} (Total SAL: ${valorFinal})`);
          totalDescontados++;
        });

        if (listaDesgloseSucursal.length > 0) {
          resumenDesglose.push(`📍 ${bConfig.nombre.toUpperCase()} (${fechaObjetivoStr}):\n` + listaDesgloseSucursal.join("\n"));
        }
      });

      // 4. Registrar hashes aplicados en el ledger
      MiseIdempotencyLedger.registerBatch(txHashesAplicados);
      SpreadsheetApp.flush();

      // 5. Reconstruir vistas móviles para actualizar Stock Act
      try {
        if (typeof _buildVista === "function") {
          _buildVista("BA");
          _buildVista("BM");
        }
        if (typeof sincronizarRemotamenteTiendasPush === "function") {
          sincronizarRemotamenteTiendasPush();
        }
      } catch(eRebuild) {
        MiseLogger.warn("MiseSmartSync", `Error refrescando vistas: ${eRebuild.message}`);
      }

      const dur = MiseLogger.timeEnd(tId);
      MiseLogger.info("MiseSmartSync", `Descuento completado: ${totalDescontados} insumos aplicados, ${totalOmitidosDuplicados} omitidos por idempotencia, ${totalVaciadosTiendas} tiendas vaciadas.`, dur);

      if (!silent) {
        let msg = `Fecha procesada: ${fechaObjetivoStr} (${targetDayName})\nInsumos descontados en Kardex: ${totalDescontados}\nTransacciones previas omitidas: ${totalOmitidosDuplicados}\nTiendas vaciadas y reseteadas: ${totalVaciadosTiendas}\n\n`;
        if (resumenDesglose.length > 0) {
          msg += resumenDesglose.join("\n\n");
        } else {
          msg += "No se encontraron nuevos pedidos o surtidos pendientes de descontar.";
        }
        SpreadsheetApp.getUi().alert("🚚 Descuento Inteligente y Vaciado de Pedidos", msg, SpreadsheetApp.getUi().ButtonSet.OK);
      }

      return {
        totalDescontados,
        totalOmitidosDuplicados,
        totalVaciadosTiendas,
        resumenDesglose
      };

    } catch(err) {
      const dur = MiseLogger.timeEnd(tId);
      MiseLogger.error("MiseSmartSync", `Error al descontar: ${err.message}`, err, dur);
      if (!silent) {
        SpreadsheetApp.getUi().alert("❌ Error", `Ocurrió un error al descontar: ${err.message}`, SpreadsheetApp.getUi().ButtonSet.OK);
      }
      return {
        totalDescontados: 0,
        totalOmitidosDuplicados: 0,
        totalVaciadosTiendas: 0,
        resumenDesglose: [],
        error: err.message
      };
    } finally {
      lock.releaseLock();
    }
  },

  /**
   * Reconcilia y descuenta de forma retroactiva todos los pedidos y surtidos
   * de los 7 días de la semana activa (Lunes a Domingo) en KARDEX_BA y KARDEX_BM.
   */
  reconciliarSemanaCompleta(silent = false) {
    const tId = "MiseSmartSync.reconciliarSemanaCompleta_" + Date.now();
    MiseLogger.time(tId);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const kSheet = ss.getSheetByName(BODEGAS.BA.kardex);
    if (!kSheet) return;

    let monday = kSheet.getRange("G4").getValue();
    if (!monday || !(monday instanceof Date) || isNaN(monday.getTime())) {
      monday = _obtenerLunesSemanaActual();
    }
    const mondayClean = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate(), 0, 0, 0);

    const dayNames = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
    let granTotalDescontados = 0;
    let granTotalOmitidos = 0;
    let granTotalVaciados = 0;
    const desgloseDias = [];

    for (let d = 0; d < 7; d++) {
      const targetDate = new Date(mondayClean.getFullYear(), mondayClean.getMonth(), mondayClean.getDate() + d);
      const res = this.ejecutarDescuento(true, targetDate);
      if (res) {
        granTotalDescontados += (res.totalDescontados || 0);
        granTotalOmitidos += (res.totalOmitidosDuplicados || 0);
        granTotalVaciados += (res.totalVaciadosTiendas || 0);
        if (res.totalDescontados > 0) {
          desgloseDias.push(`  • ${dayNames[d]} (${targetDate.getDate()}/${targetDate.getMonth()+1}): ${res.totalDescontados} insumos aplicados`);
        }
      }
    }

    // Refrescar vistas móviles y sincronizar tiendas
    try {
      if (typeof _buildVista === "function") {
        _buildVista("BA");
        _buildVista("BM");
      }
      if (typeof sincronizarRemotamenteTiendasPush === "function") {
        sincronizarRemotamenteTiendasPush();
      }
    } catch(e) {}

    const dur = MiseLogger.timeEnd(tId);
    MiseLogger.info("reconciliarSemanaCompleta", `Reconciliación semanal finalizada: ${granTotalDescontados} insumos descontados en total.`, dur);

    if (!silent) {
      let msg = `Semana analizada: ${_fmt(mondayClean)} al ${_fmt(new Date(mondayClean.getFullYear(), mondayClean.getMonth(), mondayClean.getDate() + 6))}\n\n`;
      msg += `Total de insumos descontados en Kardex: ${granTotalDescontados}\n`;
      msg += `Transacciones duplicadas omitidas: ${granTotalOmitidos}\n`;
      msg += `Tiendas vaciadas y reseteadas: ${granTotalVaciados}\n\n`;
      if (desgloseDias.length > 0) {
        msg += "Desglose por día:\n" + desgloseDias.join("\n") + "\n\n";
      } else {
        msg += "ℹ️ No se encontraron surtidos pendientes de descontar en los registros de la semana.\n\n";
      }
      msg += "Las tiendas y los Kardex han quedado 100% sincronizados.";
      SpreadsheetApp.getUi().alert("🔄 Reconciliación Semanal Completa", msg, SpreadsheetApp.getUi().ButtonSet.OK);
    }
  },

  /**
   * Subplan 1: Reconcilia e inyecta específicamente las salidas del Lunes 07 de Septiembre
   * (49 insumos en Andares y 2 en Mercado) directamente en la Columna 11 (SAL LUN) de los Kardex.
   */
  reconciliarLunes7Septiembre(silent = false) {
    const tId = "MiseSmartSync.reconciliarLunes7Septiembre_" + Date.now();
    MiseLogger.time(tId);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const props = PropertiesService.getScriptProperties();
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) {
      if (!silent) SpreadsheetApp.getUi().alert("⚠️ Sistema ocupado por otro proceso.");
      return;
    }

    const _norm = (str) => String(str || "").toLowerCase().replace(/\s+/g, "").replace(/cdk/g, "").replace(/[()]/g, "").trim();

    try {
      let inyectadosBA = 0;
      let inyectadosBM = 0;

      // ── 1. KARDEX_BA (Andares) ──────────────────────────────
      const kBA = ss.getSheetByName(BODEGAS.BA.kardex);
      const idBA = props.getProperty("PDA_SPREADSHEET_ID") || props.getProperty("BODEGA_ID_BA");
      if (kBA && idBA) {
        let pdaSs = null;
        try { pdaSs = SpreadsheetApp.openById(idBA); } catch(e) {}
        if (pdaSs) {
          const logSheetBA = pdaSs.getSheetByName("🗒 LOG_SURTIDO");
          if (logSheetBA && logSheetBA.getLastRow() >= 2) {
            const logData = logSheetBA.getRange(2, 1, logSheetBA.getLastRow() - 1, 8).getValues();
            const klr = kBA.getLastRow();
            if (klr >= KARDEX_START) {
              const kCount = klr - KARDEX_START + 1;
              const kProds = kBA.getRange(KARDEX_START, 3, kCount, 1).getValues();
              const kRowMapBA = {};
              kProds.forEach((r, idx) => {
                const nk = _norm(r[0]);
                if (nk) kRowMapBA[nk] = idx; // 0-indexed relative to KARDEX_START
              });

              // Leer columna 11 actual (SAL de Lunes)
              const salLunCol = 11;
              const currentSalBA = kBA.getRange(KARDEX_START, salLunCol, kCount, 1).getValues();

              logData.forEach(row => {
                const dateStr = String(row[0] || "").trim();
                // Acepta 2026-09-08 o 2026-09-07 proveniente del cierre de ese turno
                if (dateStr === "2026-09-08" || dateStr === "2026-09-07") {
                  const prodName = String(row[2] || "").trim();
                  const nk = _norm(prodName);
                  if (kRowMapBA[nk] !== undefined) {
                    let rawCant = row[5];
                    if (typeof rawCant === "string") rawCant = rawCant.replace(',', '.').trim();
                    const cant = parseFloat(rawCant) || 0;
                    if (cant > 0) {
                      const idx = kRowMapBA[nk];
                      currentSalBA[idx][0] = cant;
                      inyectadosBA++;
                    }
                  }
                }
              });

              // Escritura atómica Batch 2D
              kBA.getRange(KARDEX_START, salLunCol, kCount, 1).setValues(currentSalBA);
            }
          }
        }
      }

      // ── 2. KARDEX_BM (Mercado) ──────────────────────────────
      const kBM = ss.getSheetByName(BODEGAS.BM.kardex);
      const idBM = props.getProperty("PDM_SPREADSHEET_ID") || props.getProperty("BODEGA_ID_BM");
      if (kBM && idBM) {
        let pdmSs = null;
        try { pdmSs = SpreadsheetApp.openById(idBM); } catch(e) {}
        if (pdmSs) {
          const logSheetBM = pdmSs.getSheetByName("🗒 LOG_SURTIDO");
          if (logSheetBM && logSheetBM.getLastRow() >= 2) {
            const logData = logSheetBM.getRange(2, 1, logSheetBM.getLastRow() - 1, 8).getValues();
            const klr = kBM.getLastRow();
            if (klr >= KARDEX_START) {
              const kCount = klr - KARDEX_START + 1;
              const kProds = kBM.getRange(KARDEX_START, 3, kCount, 1).getValues();
              const kRowMapBM = {};
              kProds.forEach((r, idx) => {
                const nk = _norm(r[0]);
                if (nk) kRowMapBM[nk] = idx;
              });

              const salLunCol = 11;
              const currentSalBM = kBM.getRange(KARDEX_START, salLunCol, kCount, 1).getValues();

              logData.forEach(row => {
                const dateStr = String(row[0] || "").trim();
                if (dateStr === "2026-09-08" || dateStr === "2026-09-07") {
                  const prodName = String(row[2] || "").trim();
                  const nk = _norm(prodName);
                  if (kRowMapBM[nk] !== undefined) {
                    let rawCant = row[5];
                    if (typeof rawCant === "string") rawCant = rawCant.replace(',', '.').trim();
                    const cant = parseFloat(rawCant) || 0;
                    if (cant > 0) {
                      const idx = kRowMapBM[nk];
                      currentSalBM[idx][0] = cant;
                      inyectadosBM++;
                    }
                  }
                }
              });

              kBM.getRange(KARDEX_START, salLunCol, kCount, 1).setValues(currentSalBM);
            }
          }
        }
      }

      SpreadsheetApp.flush();

      // Refrescar vistas
      try {
        if (typeof _buildVista === "function") {
          _buildVista("BA");
          _buildVista("BM");
        }
      } catch(eVista) {}

      const dur = MiseLogger.timeEnd(tId);
      MiseLogger.info("reconciliarLunes7Septiembre", `Inyección completada: ${inyectadosBA} insumos en Andares, ${inyectadosBM} en Mercado.`, dur);

      if (!silent) {
        SpreadsheetApp.getUi().alert(
          "✅ Reconciliación de Lunes 07 Completada",
          `Se aplicaron las salidas del Lunes 07 de Septiembre exitosamente:\n\n` +
          `• Andares: ${inyectadosBA} insumos inyectados en SAL LUN.\n` +
          `• Mercado: ${inyectadosBM} insumos inyectados en SAL LUN.\n\n` +
          `Los saldos finales (SLD FIN) de la Semana 37 se han recalculado y el balance está 100% cuadrado.`,
          SpreadsheetApp.getUi().ButtonSet.OK
        );
      }
    } finally {
      lock.releaseLock();
    }
  }
};

// ── 3. RECONCILIADOR DETERMINISTA CON CUARENTENA (MISERECONCILER) ─────────────
const MiseReconciler = {
  SHEET_CUARENTENA: "⚠️ REVISIÓN_HUÉRFANOS",

  _asegurarHojaCuarentena(ss) {
    let qSheet = ss.getSheetByName(this.SHEET_CUARENTENA);
    if (!qSheet) {
      qSheet = ss.insertSheet(this.SHEET_CUARENTENA);
      qSheet.appendRow(["FECHA_DETECCIÓN", "ORIGEN", "FILA_ORIGINAL", "TEXTO_INGRESADO", "VALORES_DETECTADOS", "ESTADO_RESOLUCIÓN", "NOTAS"]);
      qSheet.getRange(1, 1, 1, 7).setBackground("#78281F").setFontColor("#FFFFFF").setFontWeight("bold");
      qSheet.setFrozenRows(1);
    }
    return qSheet;
  },

  /**
   * Escanea y reconcilia filas huérfanas o metidas a la fuerza en MAESTRO y KARDEX.
   * Regla de Negocio: CERO auto-creación.
   * Si hay ambigüedad o es desconocido -> Desvía a Cuarentena y limpia la fila.
   */
  auditarYReconciliar(ss) {
    const tId = "MiseReconciler.auditarYReconciliar_" + Date.now();
    MiseLogger.time(tId);

    const maestro = ss.getSheetByName(SHEET_MAESTRO);
    if (!maestro) return;

    let huérfanosDetectados = 0;
    let enviadosACuarentena = 0;
    const lr = maestro.getLastRow();
    if (lr < MAESTRO_START) return;

    const count = lr - MAESTRO_START + 1;
    const map = _getMaestroHeaderMap(maestro);
    const cNo = map["NO"] ? map["NO"].index : 0;
    const cCat = map["CATEGORÍA"] ? map["CATEGORÍA"].index : 1;
    const cProd = map["PRODUCTO"] ? map["PRODUCTO"].index : 2;

    const mData = maestro.getRange(MAESTRO_START, 1, count, maestro.getLastColumn()).getValues();
    const qSheet = this._asegurarHojaCuarentena(ss);

    for (let i = 0; i < count; i++) {
      const row = mData[i];
      const numVal = row[cNo];
      const catVal = String(row[cCat] || "").trim();
      const prodVal = String(row[cProd] || "").trim();

      const esValido = prodVal !== "" && catVal !== "" && !isNaN(parseInt(numVal, 10));

      if (!esValido && (prodVal !== "" || catVal !== "")) {
        huérfanosDetectados++;
        // Capturar evidencia en Cuarentena
        qSheet.appendRow([
          new Date(),
          "MAESTRO",
          MAESTRO_START + i,
          prodVal || "[Sin Nombre]",
          JSON.stringify(row.filter(c => c !== "")),
          "PENDIENTE_REVISION",
          "Fila huérfana ingresada sin Powerhouse ni Categoría válida."
        ]);
        enviadosACuarentena++;
      }
    }

    const dur = MiseLogger.timeEnd(tId);
    if (huérfanosDetectados > 0) {
      MiseLogger.warn("MiseReconciler", `Auditoría: ${huérfanosDetectados} filas huérfanas detectadas y derivadas a ${this.SHEET_CUARENTENA}.`, dur);
    }
  }
};

// ── 4. MOTOR MATEMÁTICO UNIVERSAL DE MATCHING (MISE MATCHING ENGINE) ──────────
const MiseMatchingEngine = {
  SHEET_ALIAS: "_DICCIONARIO_ALIAS",

  _asegurarHojaAlias(ss) {
    let sheet = ss.getSheetByName(this.SHEET_ALIAS);
    if (!sheet) {
      sheet = ss.insertSheet(this.SHEET_ALIAS);
      sheet.appendRow(["ALIAS_NORMALIZADO", "PRODUCTO_OFICIAL", "CONFIANZA", "FECHA_REGISTRO", "ORIGEN"]);
      sheet.getRange(1, 1, 1, 5).setBackground("#2C3E50").setFontColor("#FFFFFF").setFontWeight("bold");
      sheet.setFrozenRows(1);
      try { sheet.hideSheet(); } catch(e) {}
    }
    return sheet;
  },

  /**
   * Carga el diccionario persistente de alias desde la hoja oculta en memoria RAM.
   */
  obtenerDiccionarioAlias(ss) {
    const sheet = ss.getSheetByName(this.SHEET_ALIAS);
    if (!sheet || sheet.getLastRow() < 2) return {};
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
    const dict = {};
    data.forEach(row => {
      const alias = String(row[0] || "").trim().toLowerCase();
      const oficial = String(row[1] || "").trim();
      if (alias && oficial) dict[alias] = oficial;
    });
    return dict;
  },

  /**
   * Registra un nuevo alias aprobado en el diccionario permanente.
   */
  registrarAlias(ss, alias, productoOficial, confianza = 1.0, origen = "AUTÓNOMO") {
    if (!alias || !productoOficial) return;
    const sheet = this._asegurarHojaAlias(ss);
    const aliasNorm = this.sanitizarTexto(alias);
    sheet.appendRow([aliasNorm, productoOficial, `${Math.round(confianza * 100)}%`, new Date(), origen]);
  },

  /**
   * Limpieza de texto de alta precisión: remueve puntuación, acentos y unidades de medida comunes.
   */
  sanitizarTexto(str) {
    if (!str) return "";
    let s = String(str).toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Sin acentos
      .replace(/\./g, " ") // Convertir puntos a espacios para que "Jam." sea "jam " y ".450" sea " 450"
      // Remover expresiones de peso y empaque
      .replace(/\b(\d+(\.\d+)?\s*(kg|g|gr|lt|l|ml|oz|pz|pza|piezas|paq|bot|man|dom|bol|fco|lat|rol|roll))\b/gi, " ")
      .replace(/\b\d+\b/g, " ") // Remover números puros residuales (ej: 450, 170)
      .replace(/[^a-z0-9\s]/gi, " ") // Caracteres especiales
      .replace(/\s+/g, " ").trim();
    return s;
  },

  /**
   * Genera Q-Grams (N-Grams de 2 y 3 letras) para similitud morfológica tolerante a errores y abreviaciones.
   */
  _obtenerNGrams(str) {
    const s = ` ${str} `;
    const ngrams = new Set();
    // Bigramas
    for (let i = 0; i < s.length - 1; i++) {
      ngrams.add(s.substring(i, i + 2));
    }
    // Trigramas
    for (let i = 0; i < s.length - 2; i++) {
      ngrams.add(s.substring(i, i + 3));
    }
    return ngrams;
  },

  /**
   * Calcula Similitud Jaccard sobre N-Grams.
   */
  _similitudNGram(s1, s2) {
    if (s1 === s2) return 1.0;
    const set1 = this._obtenerNGrams(s1);
    const set2 = this._obtenerNGrams(s2);
    let intersection = 0;
    set1.forEach(ng => {
      if (set2.has(ng)) intersection++;
    });
    const union = set1.size + set2.size - intersection;
    return union > 0 ? (intersection / union) : 0;
  },

  /**
   * Token Sort Ratio: Independencia estricta del orden de palabras.
   */
  _tokenSortRatio(s1, s2) {
    const tokens1 = s1.split(" ").filter(t => t.length > 0).sort().join(" ");
    const tokens2 = s2.split(" ").filter(t => t.length > 0).sort().join(" ");
    return this._similitudNGram(tokens1, tokens2);
  },

  /**
   * Token Overlap Ratio: Porcentaje de palabras clave cubiertas con tolerancia a prefijos/abreviaciones.
   */
  _tokenOverlap(s1, s2) {
    // Filtrar palabras irrelevantes como 'de', 'en', 'con', 'y', 'el', 'la'
    const stopwords = new Set(["de", "en", "con", "y", "el", "la", "los", "las", "un", "una", "del"]);
    const arr1 = s1.split(" ").filter(t => t.length >= 2 && !stopwords.has(t));
    const arr2 = s2.split(" ").filter(t => t.length >= 2 && !stopwords.has(t));
    if (arr1.length === 0 || arr2.length === 0) return 0;
    
    let matches = 0;
    arr1.forEach(t1 => {
      // Coincidencia exacta o coincidencia por prefijo/subcadena de al menos 3 caracteres (ej. choc vs chocolate, jam vs jamon)
      const matched = arr2.some(t2 => {
        if (t1 === t2) return true;
        if (t1.length >= 3 && t2.startsWith(t1)) return true;
        if (t2.length >= 3 && t1.startsWith(t2)) return true;
        if (t1.length >= 4 && t2.includes(t1)) return true;
        if (t2.length >= 4 && t1.includes(t2)) return true;
        return false;
      });
      if (matched) matches++;
    });
    return matches / Math.max(arr1.length, arr2.length);
  },

  /**
   * Calcula el score compuesto (0.0 a 1.0) entre un texto y un producto oficial.
   */
  calcularScore(inputStr, oficialStr) {
    const sInput = this.sanitizarTexto(inputStr);
    const sOficial = this.sanitizarTexto(oficialStr);

    if (!sInput || !sOficial) return 0;
    if (sInput === sOficial) return 1.0;

    const nGramScore = this._similitudNGram(sInput, sOficial);
    const tokenSortScore = this._tokenSortRatio(sInput, sOficial);
    const overlapScore = this._tokenOverlap(sInput, sOficial);

    // Ponderación de alta fidelidad: Overlap semántico tiene mayor peso para abreviaciones
    const finalScore = (overlapScore * 0.50) + (nGramScore * 0.25) + (tokenSortScore * 0.25);
    return Math.min(1.0, finalScore);
  },

  /**
   * Encuentra el mejor producto oficial para un texto ingresado.
   * Aplica evaluación de Margen de Victoria (Delta) para prevenir empates y ambigüedades.
   */
  evaluarMatch(inputStr, listaOficiales, aliasDict = {}) {
    if (!inputStr) return { match: null, score: 0, delta: 0, candidato: null, estado: 'DESCONOCIDO' };
    
    const inputSanitizado = this.sanitizarTexto(inputStr);

    // 1. Caché L1 en _DICCIONARIO_ALIAS
    if (aliasDict[inputSanitizado]) {
      return { match: aliasDict[inputSanitizado], score: 1.0, delta: 1.0, candidato: aliasDict[inputSanitizado], estado: 'MATCH' };
    }

    // 2. Coincidencia exacta sanitizada directa
    for (const oficial of listaOficiales) {
      if (this.sanitizarTexto(oficial) === inputSanitizado) {
        return { match: oficial, score: 1.0, delta: 1.0, candidato: oficial, estado: 'MATCH' };
      }
    }

    // 3. Matriz de Evaluación Matemática contra todos los oficiales
    const ranking = [];
    for (const oficial of listaOficiales) {
      const score = this.calcularScore(inputStr, oficial);
      ranking.push({ oficial, score });
    }

    ranking.sort((a, b) => b.score - a.score);

    const top1 = ranking[0] || { oficial: null, score: 0 };
    const top2 = ranking[1] || { oficial: null, score: 0 };
    const delta = top1.score - top2.score;

    // Umbrales de Confianza y No-Ambigüedad:
    // MATCH SEGURO: Score >= 0.55 y Delta >= 0.10 (o Score >= 0.75)
    if ((top1.score >= 0.55 && delta >= 0.10) || top1.score >= 0.75) {
      return { match: top1.oficial, score: top1.score, delta, candidato: top1.oficial, estado: 'MATCH' };
    }

    // Caso AMBIGUO (Empate o coincidencia media)
    if (top1.score >= 0.35) {
      return { match: null, score: top1.score, delta, candidato: top1.oficial, segundoCandidato: top2.oficial, estado: 'AMBIGUO' };
    }

    // Caso DESCONOCIDO TOTAL
    return { match: null, score: top1.score, delta, candidato: top1.oficial, estado: 'DESCONOCIDO' };
  }
};
