/**
 * Suite de Pruebas: Kardex simplificado (código real en VM). La hoja 🏠 INICIO se retiró en 1.7.6e.
 */
const assert = require("assert");
const vm = require("vm");
const { crearContextoBDG } = require("../mocks/bdgVm");

function runKardexVistaTests() {
  console.log("\n🧪 [TEST SUITE] 📊 Kardex simplificado");
  const { ss, sandbox } = crearContextoBDG();
  const probe = ss.insertSheet("__p__");
  const sheetProto = Object.getPrototypeOf(probe);
  const rangeProto = Object.getPrototypeOf(probe.getRange(1, 1));
  ss.deleteSheet(probe);
  let gid = 100;
  ["setTabColor", "setHiddenGridlines"].forEach(m => { sheetProto[m] = function() { return this; }; });
  sheetProto.getSheetId = function() { return this._gid || (this._gid = gid++); };
  sheetProto.isSheetHidden = function() { return !!this.hidden; };
  sheetProto.hideColumns = function(c, n = 1) { this.ocultas = this.ocultas || new Set(); for (let i = 0; i < n; i++) this.ocultas.add(c + i); return this; };
  sheetProto.showColumns = function(c, n = 1) { this.ocultas = this.ocultas || new Set(); for (let i = 0; i < n; i++) this.ocultas.delete(c + i); return this; };
  rangeProto.setFormulas = function(m) { return this.setValues(m); };
  sandbox.SpreadsheetApp.getActiveSpreadsheet().moveActiveSheet = () => {};
  sandbox.SpreadsheetApp.getActiveSpreadsheet().setActiveSheet = () => {};

  const VMDate = vm.runInContext("Date", sandbox);
  const hoy = new VMDate(); const dow = (hoy.getDay() || 7) - 1;
  const lunes = new VMDate(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - dow);
  const maestro = ss.insertSheet("MAESTRO");
  maestro.getRange(3, 1, 1, 6).setValues([["No", "CATEGORÍA", "PRODUCTO", "PRESENTACION", "UNIDAD", "ACTIVO"]]);
  ["KARDEX_BA", "KARDEX_BM"].forEach(k => {
    const s = ss.insertSheet(k);
    s.getRange("G4").setValue(lunes);
    s.getRange(7, 1, 1, 5).setValues([[1, "REF", "Fresa", "DOMO", "kg"]]);
    s.getRange(2, 12).setValue("🟢 SEMANA 40 ACTUALIZADA");
  });
  ss.insertSheet("🗒 LOG");

  // 1. Kardex simplificado
  const kBA = ss.getSheetByName("KARDEX_BA");
  sandbox._simplificarVistaKardex(kBA);
  const visibles = [];
  for (let c = 1; c <= 30; c++) if (!kBA.ocultas.has(c)) visibles.push(c);
  assert.deepStrictEqual(visibles.slice(0, 3), [3, 5, 9], "Primeras visibles: PRODUCTO (C), UNIDAD (E), SALDO ANT (I)");
  assert.strictEqual(visibles.length, 3 + 21, "Más las 21 columnas de los 7 días");
  console.log("  ✓ Kardex: visibles solo PRODUCTO, UNIDAD, SALDO ANT y los 7 días");

  // Encabezado viejo (1.7.6s): etiquetas combinadas desfasadas, casillas de acciones y E4/I4 → limpio; G4 intacta
  {
    const k = ss.getSheetByName("KARDEX_BM");
    ["D3:E3", "F3:G3", "H3:I3", "J3:K3", "L4:M4", "O4:P4"].forEach(r => k.getRange(r).merge());
    k.getRange("D3").setValue("SEMANA"); k.getRange("E4").setValue("=ISOWEEKNUM(G4)"); k.getRange("N4").setValue(false);
    const g4Antes = k.getRange("G4").getValue();
    const ocultasF = [];
    const hideRowsPrevio = k.hideRows;
    k.hideRows = (r, n = 1) => { ocultasF.push([r, n]); return k; };
    sandbox._simplificarVistaKardex(k);
    k.hideRows = hideRowsPrevio;
    assert.strictEqual(k.getRange("G4").getValue(), g4Antes, "G4 (lunes de la semana) se conserva");
    assert.ok(k.merges.every(m => m.r1 > 4 || m.r2 < 3), "Sin combinaciones en las filas 3–4");
    assert.deepStrictEqual([k.getRange("D3").getValue(), k.getRange("E4").getValue(), k.getRange("N4").getValue()], ["", "", ""], "Etiquetas, E4 y casillas fuera");
    assert.ok(ocultasF.some(([r, n]) => r === 3 && n === 2), "Filas 3 y 4 ocultas");
    assert.strictEqual(k.getRange(5, 1).getValue(), "PRODUCTO", "Fila 5 sin 'DATOS DEL PRODUCTO' duplicado");
    assert.ok(/📦 Inventario Mercado/.test(k.getRange(2, 3).getValue()) && /^(✅|⏳) Semana/.test(k.getRange(2, 4).getValue()), "Fila 2: título y estado de la semana");
    console.log("  ✓ Encabezado: título, semana con fechas y leyenda; filas 3–4 limpias y ocultas; G4 intacta");

    // Ayudas visuales (1.7.6u)
    let reglas = [];
    k.getConditionalFormatRules = () => [];
    k.setConditionalFormatRules = (r) => { reglas = r; return k; };
    sandbox._simplificarVistaKardex(k);
    const conSemana = (r) => /\$G\$4<=TODAY\(\), TODAY\(\)<\$G\$4\+7/.test(r.formula || "");
    const hoy = reglas.filter(r => /\)=WEEKDAY\(TODAY\(\),2\)-1/.test(r.formula || ""));
    const otros = reglas.filter(r => /<>WEEKDAY\(TODAY\(\),2\)-1/.test(r.formula || ""));
    assert.ok(hoy.length === 5 && otros.length === 5 && hoy.concat(otros).every(conSemana), "Hoy (5 reglas) y los demás días (5), solo si la semana activa incluye hoy");
    assert.ok(hoy.some(r => r.letra === "#1A281F") && otros.some(r => r.letra === "#9E9E9E"), "Datos: hoy oscuro y en negritas; otros días en gris");
    assert.ok(hoy.some(r => r.color === "#2E5D4B") && otros.every(r => !r.color || r.color !== "#FFF4C2"), "Encabezado de hoy más intenso, sin el amarillo anterior");
    assert.ok(reglas.indexOf(reglas.find(r => r.menorQue === 0)) === 0, "El saldo negativo va primero (gana sobre el atenuado)");
    const neg = reglas.find(r => r.menorQue === 0), cero = reglas.find(r => r.igualA === 0);
    assert.ok(neg && neg.color === "#FFCDD2" && neg.ranges.length === 7 && neg.ranges.every(rg => (rg.col - 12) % 3 === 0), "Saldo negativo en rojo en las 7 columnas SLD");
    assert.ok(cero && cero.letra === "#C9C9C9", "Saldos en cero atenuados");
    console.log("  ✓ Inventario: columna de hoy resaltada, saldo negativo en rojo y ceros atenuados");
  }


}

module.exports = { runKardexVistaTests };
