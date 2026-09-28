/**
 * Suite de Pruebas: la versión visible (Acerca de) y la cabecera de cada archivo no pueden divergir
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

function runVersionTests() {
  console.log("\n🧪 [TEST SUITE] Versión única por libro (cabecera = Acerca de)");
  const root = path.join(__dirname, "..", "..");
  const versiones = {};
  [["bdg", "miseAuthBDG.js"], ["pda", "miseAuthPDA.js"], ["pdm", "miseAuthPDM.js"]].forEach(([dir, f]) => {
    const src = fs.readFileSync(path.join(root, dir, f), "utf8");
    const cab = (src.split("\n")[1].match(/v(\d+\.\d+\.\d+[a-z]?)/) || [])[1];
    const cons = (src.match(/const MISE_VERSION\s*=\s*"([^"]+)"/) || [])[1];
    assert.ok(cab && cons, `${dir}: debe tener cabecera con versión y MISE_VERSION`);
    assert.strictEqual(cons, cab, `${dir}: MISE_VERSION (${cons}) ≠ cabecera (v${cab})`);
    assert.ok(!/alert\("⚙️ Mise — v\d/.test(src), `${dir}: no debe quedar una versión escrita a mano en Acerca de`);
    versiones[dir] = cons;
  });
  console.log(`  ✓ Cabecera y Acerca de coinciden: BDG ${versiones.bdg} · PDA ${versiones.pda} · PDM ${versiones.pdm}`);
}

module.exports = { runVersionTests };
