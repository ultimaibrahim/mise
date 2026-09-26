#!/usr/bin/env node
/**
 * MISE — Gestor de entornos PROD / DEV para los 3 proyectos GAS (bdg, pda, pdm)
 *
 *   node scripts/mise-env.js gen          Genera .clasp.dev.json, MiseDevEnv.js y los .claspignore
 *   node scripts/mise-env.js push dev     gen + validación + clasp push a los proyectos [DEV]
 *   node scripts/mise-env.js push prod    clasp push a PRODUCCIÓN (MiseDevEnv.js queda excluido)
 *   node scripts/mise-env.js status       Muestra qué archivos subiría cada entorno
 *   node scripts/mise-env.js verify dev|prod  Verifica que cada script esté vinculado a su libro (API)
 *
 * La configuración vive en scripts/mise-env.config.json (gitignored: contiene IDs de producción).
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const CONFIG_PATH = path.join(__dirname, "mise-env.config.json");
const PROYECTOS = { BDG: "bdg", PDA: "pda", PDM: "pdm" };

const IGNORE_COMUN = [".clasp*.json", ".claspignore*"];
const IGNORE_PROD = [...IGNORE_COMUN, "**/MiseDevEnv.js"];

function cargarConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Falta ${path.relative(ROOT, CONFIG_PATH)}. Cópialo de mise-env.config.example.json y llénalo.`);
  }
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  Object.keys(PROYECTOS).forEach(k => {
    if (!cfg.prod[k] || !cfg.dev[k]) throw new Error(`Config incompleta para ${k}.`);
    if (cfg.dev[k].sheetId === cfg.prod[k].sheetId) throw new Error(`${k}: el libro DEV no puede ser el de PROD.`);
    if (cfg.dev[k].scriptId && cfg.dev[k].scriptId === cfg.prod[k].scriptId) {
      throw new Error(`${k}: el scriptId DEV no puede ser el de PROD.`);
    }
  });
  return cfg;
}

const url = (id) => `https://docs.google.com/spreadsheets/d/${id}/edit`;

// Propiedades del script que deben apuntar a DEV en cada proyecto (mismas llaves que lee el código)
function propsDev(cfg, k) {
  const d = cfg.dev;
  if (k === "BDG") {
    return {
      MISE_ENV: "DEV",
      PDA_SPREADSHEET_ID: d.PDA.sheetId, BODEGA_ID_BA: d.PDA.sheetId,
      PDM_SPREADSHEET_ID: d.PDM.sheetId, BODEGA_ID_BM: d.PDM.sheetId,
      PDA_SPREADSHEET_URL: url(d.PDA.sheetId), BODEGA_URL_BA: url(d.PDA.sheetId),
      PDM_SPREADSHEET_URL: url(d.PDM.sheetId), BODEGA_URL_BM: url(d.PDM.sheetId)
    };
  }
  return {
    MISE_ENV: "DEV",
    BODEGA_SPREADSHEET_ID: d.BDG.sheetId, BDG_SPREADSHEET_ID: d.BDG.sheetId,
    BODEGA_URL_BA: url(d.BDG.sheetId), BODEGA_URL_BM: url(d.BDG.sheetId)
  };
}

function devEnvJs(cfg, k) {
  const prodToDev = {};
  Object.keys(PROYECTOS).forEach(p => { prodToDev[cfg.prod[p].sheetId] = cfg.dev[p].sheetId; });
  const env = { rol: k, libroDev: cfg.dev[k].sheetId, props: propsDev(cfg, k), prodToDev };
  return `/**
 * MISE — Guardia de entorno DEV · ${k}
 * GENERADO por scripts/mise-env.js — no editar a mano. Solo se sube a [DEV]; PROD lo excluye (.claspignore).
 *
 * Se ejecuta en cada invocación del script (código global de Apps Script):
 *  1. Solo actúa si el libro activo es el libro DEV esperado (nunca toca PROD aunque se suba por error).
 *  2. Fuerza las Propiedades del Script para que toda conexión apunte a los libros DEV.
 *  3. La primera vez, re-apunta fórmulas (IMPORTRANGE) que todavía referencian libros de PROD.
 */
const MISE_DEV_ENV = ${JSON.stringify(env, null, 2)};

function _miseDevReapuntarFormulas(ss) {
  const ids = Object.keys(MISE_DEV_ENV.prodToDev);
  let cambios = 0;
  ss.getSheets().forEach(sheet => {
    const rows = Math.min(sheet.getMaxRows(), 10);
    const cols = Math.min(sheet.getMaxColumns(), 12);
    if (rows < 1 || cols < 1) return;
    const rng = sheet.getRange(1, 1, rows, cols);
    const formulas = rng.getFormulas();
    formulas.forEach((fila, r) => fila.forEach((f, c) => {
      if (!f) return;
      let nueva = f;
      ids.forEach(prodId => { nueva = nueva.split(prodId).join(MISE_DEV_ENV.prodToDev[prodId]); });
      if (nueva !== f) { sheet.getRange(r + 1, c + 1).setFormula(nueva); cambios++; }
    }));
  });
  return cambios;
}

function miseDevReapuntarFormulasManualmente() {
  const n = _miseDevReapuntarFormulas(SpreadsheetApp.getActiveSpreadsheet());
  SpreadsheetApp.getActive().toast(\`\${n} fórmula(s) re-apuntadas a DEV\`, "🧪 Mise DEV", 5);
}

(function _miseDevGuard() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss || ss.getId() !== MISE_DEV_ENV.libroDev) return;
    const sp = PropertiesService.getScriptProperties();
    const actuales = sp.getProperties();
    const cambios = {};
    Object.keys(MISE_DEV_ENV.props).forEach(key => {
      if (actuales[key] !== MISE_DEV_ENV.props[key]) cambios[key] = MISE_DEV_ENV.props[key];
    });
    if (Object.keys(cambios).length === 0) return;
    sp.setProperties(cambios);
    _miseDevReapuntarFormulas(ss);
  } catch (e) {
    console.error("MiseDevGuard: " + e);
  }
})();
`;
}

