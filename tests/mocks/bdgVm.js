/**
 * Arranque compartido: carga el código real de bdg/ en una VM con los mocks GAS
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { MockSpreadsheetApp, MockLockService, MockPropertiesService, MockScriptApp, MockHtmlService } = require("./gasMocks");

function crearContextoBDG(opts = {}) {
  // Spreadsheet aislado para no contaminar las otras suites
  const base = MockSpreadsheetApp.getActiveSpreadsheet();
  const ss = new base.constructor();
  const sheetProto = Object.getPrototypeOf(ss.insertSheet("__probe__"));
  ss.deleteSheet(ss.getSheetByName("__probe__"));
  const rangeProto = Object.getPrototypeOf(ss.insertSheet("__probe2__").getRange(1, 1));
  ss.deleteSheet(ss.getSheetByName("__probe2__"));

  // Métodos que el emulador no trae y que usa la hoja de Entradas
  if (!rangeProto.merge)      rangeProto.merge = function() { return this; };
  if (!rangeProto.breakApart) rangeProto.breakApart = function() { return this; };
  if (!sheetProto.getMaxRows) sheetProto.getMaxRows = function() { return Math.max(this.getLastRow(), 200); };
  ["setFontFamily", "breakAtMerge", "setFontStyle"].forEach(m => { if (!rangeProto[m]) rangeProto[m] = function() { return this; }; });
  const validaciones = {};
  rangeProto.setDataValidation = function(rule) { validaciones[`${this.sheet.name}!${this.row},${this.col}`] = rule; return this; };

  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    SpreadsheetApp: Object.assign({}, MockSpreadsheetApp, {
      getActiveSpreadsheet: () => ss,
      getActive: () => ss,
      setActiveSheet: () => {},
      newDataValidation: () => {
        const rule = { values: null };
        const b = {
          requireValueInList(v) { rule.values = v; return b; },
          setAllowInvalid() { return b; },
          build() { return rule; }
        };
        return b;
      }
    }),
    LockService: opts.LockService || MockLockService,
    PropertiesService: MockPropertiesService,
    ScriptApp: MockScriptApp,
    HtmlService: MockHtmlService,
    Session: {
      getActiveUser: () => ({ getEmail: () => "tester@lacrepeparisienne.com" }),
      getEffectiveUser: () => ({ getEmail: () => "tester@lacrepeparisienne.com" }),
      getScriptTimeZone: () => "America/Mexico_City"
    },
    Utilities: { formatDate: (d) => d.toISOString().substring(11, 16) }
  };
  vm.createContext(sandbox);
  const bdgDir = path.join(__dirname, "..", "..", "bdg");
  const code = ["miseAuthBDG.js", "MiseKardexEngine.js"]
    .map(f => fs.readFileSync(path.join(bdgDir, f), "utf8")).join("\n");
  // Exponer las constantes top-level (const no se cuelga del global de la VM)
  vm.runInContext(code + "\n;this.__c = { SHEET_ENTRADAS, ENTRADAS_START, ENTRADAS_HOY, DIAS, KARDEX_START };", sandbox);
  return { ss, sandbox, validaciones };
}

module.exports = { crearContextoBDG };
