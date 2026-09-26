/**
 * Suite de Pruebas: Guardia de entorno DEV (MiseDevEnv.js generado por scripts/mise-env.js)
 * Se omite si no existe el archivo generado (repo clonado sin scripts/mise-env.config.json).
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function _libro(id, formulas) {
  const celdas = Object.assign({}, formulas);
  const hoja = {
    getMaxRows: () => 10, getMaxColumns: () => 12,
    getRange: (r, c, nr, nc) => ({
      getFormulas: () => Array.from({ length: nr || 1 }, (_, i) =>
        Array.from({ length: nc || 1 }, (_, j) => celdas[`${r + i},${c + j}`] || "")),
      setFormula: (f) => { celdas[`${r},${c}`] = f; }
    })
  };
  return { ss: { getId: () => id, getSheets: () => [hoja] }, celdas };
}

function _cargar(file, ss, propsIniciales) {
  const props = Object.assign({}, propsIniciales);
  const sandbox = {
    console: { log() {}, error() {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, getActive: () => ({ toast() {} }) },
    PropertiesService: { getScriptProperties: () => ({
      getProperties: () => Object.assign({}, props),
      setProperties: (o) => Object.assign(props, o)
    }) }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(file, "utf8") + "\n;this.__env = MISE_DEV_ENV;", sandbox);
  return { props, env: sandbox.__env };
}

function runDevEnvTests() {
  console.log("\n🧪 [TEST SUITE] Guardia de entorno DEV (MiseDevEnv.js)");
  const root = path.join(__dirname, "..", "..");
  const archivos = ["bdg", "pda", "pdm"].map(d => path.join(root, d, "MiseDevEnv.js"));
  if (!archivos.every(f => fs.existsSync(f))) {
    console.log("  ⏭  Omitida: ejecuta `npm run env:gen` para generar MiseDevEnv.js");
    return;
  }

  archivos.forEach(file => {
    const dir = path.basename(path.dirname(file)).toUpperCase();
    const probe = _cargar(file, { getId: () => "__nadie__", getSheets: () => [] }, {}).env;
    const prodIds = Object.keys(probe.prodToDev);
    const prodPropio = prodIds.find(id => probe.prodToDev[id] === probe.libroDev);
    const prodOtro = prodIds.find(id => id !== prodPropio);

    // 1. En el libro de PROD no toca nada, aunque el archivo se haya subido por error
    const enProd = _libro(prodPropio, { "4,1": `=IMPORTRANGE("${prodOtro}", "X!A4:L")` });
    const r1 = _cargar(file, enProd.ss, { BODEGA_KEY: "BA", PDA_SPREADSHEET_ID: "prod" });
    assert.deepStrictEqual(r1.props, { BODEGA_KEY: "BA", PDA_SPREADSHEET_ID: "prod" }, `${dir}: no debe tocar props en PROD`);
    assert.ok(enProd.celdas["4,1"].includes(prodOtro), `${dir}: no debe tocar fórmulas en PROD`);

    // 2. En su libro DEV fuerza props y re-apunta IMPORTRANGE de PROD → DEV; conserva llaves ajenas
    const enDev = _libro(probe.libroDev, { "4,1": `=IMPORTRANGE("${prodOtro}", "X!A4:L")`, "1,1": "=SUM(B1:B3)" });
    const r2 = _cargar(file, enDev.ss, { BODEGA_KEY: "BA" });
    assert.strictEqual(r2.props.MISE_ENV, "DEV", `${dir}: MISE_ENV=DEV`);
    assert.strictEqual(r2.props.BODEGA_KEY, "BA", `${dir}: conserva BODEGA_KEY`);
    Object.values(r2.props).forEach(v => prodIds.forEach(id =>
      assert.ok(!String(v).includes(id), `${dir}: ninguna prop debe apuntar a PROD (${id})`)));
    assert.ok(enDev.celdas["4,1"].includes(probe.prodToDev[prodOtro]), `${dir}: IMPORTRANGE re-apuntado a DEV`);
    assert.strictEqual(enDev.celdas["1,1"], "=SUM(B1:B3)", `${dir}: fórmulas ajenas intactas`);
    console.log(`  ✓ ${dir}: inerte en PROD · fuerza conexiones DEV y re-apunta IMPORTRANGE en su libro DEV`);
  });
}

module.exports = { runDevEnvTests };