function gen(cfg) {
  Object.entries(PROYECTOS).forEach(([k, dir]) => {
    const abs = path.join(ROOT, dir);
    fs.writeFileSync(path.join(abs, ".claspignore"), IGNORE_PROD.join("\n") + "\n");
    fs.writeFileSync(path.join(abs, ".claspignore.dev"), IGNORE_COMUN.join("\n") + "\n");
    fs.writeFileSync(path.join(abs, "MiseDevEnv.js"), devEnvJs(cfg, k));
    if (cfg.dev[k].scriptId) {
      const prodClasp = JSON.parse(fs.readFileSync(path.join(abs, ".clasp.json"), "utf8"));
      fs.writeFileSync(path.join(abs, ".clasp.dev.json"),
        JSON.stringify({ ...prodClasp, scriptId: cfg.dev[k].scriptId }, null, 2));
    }
  });
  console.log("✓ Entorno generado (.claspignore, .claspignore.dev, MiseDevEnv.js" +
    (Object.keys(PROYECTOS).every(k => cfg.dev[k].scriptId) ? ", .clasp.dev.json)" : ") — faltan scriptId DEV"));
}

function clasp(dir, args) {
  return execSync(`clasp ${args}`, { cwd: path.join(ROOT, dir), stdio: "pipe" }).toString();
}

// Pregunta a la API de Apps Script a qué libro está vinculado cada script y aborta si no coincide.
// (Protege contra .clasp.json apuntando a scripts de hojas de prueba.)
function verificarContenedores(cfg, env) {
  const rc = JSON.parse(fs.readFileSync(path.join(require("os").homedir(), ".clasprc.json"), "utf8"));
  const t = (rc.tokens && rc.tokens.default) || rc.token || rc;
  const body = new URLSearchParams({ client_id: t.client_id, client_secret: t.client_secret,
    refresh_token: t.refresh_token, grant_type: "refresh_token" }).toString();
  const curl = (args) => execSync(`curl -sS ${args}`, { stdio: "pipe" }).toString();
  const at = JSON.parse(curl(`-d '${body}' https://oauth2.googleapis.com/token`)).access_token;
  if (!at) throw new Error("No se pudo obtener token de clasp para verificar contenedores.");
  Object.entries(PROYECTOS).forEach(([k, dir]) => {
    const claspFile = env === "dev" ? ".clasp.dev.json" : ".clasp.json";
    const scriptId = JSON.parse(fs.readFileSync(path.join(ROOT, dir, claspFile), "utf8")).scriptId;
    if (scriptId !== cfg[env][k].scriptId) {
      throw new Error(`${k}: ${dir}/${claspFile} (${scriptId}) no coincide con la config ${env} (${cfg[env][k].scriptId}).`);
    }
    const proj = JSON.parse(curl(`-H "Authorization: Bearer ${at}" https://script.googleapis.com/v1/projects/${scriptId}`));
    if (proj.parentId !== cfg[env][k].sheetId) {
      throw new Error(`${k} ${env.toUpperCase()}: el script "${proj.title}" está vinculado al libro ${proj.parentId}, ` +
        `no al esperado ${cfg[env][k].sheetId}. Push abortado.`);
    }
  });
  console.log(`✓ Contenedores ${env.toUpperCase()} verificados (cada script pertenece a su libro)`);
}

function push(cfg, env) {
  if (env === "dev") {
    gen(cfg);
    const faltan = Object.keys(PROYECTOS).filter(k => !cfg.dev[k].scriptId);
    if (faltan.length) throw new Error(`Falta scriptId DEV para: ${faltan.join(", ")}`);
    execSync("node tests/run_all.js", { cwd: ROOT, stdio: "inherit" });
  }
  verificarContenedores(cfg, env);
  Object.entries(PROYECTOS).forEach(([k, dir]) => {
    const args = env === "dev"
      ? `-P ${path.join(ROOT, dir, ".clasp.dev.json")} -I ${path.join(ROOT, dir, ".claspignore.dev")} push --force`
      : "push --force";
    process.stdout.write(`→ ${env.toUpperCase()} ${k}: `);
    const out = clasp(dir, args);
    console.log((out.match(/Pushed \d+ files?/) || ["ok"])[0]);
  });
}

function status(cfg) {
  Object.entries(PROYECTOS).forEach(([k, dir]) => {
    console.log(`\n══ ${k} · PROD`); console.log(clasp(dir, "status"));
    if (cfg.dev[k].scriptId) { console.log(`══ ${k} · DEV`); console.log(clasp(dir, `-P ${path.join(ROOT, dir, ".clasp.dev.json")} -I ${path.join(ROOT, dir, ".claspignore.dev")} status`)); }
  });
}

try {
  const [cmd, env] = process.argv.slice(2);
  const cfg = cargarConfig();
  if (cmd === "gen") gen(cfg);
  else if (cmd === "push" && (env === "dev" || env === "prod")) push(cfg, env);
  else if (cmd === "status") status(cfg);
  else if (cmd === "verify" && (env === "dev" || env === "prod")) verificarContenedores(cfg, env);
  else console.log("Uso: node scripts/mise-env.js gen | push dev | push prod | status | verify dev|prod");
} catch (e) {
  console.error("✗ " + e.message);
  process.exit(1);
}
