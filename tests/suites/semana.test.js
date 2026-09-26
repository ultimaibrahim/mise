/**
 * Suite de Pruebas: Auto-avance semanal de KARDEX_BA / KARDEX_BM (código real de miseAuthBDG.js en VM)
 * Reproduce las condiciones que dejaban a una bodega sin avanzar:
 *  - Candado ya tomado por el mantenimiento dominical (no reentrante)
 *  - Candado ocupado por otro proceso (antes se contaba como avanzada sin hacerlo)
 *  - Límite de 30 s del onOpen simple (BA consumía el tiempo y BM quedaba a medias)
 */
const assert = require("assert");
const vm = require("vm");
const { crearContextoBDG } = require("../mocks/bdgVm");

function _lock(estado) {
  // estado: { held: bool (este proceso ya lo tiene), libre: bool (tryLock tendría éxito) }
  const l = {
    hasLock: () => estado.held,
    tryLock: () => { if (estado.libre) { estado.held = true; return true; } return false; },
    releaseLock: () => { estado.held = false; estado.liberaciones = (estado.liberaciones || 0) + 1; }
  };
  return { getScriptLock: () => l, getUserLock: () => l };
}

function _escenario(lockEstado) {
  const ctx = crearContextoBDG({ LockService: _lock(lockEstado) });
  const VMDate = vm.runInContext("Date", ctx.sandbox);
  const hoy = new VMDate();
  const dow = (hoy.getDay() || 7) - 1;
  // Semana activa = la semana pasada → ya venció
  const lunesPasado = new VMDate(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - dow - 7);
  ["KARDEX_BA", "KARDEX_BM"].forEach(k => {
    const s = ctx.ss.insertSheet(k);
    s.getRange("G4").setValue(lunesPasado);
    s.getRange(7, 1, 2, 5).setValues([[1, "REF", "Fresa", "DOMO", "kg"], [2, "LAC", "Leche", "LT", "lt"]]);
    s.getRange(7, 30, 2, 1).setValues([[5], [3]]); // SLD domingo
  });
  const g4 = (k) => ctx.ss.getSheetByName(k).getRange("G4").getValue().getTime();
  return { ctx, VMDate, lunesPasado, g4, semana: 7 * 86400000 };
}

function runSemanaTests() {
  console.log("\n🧪 [TEST SUITE] Auto-avance semanal de KARDEX (BA y BM)");

  // 1. Mantenimiento dominical: el llamador YA tiene el candado → ambas bodegas avanzan y no se suelta el candado ajeno
  {
    const lock = { held: true, libre: false };
    const { ctx, lunesPasado, g4, semana } = _escenario(lock);
    const n = ctx.sandbox._autoVerificarYAvanzarSemanaSilencioso(true);
    assert.strictEqual(n, 2, "Deben avanzar BA y BM");
    assert.strictEqual(g4("KARDEX_BA"), lunesPasado.getTime() + semana, "BA +7 días");
    assert.strictEqual(g4("KARDEX_BM"), lunesPasado.getTime() + semana, "BM +7 días");
    assert.strictEqual(lock.held, true, "No debe liberar el candado del mantenimiento");
    assert.strictEqual(ctx.ss.getSheetByName("KARDEX_BM").getRange(7, 9).getValue(), 5, "SLD domingo → SALDO ANT en BM");
    console.log("  ✓ Con el candado del mantenimiento: avanzan BA y BM sin soltarlo");
  }

  // 2. Candado ocupado por otro proceso → no avanza, no reporta avance falso, no archiva historial
  {
    const lock = { held: false, libre: false };
    const { ctx, lunesPasado, g4 } = _escenario(lock);
    const n = ctx.sandbox._autoVerificarYAvanzarSemanaSilencioso(true);
    assert.strictEqual(n, 0, "Sin candado no debe reportar avances");
    assert.strictEqual(g4("KARDEX_BA"), lunesPasado.getTime(), "BA sin cambios");
    assert.strictEqual(g4("KARDEX_BM"), lunesPasado.getTime(), "BM sin cambios");
    assert.ok(!ctx.ss.getSheetByName("HISTORIAL_BA"), "No debe archivar historial si no avanzó");
    console.log("  ✓ Candado ocupado: no avanza ni reporta avances falsos");
  }

  // 3. onOpen con presupuesto: si el tiempo se agota tras BA, BM queda intacta (no a medias) para la siguiente corrida
  {
    const lock = { held: false, libre: true };
    const { ctx, VMDate, lunesPasado, g4, semana } = _escenario(lock);
    let reloj = 0;
    const nowReal = VMDate.now;
    VMDate.now = () => (reloj += 10000); // cada consulta de reloj avanza 10 s
    const n = ctx.sandbox._autoVerificarYAvanzarSemanaSilencioso(true, 18000);
    VMDate.now = nowReal;
    assert.strictEqual(n, 1, "Solo BA alcanza a avanzar");
    assert.strictEqual(g4("KARDEX_BA"), lunesPasado.getTime() + semana, "BA avanzó");
    assert.strictEqual(g4("KARDEX_BM"), lunesPasado.getTime(), "BM intacta, sin estado a medias");
    assert.ok(!ctx.ss.getSheetByName("HISTORIAL_BM"), "BM no debe archivar historial parcial");
    // Siguiente corrida sin límite: BM se pone al día
    assert.strictEqual(ctx.sandbox._autoVerificarYAvanzarSemanaSilencioso(true), 1, "BM avanza en la siguiente corrida");
    assert.strictEqual(g4("KARDEX_BM"), lunesPasado.getTime() + semana, "BM al día");
    console.log("  ✓ Presupuesto de onOpen: BM no queda a medias y se pone al día en la siguiente corrida");
  }
}

module.exports = { runSemanaTests };
