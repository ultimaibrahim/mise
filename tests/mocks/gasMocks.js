/**
 * Emulador en Memoria de Google Apps Script Runtime
 * Simula SpreadsheetApp, Sheet, Range, LockService, PropertiesService, Session
 */

// Error diferido pendiente (compartido, como la cola de escrituras de Apps Script)
const _cola = { error: null };
function _diferir(msg) { if (!_cola.error) _cola.error = new Error(msg); }
function _aplicarPendientes() { if (_cola.error) { const e = _cola.error; _cola.error = null; throw e; } }

class MockRange {
  constructor(sheet, row, col, numRows = 1, numCols = 1) {
    this.sheet = sheet;
    this.row = row;
    this.col = col;
    this.numRows = numRows;
    this.numCols = numCols;
  }

  getValue() {
    _aplicarPendientes();
    const vals = this.getValues();
    return vals[0] ? vals[0][0] : "";
  }

  setValue(val) {
    this.setValues([[val]]);
    return this;
  }

  getValues() {
    _aplicarPendientes();
    const res = [];
    for (let r = 0; r < this.numRows; r++) {
      const rowArr = [];
      for (let c = 0; c < this.numCols; c++) {
        const val = this.sheet._getCell(this.row + r, this.col + c);
        rowArr.push(val);
      }
      res.push(rowArr);
    }
    return res;
  }

  setValues(matrix) {
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        this.sheet._setCell(this.row + r, this.col + c, matrix[r][c]);
      }
    }
    return this;
  }

  // Como Google: devuelve la fórmula de la celda (las fórmulas se guardan como texto que empieza con "=")
  getFormula() {
    const v = this.getValue();
    return (typeof v === "string" && v.startsWith("=")) ? v : "";
  }

  getFormulas() {
    const res = [];
    for (let r = 0; r < this.numRows; r++) {
      const fila = [];
      for (let c = 0; c < this.numCols; c++) {
        const v = this.sheet._getCell(this.row + r, this.col + c);
        fila.push((typeof v === "string" && v.startsWith("=")) ? v : "");
      }
      res.push(fila);
    }
    return res;
  }

  setFormula(formula) {
    this.sheet._setCell(this.row, this.col, formula);
    return this;
  }

  setFormulas(matrix) {
    // Como Google: en setFormulas, un texto sin "=" se interpreta como fórmula inválida → #NAME?
    const conv = matrix.map(f => f.map(v => (typeof v === "string" && v !== "" && !v.startsWith("=")) ? "#NAME?" : v));
    return this.setValues(conv);
  }

  clearContent() {
    for (let r = 0; r < this.numRows; r++) {
      for (let c = 0; c < this.numCols; c++) {
        this.sheet._setCell(this.row + r, this.col + c, "");
      }
    }
    return this;
  }

  clear() { return this.clearContent(); }
  // Celdas combinadas con las mismas reglas que Google Sheets frente a filas/columnas congeladas
  merge() {
    const m = { r1: this.row, c1: this.col, r2: this.row + this.numRows - 1, c2: this.col + this.numCols - 1 };
    const fc = this.sheet.frozenCols, fr = this.sheet.frozenRows;
    if ((fc > 0 && m.c1 <= fc && fc < m.c2) || (fr > 0 && m.r1 <= fr && fr < m.r2)) {
      throw new Error("No se pueden combinar celdas congeladas y no congeladas.");
    }
    if (!this._validarCombinacionesParciales()) return this;
    // Las combinaciones completamente contenidas se absorben (igual que Google)
    this.sheet.merges = this.sheet.merges.filter(x => !(x.r1 >= m.r1 && x.r2 <= m.r2 && x.c1 >= m.c1 && x.c2 <= m.c2));
    this.sheet.merges.push(m);
    return this;
  }
  _validarCombinacionesParciales() {
    const r2 = this.row + this.numRows - 1, c2 = this.col + this.numCols - 1;
    const parcial = this.sheet.merges.some(x => {
      const cruza = !(x.r2 < this.row || x.r1 > r2 || x.c2 < this.col || x.c1 > c2);
      const contenida = x.r1 >= this.row && x.r2 <= r2 && x.c1 >= this.col && x.c2 <= c2;
      return cruza && !contenida;
    });
    if (parcial) { _diferir("Debes seleccionar todas las celdas de un intervalo combinado para combinarlas o separarlas."); return false; }
    return true;
  }
  breakApart() {
    if (!this._validarCombinacionesParciales()) return this;
    const r2 = this.row + this.numRows - 1, c2 = this.col + this.numCols - 1;
    this.sheet.merges = this.sheet.merges.filter(m => m.r2 < this.row || m.r1 > r2 || m.c2 < this.col || m.c1 > c2);
    return this;
  }
  getMergedRanges() {
    const r2 = this.row + this.numRows - 1, c2 = this.col + this.numCols - 1;
    return this.sheet.merges
      .filter(m => !(m.r2 < this.row || m.r1 > r2 || m.c2 < this.col || m.c1 > c2))
      .map(m => new MockRange(this.sheet, m.r1, m.c1, m.r2 - m.r1 + 1, m.c2 - m.c1 + 1));
  }
  getRow() { return this.row; }
  getColumn() { return this.col; }
  getNumRows() { return this.numRows; }
  getNumColumns() { return this.numCols; }
  getLastRow() { return this.row + this.numRows - 1; }
  getLastColumn() { return this.col + this.numCols - 1; }
  getSheet() { return this.sheet; }
  setBackground() { return this; }
  setBackgrounds() { return this; }
  setFontColor() { return this; }
  setFontColors() { return this; }
  setFontWeight() { return this; }
  setFontWeights() { return this; }
  setFontSize() { return this; }
  setHorizontalAlignment() { return this; }
  setVerticalAlignment() { return this; }
  setNumberFormat() { return this; }
  setNumberFormats() { return this; }
  setBorder() { return this; }
  setWrap() { return this; }
  setDataValidation() { return this; }
  insertCheckboxes() { return this; }
  removeCheckboxes() { return this; }
}

