/**
 * Suite de Pruebas: métodos que NO existen en Apps Script
 * Un método inexistente dentro de try/catch falla en silencio en producción (caso real: breakAtMerge
 * dejó sin pintar el badge de semana del Kardex desde v1.6.2). Esta lista crece con cada caso encontrado.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const INEXISTENTES = {
  "breakAtMerge": "breakApart()",
  "setFrozenColumn(": "setFrozenColumns()",
  "getSheetByID": "getSheetById()"
};

function runMetodosTests() {
  console.log("\n🧪 [TEST SUITE] Métodos inexistentes en Apps Script (fallan en silencio dentro de try/catch)");
  const root = path.join(__dirname, "..", "..");
  ["bdg", "tienda", "pda", "pdm"].forEach(dir => {
    fs.readdirSync(path.join(root, dir)).filter(f => /\.(js|html)$/.test(f) && f !== "MiseDevEnv.js").forEach(f => {
      const src = fs.readFileSync(path.join(root, dir, f), "utf8");
      Object.keys(INEXISTENTES).forEach(m => {
        assert.ok(!src.includes(m), `${dir}/${f} usa "${m}", que no existe en Apps Script; usa ${INEXISTENTES[m]}`);
      });
    });
  });
  console.log("  ✓ Ningún archivo usa métodos inexistentes conocidos");
}

module.exports = { runMetodosTests };
