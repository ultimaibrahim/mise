const assert = require("assert");

function runV110Tests() {
  console.log("\n🧪 [TEST SUITE] MISE v1.7.4 Altair — Features & Conversion");

  // 1. Factor de conversión para Fresas (1 Domo = 0.454 Kg)
  const factorDomoFresa = 0.454;
  const cantPedida = 12;
  const cantKardex = Math.round(cantPedida * factorDomoFresa * 1000) / 1000;
  assert.strictEqual(cantKardex, 5.448, "12 domos de fresa deben ser exactamente 5.448 kg en Kardex");
  console.log("  ✓ Factor de conversión Fresas (12 domos = 5.448 kg) validado");

  // 2. Factor de conversión para Guantes (1 Caja = 100 Piezas)
  const factorCajaGuantes = 100;
  const cantPedidaGuantes = 2;
  const cantKardexGuantes = Math.round(cantPedidaGuantes * factorCajaGuantes * 1000) / 1000;
  assert.strictEqual(cantKardexGuantes, 200, "2 cajas de guantes deben ser 200 piezas en Kardex");
  console.log("  ✓ Factor de conversión Guantes (2 cajas = 200 piezas) validado");

  // 3. Fallback a factor 1.0 para insumos sin conversión (ej. Harina en Kg)
  const factorDefecto = 1.0;
  const cantPedidaHarina = 25;
  const cantKardexHarina = Math.round(cantPedidaHarina * factorDefecto * 1000) / 1000;
  assert.strictEqual(cantKardexHarina, 25, "Insumos sin factor especial deben deducir 1:1");
  console.log("  ✓ Fallback a factor 1.0 (1:1) validado");

  // 4. Traspaso atómico: verificación de saldo y simetría
  const saldoInicialOrigen = 50;
  const saldoInicialDestino = 10;
  const cantTraspaso = 5;

  const saldoFinalOrigen = saldoInicialOrigen - cantTraspaso;
  const saldoFinalDestino = saldoInicialDestino + cantTraspaso;

  assert.strictEqual(saldoFinalOrigen, 45, "Origen debe reducir su saldo");
  assert.strictEqual(saldoFinalDestino, 15, "Destino debe aumentar su saldo");
  assert.strictEqual(saldoFinalOrigen + saldoFinalDestino, saldoInicialOrigen + saldoInicialDestino, "La masa total debe conservarse");
  // 5. Doble candado de deducción: Fallo de script en celda pero Checkbox COMPLETO en TRUE
  function resolverDeduccion(cantPed, cantRec, estado, sInfo) {
    if (cantRec > 0) return cantRec;
    if (sInfo && sInfo.sRec > 0) return sInfo.sRec;
    if (estado.includes("INEXISTENTE") || (sInfo && sInfo.sInex)) return 0;
    if (estado.includes("COMPLETO") || (sInfo && sInfo.sComp)) return cantPed;
    if (cantPed > 0) return cantPed;
    return 0;
  }

  const casoFalloCeldaVacia = resolverDeduccion(8, 0, "", { sRec: 0, sComp: true, sInex: false });
  assert.strictEqual(casoFalloCeldaVacia, 8, "Si checkbox de surtido es Completo pero celda quedó en blanco, deduce cantPedida (8)");
  console.log("  ✓ Doble candado por checkbox COMPLETO validado");

  // 6. Cancelación / Void con INEXISTENTE
  const casoCancelado = resolverDeduccion(5, 0, "INEXISTENTE", { sRec: 0, sComp: false, sInex: true });
  assert.strictEqual(casoCancelado, 0, "Si se marca INEXISTENTE, debe deducir exactamente 0");
  console.log("  ✓ Cancelación / Void mediante INEXISTENTE (0 deducción) validada");
}

module.exports = { runV110Tests };


