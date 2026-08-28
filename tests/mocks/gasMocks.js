/**
 * Emulador en Memoria de Google Apps Script Runtime
 * Simula SpreadsheetApp, Sheet, Range, LockService, PropertiesService, Session
 */

class MockRange {
  constructor(sheet, row, col, numRows = 1, numCols = 1) {
    this.sheet = sheet;
    this.row = row;
    this.col = col;
    this.numRows = numRows;
    this.numCols = numCols;
  }

  getValue() {
    const vals = this.getValues();
    return vals[0] ? vals[0][0] : "";
  }

  setValue(val) {
    this.setValues([[val]]);
    return this;
  }

  getValues() {
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

  setFormula(formula) {
    this.sheet._setCell(this.row, this.col, formula);
    return this;
  }

  setFormulas(matrix) {
    return this.setValues(matrix);
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

  setFrozenRows(n) { this.frozenRows = n; return this; }
  setFrozenColumns(n) { this.frozenCols = n; return this; }
  setColumnWidth(col, width) { this.colWidths[col] = width; return this; }
  setRowHeight(row, height) { this.rowHeights[row] = height; return this; }
  hideSheet() { this.hidden = true; return this; }
  showSheet() { this.hidden = false; return this; }
  deleteRows(row, count = 1) {}
  insertRowsAfter(row, count = 1) {}
  deleteColumns(col, count = 1) {}
  insertColumnsAfter(col, count = 1) {}
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
}

class MockSpreadsheet {
  constructor() {
    this.sheets = new Map();
  }

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
  flush: () => {}
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
  setProperties: (obj) => { Object.assign(mockPropsStorage, obj); }
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
  createHtmlOutputFromFile: () => ({
    setWidth: function() { return this; },
    setHeight: function() { return this; },
    setTitle: function() { return this; }
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
