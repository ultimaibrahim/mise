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
  const g4 = (k) => ctx.sandbox._hoja(ctx.ss, k === "KARDEX_BA" ? "📦 Inventario Andares" : k === "KARDEX_BM" ? "📦 Inventario Mercado" : k).getRange("G4").getValue().getTime(); // nombre nuevo o anterior
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
    assert.ok(/⏳ Semana \d+ · falta avanzar/.test(ctx.ss.getSheetByName("KARDEX_BM").getRange(2, 4).getValue()),
      "El encabezado de BM dice 'falta avanzar' si no avanzó");
    assert.ok(/^✅ Semana \d+ · \d\d\/\d\d al \d\d\/\d\d$/.test(ctx.ss.getSheetByName("KARDEX_BA").getRange(2, 4).getValue()), "BA: ✅ Semana N · lunes al domingo");
    // Siguiente corrida sin límite: BM se pone al día
    assert.strictEqual(ctx.sandbox._autoVerificarYAvanzarSemanaSilencioso(true), 1, "BM avanza en la siguiente corrida");
    assert.strictEqual(g4("KARDEX_BM"), lunesPasado.getTime() + semana, "BM al día");
    console.log("  ✓ Presupuesto de onOpen: BM no queda a medias, su badge avisa y se pone al día en la siguiente corrida");
  }

  // 5. HISTORIAL con bloque HUÉRFANO (archivado interrumpido): antes, "Debes seleccionar todas las celdas…"
  //    en cada intento y la bodega nunca volvía a avanzar sola
  {
    const lock = { held: false, libre: true };
    const { ctx, lunesPasado, g4, semana } = _escenario(lock);
    const h = ctx.ss.insertSheet("HISTORIAL_BM");
    h.getRange(5, 1, 2, 3).setValues([[1, "Fresa", "kg"], [2, "Leche", "lt"]]);
    h.getRange(2, 4, 1, 15).merge().setValue("SEMANA 38 (2026)");        // bloque completo
    h.getRange(5, 4, 2, 15).setValues([[1,0,0,0,0,0,0,0,0,0,0,0,0,0,5],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,3]]);
    h.getRange(2, 19, 1, 15).merge().setValue("SEMANA 39 (2026)");       // huérfano: sin datos debajo
    // Cada intento fallido insertaba 16 columnas dentro del huérfano (Google lo ensancha): 3 intentos
    for (let i = 0; i < 3; i++) h.insertColumnsAfter(19, 16);
    const n = ctx.sandbox._autoVerificarYAvanzarSemanaSilencioso(false);
    assert.strictEqual(g4("KARDEX_BM"), lunesPasado.getTime() + semana, "BM avanza pese al bloque huérfano");
    assert.strictEqual(n, 2, "Ambas bodegas avanzan");
    const encabezadosFila2 = h.getRange(2, 1, 1, 60).getMergedRanges().map(m => m.getColumn());
    assert.deepStrictEqual(JSON.parse(JSON.stringify(encabezadosFila2)), [4, 19], "Bloque nuevo ocupa el lugar del huérfano (aunque se haya ensanchado), sin encimarse");
    assert.deepStrictEqual([h.getRange(5, 33).getValue(), h.getRange(6, 33).getValue()], [5, 3], "Datos del bloque nuevo escritos (SLD FIN de Fresa y Leche)");
    console.log("  ✓ HISTORIAL con bloque huérfano: se limpia y la semana avanza (antes fallaba en cada intento)");
  }

  // 6. Red de seguridad: si el HISTORIAL horizontal falla por CUALQUIER causa, la semana avanza igual
  //    y los datos de la semana quedan en _HISTORIAL_RESPALDO
  {
    const lock = { held: false, libre: true };
    const { ctx, lunesPasado, g4, semana } = _escenario(lock);
    ctx.sandbox._guardarHistHorizontal = () => { throw new Error("Debes seleccionar todas las celdas de un intervalo combinado"); };
    const n = ctx.sandbox._autoVerificarYAvanzarSemanaSilencioso(true);
    assert.strictEqual(n, 2, "Ambas bodegas avanzan aunque el historial falle");
    assert.strictEqual(g4("KARDEX_BM"), lunesPasado.getTime() + semana, "BM avanzó");
    const r = ctx.ss.getSheetByName("_HISTORIAL_RESPALDO");
    assert.ok(r, "Existe el respaldo");
    const filas = r.getRange(2, 1, 4, 4).getValues().map(f => [f[0], f[3]]);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(filas)), [["BA", "Fresa"], ["BA", "Leche"], ["BM", "Fresa"], ["BM", "Leche"]], "Semana respaldada por bodega y producto");
    assert.strictEqual(r.getRange(5, 19).getValue(), 3, "SLD FIN de Leche (BM) respaldado");
    console.log("  ✓ Si el historial falla, la semana avanza igual y los datos quedan en _HISTORIAL_RESPALDO");
  }

  // 7. Caso real PROD: el título de KARDEX_BA combinado D2:AD2. El badge de BA separaba L2:P2 (pedazo de
  //    esa combinación); Apps Script difiere el error a la SIGUIENTE lectura = G4 de KARDEX_BM → BM nunca avanzaba
  {
    const lock = { held: false, libre: true };
    const { ctx, lunesPasado, g4, semana } = _escenario(lock);
    ["KARDEX_BA", "KARDEX_BM"].forEach(k => ctx.ss.getSheetByName(k).getRange(2, 4, 1, 27).merge());
    const n = ctx.sandbox._autoVerificarYAvanzarSemanaSilencioso(true);
    assert.strictEqual(g4("KARDEX_BM"), lunesPasado.getTime() + semana, "BM avanza aunque el título de BA esté combinado D2:AD2");
    assert.strictEqual(n, 2, "Ambas avanzan");
    const fila2 = ctx.ss.getSheetByName("KARDEX_BA").getRange(2, 1, 1, 30).getMergedRanges().map(m => [m.getColumn(), m.getLastColumn()]);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(fila2)), [[4, 9], [10, 30]], "Estado de semana D2:I2 y leyenda J2:AD2 (título en C2, sin combinar)");
    assert.ok(/^✅ Semana/.test(ctx.ss.getSheetByName("KARDEX_BM").getRange(2, 4).getValue()), "Encabezado de BM dibujado");
    assert.ok(/📦 Inventario Mercado/.test(ctx.ss.getSheetByName("KARDEX_BM").getRange(2, 3).getValue()), "Título con el nombre nuevo");
    console.log("  ✓ Título combinado D2:AD2: el badge ya no rompe el avance de Mercado (error diferido de Apps Script)");
  }

  // 4. onOpen INSTALABLE (sin tope de 30 s): pone al día AMBOS Kardex de una vez
  {
    const lock = { held: false, libre: true };
    const { ctx, VMDate, lunesPasado, g4, semana } = _escenario(lock);
    let reloj = 0;
    const nowReal = VMDate.now;
    VMDate.now = () => (reloj += 10000); // aunque cada paso "tarde", el instalable no tiene tope
    ctx.sandbox.onOpenBodegaInstalable({});
    VMDate.now = nowReal;
    assert.strictEqual(g4("KARDEX_BA"), lunesPasado.getTime() + semana, "BA avanzó");
    assert.strictEqual(g4("KARDEX_BM"), lunesPasado.getTime() + semana, "BM avanzó en la misma apertura");
    console.log("  ✓ onOpen instalable: Andares y Mercado avanzan en la misma apertura");
  }
}

module.exports = { runSemanaTests };
