/**
 * Suite de Pruebas: fuente única de tiendas (tienda/ → pda/, pdm/)
 * Las copias generadas solo pueden diferir en la cabecera (sucursal) y MISE_SUCURSAL_DEFAULT.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { build } = require("../../scripts/build-tienda");

function runTiendaUnicaTests() {
  console.log("\n🧪 [TEST SUITE] Fuente única de tiendas (tienda/ → Andares y Mercado)");
  build();
  const root = path.join(__dirname, "..", "..");
  const pda = fs.readFileSync(path.join(root, "pda", "miseAuthPDA.js"), "utf8").split("\n");
  const pdm = fs.readFileSync(path.join(root, "pdm", "miseAuthPDM.js"), "utf8").split("\n");
  assert.strictEqual(pda.length, pdm.length, "Mismo número de líneas");
  const difieren = pda.map((l, i) => l !== pdm[i] ? i + 1 : 0).filter(Boolean);
  assert.deepStrictEqual(difieren, [2, 6, 8], "Solo difieren cabecera (2), guía de trazas (6) y sucursal por defecto (8)");
  assert.ok(pda[7].includes('key: "BA"') && pdm[7].includes('key: "BM"'), "Sucursal por defecto correcta");
  ["appsscript.json"].forEach(f => {
    assert.strictEqual(fs.readFileSync(path.join(root, "pda", f), "utf8"), fs.readFileSync(path.join(root, "tienda", f), "utf8"), `pda/${f} = fuente`);
    assert.strictEqual(fs.readFileSync(path.join(root, "pdm", f), "utf8"), fs.readFileSync(path.join(root, "tienda", f), "utf8"), `pdm/${f} = fuente`);
  });
  assert.ok(!/instalarActivadoresMedianochePD[AM]/.test(pda.join("\n")), "Instalador unificado");
  console.log("  ✓ Andares y Mercado se generan de una sola fuente y solo difieren en la sucursal");
}

module.exports = { runTiendaUnicaTests };
