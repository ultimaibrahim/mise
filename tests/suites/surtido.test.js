/**
 * Suite de Pruebas: 🚚 SURTIDO RÁPIDO v1.7.5 (CANT. FINAL + coloreado por fila) — código real de pda/ y pdm/ en VM
 */
const assert = require("assert");
const { crearContextoTienda } = require("../mocks/tiendaVm");

// Los arreglos creados dentro de la VM tienen otro prototipo: comparar por valor
const eq = (a, b, msg) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), msg);

function _sembrarPedido(ss) {
  const p = ss.insertSheet("📋 PEDIDO DIARIO");
  // No, CAT, PRODUCTO, UNIDAD, SALDO, CANT.PEDIR, DIF, H RECIBIDA, I ESTADO, J, K
  p.getRange(4, 1, 4, 11).setValues([
    [1, "REF", "Fresa",  "DOMO", 10, 5, "", 5,  "COMPLETO", "", ""],
    [2, "LAC", "Leche",  "LT",   8,  4, "", 2,  "PARCIAL",  "", ""],
    [3, "ABA", "Harina", "KG",   3,  2, "", "", "",         "", ""],
    [4, "ABA", "Azúcar", "KG",   3,  0, "", "", "",         "", ""]
  ]);
  return p;
}

function _editar(sandbox, ss, fila, col, valor) {
  const s = ss.getSheetByName("🚚 SURTIDO RÁPIDO");
  const range = s.getRange(fila, col);
  range.setValue(valor);
  sandbox.onEdit({ range, value: valor });
}

function runSurtidoTests() {
  console.log("\n🧪 [TEST SUITE] 🚚 SURTIDO RÁPIDO — CANT. FINAL y coloreado por fila (PDA / PDM)");

  [["pda", "miseAuthPDA.js"], ["pdm", "miseAuthPDM.js"]].forEach(([dir, archivo]) => {
    const tag = dir.toUpperCase();
    const { ss, sandbox, _formulas } = crearContextoTienda(dir, archivo);
    const pedido = _sembrarPedido(ss);
    sandbox._generarSurtidoRapidoInternal(false);
    const s = ss.getSheetByName("🚚 SURTIDO RÁPIDO");

    // 1. Estructura: 8 columnas (C = nombre y D = pedido siguen en su lugar: el código los lee), CANT. FINAL al final;
    //    congelada solo la vista B "producto + lo pedido" (1.7.6w: cabe en un iPhone)
    eq(s.getRange(3, 1, 1, 8).getValues()[0],
      ["No", "PRODUCTO · PEDIDO", "PRODUCTO", "CANT. PEDIDA", "RECIBIDA", "✅ COMPLETO", "❌ NO LLEGÓ", "FINAL"], `${tag}: encabezados`);
    assert.strictEqual(s.frozenCols, 2, `${tag}: congelada solo la vista (A:B)`);
    for (let r = 4; r <= 6; r++) {
      assert.strictEqual(_formulas[`🚚 SURTIDO RÁPIDO!${r},2`],
        `=IF(C${r}="","",IF(LEN(C${r})>24,LEFT(C${r},23)&"…",C${r})&CHAR(10)&"pidió "&D${r})`, `${tag}: vista B fila ${r} (nombre recortado + pedido)`);
    }
    assert.strictEqual(s.getRange(7, 3).getValue(), "", `${tag}: solo productos con pedido > 0`);
    for (let r = 4; r <= 6; r++) {
      assert.strictEqual(_formulas[`🚚 SURTIDO RÁPIDO!${r},8`],
        `=IF($G${r}=TRUE,0,IF($E${r}<>"",$E${r},IF($F${r}=TRUE,$D${r},"")))`, `${tag}: fórmula CANT. FINAL fila ${r}`);
    }
    console.log(`  ✓ ${tag}: 8 columnas, CANT. FINAL por fórmula y vista congelada «producto + pedido»`);

    // 2. Estado inicial desde el pedido: una sola fuente por fila
    eq(s.getRange(4, 5, 3, 3).getValues(),
      [["", true, false], [2, false, false], ["", false, false]], `${tag}: COMPLETO→✅, PARCIAL→número, sin registro→vacío`);

    // 3. Colores: 5 reglas sobre A:H basadas en H vs D, en orden de prioridad
    const cf = s._cf;
    eq(cf.map(r => r.color), ["#C8E6C9", "#FFCDD2", "#FFE0B2", "#E1F5FE", "#FFF9C4"], `${tag}: paleta y orden`);
    cf.forEach(r => assert.ok(r.formula.includes("$H4"), `${tag}: regla basada en CANT. FINAL`));
    eq(s._proteccion.libres.map(g => [g.col, g.numCols]), [[5, 1], [6, 2]], `${tag}: solo E, F, G editables`);
    console.log(`  ✓ ${tag}: fila completa coloreada por CANT. FINAL (exacto / no llegó / de menos / de más / sin registrar)`);

    // 4. Captura: escribir cantidad limpia ✅/❌ y sincroniza PEDIDO DIARIO
    _editar(sandbox, ss, 6, 5, "1,5");
    eq(s.getRange(6, 5, 1, 3).getValues()[0], [1.5, false, false], `${tag}: número con coma`);
    eq(pedido.getRange(6, 8, 1, 2).getValues()[0], [1.5, "PARCIAL"], `${tag}: sync parcial`);

    _editar(sandbox, ss, 6, 6, true); // ✅ sobre una fila con número → deja una sola fuente
    eq(s.getRange(6, 5, 1, 3).getValues()[0], ["", true, false], `${tag}: ✅ limpia número`);
    eq(pedido.getRange(6, 8, 1, 2).getValues()[0], [2, "COMPLETO"], `${tag}: sync completo`);

    _editar(sandbox, ss, 6, 7, true); // ❌ reemplaza a ✅
    eq(s.getRange(6, 5, 1, 3).getValues()[0], ["", false, true], `${tag}: ❌ exclusivo`);
    eq(pedido.getRange(6, 8, 1, 2).getValues()[0], [0, "INEXISTENTE"], `${tag}: sync inexistente`);

    _editar(sandbox, ss, 6, 7, false); // desmarcar → sin registro
    eq(pedido.getRange(6, 8, 1, 2).getValues()[0], ["", ""], `${tag}: desmarcar limpia`);

    _editar(sandbox, ss, 5, 5, 6); // de más
    eq(pedido.getRange(5, 8, 1, 2).getValues()[0], [6, "EXCEDENTE"], `${tag}: excedente`);
    console.log(`  ✓ ${tag}: captura libre, ✅/❌ excluyentes y sincronización con PEDIDO DIARIO`);
  });
}

module.exports = { runSurtidoTests };