class MockSheet {
  constructor(name, spreadsheet) {
    this.name = name;
    this.spreadsheet = spreadsheet;
    this.grid = {}; // key: "r,c" -> value
    this.maxRow = 0;
    this.maxCol = 0;
    this.frozenRows = 0;
    this.frozenCols = 0;
    this.colWidths = {};
    this.rowHeights = {};
    this.hidden = false;
    this.merges = [];
  }

  getName() { return this.name; }
  _getCell(r, c) { return this.grid[`${r},${c}`] !== undefined ? this.grid[`${r},${c}`] : ""; }
  _setCell(r, c, v) {
    this.grid[`${r},${c}`] = v;
    if (r > this.maxRow) this.maxRow = r;
    if (c > this.maxCol) this.maxCol = c;
  }

  getLastRow() {
    let max = 0;
    for (const key of Object.keys(this.grid)) {
      const [r] = key.split(",").map(Number);
      if (this.grid[key] !== "" && this.grid[key] !== null && this.grid[key] !== undefined) {
        if (r > max) max = r;
      }
    }
    return max;
  }

  getLastColumn() {
    let max = 0;
    for (const key of Object.keys(this.grid)) {
      const [, c] = key.split(",").map(Number);
      if (this.grid[key] !== "" && this.grid[key] !== null && this.grid[key] !== undefined) {
        if (c > max) max = c;
      }
    }
    return max;
  }

  getRange(a, b, c, d) {
    if (typeof a === "string") {
      // Range string "A1" o "A4:L"
      return this._parseA1Range(a);
    }
    const row = a;
    const col = b;
    const numRows = c !== undefined ? c : 1;
    const numCols = d !== undefined ? d : 1;
    return new MockRange(this, row, col, numRows, numCols);
  }

