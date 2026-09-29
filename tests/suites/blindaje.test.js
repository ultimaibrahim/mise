/**
 * Suite de Pruebas: blindaje por capas (tienda)
 * Con cuentas propias en tienda, el onEdit SIMPLE no puede escribir en celdas protegidas (fallaba en silencio).
 * Con el instalable activo, el simple no hace nada y el instalable (como el dueño) hace todo.
 */
const assert = require("assert");
const { crearContextoTienda } = require("../mocks/tiendaVm");

function runBlindajeTests() {
  console.log("\n🧪 [TEST SUITE] 🔐 Blindaje por capas (tiendas)");
  const { ss, sandbox, props } = crearContextoTienda("pda", "miseAuthPDA.js");
  const pedido = ss.insertSheet("📋 PEDIDO DIARIO");
  pedido.getRange(4, 1, 1, 11).setValues([[1, "REF", "Fresa", "DOMO", 10, 5, "", "", "", "", ""]]);
  sandbox._generarSurtidoRapidoInternal(false);
  const surtido = ss.getSheetByName("🚚 SURTIDO RÁPIDO");
  const editar = (fn, valor) => { const range = surtido.getRange(4, 6); range.setValue(valor); sandbox[fn]({ range, value: valor }); };

  // 1. Con instalable activo, el onEdit SIMPLE (cuenta de tienda) no toca nada
  props.ONEDIT_INSTALABLE = "1";
  editar("onEdit", true);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(pedido.getRange(4, 8, 1, 2).getValues()[0])), ["", ""], "El simple no escribe");
  // 2. El instalable (como el dueño) sincroniza PEDIDO DIARIO
  editar("onEditTiendaInstalable", true);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(pedido.getRange(4, 8, 1, 2).getValues()[0])), [5, "COMPLETO"], "El instalable sincroniza H/I");
  console.log("  ✓ Con instalable activo: el onEdit simple se abstiene y el instalable sincroniza PEDIDO DIARIO");

  // 3. Hojas técnicas protegidas (solo el dueño) y las de sistema ocultas
  const sync = ss.insertSheet("_SYNC_BA");
  const log = ss.insertSheet("🗒 LOG_SURTIDO");
  let ocultada = false; sync.hideSheet = () => { ocultada = true; return sync; };
  sandbox._blindarHojasTecnicasTienda();
  assert.ok(sync._proteccion && log._proteccion, "_SYNC y LOG_SURTIDO protegidas");
  assert.ok(!pedido._proteccionTecnica, "PEDIDO no se trata como técnica");
  assert.ok(ocultada, "_SYNC oculta");
  console.log("  ✓ Hojas técnicas (_SYNC, 🗒 LOG_SURTIDO…) protegidas y las de sistema ocultas");
}

module.exports = { runBlindajeTests };
