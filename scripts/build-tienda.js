#!/usr/bin/env node
/**
 * Genera los scripts de Andares (pda/) y Mercado (pdm/) desde la FUENTE ÚNICA tienda/.
 *   node scripts/build-tienda.js        (también lo invocan mise-env.js y tests/run_all.js)
 * Los archivos generados están en .gitignore: nunca se editan a mano.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const FUENTE = path.join(ROOT, "tienda");
const SUCURSALES = [
  { dir: "pda", archivo: "miseAuthPDA.js", key: "BA", nombre: "Andares" },
  { dir: "pdm", archivo: "miseAuthPDM.js", key: "BM", nombre: "Mercado" }
];
const COPIAS_TAL_CUAL = ["TraspasoTiendaDialog.html", "appsscript.json", "MiseDevTools.js"];

function build() {
  const src = fs.readFileSync(path.join(FUENTE, "miseTienda.js"), "utf8");
  const version = (src.match(/const MISE_VERSION\s*=\s*"([^"]+)"/) || [])[1];
  const subtitulo = ((src.match(/\* SUBTITULO: (.+)/) || [])[1] || "").trim();
  if (!version) throw new Error("tienda/miseTienda.js sin MISE_VERSION");
  const fin = src.indexOf("*/") + 2;           // quitar el encabezado de la fuente
  const cuerpo = src.slice(fin);
  const lineasCabFuente = src.slice(0, fin).split("\n").length;
  const LINEAS_CAB_GENERADA = 8;               // 7 del comentario + MISE_SUCURSAL_DEFAULT
  const desfase = lineasCabFuente - LINEAS_CAB_GENERADA; // línea_fuente = línea_generada + desfase

  SUCURSALES.forEach(s => {
    const cabecera = `/**
 * MISE — Pedidos ${s.nombre} Script v${version} Altair (${subtitulo})
 * Suite Atelier · La Crêpe Parisienne · Grupo MYT
 *
 * ⚠️ GENERADO por scripts/build-tienda.js desde tienda/miseTienda.js — NO EDITAR AQUÍ.
 * Trazas "miseAuth${s.key === "BA" ? "PDA" : "PDM"}:N" → línea N ${desfase >= 0 ? "+" : "−"} ${Math.abs(desfase)} en tienda/miseTienda.js
 */
const MISE_SUCURSAL_DEFAULT = { key: "${s.key}", nombre: "${s.nombre}" };`;
    fs.writeFileSync(path.join(ROOT, s.dir, s.archivo), cabecera + cuerpo);
    COPIAS_TAL_CUAL.forEach(f => fs.copyFileSync(path.join(FUENTE, f), path.join(ROOT, s.dir, f)));
  });
  return { version, sucursales: SUCURSALES.map(s => s.nombre) };
}

module.exports = { build };

if (require.main === module) {
  const r = build();
  console.log(`✓ Tiendas generadas desde tienda/ (v${r.version}): ${r.sucursales.join(", ")}`);
}
