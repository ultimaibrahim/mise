/**
 * Validador Estricto de Sintaxis JS/GAS (V8)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const filesToValidate = [
  'bdg/miseAuthBDG.js',
  'bdg/MiseKardexEngine.js',
  'pda/miseAuthPDA.js',
  'pdm/miseAuthPDM.js',
  'scripts/sheets_mirror_worker.js'
];

let hasErrors = false;

console.log("🔍 [SYNTAX] Iniciando verificación de sintaxis para archivos Apps Script (.gs)...");

filesToValidate.forEach(relPath => {
  const fullPath = path.join(__dirname, '..', relPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ [SYNTAX] Archivo no encontrado: ${relPath}`);
    hasErrors = true;
    return;
  }

  const code = fs.readFileSync(fullPath, 'utf8');
  try {
    new vm.Script(code, { filename: relPath });
    console.log(`✅ [SYNTAX OK] ${relPath}`);
  } catch (err) {
    console.error(`❌ [SYNTAX ERROR] en ${relPath}:`);
    console.error(err.message);
    hasErrors = true;
  }
});

if (hasErrors) {
  console.error("\n💥 Error de sintaxis detectado. Revisa las líneas señaladas.");
  process.exit(1);
} else {
  console.log("\n✨ 0 errores de sintaxis en todos los archivos de Google Apps Script.");
  process.exit(0);
}
