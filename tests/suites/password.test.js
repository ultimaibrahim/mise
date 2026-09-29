/**
 * Suite de Pruebas: 🔐 contraseña de administrador (1.7.6j) — código real de Bodega y tienda en VM
 * Sin contraseña en el código: huella SHA-256 en ADMIN_PASSWORD_HASH, definida solo por el dueño.
 */
const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { crearContextoBDG } = require("../mocks/bdgVm");
const { crearContextoTienda } = require("../mocks/tiendaVm");
const { MockPropertiesService } = require("../mocks/gasMocks");

const utilidades = (base) => Object.assign({}, base, {
  DigestAlgorithm: { SHA_256: "SHA_256" }, Charset: { UTF_8: "UTF_8" },
  computeDigest: (alg, txt) => [...crypto.createHash("sha256").update(txt, "utf8").digest()],
  base64Encode: (bytes) => Buffer.from(bytes).toString("base64")
});

// UI con respuestas guionizadas: prompts en orden, alertas registradas (YES/NO guionizados)
function uiGuion(respuestas, botones = []) {
  const alertas = [];
  const ui = {
    ButtonSet: { OK: "OK", OK_CANCEL: "OK_CANCEL", YES_NO: "YES_NO" }, Button: { OK: "OK", CANCEL: "CANCEL", YES: "YES", NO: "NO" },
    prompt: () => { const t = respuestas.shift(); return { getSelectedButton: () => (t === null ? "CANCEL" : "OK"), getResponseText: () => t || "" }; },
    alert: (...a) => { alertas.push(a.filter(x => typeof x === "string").join(" | ")); return botones.shift() || "OK"; }
  };
  return { ui, alertas };
}

function runPasswordTests() {
  console.log("\n🧪 [TEST SUITE] 🔐 Contraseña de administrador: sin texto en el código, solo el dueño");
  const props = MockPropertiesService.getScriptProperties();
  const previas = { h: props.getProperty("ADMIN_PASSWORD_HASH"), p: props.getProperty("ADMIN_PASSWORD") };
  try {
    const { sandbox } = crearContextoBDG();
    sandbox.Utilities = utilidades(sandbox.Utilities);
    let dueno = "dueno@lcp.mx", activo = "dueno@lcp.mx";
    sandbox.Session.getActiveUser = () => ({ getEmail: () => activo });
    const ssBase = sandbox.SpreadsheetApp.getActiveSpreadsheet();
    ssBase.getOwner = () => ({ getEmail: () => dueno });
    let borrados = 0;
    const delOrig = props.deleteAllProperties;
    props.deleteAllProperties = () => { borrados++; };
    props.setProperty("ADMIN_PASSWORD_HASH", "");
    props.setProperty("ADMIN_PASSWORD", "texto-plano-viejo");

    // 1. Sin contraseña definida: restablecer bloqueado
    let g = uiGuion([]);
    sandbox.SpreadsheetApp.getUi = () => g.ui;
    sandbox.setupCompleto();
    assert.ok(/Sin contraseña/.test(g.alertas[0]) && borrados === 0, "Sin contraseña definida el restablecimiento queda bloqueado");

    // 2. Alguien que no es el dueño no puede definirla
    activo = "gerente@lcp.mx";
    g = uiGuion(["intrusa12345", "intrusa12345"]);
    sandbox.cambiarPasswordAdmin();
    assert.ok(!props.getProperty("ADMIN_PASSWORD_HASH") && /Solo el dueño/.test(g.alertas[0]), "Un no-dueño no puede definir la contraseña");

    // 3. El dueño la define: se guarda la huella, no el texto; se borra el formato viejo
    activo = dueno;
    g = uiGuion(["corta", ]);
    sandbox.cambiarPasswordAdmin();
    assert.ok(!props.getProperty("ADMIN_PASSWORD_HASH"), "Menos de 10 caracteres: rechazada");
    g = uiGuion(["Crepe-Segura-2026!", "Crepe-Segura-2026!"]);
    sandbox.cambiarPasswordAdmin();
    const hash = props.getProperty("ADMIN_PASSWORD_HASH");
    assert.ok(hash && !hash.includes("Crepe"), "Se guarda solo la huella cifrada");
    assert.ok(!props.getProperty("ADMIN_PASSWORD"), "Se elimina la contraseña en texto plano del formato anterior");

    // 4. Contraseña incorrecta aborta; la correcta pasa a la confirmación final (respondemos NO)
    g = uiGuion(["LCP-ADMIN-2026"]);
    sandbox.setupCompleto();
    assert.ok(g.alertas.some(a => /incorrecta/.test(a)) && borrados === 0, "La contraseña vieja ya no sirve");
    g = uiGuion(["Crepe-Segura-2026!"], ["NO"]);
    sandbox.setupCompleto();
    assert.ok(g.alertas.some(a => /Confirmación Final/.test(a)) && borrados === 0, "Correcta → pide confirmación; con NO no borra nada");

    // 5. Cambiarla exige la actual
    g = uiGuion(["equivocada-123", "Otra-Clave-2026!", "Otra-Clave-2026!"]);
    sandbox.cambiarPasswordAdmin();
    assert.strictEqual(props.getProperty("ADMIN_PASSWORD_HASH"), hash, "Sin la contraseña actual no se cambia");
    console.log("  ✓ Bodega: bloqueado sin contraseña, solo el dueño la define, se guarda cifrada y la vieja ya no sirve");
    props.deleteAllProperties = delOrig;

    // 6. Tienda: la confirmación final ahora sí se respeta
    const t = crearContextoTienda("pda", "miseAuthPDA.js");
    t.sandbox.Utilities = utilidades(t.sandbox.Utilities);
    t.props.ADMIN_PASSWORD_HASH = t.sandbox._hashAdmin("Crepe-Segura-2026!");
    t.props.BODEGA_URL_BA = "https://docs.google.com/spreadsheets/d/x/edit";
    const tg = uiGuion(["Crepe-Segura-2026!"], ["NO"]);
    t.sandbox.SpreadsheetApp.getUi = () => tg.ui;
    t.sandbox.setupCompleto();
    assert.strictEqual(t.props.BODEGA_URL_BA, "https://docs.google.com/spreadsheets/d/x/edit", "Tienda: con NO en la confirmación no borra nada (antes borraba igual)");
    console.log("  ✓ Tienda: responder NO en la confirmación final ya no borra el libro");

    // 7. Ningún archivo del repo publica la contraseña anterior
    const ROOT = path.join(__dirname, "..", "..");
    const archivos = ["bdg/miseAuthBDG.js", "tienda/miseTienda.js", "documentacion/historial_versiones.md", "documentacion/plan_v1.7.6.md", "CHANGELOG.md", "CHANGELOG_PUBLIC.md"];
    const conClave = archivos.filter(f => fs.readFileSync(path.join(ROOT, f), "utf8").includes("LCP-ADMIN-" + "2026"));
    assert.deepStrictEqual(conClave, [], "La contraseña anterior no aparece en código ni documentación");
    console.log("  ✓ La contraseña anterior ya no aparece en el código ni en la documentación");
  } finally {
    props.setProperty("ADMIN_PASSWORD_HASH", previas.h || "");
    props.setProperty("ADMIN_PASSWORD", previas.p || "");
  }
}

module.exports = { runPasswordTests };
