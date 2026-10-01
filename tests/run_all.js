/**
 * Orquestador Principal de Testing Automatizado (Suite MISE)
 */
const { runBDGTests } = require('./suites/bdg.test');
const { runStoreTests } = require('./suites/pda_pdm.test');
const { runV110Tests } = require('./suites/v1_10_features.test');
const { runEntradasTests } = require('./suites/entradas.test');
const { runDevEnvTests } = require('./suites/dev_env.test');
const { runSemanaTests } = require('./suites/semana.test');
const { runSurtidoTests } = require('./suites/surtido.test');
const { runMigracionTests } = require('./suites/migracion.test');
const { runVistaTests } = require('./suites/vista.test');
const { runNivel1Tests } = require('./suites/nivel1.test');
const { runVersionTests } = require('./suites/version.test');
const { runPowerhouseTests } = require('./suites/powerhouse.test');
const { runSmartSyncTests } = require('./suites/smartsync.test');
const { runEstadoTests } = require('./suites/estado.test');
const { runLimpiezaTests } = require('./suites/limpieza.test');
const { runPasswordTests } = require('./suites/password.test');
const { runNombresTests } = require('./suites/nombres.test');
const { runCatalogoTests } = require('./suites/catalogo.test');
const { runMetodosTests } = require('./suites/metodos.test');
const { runTiendaUnicaTests } = require('./suites/tienda_unica.test');
const { runBlindajeTests } = require('./suites/blindaje.test');
const { runLogSurtidoTests } = require('./suites/log_surtido.test');
const { runKardexVistaTests } = require('./suites/kardex_vista.test');
const { execSync } = require('child_process');
require('../scripts/build-tienda').build(); // pda/ y pdm/ se generan desde tienda/

console.log("═════════════════════════════════════════════════════════════════");
console.log("🚀 SUITE MISE · RUNNER DE PRUEBAS AUTOMATIZADAS & TELEMETRÍA");
console.log("═════════════════════════════════════════════════════════════════");

try {
  // 1. Verificación sintáctica
  console.log("\n[FASE 1] Verificación Sintáctica Estricta (Node V8 VM)");
  execSync('node tests/check_syntax.js', { stdio: 'inherit' });

  // 2. Ejecutar suites unitarias / integración
  console.log("\n[FASE 2] Ejecución de Suites de Pruebas Unitarias & Invariantes");
  runBDGTests();
  runStoreTests();
  runV110Tests();
  runEntradasTests();
  runSemanaTests();
  runSurtidoTests();
  runMigracionTests();
  runVistaTests();
  runNivel1Tests();
  runPowerhouseTests();
  runSmartSyncTests();
  runEstadoTests();
  runLimpiezaTests();
  runPasswordTests();
  runNombresTests();
  runCatalogoTests();
  runMetodosTests();
  runTiendaUnicaTests();
  runBlindajeTests();
  runLogSurtidoTests();
  runKardexVistaTests();
  runVersionTests();
  runDevEnvTests();

  console.log("\n═════════════════════════════════════════════════════════════════");
  console.log("✨ TODAS LAS PRUEBAS AUTOMATIZADAS PASARON CON ÉXITO (0 FALLOS)");
  console.log("═════════════════════════════════════════════════════════════════\n");
  process.exit(0);
} catch (err) {
  console.error("\n💥 FALLO EN LA EJECUCIÓN DE PRUEBAS AUTOMATIZADAS:");
  console.error(err.message);
  process.exit(1);
}
