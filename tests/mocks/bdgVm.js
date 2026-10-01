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
  ["setFontFamily", "setFontStyle", "setWrap", "clearDataValidations"].forEach(m => { if (!rangeProto[m]) rangeProto[m] = function() { return this; }; });
  rangeProto.setNote = function(t) { this.sheet._notas = this.sheet._notas || {}; this.sheet._notas[`${this.row},${this.col}`] = t; return this; };
  ["clearConditionalFormatRules", "setConditionalFormatRules", "setHiddenGridlines", "showRows", "hideRows", "hideColumns", "showColumns"]
    .forEach(m => { if (!sheetProto[m]) sheetProto[m] = function() { return this; }; });
  if (!sheetProto.getConditionalFormatRules) sheetProto.getConditionalFormatRules = function() { return []; };
  if (!sheetProto.getMaxColumns) sheetProto.getMaxColumns = function() { return Math.max(this.getLastColumn(), 30); };
  // Protecciones registrables (igual que tiendaVm): sheet._proteccion.libres = rangos editables
  sheetProto.getProtections = function() { return this._proteccion ? [this._proteccion] : []; };
  sheetProto.protect = function() {
    const p = { libres: [], setDescription: () => p, setWarningOnly: () => p, canDomainEdit: () => false, setDomainEdit: () => p,
      removeEditors: () => p, addEditor: () => p, getEditors: () => [], remove: () => { this._proteccion = null; },
      setUnprotectedRanges: (r) => { p.libres = r; return p; }, getUnprotectedRanges: () => p.libres };
    this._proteccion = p;
    return p;
  };
  const validaciones = {};
  rangeProto.setDataValidation = function(rule) { validaciones[`${this.sheet.name}!${this.row},${this.col}`] = rule; return this; };

  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    SpreadsheetApp: Object.assign({}, MockSpreadsheetApp, {
      ProtectionType: { SHEET: "SHEET", RANGE: "RANGE" }, BorderStyle: { SOLID: "SOLID" },
      getActiveSpreadsheet: () => ss,
      getActive: () => ss,
      setActiveSheet: () => {},
      // Registra fórmula/condición/colores/rangos de cada regla (como tiendaVm) para poder verificarlas
      newConditionalFormatRule: () => {
        const regla = {};
        const b = new Proxy({}, { get: (_, prop) => {
          if (prop === "build") return () => regla;
          if (prop === "whenFormulaSatisfied") return (f) => { regla.formula = f; return b; };
          if (prop === "whenNumberLessThan") return (x) => { regla.menorQue = x; return b; };
          if (prop === "whenNumberEqualTo") return (x) => { regla.igualA = x; return b; };
          if (prop === "setBackground") return (c) => { regla.color = c; return b; };
          if (prop === "setFontColor") return (c) => { regla.letra = c; return b; };
          if (prop === "setRanges") return (r) => { regla.ranges = r; return b; };
          return () => b;
        } });
        return b;
      },
      newDataValidation: () => {
        const rule = { values: null };
        const b = {
          requireValueInList(v) { rule.values = v; return b; },
          requireFormulaSatisfied(f) { rule.formula = f; return b; },
          requireNumberGreaterThanOrEqualTo(x) { rule.min = x; return b; },
          requireDate() { rule.fecha = true; return b; },
          setAllowInvalid(v) { rule.allowInvalid = v; return b; },
          setHelpText(t) { rule.help = t; return b; },
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
  const code = ["miseAuthBDG.js", "MiseKardexEngine.js", "MiseEstado.js", "MiseDevTools.js"]
    .map(f => fs.readFileSync(path.join(bdgDir, f), "utf8")).join("\n");
  // Exponer las constantes top-level (const no se cuelga del global de la VM)
  vm.runInContext(code + "\n;this.__c = { SHEET_ENTRADAS, ENTRADAS_START, ENTRADAS_HOY, DIAS, KARDEX_START }; this.MiseSmartSync = MiseSmartSync;", sandbox);
  return { ss, sandbox, validaciones };
}

module.exports = { crearContextoBDG };
