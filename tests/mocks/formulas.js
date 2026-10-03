/**
 * Evaluador de fórmulas para el emulador (solo lo que usa Mise): referencias ('Hoja'!$C4, rangos C:AD),
 * & + - * / comparaciones, IF · AND · OR · NOT · IFERROR · VLOOKUP · ROUND · N · LEN · CHAR · INT · MOD · SUM · SUMPRODUCT · INDIRECT.
 * Como Google: getValues devuelve el RESULTADO; una hoja inexistente es #REF!; una función desconocida es #NAME?.
 */
// Celda vacía (distinta del texto ""): vale 0 frente a números y "" frente a texto, como en Sheets
const VACIO = Object.freeze({ vacio: true });

class ErrorHoja extends Error {
  constructor(codigo) { super(codigo); this.codigo = codigo; }
}

function _colANum(letras) {
  return letras.toUpperCase().split("").reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
}

function _tokens(f) {
  const t = [];
  let i = 0;
  const re = {
    espacio: /^\s+/,
    texto: /^"((?:[^"]|"")*)"/,
    ref: /^(?:('(?:[^']|'')+'|[A-Za-z_][\w.]*)!)?(\$?[A-Za-z]{1,3}\$?\d*)(?::(\$?[A-Za-z]{1,3}\$?\d*))?(?![\w(])/,
    numero: /^\d+(?:\.\d+)?/,
    funcion: /^([A-Za-z][\w.]*)\(/,
    logico: /^(TRUE|FALSE)(?![\w(])/i,
    op: /^(<>|<=|>=|[-+*/&=<>(),:])/
  };
  while (i < f.length) {
    const resto = f.slice(i);
    let m;
    if ((m = resto.match(re.espacio))) { i += m[0].length; continue; }
    if ((m = resto.match(re.texto))) { t.push({ tipo: "txt", v: m[1].replace(/""/g, '"') }); i += m[0].length; continue; }
    if ((m = resto.match(re.logico))) { t.push({ tipo: "bool", v: m[1].toUpperCase() === "TRUE" }); i += m[0].length; continue; }
    if ((m = resto.match(re.funcion))) { t.push({ tipo: "fn", v: m[1].toUpperCase() }); i += m[0].length; continue; }
    if ((m = resto.match(re.ref)) && (m[1] || /\d/.test(m[2]) || m[3])) {
      const hoja = m[1] ? m[1].slice(0, -1).replace(/^'|'$/g, "").replace(/''/g, "'") : null;
      t.push({ tipo: "ref", hoja, a: m[2].replace(/\$/g, ""), b: m[3] ? m[3].replace(/\$/g, "") : null });
      i += m[0].length; continue;
    }
    if ((m = resto.match(/^[A-Za-z_][A-Za-z0-9_]*(?![\w(!])/))) { t.push({ tipo: "id", v: m[0] }); i += m[0].length; continue; }   // nombre de LET
    if ((m = resto.match(re.numero))) { t.push({ tipo: "num", v: parseFloat(m[0]) }); i += m[0].length; continue; }
    if ((m = resto.match(re.op))) { t.push({ tipo: "op", v: m[1] }); i += m[0].length; continue; }
    throw new ErrorHoja("#ERROR!");
  }
  return t;
}

// Rango perezoso: VLOOKUP solo calcula la primera columna y la celda que devuelve (no toda la tabla)
class Rango {
  constructor(h, r1, r2, c1, c2, celda) { Object.assign(this, { h, r1, r2, c1, c2, celda }); }
  en(r, c) { return this.celda(this.h, this.r1 + r, this.c1 + c); }
  get filas() { return this.r2 - this.r1 + 1; }
  get columnas() { return this.c2 - this.c1 + 1; }
  matriz() {
    const m = [];
    for (let r = 0; r < this.filas; r++) { const f = []; for (let c = 0; c < this.columnas; c++) f.push(this.en(r, c)); m.push(f); }
    return m;
  }
}

// version(): contador de escrituras del emulador; los resultados se guardan mientras no cambie nada
function crearEvaluador(version = () => 0, importRange = () => null) {
  const cache = new Map();
  let versionCache = -1;
  function evaluar(formula, sheet, profundidad = 0) {
    if (version() !== versionCache) { cache.clear(); versionCache = version(); }
    if (profundidad > 40) return "#REF!";
    try {
      const t = _tokens(formula.replace(/^=/, ""));
      let p = 0;
      const vars = {};            // variables de LET
      const ver = () => t[p];
      const tomar = (v) => { const x = t[p]; if (v && (!x || x.v !== v)) throw new ErrorHoja("#ERROR!"); p++; return x; };

      const hojaDe = (nombre) => {
        if (!nombre) return sheet;
        const h = sheet.spreadsheet.getSheetByName(nombre);
        if (!h) throw new ErrorHoja("#REF!");
        return h;
      };
      const celda = (h, r, c) => {
        const v = h._getCell(r, c);
        if (v === "" || v === null || v === undefined) return VACIO;
        if (!(typeof v === "string" && v.startsWith("="))) return v;
        const clave = h.name + "!" + r + "," + c;
        if (!cache.has(clave)) cache.set(clave, evaluar(v, h, profundidad + 1));
        return cache.get(clave);
      };
      const parteRef = (s) => { const m = s.match(/^([A-Za-z]+)(\d*)$/); return { c: _colANum(m[1]), r: m[2] ? parseInt(m[2], 10) : null }; };
      const rango = (tk) => {
        const h = hojaDe(tk.hoja);
        const a = parteRef(tk.a), b = parteRef(tk.b || tk.a);
        const r1 = a.r || 1, r2 = b.r || Math.max(h.getLastRow(), 1);
        return new Rango(h, r1, r2, a.c, b.c, celda);
      };
      const num = (v) => {
        if (v instanceof ErrorHoja) throw v;
        if (v === VACIO || v === "" || v === null || v === undefined) return 0;
        if (typeof v === "boolean") return v ? 1 : 0;
        if (typeof v === "number") return v;
        if (v instanceof Date) return v.getTime() / 86400000;
        const n = Number(String(v).replace(",", "."));
        if (String(v).trim() === "" || isNaN(n)) throw new ErrorHoja("#VALUE!");
        return n;
      };
      const txt = (v) => (v === VACIO ? "" : v === true ? "TRUE" : v === false ? "FALSE" : v === null || v === undefined ? "" : String(v));
      const esError = (v) => typeof v === "string" && /^#(REF|VALUE|NAME|N\/A|DIV\/0|ERROR)/.test(v);
      const valor = (v) => { if (v instanceof Rango) v = v.en(0, 0); else if (Array.isArray(v)) v = v[0] ? v[0][0] : ""; if (esError(v)) throw new ErrorHoja(v); return v; };
      const comparar = (a, b, op) => {
        let x = a, y = b;
        const vacioComo = (otro) => typeof otro === "number" ? 0 : typeof otro === "boolean" ? false : "";
        if (x === VACIO) x = vacioComo(y);
        if (y === VACIO) y = vacioComo(x);
        if (x instanceof Date) x = num(x);
        if (y instanceof Date) y = num(y);
        const rango = (v) => typeof v === "number" ? 0 : typeof v === "string" ? 1 : 2;   // número < texto < lógico
        if (rango(x) !== rango(y)) { x = rango(x); y = rango(y); }
        else if (typeof x === "string") { x = x.toLowerCase(); y = y.toLowerCase(); }
        switch (op) {
          case "=": return x === y; case "<>": return x !== y; case "<": return x < y;
          case ">": return x > y; case "<=": return x <= y; default: return x >= y;
        }
      };

      const FUNCIONES = {
        IF: (args) => { const c = valor(args[0]()); return (typeof c === "string" ? c !== "" : !!num(c)) ? (args[1] ? args[1]() : true) : (args[2] ? args[2]() : false); },
        AND: (args) => args.every(a => !!num(valor(a()))),
        OR: (args) => args.some(a => !!num(valor(a()))),
        NOT: (args) => !num(valor(args[0]())),
        IFERROR: (args) => { try { const v = valor(args[0]()); return v; } catch (e) { if (e instanceof ErrorHoja) return args[1] ? args[1]() : ""; throw e; } },
        ROUND: (args) => { const f = Math.pow(10, args[1] ? num(valor(args[1]())) : 0); return Math.round(num(valor(args[0]())) * f) / f; },
        N: (args) => { const v = valor(args[0]()); return typeof v === "number" ? v : v === true ? 1 : 0; },
        CHAR: (args) => String.fromCharCode(num(valor(args[0]()))),
        INT: (args) => Math.floor(num(valor(args[0]()))),
        MOD: (args) => { const a = num(valor(args[0]())), b = num(valor(args[1]())); if (b === 0) throw new ErrorHoja("#DIV/0!"); return a - b * Math.floor(a / b); },
        LEN: (args) => txt(valor(args[0]())).length,
        SUM: (args) => args.reduce((s, a) => { const v = a(); return s + (v instanceof Rango ? v.matriz().flat().reduce((x, y) => x + (typeof y === "number" ? y : 0), 0) : num(valor(v))); }, 0),
        VLOOKUP: (args) => {
          const buscado = valor(args[0]()), tabla = args[1](), idx = num(valor(args[2]()));
          if (!(tabla instanceof Rango) || idx < 1 || idx > tabla.columnas) throw new ErrorHoja("#REF!");
          for (let r = 0; r < tabla.filas; r++) {
            const k = tabla.en(r, 0);
            if (!esError(k) && comparar(k, buscado, "=")) return tabla.en(r, idx - 1);
          }
          throw new ErrorHoja("#N/A");
        },
        TODAY: () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); },
        WEEKDAY: (args) => {
          const v = valor(args[0]()), tipo = args[1] ? num(valor(args[1]())) : 1;
          const d = v instanceof Date ? v : new Date(Date.UTC(1899, 11, 30) + num(v) * 86400000);
          const g = d.getDay();                       // 0 = domingo
          return tipo === 2 ? (g || 7) : g + 1;
        },
        CHOOSE: (args) => { const i = num(valor(args[0]())); if (i < 1 || i >= args.length) throw new ErrorHoja("#VALUE!"); return args[i](); },
        // Solo la celda de arriba a la izquierda (el resto del rango lo escribe la prueba, como el "derrame" de Google)
        IMPORTRANGE: (args) => {
          const v = importRange(txt(valor(args[0]())), txt(valor(args[1]())));
          if (v === null || v === undefined) throw new ErrorHoja("#REF!");
          return v;
        },
        MATCH: (args) => {
          const buscado = valor(args[0]()), rango = args[1](), tipo = args[2] ? num(valor(args[2]())) : 1;
          if (!(rango instanceof Rango) || tipo !== 0) throw new ErrorHoja("#N/A");
          const n = rango.filas > 1 ? rango.filas : rango.columnas;
          for (let i = 0; i < n; i++) {
            const v = rango.filas > 1 ? rango.en(i, 0) : rango.en(0, i);
            if (!esError(v) && v !== VACIO && comparar(v, buscado, "=")) return i + 1;
          }
          throw new ErrorHoja("#N/A");
        },
        INDEX: (args) => {
          const rango = args[0](), f = num(valor(args[1]())), c = args[2] ? num(valor(args[2]())) : 1;
          if (!(rango instanceof Rango)) return rango;
          if (rango.columnas === 1 && !args[2]) { if (f < 1 || f > rango.filas) throw new ErrorHoja("#REF!"); return rango.en(f - 1, 0); }
          if (f < 1 || f > rango.filas || c < 1 || c > rango.columnas) throw new ErrorHoja("#REF!");
          return rango.en(f - 1, c - 1);
        },
        INDIRECT: () => { throw new ErrorHoja("#REF!"); }
      };

      // Operación celda a celda cuando un lado es rango (como dentro de SUMPRODUCT/ARRAYFORMULA)
      const esMatriz = (v) => v instanceof Rango || Array.isArray(v);
      const aMatriz = (v) => v instanceof Rango ? v.matriz() : v;
      const bin = (a, b, f) => {
        if (!esMatriz(a) && !esMatriz(b)) return f(valor(a), valor(b));
        const ma = esMatriz(a) ? aMatriz(a) : null, mb = esMatriz(b) ? aMatriz(b) : null;
        const ref = ma || mb;
        return ref.map((fila, i) => fila.map((_, j) => {
          const x = ma ? ma[i][j] : valor(a), y = mb ? mb[i][j] : valor(b);
          try { return f(x, y); } catch (e) { if (e instanceof ErrorHoja) return e.codigo; throw e; }
        }));
      };

      // Gramática: comparación > concatenación (&) > suma > producto > unario > primario
      function expr() { return compar(); }
      function compar() {
        let a = concat();
        while (ver() && ver().tipo === "op" && ["=", "<>", "<", ">", "<=", ">="].includes(ver().v)) {
          const op = tomar().v; const b = concat(); a = bin(a, b, (x, y) => comparar(x, y, op));
        }
        return a;
      }
      function concat() {
        let a = suma();
        while (ver() && ver().tipo === "op" && ver().v === "&") { tomar(); const b = suma(); a = txt(valor(a)) + txt(valor(b)); }
        return a;
      }
      function suma() {
        let a = prod();
        while (ver() && ver().tipo === "op" && (ver().v === "+" || ver().v === "-")) {
          const op = tomar().v; const b = prod(); a = bin(a, b, (x, y) => op === "+" ? num(x) + num(y) : num(x) - num(y));
        }
        return a;
      }
      function prod() {
        let a = unario();
        while (ver() && ver().tipo === "op" && (ver().v === "*" || ver().v === "/")) {
          const op = tomar().v; const b = unario();
          a = bin(a, b, (x, y) => { if (op === "/" && num(y) === 0) throw new ErrorHoja("#DIV/0!"); return op === "*" ? num(x) * num(y) : num(x) / num(y); });
        }
        return a;
      }
      function unario() {
        if (ver() && ver().tipo === "op" && ver().v === "-") { tomar(); return -num(valor(unario())); }
        if (ver() && ver().tipo === "op" && ver().v === "+") { tomar(); return unario(); }
        return primario();
      }
      function primario() {
        const x = tomar();
        if (!x) throw new ErrorHoja("#ERROR!");
        if (x.tipo === "num" || x.tipo === "txt" || x.tipo === "bool") return x.v;
        if (x.tipo === "id") {
          if (Object.prototype.hasOwnProperty.call(vars, x.v.toUpperCase())) return vars[x.v.toUpperCase()];
          throw new ErrorHoja("#NAME?");
        }
        if (x.tipo === "ref") {
          if (!x.b && /\d/.test(x.a)) { const a = parteRef(x.a); return celda(hojaDe(x.hoja), a.r, a.c); }
          return rango(x);
        }
        if (x.tipo === "op" && x.v === "(") { const v = expr(); tomar(")"); return v; }
        if (x.tipo === "fn") {
          // Argumentos perezosos: IF / IFERROR solo evalúan la rama que toca (como Sheets)
          const args = [];
          const inicio = p;
          let nivel = 0, desde = p;
          const cortes = [];
          for (; p < t.length; p++) {
            const k = t[p];
            if (k.tipo === "fn" || (k.tipo === "op" && k.v === "(")) nivel++;
            else if (k.tipo === "op" && k.v === ")") { if (nivel === 0) break; nivel--; }
            else if (k.tipo === "op" && k.v === "," && nivel === 0) { cortes.push([desde, p]); desde = p + 1; }
          }
          if (p > inicio) cortes.push([desde, p]);
          const fin = p;
          tomar(")");
          cortes.forEach(([d, h]) => args.push(() => {
            const guarda = p;
            p = d;
            try { const v = expr(); if (p !== h) throw new ErrorHoja("#ERROR!"); return v; } finally { p = guarda; }
          }));
          if (x.v === "LET") {
            // LET(nombre1, valor1, …, expresión): los nombres se resuelven como variables locales
            const pares = cortes.slice(0, -1);
            const guardaVars = Object.assign({}, vars);
            try {
              for (let i = 0; i + 1 < pares.length; i += 2) {
                const tk = t[pares[i][0]];
                const nombre = tk.v || tk.a;
                vars[String(nombre).toUpperCase()] = args[i + 1]();
              }
              return args[args.length - 1]();
            } finally { Object.keys(vars).forEach(k => delete vars[k]); Object.assign(vars, guardaVars); }
          }
          if (x.v === "SUMPRODUCT") {
            const ms = args.map(a => aMatriz(a()));
            if (!ms.every(Array.isArray)) return ms.reduce((s, m) => s * num(valor(m)), 1);
            let total = 0;
            ms[0].forEach((fila, i) => fila.forEach((_, j) => { total += ms.reduce((pr, m) => pr * (typeof m[i][j] === "number" ? m[i][j] : m[i][j] === true ? 1 : 0), 1); }));
            return total;
          }
          const fn = FUNCIONES[x.v];
          if (!fn) throw new ErrorHoja("#NAME?");
          void fin;
          return fn(args);
        }
        throw new ErrorHoja("#ERROR!");
      }

      const r = valor(expr());
      if (p !== t.length) throw new ErrorHoja("#ERROR!");
      return r === VACIO ? "" : r;
    } catch (e) {
      if (e instanceof ErrorHoja) return e.codigo;
      throw e;
    }
  }
  return evaluar;
}

module.exports = { crearEvaluador };
