/**
 * Suite de Pruebas: nombres de pestañas por tarea (1.7.6o) — código real de Bodega en VM
 * Antes de renombrar el código encuentra las hojas por su nombre anterior y las fórmulas usan el nombre REAL
 * (nunca #REF! a mitad del cambio); el renombrado es idempotente y ningún nombre viejo queda escrito en el código.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { crearContextoBDG } = require("../mocks/bdgVm");

function runNombresTests() {
  console.log("\n🧪 [TEST SUITE] 🏷️ Nombres de pestañas por tarea (compatibles con los anteriores)");
  const { ss, sandbox } = crearContextoBDG();
  const viejos = ["MAESTRO", "KARDEX_BA", "KARDEX_BM", "HISTORIAL_BA", "HISTORIAL_BM", "📥 ENTRADAS", "🔄 TRASPASOS", "🗒 LOG"];
  viejos.forEach(n => ss.insertSheet(n));

  // 1. Antes de renombrar: _hoja encuentra la hoja vieja y las fórmulas apuntan a su nombre real
  assert.strictEqual(sandbox._hoja(ss, "📋 Catálogo").getName(), "MAESTRO", "Nombre nuevo → hoja con nombre anterior");
  assert.strictEqual(sandbox._refHoja("📦 Inventario Andares"), "KARDEX_BA", "Fórmulas con el nombre real (sin #REF!)");
  assert.strictEqual(sandbox._nombreCanonico("KARDEX_BM"), "📦 Inventario Mercado", "onEdit reconoce la hoja vieja");

  // 2. Renombrar (Configurar / onOpen / cierre): todas, una sola vez
  const hechos = sandbox._renombrarHojasBDG();
  assert.strictEqual(hechos.length, 8, "Renombra las 8 pestañas visibles");
  ["📋 Catálogo", "📦 Inventario Andares", "📦 Inventario Mercado", "🗄 Semanas pasadas Andares", "🗄 Semanas pasadas Mercado",
   "📥 Registrar entradas", "🔄 Traspasos", "🗒 Registro del sistema"].forEach(n => assert.ok(ss.getSheetByName(n), `Existe "${n}"`));
  viejos.forEach(n => assert.ok(!ss.getSheetByName(n), `Ya no existe "${n}"`));
  assert.strictEqual(sandbox._refHoja("📦 Inventario Andares"), "'📦 Inventario Andares'", "Tras renombrar, las fórmulas usan el nombre nuevo (entre comillas)");
  assert.deepStrictEqual(Array.from(sandbox._renombrarHojasBDG()), [], "Idempotente");
  console.log("  ✓ Antes: encuentra las hojas viejas y las fórmulas usan su nombre real · Después: 8 pestañas por tarea, idempotente");

  // 3. Ningún nombre viejo escrito en el código de Bodega fuera del mapa NOMBRES_ANTERIORES
  const ROOT = path.join(__dirname, "..", "..");
  ["bdg/miseAuthBDG.js", "bdg/MiseKardexEngine.js", "bdg/MiseEstado.js", "bdg/MiseDevTools.js"].forEach(f => {
    let src = fs.readFileSync(path.join(ROOT, f), "utf8");
    src = src.replace(/const NOMBRES_ANTERIORES = \{[\s\S]*?\};/, "");
    const lineas = src.split("\n").filter(l => !/^\s*(\/\/|\*)/.test(l))
      .filter(l => /["'`](MAESTRO|KARDEX_B[AM]|HISTORIAL_B[AM]|📥 ENTRADAS|🔄 TRASPASOS|🗒 LOG)["'`]/.test(l) || /'KARDEX_B[AM]'!|`HISTORIAL_\$\{/.test(l));
    assert.deepStrictEqual(lineas, [], `${f}: nombres de pestaña viejos escritos en el código`);
  });
  console.log("  ✓ El código usa constantes: ningún nombre de pestaña viejo escrito a mano");
}

module.exports = { runNombresTests };
