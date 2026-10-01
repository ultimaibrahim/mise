/**
 * Suite de Pruebas: limpieza de Fase 2 (1.7.6j)
 * - Cada opción de menú apunta a una función que existe en lo que se sube a PROD (o está tras la guarda de DevTools).
 * - Las herramientas de desarrollo (MiseDevTools.js) quedan fuera de PROD (.claspignore generado).
 * - Sin funciones de nivel superior sin referencias (código muerto) ni definiciones duplicadas.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const leer = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const funciones = (src) => [...src.matchAll(/^function\s+([\p{L}_$][\p{L}\p{N}_$]*)\s*\(/gmu)].map(m => m[1]);

function revisarLibro(nombre, prod, devTools, htmls) {
  const srcProd = prod.map(leer).join("\n");
  const srcDev = leer(devTools);
  const defProd = new Set(funciones(srcProd));
  const defDev = new Set(funciones(srcDev));

  // 1. Menús
  const items = [...srcProd.matchAll(/\.addItem\([^,]+,\s*"([^"]+)"\)/g)].map(m => m[1]);
  assert.ok(items.length > 10, `${nombre}: se leyeron las opciones de menú`);
  const rotas = items.filter(fn => !defProd.has(fn) && !defDev.has(fn));
  assert.deepStrictEqual(rotas, [], `${nombre}: opciones de menú sin función`);
  items.filter(fn => !defProd.has(fn)).forEach(fn => {
    const guarda = [...defDev].some(d => srcProd.includes(`typeof ${d} === "function"`));
    assert.ok(guarda, `${nombre}: "${fn}" (DevTools) debe mostrarse solo tras una guarda typeof`);
  });

  // 2. Código muerto y duplicados (en todo lo que se sube, incluidos los HTML que llaman google.script.run)
  const todo = [srcProd, srcDev, ...htmls.map(leer)].join("\n");
  const especiales = new Set(["onOpen", "onEdit", "doGet"]);
  const todas = [...funciones(srcProd), ...funciones(srcDev)];
  const muertas = todas.filter(fn => !especiales.has(fn) &&
    (todo.match(new RegExp(`(?<![\\p{L}\\p{N}_$])${fn.replace(/\$/g, "\\$")}(?![\\p{L}\\p{N}_$])`, "gu")) || []).length <= 1);
  assert.deepStrictEqual(muertas, [], `${nombre}: funciones sin referencias`);
  const dup = todas.filter((fn, i) => todas.indexOf(fn) !== i);
  assert.deepStrictEqual(dup, [], `${nombre}: funciones definidas dos veces`);
  return { items: items.length, funciones: todas.length, dev: defDev.size };
}

function runLimpiezaTests() {
  console.log("\n🧪 [TEST SUITE] 🧹 Limpieza: menús válidos, DevTools fuera de PROD, sin código muerto");
  const b = revisarLibro("Bodega", ["bdg/miseAuthBDG.js", "bdg/MiseKardexEngine.js", "bdg/MiseEstado.js"], "bdg/MiseDevTools.js",
    ["bdg/PickingDialog.html", "bdg/TraspasoDialog.html", "bdg/EstadoSistema.html", "bdg/ProgresoDialog.html"]);
  const t = revisarLibro("Tienda", ["tienda/miseTienda.js"], "tienda/MiseDevTools.js", []);
  console.log(`  ✓ Bodega: ${b.items} opciones de menú válidas · ${b.funciones} funciones con uso · ${b.dev} herramientas solo DEV`);
  console.log(`  ✓ Tienda: ${t.items} opciones de menú válidas · ${t.funciones} funciones con uso · ${t.dev} herramientas solo DEV`);

  const envSrc = leer("scripts/mise-env.js");
  assert.ok(/IGNORE_PROD\s*=\s*\[[^\]]*MiseDevTools\.js/.test(envSrc), "mise-env excluye MiseDevTools.js de PROD");
  assert.ok(!/IGNORE_COMUN\s*=\s*\[[^\]]*MiseDevTools/.test(envSrc), "…pero sí lo sube a DEV");
  assert.ok(/COPIAS_TAL_CUAL[^;]*MiseDevTools\.js/.test(leer("scripts/build-tienda.js")), "build-tienda copia DevTools a pda/ y pdm/");
  console.log("  ✓ MiseDevTools.js: se sube a DEV y queda excluido de PROD");

  // Diálogos HTML: todo nombre/categoría/unidad insertado como HTML pasa por esc() (en innerText no hace falta)
  ["bdg/PickingDialog.html", "bdg/TraspasoDialog.html", "bdg/EstadoSistema.html", "bdg/ProgresoDialog.html"].forEach(f => {
    const html = leer(f);
    assert.ok(/function esc\(/.test(html), `${f}: define esc()`);
    const crudos = html.split("\n").filter(l => !/innerText|textContent|title=|onchange=|oninput=/.test(l))
      .filter(l => /\$\{(?!esc\()[\w.]*\.(name|cat|pres|unit|unitTienda|producto|detalle)\}/.test(l));
    assert.deepStrictEqual(crudos, [], `${f}: datos insertados sin esc()`);
  });
  console.log("  ✓ Diálogos HTML: nombres, categorías y unidades escapados (un nombre con comillas o < no rompe la lista)");
}

module.exports = { runLimpiezaTests };