  _parseA1Range(a1) {
    const parts = a1.split(":");
    const startCol = parts[0].replace(/[0-9]/g, "");
    const startRow = parseInt(parts[0].replace(/[^0-9]/g, ""), 10) || 1;
    const colNum = this._letterToCol(startCol);

    if (parts.length === 1) {
      return new MockRange(this, startRow, colNum, 1, 1);
    }

    const endColStr = parts[1].replace(/[0-9]/g, "");
    const endRowStr = parts[1].replace(/[^0-9]/g, "");
    const endCol = endColStr ? this._letterToCol(endColStr) : colNum;
    const endRow = endRowStr ? parseInt(endRowStr, 10) : Math.max(this.getLastRow(), startRow);

    const numRows = Math.max(1, endRow - startRow + 1);
    const numCols = Math.max(1, endCol - colNum + 1);
    return new MockRange(this, startRow, colNum, numRows, numCols);
  }

  _letterToCol(letter) {
    let col = 0;
    const str = letter.toUpperCase();
    for (let i = 0; i < str.length; i++) {
      col = col * 26 + (str.charCodeAt(i) - 64);
    }
    return col || 1;
  }

  appendRow(rowArr) {
    const nextRow = this.getLastRow() + 1;
    for (let c = 0; c < rowArr.length; c++) {
      this._setCell(nextRow, c + 1, rowArr[c]);
    }
    return this;
  }

  // Como una hoja real: nunca menos columnas/filas que su contenido o sus combinaciones
  getMaxColumns() { return Math.max(this.getLastColumn(), ...this.merges.map(m => m.c2), 26); }
  getMaxRows() { return Math.max(this.getLastRow(), ...this.merges.map(m => m.r2), 200); }
  setFrozenRows(n) {
    if (this.merges.some(m => m.r1 <= n && n < m.r2)) {
      throw new Error("No se pueden inmovilizar filas que solo contengan parte de una celda combinada.");
    }
    this.frozenRows = n; return this;
  }
  setFrozenColumns(n) {
    if (this.merges.some(m => m.c1 <= n && n < m.c2)) {
      throw new Error("No se pueden inmovilizar columnas que solo contengan parte de una celda combinada.");
    }
    this.frozenCols = n; return this;
  }
  setColumnWidth(col, width) { this.colWidths[col] = width; return this; }
  setRowHeight(row, height) { this.rowHeights[row] = height; return this; }
  setRowHeights(row, n, height) { for (let i = 0; i < n; i++) this.rowHeights[row + i] = height; return this; }
  hideSheet() { this.hidden = true; return this; }
  showSheet() { this.hidden = false; return this; }
  deleteRows(row, count = 1) {}
  insertRowBefore(row) {
    const nuevo = {};
    Object.keys(this.grid).forEach(k => { const [r, c] = k.split(",").map(Number); nuevo[`${r >= row ? r + 1 : r},${c}`] = this.grid[k]; });
    this.grid = nuevo;
    return this;
  }
  insertRowsAfter(row, count = 1) {}
  // Como Google: las celdas a la derecha se recorren (contenido y combinaciones)
  _recorrerColumnas(desde, delta) {
    const nuevo = {};
    Object.keys(this.grid).forEach(k => {
      const [r, c] = k.split(",").map(Number);
      if (c < desde) nuevo[k] = this.grid[k];
      else if (delta > 0 || c >= desde - delta) nuevo[`${r},${c + delta}`] = this.grid[k];
    });
    this.grid = nuevo;
  }
  deleteColumns(col, count = 1) {
    this._recorrerColumnas(col + count, -count);
    this.merges = this.merges.filter(m => m.c2 < col || m.c1 >= col + count || (m.c1 < col && m.c2 >= col + count))
      .map(m => { if (m.c1 >= col + count) { m.c1 -= count; m.c2 -= count; } else if (m.c2 >= col + count) { m.c2 -= count; } return m; });
    return this;
  }
  deleteColumn(col) { return this.deleteColumns(col, 1); }
  insertColumnsAfter(col, count = 1) {
    this._recorrerColumnas(col + 1, count);
    // Insertar dentro de una combinación la ensancha; las que están a la derecha se desplazan
    this.merges.forEach(m => { if (m.c1 > col) { m.c1 += count; m.c2 += count; } else if (m.c2 > col) { m.c2 += count; } });
  }
  clear() { this.grid = {}; return this; }

