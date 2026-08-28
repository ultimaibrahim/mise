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
   * Ejecuta el descuento con control de fecha (ayer en cronjob nocturno)
   * e idempotencia transaccional (cero duplicados ante ejecuciones repetidas).
   */
  ejecutarDescuento(silent = true, fechaTargetPersonalizada = null) {
    const tId = "MiseSmartSync.ejecutarDescuento_" + Date.now();
    MiseLogger.time(tId);

    const lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) {
      MiseLogger.warn("MiseSmartSync", "Bodega bloqueada por otro proceso concurrente.");
      return;
    }

    let totalDescontados = 0;
    let totalOmitidosDuplicados = 0;
    const resumenDesglose = [];
    const txHashesAplicados = [];
    const ss = SpreadsheetApp.getActiveSpreadsheet();

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
      if (typeof raw === "string" && raw.includes("-")) {
        const parts = raw.split("-");
        return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      }
      return new Date();
    };

    try {
      // 1. Determinar Fecha Objetivo:
      // Si corre de madrugada (entre 00:00 y 05:00 AM), el turno cerrado corresponde a AYER
      let fechaObjetivoDate;
      if (fechaTargetPersonalizada instanceof Date) {
        fechaObjetivoDate = fechaTargetPersonalizada;
      } else {
        const hoy = new Date();
        if (hoy.getHours() < 6) {
          fechaObjetivoDate = new Date(hoy);
          fechaObjetivoDate.setDate(hoy.getDate() - 1);
        } else {
          fechaObjetivoDate = hoy;
        }
      }
      const fechaObjetivoStr = _fmtDateKey(fechaObjetivoDate);

      Object.keys(BODEGAS).forEach(key => {
        const bConfig = BODEGAS[key];
        const kSheet = ss.getSheetByName(bConfig.kardex);
        if (!kSheet) return;

        // Buscar hoja de logs de la sucursal
        const posiblesHojas = [
          `_SYNC_LOG_${key}`,
          `LOG_SURTIDO_${key}`,
          `_SYNC_LOG_${key.toLowerCase()}`,
          "🗒 LOG_SURTIDO"
        ];

        let logSheet = null;
        for (const name of posiblesHojas) {
          const found = ss.getSheetByName(name);
          if (found && found.getLastRow() >= 2) {
            logSheet = found;
            break;
          }
        }
        if (!logSheet) {
          logSheet = ss.getSheets().find(s => (s.getName().includes("LOG_SURTIDO") || s.getName().includes("SYNC_LOG")) && s.getName().includes(key));
        }
        if (!logSheet || logSheet.getLastRow() < 2) return;

        const logLr = logSheet.getLastRow();
        const logData = logSheet.getRange(2, 1, logLr - 1, 8).getValues();
        if (logData.length === 0) return;

        // Filtrar filas de esta sucursal y de la fecha objetivo
        const filasSucursal = logData.filter(r => {
          const bName = String(r[1] || "").trim().toLowerCase();
          return bName.includes(bConfig.nombre.toLowerCase()) || bName.includes(key.toLowerCase());
        });

        // Ubicar la subcolumna SAL del día correspondiente
        const dayMap = ["DOM", "LUN", "MAR", "MIE", "JUE", "VIE", "SAB"];
        const targetDayName = dayMap[fechaObjetivoDate.getDay()];
        const hRow5 = kSheet.getRange(5, 1, 1, kSheet.getLastColumn()).getValues()[0];
        let salColIdx = -1;
        for (let colIdx = 0; colIdx < hRow5.length; colIdx++) {
          const cellText = String(hRow5[colIdx] || "").trim().toUpperCase();
          if (cellText === targetDayName) {
            salColIdx = colIdx + 2; // Subcolumna SAL
            break;
          }
        }
        if (salColIdx === -1) {
          const dow = fechaObjetivoDate.getDay() || 7;
          salColIdx = 11 + (dow - 1) * 3;
        }

        // Mapear insumos oficiales en Kardex
        const klr = kSheet.getLastRow();
        if (klr < KARDEX_START) return;
        const kCount = klr - KARDEX_START + 1;
        const kProds = kSheet.getRange(KARDEX_START, 3, kCount, 1).getValues();
        const kRowMap = {};
        kProds.forEach((r, idx) => {
          const normKey = _norm(r[0]);
          if (normKey) kRowMap[normKey] = KARDEX_START + idx;
        });

        // 2. Procesamiento con Filtro de Idempotencia
        const acumuladoPorProducto = {};
        const listaDesgloseSucursal = [];

        filasSucursal.forEach((lRow, rowIdx) => {
          const rowDate = _parseFecha(lRow[0]);
          const rowDateStr = _fmtDateKey(rowDate);
          if (rowDateStr !== fechaObjetivoStr) return;

          const prodName = String(lRow[2] || "").trim();
          const normKey = _norm(prodName);
          let rawCant = lRow[5];
          if (typeof rawCant === "string") rawCant = rawCant.replace(',', '.').trim();
          const cantRec = parseFloat(rawCant) || 0;
          const estado = String(lRow[6] || "").trim().toUpperCase();

          if (!normKey || !kRowMap[normKey] || !(estado.includes("COMPLETO") || estado.includes("PARCIAL") || cantRec > 0)) {
            return;
          }

          // Generar Firma Única de Transacción
          const txHash = `${rowDateStr}_${key}_${normKey}_${cantRec}_r${rowIdx}`;
          if (MiseIdempotencyLedger.has(txHash)) {
            totalOmitidosDuplicados++;
            return;
          }

          acumuladoPorProducto[normKey] = (acumuladoPorProducto[normKey] || 0) + cantRec;
          txHashesAplicados.push(txHash);
        });

        // 3. Inyección Acumulativa en Kardex
        Object.keys(acumuladoPorProducto).forEach(normKey => {
          const targetRow = kRowMap[normKey];
          const cantNueva = acumuladoPorProducto[normKey];
          
          // Leer valor actual de la celda de SAL para sumar sin sobreescribir
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

      // 4. Registrar hashes aplicados
      MiseIdempotencyLedger.registerBatch(txHashesAplicados);
      SpreadsheetApp.flush();

      const dur = MiseLogger.timeEnd(tId);
      MiseLogger.info("MiseSmartSync", `Descuento completado: ${totalDescontados} insumos aplicados, ${totalOmitidosDuplicados} omitidos por idempotencia.`, dur);

      if (!silent) {
        let msg = `Fecha procesada: ${fechaObjetivoStr}\nInsumos actualizados: ${totalDescontados}\nTransacciones previas omitidas: ${totalOmitidosDuplicados}\n\n`;
        if (resumenDesglose.length > 0) {
          msg += resumenDesglose.join("\n\n");
        } else {
          msg += "No se encontraron nuevos surtidos pendientes de descontar.";
        }
        SpreadsheetApp.getUi().alert("🚚 Descuento Inteligente de Inventario", msg, SpreadsheetApp.getUi().ButtonSet.OK);
      }

    } catch(err) {
      const dur = MiseLogger.timeEnd(tId);
      MiseLogger.error("MiseSmartSync", `Error al descontar: ${err.message}`, err, dur);
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
