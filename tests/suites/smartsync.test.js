/**
 * Suite de Pruebas: descuento nocturno (MiseSmartSync.ejecutarDescuento) — código real de bdg/ en VM
 * Tiendas remotas emuladas (openById por ID). Verifica cantidades en Kardex, idempotencia al
 * re-ejecutar la misma fecha (el LOG_SURTIDO escrito en la 1a corrida no debe descontarse otra vez)
 * y el costo en llamadas (lista de idempotencia leída una vez, sin lecturas celda por celda en Kardex).
 */
const assert = require("assert");
const vm = require("vm");
const { crearContextoBDG } = require("../mocks/bdgVm");
const { MockPropertiesService } = require("../mocks/gasMocks");

function runSmartSyncTests() {
  console.log("\n🧪 [TEST SUITE] 🌙 MiseSmartSync: descuento nocturno idempotente y en bloque");
  const props = MockPropertiesService.getScriptProperties();
  const claves = ["PDA_SPREADSHEET_ID", "PDM_SPREADSHEET_ID", "BODEGA_ID_BA", "BODEGA_ID_BM", "BODEGA_URL_BA", "BODEGA_URL_BM",
    "PDA_SPREADSHEET_URL", "PDM_SPREADSHEET_URL", "PROCESSED_SURTIDO_TX_HASHES"];
  const previas = {};
  claves.forEach(k => { previas[k] = props.getProperty(k); props.setProperty(k, ""); });
  props.setProperty("PDA_SPREADSHEET_ID", "ID_PDA");
  props.setProperty("PDM_SPREADSHEET_ID", "ID_PDM");

  try {
    const { ss, sandbox } = crearContextoBDG();
    const tiendas = { ID_PDA: new ss.constructor(), ID_PDM: new ss.constructor() };
    sandbox.SpreadsheetApp.openById = (id) => { if (!tiendas[id]) throw new Error("sin acceso"); return tiendas[id]; };
    sandbox._buildVista = () => {};
    sandbox.sincronizarRemotamenteTiendasPush = () => {};

    const productos = [[1, "FRUTAS", "Fresa", "DOMO", "kg"], [2, "LÁCTEOS", "Leche", "LT", "lt"], [3, "ABARROTES", "Harina", "BOL", "kg"]];
    ["KARDEX_BA", "KARDEX_BM"].forEach(k => ss.insertSheet(k).getRange(7, 1, 3, 5).setValues(productos));
    const fechaVm = (y, m, d) => vm.runInContext(`new Date(${y}, ${m}, ${d})`, sandbox);   // Date del mismo realm (instanceof)
    const fecha = fechaVm(2026, 8, 29);        // martes → SAL en la columna 14
    const SAL = 14;
    ss.getSheetByName("KARDEX_BA").getRange(7, SAL).setValue(1);   // SAL previa de Fresa (p. ej. Entradas/traspaso)

    const pedido = (t, filas) => {
      const p = tiendas[t].insertSheet("📋 PEDIDO DIARIO");
      p.getRange(4, 1, filas.length, 11).setValues(filas);
    };
    //            No CAT        PROD      PRES   UNI  F(ped) G   H(rec) I(estado)    J   K
    pedido("ID_PDA", [[1, "FRUTAS", "Fresa", "DOMO", "kg", 2, "", 2, "COMPLETO", "", ""],
                      [2, "LÁCTEOS", "Leche", "LT", "lt", 3, "", "", "COMPLETO", "", ""],
                      [3, "ABARROTES", "Harina", "BOL", "kg", 1, "", "", "", "", ""]]);
    pedido("ID_PDM", [[1, "FRUTAS", "Fresa", "DOMO", "kg", 4, "", 3, "PARCIAL", "", ""],
                      [2, "LÁCTEOS", "Leche", "LT", "lt", "", "", "", "", "", ""],
                      [3, "ABARROTES", "Harina", "BOL", "kg", "", "", "", "", "", ""]]);

    const sal = (k, r) => ss.getSheetByName(k).getRange(r, SAL).getValue();
    const foto = () => [7, 8, 9].map(r => [sal("KARDEX_BA", r), sal("KARDEX_BM", r)]);

    // Contador de lecturas de la lista de idempotencia (antes: una por renglón procesado)
    let lecturasLedger = 0;
    const getOrig = props.getProperty;
    props.getProperty = (k) => { if (k === "PROCESSED_SURTIDO_TX_HASHES") lecturasLedger++; return getOrig(k); };

    const r1 = sandbox.MiseSmartSync.ejecutarDescuento(true, fecha);
    props.getProperty = getOrig;

    assert.strictEqual(sal("KARDEX_BA", 7), 3, "Andares Fresa: SAL previa 1 + recibido 2");
    assert.strictEqual(sal("KARDEX_BA", 8), 3, "Andares Leche: COMPLETO sin cantidad → lo pedido (3)");
    assert.strictEqual(sal("KARDEX_BA", 9), "", "Andares Harina: sin registro de recepción → no se descuenta");
    assert.strictEqual(sal("KARDEX_BM", 7), 3, "Mercado Fresa: PARCIAL 3");
    assert.strictEqual(r1.totalDescontados, 3, "3 insumos aplicados");
    assert.strictEqual(r1.totalVaciadosTiendas, 2, "Ambas tiendas vaciadas");
    assert.ok(lecturasLedger <= 2, `La lista de idempotencia se lee una vez por corrida (leída ${lecturasLedger} veces)`);
    console.log("  ✓ Descuenta solo lo recibido, suma sobre la SAL existente y lee la lista de idempotencia una sola vez");

    // Re-ejecución de la misma fecha (reintento de madrugada o botón manual): nada cambia
    const antes = JSON.stringify(foto());
    const r2 = sandbox.MiseSmartSync.ejecutarDescuento(true, fecha);
    assert.strictEqual(JSON.stringify(foto()), antes, "Re-ejecutar la misma fecha no vuelve a descontar desde 🗒 LOG_SURTIDO");
    assert.strictEqual(r2.totalDescontados, 0, "Segunda corrida: 0 aplicados");
    console.log("  ✓ Re-ejecutar la misma fecha no descuenta dos veces (el LOG_SURTIDO de la 1a corrida se reconoce)");

    // Respaldo desde el LOG: si la tienda ya registró y vació (Bodega no corrió a las 23:00), se descuenta una vez
    const fecha2 = fechaVm(2026, 8, 30);      // miércoles → SAL en la columna 17
    tiendas.ID_PDA.getSheetByName("🗒 LOG_SURTIDO").appendRow([fecha2, "Andares", "Harina", "ABARROTES", 2, 2, "COMPLETO"]);
    sandbox.MiseSmartSync.ejecutarDescuento(true, fecha2);
    sandbox.MiseSmartSync.ejecutarDescuento(true, fecha2);
    assert.strictEqual(ss.getSheetByName("KARDEX_BA").getRange(9, 17).getValue(), 2, "Harina desde el LOG: 2, una sola vez");
    console.log("  ✓ Vía de respaldo (LOG_SURTIDO de la tienda) descuenta una sola vez");
  } finally {
    claves.forEach(k => props.setProperty(k, previas[k] || ""));
  }
}

module.exports = { runSmartSyncTests };