  protect() {
    return {
      setDescription: function(d) { this.desc = d; return this; },
      getEditors: function() { return []; },
      removeEditor: function() {},
      setUnprotectedRanges: function(r) { this.unprotected = r; return this; }
    };
  }

  getProtections() { return []; }

  // Como Google: renombrar mantiene la hoja (y su contenido) bajo el nombre nuevo
  setName(nombre) {
    if (this.spreadsheet && this.spreadsheet.sheets) {
      this.spreadsheet.sheets.delete(this.name);
      this.spreadsheet.sheets.set(nombre, this);
    }
    this.name = nombre;
    return this;
  }

  // ID numérico estable por nombre (como el gid de Google)
  getSheetId() {
    let h = 0;
    for (const ch of String(this.name)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return h;
  }
}

let _siguienteLibro = 1;
class MockSpreadsheet {
  constructor() {
    this.sheets = new Map();
    this._id = `MOCK_LIBRO_${_siguienteLibro++}`;
  }

  getId() { return this._id; }
  getUrl() { return `https://docs.google.com/spreadsheets/d/${this._id}/edit`; }

  getSheetByName(name) {
    return this.sheets.get(name) || null;
  }

  insertSheet(name) {
    const sheet = new MockSheet(name, this);
    this.sheets.set(name, sheet);
    return sheet;
  }

  deleteSheet(sheet) {
    if (sheet && sheet.name) {
      this.sheets.delete(sheet.name);
    }
  }

  getSheets() {
    return Array.from(this.sheets.values());
  }

  toast(msg) {}
}

const globalActiveSpreadsheet = new MockSpreadsheet();

const MockSpreadsheetApp = {
  getActiveSpreadsheet: () => globalActiveSpreadsheet,
  openById: (id) => globalActiveSpreadsheet,
  getUi: () => ({
    createMenu: () => ({
      addItem: function() { return this; },
      addSeparator: function() { return this; },
      addSubMenu: function() { return this; },
      addToUi: function() {}
    }),
    alert: () => "OK",
    ButtonSet: { OK: "OK", YES_NO: "YES_NO" },
    Button: { YES: "YES", NO: "NO", OK: "OK" }
  }),
  flush: () => { _aplicarPendientes(); }
};

const MockLock = {
  tryLock: () => true,
  releaseLock: () => {}
};

const MockLockService = {
  getScriptLock: () => MockLock,
  getUserLock: () => MockLock
};

const mockPropsStorage = {};
const MockProperties = {
  getProperty: (k) => mockPropsStorage[k] || null,
  setProperty: (k, v) => { mockPropsStorage[k] = String(v); },
  getProperties: () => ({ ...mockPropsStorage }),
  setProperties: (obj) => { Object.assign(mockPropsStorage, obj); },
  deleteProperty: (k) => { delete mockPropsStorage[k]; }
};

const MockPropertiesService = {
  getScriptProperties: () => MockProperties,
  getUserProperties: () => MockProperties
};

const MockSession = {
  getActiveUser: () => ({
    getEmail: () => "tester@lacrepeparisienne.com"
  })
};

const MockScriptApp = {
  getProjectTriggers: () => [],
  deleteTrigger: () => {},
  newTrigger: () => ({
    timeBased: function() { return this; },
    everyDays: function() { return this; },
    atHour: function() { return this; },
    after: function() { return this; },
    create: function() {}
  })
};

const MockHtmlService = {
  createHtmlOutputFromFile: (archivo) => ({
    archivo,
    setWidth: function() { return this; },
    setHeight: function() { return this; },
    setTitle: function(t) { this.titulo = t; return this; },
    addMetaTag: function() { return this; }
  })
};

module.exports = {
  MockSpreadsheetApp,
  MockLockService,
  MockPropertiesService,
  MockSession,
  MockScriptApp,
  MockHtmlService,
  globalActiveSpreadsheet
};
