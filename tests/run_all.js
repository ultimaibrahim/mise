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
const { execSync } = require('child_process');

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
