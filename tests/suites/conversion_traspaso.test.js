/**
 * Suite de Pruebas: modo traspaso en 📥 Registrar entradas y motor de conversión (1.7.6p) — código real de Bodega
 */
const assert = require("assert");
const vm = require("vm");
const { crearContextoBDG } = require("../mocks/bdgVm");
const { MockPropertiesService } = require("../mocks/gasMocks");

function runConversionTraspasoTests() {
  console.log("\n🧪 [TEST SUITE] 🔄 Traspasos desde Registrar entradas · ⚖️ conversión pedido → bodega");

  // ── 1. Modo traspaso ───────────────────────────────────────────────────────────────────
  {
    const { ss, sandbox } = crearContextoBDG();
    const K = sandbox.__c;
    const VMDate = vm.runInContext("Date", sandbox);
    const hoy = new VMDate();
    const dow = (hoy.getDay() || 7) - 1;
    const monday = new VMDate(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - dow);
    const m = ss.insertSheet("MAESTRO");
    m.getRange(3, 1, 1, 8).setValues([["No", "CATEGORÍA", "PRODUCTO", "PRESENTACION", "UNIDAD", "ACTIVO", "UNIDAD_TIENDA", "FACTOR_CONVERSION"]]);
    m.getRange(4, 1, 2, 8).setValues([[1, "REF", "Fresa", "DOM 454 g", "kg", "SÍ", "domo", 0.454], [2, "LAC", "Leche", "LT", "lt", "SÍ", "", ""]]);
    ["KARDEX_BA", "KARDEX_BM"].forEach(k => {
      const s = ss.insertSheet(k);
      s.getRange("G4").setValue(monday);
      s.getRange(7, 1, 2, 5).setValues([[1, "REF", "Fresa", "DOMO", "kg"], [2, "LAC", "Leche", "LT", "lt"]]);
    });
    sandbox._prepararHojaEntradas();
    const sh = sandbox._hoja(ss, K.SHEET_ENTRADAS);
    assert.strictEqual(sh.getRange("A2").getValue(), "📥 Entrada", "Modo por default: Entrada");
    // Distribución para celular (1.7.6v)
    const rango = (m) => [m.r1, m.c1, m.r2, m.c2].join(",");
    const merges = sh.merges.map(rango);
    assert.ok(merges.includes("1,1,1,3") && merges.includes("2,2,2,3"), "Título A1:C1 y día en B2:C2 (ya cabe)");
    assert.strictEqual(sh.getRange("D1").getValue(), "Enviar ⬇", "Etiqueta de la casilla Enviar arriba (D1)");
    assert.strictEqual(sh.getRange("B2").getValue(), K.ENTRADAS_HOY, "El día seleccionado se conserva al combinar");
    assert.deepStrictEqual(JSON.parse(JSON.stringify(sh.getRange(4, 3, 1, 2).getValues()[0])), ["ANDARES", "MERCADO"], "Encabezados cortos");

    sh.getRange("A2").setValue("🔄 Andares → Mercado");
    sandbox._aplicarModoEntradas(sh, true);             // lo que hace onEdit al cambiar A2
    assert.strictEqual(sh.getRange(4, 3).getValue(), "CANTIDAD", "Encabezado del modo traspaso");
    assert.deepStrictEqual([sh.getRange(K.ENTRADAS_START, 2).getValue(), sh.getRange(K.ENTRADAS_START + 1, 2).getValue()], ["domo", "lt"],
      "En traspaso la UNIDAD es la de pedido (domo) o la de bodega si no tiene");
    assert.ok(/Traspaso Andares → Mercado/.test(sh.getRange("A3").getValue()), "La fila 3 dice la dirección del traspaso");

    sh.getRange(K.ENTRADAS_START, 3, 2, 2).setValues([[2, ""], ["", 1]]);
    sandbox.procesarEntradasKardex();
    assert.ok(/solo se usa la columna CANTIDAD/.test(sh.getRange("A3").getValue()), "Usar la otra columna en traspaso: rechazo");
    const sal = 10 + dow * 3 + 1, ent = 10 + dow * 3;
    assert.strictEqual(sandbox._hoja(ss, "📦 Inventario Andares").getRange(7, sal).getValue(), "", "…y nada escrito");

    sh.getRange(K.ENTRADAS_START + 1, 4).setValue("");
    sandbox.procesarEntradasKardex();
    assert.strictEqual(sandbox._hoja(ss, "📦 Inventario Andares").getRange(7, sal).getValue(), 0.908, "Origen: SAL de Andares + 2 domos = 0.908 kg");
    assert.strictEqual(sandbox._hoja(ss, "📦 Inventario Mercado").getRange(7, ent).getValue(), 0.908, "Destino: ENT de Mercado + 0.908 kg");
    const t = sandbox._hoja(ss, "🔄 Traspasos");
    const fila = t.getRange(2, 1, 1, 11).getValues()[0];
    assert.ok(/^TRP-.+-1$/.test(fila[0]) && fila[2] === "Andares" && fila[3] === "Mercado" && fila[4] === "Fresa" && fila[5] === 2,
      "Folio en 🔄 Traspasos con origen, destino, producto y cantidad");
    assert.deepStrictEqual([fila[6], fila[7], fila[8]], ["domo", 0.454, 0.908], "Folio: unidad de pedido, factor y cantidad en bodega");
    assert.ok(/^✅ 1 traspaso\(s\) Andares → Mercado/.test(sh.getRange("A3").getValue()), "Resultado claro en la fila 3");
    assert.strictEqual(sh.getRange("A2").getValue(), "🔄 Andares → Mercado", "El modo se conserva tras enviar");
    // Volver a Entrada: la unidad regresa a la de bodega
    sh.getRange("A2").setValue("📥 Entrada");
    sandbox._aplicarModoEntradas(sh, true);
    assert.strictEqual(sh.getRange(K.ENTRADAS_START, 2).getValue(), "domo", "En entrada (1.7.7a) se captura en la unidad de pedido");
    console.log("  ✓ Modo traspaso en unidad de pedido (2 domos → 0.908 kg): resta en origen, suma en destino, folio con factor");
  }

  // ── 1b. Entradas con conversión (1.7.7a): pesado (kg exactos) y por presentación ─────────
  {
    const { ss, sandbox } = crearContextoBDG();
    const K = sandbox.__c;
    const VMDate = vm.runInContext("Date", sandbox);
    const hoy = new VMDate();
    const dow = (hoy.getDay() || 7) - 1;
    const monday = new VMDate(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - dow);
    const m = ss.insertSheet("MAESTRO");
    m.getRange(3, 1, 1, 9).setValues([["No", "CATEGORÍA", "PRODUCTO", "PRESENTACION", "UNIDAD", "ACTIVO", "UNIDAD_TIENDA", "FACTOR_CONVERSION", "RECEPCION_PESADA"]]);
    const prods = [
      [1, "FRU", "Fresa", "DOM 454 g", "kg", "SÍ", "dom", 0.454, "SÍ"],     // pesado, inventario en kg → directo
      [2, "FRU", "Plátano", "PZA 180 g", "pza", "SÍ", "", "", "SÍ"],       // pesado, inventario en piezas → ÷ 0.18
      [3, "DES", "Guantes", "CAJ 100 PZA", "pza", "SÍ", "caj", 100, ""],   // por presentación → × 100
      [4, "FRU", "Limón", "PZA", "pza", "SÍ", "", "", "SÍ"]];               // pesado sin peso por unidad → no se puede
    m.getRange(4, 1, prods.length, 9).setValues(prods);
    ["KARDEX_BA", "KARDEX_BM"].forEach(k => {
      const s = ss.insertSheet(k);
      s.getRange("G4").setValue(monday);
      s.getRange(7, 1, prods.length, 5).setValues(prods.map(p => p.slice(0, 5)));
    });
    sandbox._prepararHojaEntradas();
    const sh = sandbox._hoja(ss, K.SHEET_ENTRADAS);
    const uni = sh.getRange(K.ENTRADAS_START, 1, 4, 2).getValues().map(r => r[1]);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(uni)), ["kg", "kg", "caj", "kg"], "UNIDAD de captura: kg en pesados, caj por presentación");
    const ent = 10 + dow * 3;
    const inv = sandbox._hoja(ss, "📦 Inventario Andares");

    // Un pesado sin peso por unidad bloquea todo el envío (todo o nada)
    sh.getRange(K.ENTRADAS_START, 3, 4, 1).setValues([[4.2], [5], [3], [2]]);
    sandbox.procesarEntradasKardex();
    assert.ok(/No se puede convertir: Limón/.test(sh.getRange("A3").getValue()) && inv.getRange(7, ent).getValue() === "", "Limón sin peso por unidad: no se envía nada");

    sh.getRange(K.ENTRADAS_START + 3, 3).setValue("");
    sandbox.procesarEntradasKardex();
    assert.strictEqual(inv.getRange(7, ent).getValue(), 4.2, "Fresa: 4.2 kg exactos (inventario en kg)");
    assert.strictEqual(inv.getRange(8, ent).getValue(), 28, "Plátano: 5 kg ÷ 0.18 = 27.8 → 28 piezas");
    assert.strictEqual(inv.getRange(9, ent).getValue(), 300, "Guantes: 3 cajas × 100 = 300 pz");
    assert.ok(/Plátano 5 kg → 28 pza/.test(sh.getRange("A3").getValue()), "La fila 3 muestra las conversiones");
    console.log("  ✓ Entradas con conversión: pesados en kg exactos (→ piezas por peso de la presentación), cajas × factor; sin peso por unidad bloquea");
  }

  // ── 2. Conversión: la tienda pide en su unidad, Bodega descuenta en la suya ─────────────
  {
    const props = MockPropertiesService.getScriptProperties();
    const claves = ["PDA_SPREADSHEET_ID", "PDM_SPREADSHEET_ID", "BODEGA_ID_BA", "BODEGA_ID_BM", "BODEGA_URL_BA", "BODEGA_URL_BM",
      "PDA_SPREADSHEET_URL", "PDM_SPREADSHEET_URL", "PROCESSED_SURTIDO_TX_HASHES", "HISTORIAL_CIERRES"];
    const previas = {};
    claves.forEach(k => { previas[k] = props.getProperty(k); props.setProperty(k, ""); });
    props.setProperty("PDA_SPREADSHEET_ID", "ID_PDA");
    try {
      const { ss, sandbox } = crearContextoBDG();
      const tienda = new ss.constructor();
      sandbox.SpreadsheetApp.openById = (id) => { if (id !== "ID_PDA") throw new Error("sin acceso"); return tienda; };
      const buildVistaReal = sandbox._buildVista;
      sandbox._buildVista = () => {}; sandbox.sincronizarRemotamenteTiendasPush = () => {};
      const fecha = vm.runInContext("new Date(2026, 8, 29)", sandbox);
      const lunes = vm.runInContext("new Date(2026, 8, 28)", sandbox);
      const m = ss.insertSheet("MAESTRO");
      m.getRange(3, 1, 1, 8).setValues([["No", "CATEGORÍA", "PRODUCTO", "PRESENTACION", "UNIDAD", "ACTIVO", "UNIDAD_TIENDA", "FACTOR_CONVERSION"]]);
      m.getRange(4, 1, 3, 8).setValues([
        [1, "REF", "Fresa", "DOMO", "kg", "SÍ", "domo", 0.454],
        [2, "DES", "Guantes", "CAJA", "pz", "SÍ", "caja", 100],
        [3, "LAC", "Leche", "LT", "lt", "SÍ", "", 2]]);          // factor SIN unidad de pedido → no se aplica
      ["KARDEX_BA", "KARDEX_BM"].forEach(k => {
        const s = ss.insertSheet(k);
        s.getRange("G4").setValue(lunes);
        s.getRange(7, 1, 3, 5).setValues([[1, "REF", "Fresa", "DOMO", "kg"], [2, "DES", "Guantes", "CAJA", "pz"], [3, "LAC", "Leche", "LT", "lt"]]);
      });
      tienda.insertSheet("📋 PEDIDO DIARIO").getRange(4, 1, 3, 11).setValues([
        [1, "REF", "Fresa", "domo", "", 24, "", 24, "COMPLETO", "", ""],
        [2, "DES", "Guantes", "caja", "", 2, "", 2, "COMPLETO", "", ""],
        [3, "LAC", "Leche", "lt", "", 3, "", 3, "COMPLETO", "", ""]]);
      sandbox.MiseSmartSync.ejecutarDescuento(true, fecha);
      const SAL = 14;
      const k = sandbox._hoja(ss, "📦 Inventario Andares");
      assert.strictEqual(k.getRange(7, SAL).getValue(), 10.896, "24 domos de fresa × 0.454 = 10.896 kg");
      assert.strictEqual(k.getRange(8, SAL).getValue(), 200, "2 cajas de guantes × 100 = 200 pz");
      assert.strictEqual(k.getRange(9, SAL).getValue(), 3, "Factor sin unidad de pedido: no se aplica (la tienda pide en lt)");
      console.log("  ✓ Descuento: pedido × factor solo si el producto tiene unidad de pedido (24 domos → 10.896 kg; 2 cajas → 200 pz)");

      // La vista que leen las tiendas convierte saldo/ENT/SAL a la unidad de pedido (Kardex ÷ factor)
      // setFormulas fiel durante esta verificación (otras suites lo reemplazan en el prototipo compartido)
      const rp = Object.getPrototypeOf(ss.insertSheet("__p__").getRange(1, 1));
      ss.deleteSheet(ss.getSheetByName("__p__"));
      const setFormulasPrevio = rp.setFormulas;
      rp.setFormulas = function(mx) { mx.forEach((f, r) => f.forEach((v, c) => this.sheet._setCell(this.row + r, this.col + c, v))); return this; };
      try { buildVistaReal("BA"); } finally { rp.setFormulas = setFormulasPrevio; }
      const vista = ss.getSheetByName("VISTA_MOVIL_BA");
      const filaDe = (p) => { for (let r = 4; r <= 6; r++) if (vista.getRange(r, 3).getValue() === p) return r; return -1; };
      // (otras suites envuelven setFormulas en el prototipo compartido y anteponen "ƒ": se normaliza)
      const fFresa = String(vista.getRange(filaDe("Fresa"), 5).getValue()).replace(/^ƒ/, "");
      const fLeche = String(vista.getRange(filaDe("Leche"), 5).getValue()).replace(/^ƒ/, "");
      assert.ok(/^=IFERROR\(ROUND\(.+!AD7\/IF\(AND\(LEN\(MAESTRO!G4\)>0, N\(MAESTRO!H4\)>0\), MAESTRO!H4, 1\), 2\),0\)$/.test(fFresa),
        `Saldo de Fresa para la tienda = Kardex ÷ factor (en domos): ${fFresa}`);
      assert.ok(/^=IFERROR\(ROUND\(.+\/IF\(AND\(LEN\(MAESTRO!G6\)/.test(fLeche), "Leche también pasa por la regla (sin unidad de pedido → divide entre 1)");
      assert.strictEqual(vista.getRange(filaDe("Fresa"), 4).getValue(), "domo", "La tienda ve su unidad de pedido");
      console.log("  ✓ Vista para tiendas: saldo/ENT/SAL en la unidad de pedido (Kardex ÷ factor) con la misma regla del descuento");
    } finally {
      claves.forEach(k => props.setProperty(k, previas[k] || ""));
    }
  }
}

module.exports = { runConversionTraspasoTests };
