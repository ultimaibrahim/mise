/**
 * Suite de Pruebas: VISTA_MOVIL enlaza MAESTRO ↔ KARDEX por PRODUCTO (no por posición)
 * Caso real: "desactivé Aderezo Ranch (fila 1 de MAESTRO) y en la tienda se desactivó el
 * Concentrado de Frutos Rojos (fila 1 del Kardex)".
 */
const assert = require("assert");
const { crearContextoBDG } = require("../mocks/bdgVm");

function runVistaTests() {
  console.log("\n🧪 [TEST SUITE] VISTA_MOVIL: ACTIVO / MÍN / MÁX / PICKING por producto");
  const { ss, sandbox } = crearContextoBDG();

  // Otras suites reemplazan setFormulas en el prototipo compartido: aquí debe escribir la celda
  const probe = ss.insertSheet("__p__");
  const rangeProto = Object.getPrototypeOf(probe.getRange(1, 1));
  ss.deleteSheet(probe);
  rangeProto.setFormulas = function(m) { return this.setValues(m); };

  const headers = ["No", "CATEGORÍA", "PRODUCTO", "PRESENTACION", "UNIDAD", "ACTIVO", "MÍN_BA", "MÁX_BA", "STOCK_BA",
    "MÍN_BM", "MÁX_BM", "STOCK_BM", "SELECCIONAR", "MÍN_Q_BA", "MÁX_Q_BA", "MÍN_Q_BM", "MÁX_Q_BM", "PICKING_BA", "PICKING_BM"];
  const maestro = ss.insertSheet("MAESTRO");
  maestro.getRange(3, 1, 1, headers.length).setValues([headers]);
  maestro.getRange(4, 1, 2, headers.length).setValues([
    [1, "ADEREZOS", "Aderezo Ranch", "BOT", "pza", "NO", 1, 2, 0, 1, 2, 0, false, 1, 2, 1, 2, 2, 2],
    [2, "FRUTAS",   "Concentrado de Frutos Rojos", "BOL", "kg", "SÍ", 1, 2, 0, 1, 2, 0, false, 1, 2, 1, 2, 1, 1]
  ]);

  // KARDEX en OTRO orden: Concentrado primero
  const k = ss.insertSheet("KARDEX_BA");
  k.getRange(7, 1, 2, 5).setValues([
    [2, "FRUTAS",   "Concentrado de Frutos Rojos", "BOL", "kg"],
    [1, "ADEREZOS", "Aderezo Ranch", "BOT", "pza"]
  ]);

  sandbox._buildVista("BA");
  const vista = ss.getSheetByName("VISTA_MOVIL_BA");
  const fila = (nombre) => { for (let r = 4; r <= 5; r++) if (vista.getRange(r, 3).getValue() === nombre) return r; return -1; };

  const rC = fila("Concentrado de Frutos Rojos"), rR = fila("Aderezo Ranch");
  assert.ok(rC > 0 && rR > 0, "Ambos productos en la vista");
  assert.strictEqual(vista.getRange(rC, 9).getValue(), "=MAESTRO!F5", "ACTIVO del Concentrado = su fila en MAESTRO (5)");
  assert.strictEqual(vista.getRange(rR, 9).getValue(), "=MAESTRO!F4", "ACTIVO del Ranch = su fila en MAESTRO (4)");
  assert.strictEqual(vista.getRange(rC, 12).getValue(), "=MAESTRO!R5", "PICKING del Concentrado = su fila en MAESTRO");
  assert.strictEqual(vista.getRange(rR, 12).getValue(), "=MAESTRO!R4", "PICKING del Ranch = su fila en MAESTRO");
  console.log("  ✓ Con MAESTRO y KARDEX en distinto orden, cada producto toma SU ACTIVO y SU PICKING");
}

module.exports = { runVistaTests };
