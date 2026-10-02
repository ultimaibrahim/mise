/**
 * Carga una copia AISLADA del emulador (gasMocks + contextos): prototipos y propiedades propios, sin
 * contaminar ni ser contaminada por las demás suites. Con { formulas: true } calcula fórmulas como Google.
 */
const MODULOS = ["./gasMocks", "./bdgVm", "./tiendaVm", "./formulas"];

function cargarEmuladorAislado({ formulas = false } = {}) {
  const ids = MODULOS.map(m => require.resolve(m));
  const previos = ids.map(id => require.cache[id]);
  ids.forEach(id => { delete require.cache[id]; });
  try {
    const gas = require("./gasMocks");
    if (formulas) gas.activarCalculoDeFormulas();
    _formatoSinEfecto(gas);
    return { gas, ...require("./bdgVm"), ...require("./tiendaVm") };
  } finally {
    ids.forEach((id, i) => { if (previos[i]) require.cache[id] = previos[i]; else delete require.cache[id]; });
  }
}

// Métodos de formato/estructura que el emulador no trae: aceptan y no hacen nada (no tocan datos). Solo en la copia
// aislada, para correr procesos completos (Configurar, reconstrucciones) con el código real.
function _formatoSinEfecto(gas) {
  const ss = new (gas.MockSpreadsheetApp.getActiveSpreadsheet().constructor)();
  const hoja = ss.insertSheet("__p__");
  const protos = [Object.getPrototypeOf(hoja), Object.getPrototypeOf(hoja.getRange(1, 1))];
  const NOOP = /^(set|clear|merge|break|insert|remove|hide|show|protect|activate|auto|apply|copy|unmerge|add|collapse|expand|trim|create|sort)/;
  protos.forEach(proto => {
    Object.setPrototypeOf(proto, new Proxy(Object.getPrototypeOf(proto), {
      get: (base, k, recv) => (k in base) ? Reflect.get(base, k, recv)
        : typeof k !== "string" ? undefined
        : NOOP.test(k) ? function() { return this; }
        : k === "getFilter" ? () => null
        : /^get(Bandings|Charts|DeveloperMetadata|NamedRanges|ConditionalFormatRules|Protections)$/.test(k) ? () => []
        : undefined
    }));
  });
}

module.exports = { cargarEmuladorAislado };
