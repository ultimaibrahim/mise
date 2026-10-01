/**
 * Suite de Pruebas: 📋 Catálogo amigable (1.7.6o) — código real de Bodega en VM
 * Libro realista: fila 2 con los viejos botones por lote (A2:B2 combinada + casillas). Resultado: etiquetas claras en
 * fila 2 sin combinaciones, validaciones que rechazan lo inválido, técnicas ocultas y SOLO ACTIVO + MÍN/MÁX editables.
 */
const assert = require("assert");
const { crearContextoBDG } = require("../mocks/bdgVm");

function runCatalogoTests() {
  console.log("\n🧪 [TEST SUITE] 📋 Catálogo amigable (híbrido hoja + Powerhouse)");
  const { ss, sandbox, validaciones } = crearContextoBDG();
  const headers = ["No", "CATEGORÍA", "PRODUCTO", "PRESENTACION", "UNIDAD", "ACTIVO", "MÍN_BA", "MÁX_BA", "STOCK_BA",
    "MÍN_BM", "MÁX_BM", "STOCK_BM", "SELECCIONAR", "MÍN_Q_BA", "MÁX_Q_BA", "MÍN_Q_BM", "MÁX_Q_BM", "PICKING_BA", "PICKING_BM"];
  const m = ss.insertSheet("MAESTRO"); // nombre anterior: el código lo encuentra igual
  m.getRange(3, 1, 1, headers.length).setValues([headers]);
  m.getRange(4, 1, 2, headers.length).setValues([
    [1, "FRUTAS", "Fresa", "DOMO", "kg", "SÍ", 2, 6, 0, 1, 4, 0, false, 1, 3, 1, 3, 1, 1],
    [2, "LÁCTEOS", "Leche", "LT", "lt", "SÍ", 3, 9, 0, 2, 5, 0, false, 1, 2, 1, 2, 2, 2]]);
  m.getRange("A2:B2").merge();                       // viejo "⚠️ Acciones por lote:"
  m.getRange(2, 4).setValue(false);                  // vieja casilla Desactivar
  const ocultas = [];
  m.hideColumns = (c, k = 1) => { for (let i = 0; i < k; i++) ocultas.push(c + i); return m; };
  m.showColumns = () => { ocultas.length = 0; return m; };

  sandbox.restaurarValidacionesMaestro();
  sandbox.protegerMaestroSeguro();
  const col = (h) => headers.indexOf(h) + 1;

  // Etiquetas claras en fila 2, sin combinaciones ni casillas viejas
  assert.strictEqual(m.getRange(2, col("MÍN_BA")).getValue(), "Andares\nbodega · mín.", "Etiqueta clara sobre MÍN_BA");
  assert.strictEqual(m.getRange(2, col("MÁX_Q_BM")).getValue(), "Mercado\ntienda · máx.", "Etiqueta clara sobre MÁX_Q_BM");
  assert.strictEqual(m.getRange(2, col("ACTIVO")).getValue(), "¿Activo?", "Etiqueta de ACTIVO");
  assert.strictEqual(m.getRange(2, 4).getValue(), "", "La casilla vieja de Desactivar desapareció");
  assert.ok(m.merges.every(r => r.r1 !== 2), "Fila 2 sin celdas combinadas");
  assert.strictEqual(m.getRange(3, col("MÍN_BA")).getValue(), "MÍN_BA", "Fila 3 conserva los nombres técnicos");
  console.log("  ✓ Fila 2: etiquetas claras con notas (sin combinaciones); fila 3 técnica intacta");

  // Validaciones que rechazan
  const v = (h) => validaciones[`MAESTRO!4,${col(h)}`];
  assert.ok(v("ACTIVO") && v("ACTIVO").values.join() === "SÍ,NO" && v("ACTIVO").allowInvalid === false, "ACTIVO: solo SÍ/NO, rechaza lo demás");
  assert.ok(/ISNUMBER\(G4\), G4>=0, OR\(H4="", G4<=H4\)/.test(v("MÍN_BA").formula) && v("MÍN_BA").allowInvalid === false, "MÍN: número ≥ 0 y no mayor que el máximo");
  assert.ok(/ISNUMBER\(H4\), H4>=0, OR\(G4="", H4>=G4\)/.test(v("MÁX_BA").formula), "MÁX: número ≥ 0 y no menor que el mínimo");
  assert.ok(v("MÍN_Q_BM") && v("MÁX_Q_BM"), "También los de tienda (quiosco)");
  console.log("  ✓ Validaciones: ACTIVO solo SÍ/NO; MÍN/MÁX números ≥ 0 y en orden (rechazan lo inválido)");

  // Solo lo útil a la vista
  ["No", "PRESENTACION", "STOCK_BA", "SELECCIONAR", "PICKING_BA", "PICKING_BM"].forEach(h => assert.ok(ocultas.includes(col(h)), `${h} oculta`));
  ["PRODUCTO", "ACTIVO", "MÍN_BA", "MÁX_Q_BM"].forEach(h => assert.ok(!ocultas.includes(col(h)), `${h} visible`));
  console.log("  ✓ Visibles: categoría, producto, unidad, ACTIVO y los 8 MÍN/MÁX; lo técnico oculto");

  // Protección: solo ACTIVO + 8 MÍN/MÁX
  const libres = JSON.parse(JSON.stringify(m._proteccion.libres.map(r => r.col).sort((a, b) => a - b)));
  assert.deepStrictEqual(libres, ["ACTIVO", "MÍN_BA", "MÁX_BA", "MÍN_BM", "MÁX_BM", "MÍN_Q_BA", "MÁX_Q_BA", "MÍN_Q_BM", "MÁX_Q_BM"].map(col).sort((a, b) => a - b),
    "Editables: solo ACTIVO y los MÍN/MÁX (nada de SELECCIONAR ni fila 2)");
  console.log("  ✓ Protección: solo ACTIVO y los MÍN/MÁX quedan editables");
}

module.exports = { runCatalogoTests };
