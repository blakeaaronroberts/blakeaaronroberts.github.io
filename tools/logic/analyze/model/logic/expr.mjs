// Boolean expressions: parse, print, evaluate.
//
// Syntax (the same in logic/boolean.py):
//   variables  a letter followed by digits: A, B, x1, A0. So "AB" is A AND B,
//              and "A1B" is A1 AND B.
//   constants  0 and 1
//   NOT        postfix ' (A', (A+B)') or prefix ~ ! ¬
//   AND        juxtaposition (AB, A(B+C)) or * · & ∧
//   XOR        ^ ⊕
//   OR         + | ∨
//   precedence NOT, then AND, then XOR, then OR; parentheses group.
//
// A tree is made of plain objects:
//   { t: "var", name }   { t: "const", v: 0 | 1 }   { t: "not", a }
//   { t: "and", args }   { t: "or", args }          { t: "xor", args: [a, b] }
// AND and OR are n-ary; the parser keeps the grouping that was written, so
// "A(BC)" is and[A, and[B, C]] and "ABC" is and[A, B, C].

export const v = (name) => ({ t: "var", name });
export const c = (value) => ({ t: "const", v: value });
export const not = (a) => ({ t: "not", a });
export const and = (...args) => ({ t: "and", args });
export const or = (...args) => ({ t: "or", args });
export const xor = (a, b) => ({ t: "xor", args: [a, b] });

const VARIABLE = /^[A-Za-z][0-9]*$/;

function tokenize(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[A-Za-z]/.test(ch)) {
      let j = i + 1;
      while (j < text.length && /[0-9]/.test(text[j])) j++;
      tokens.push({ k: "var", s: text.slice(i, j), at: i });
      i = j;
      continue;
    }
    if (ch === "0" || ch === "1") { tokens.push({ k: "const", s: ch, at: i }); i++; continue; }
    const kind = { "(": "(", ")": ")", "+": "or", "|": "or", "∨": "or",
      "*": "and", "·": "and", "&": "and", "∧": "and", "^": "xor", "⊕": "xor",
      "'": "post", "’": "post", "~": "pre", "!": "pre", "¬": "pre" }[ch];
    if (!kind) throw new SyntaxError(`unexpected "${ch}" at position ${i + 1}`);
    tokens.push({ k: kind, s: ch, at: i });
    i++;
  }
  return tokens;
}

/** Parse an expression. Throws SyntaxError with the position on bad input. */
export function parse(text) {
  const tokens = tokenize(String(text));
  let p = 0;
  const peek = () => tokens[p];
  const fail = (msg) => {
    const t = peek();
    throw new SyntaxError(t ? `${msg} at position ${t.at + 1}` : `${msg} at the end`);
  };
  const startsUnary = (t) => t && (t.k === "var" || t.k === "const" || t.k === "(" || t.k === "pre");

  function parseOr() {
    const args = [parseXor()];
    while (peek()?.k === "or") { p++; args.push(parseXor()); }
    return args.length === 1 ? args[0] : or(...args);
  }
  function parseXor() {
    let left = parseAnd();
    while (peek()?.k === "xor") { p++; left = xor(left, parseAnd()); }
    return left;
  }
  function parseAnd() {
    const args = [parseUnary()];
    for (;;) {
      if (peek()?.k === "and") { p++; args.push(parseUnary()); }
      else if (startsUnary(peek())) args.push(parseUnary());
      else break;
    }
    return args.length === 1 ? args[0] : and(...args);
  }
  function parseUnary() {
    if (peek()?.k === "pre") { p++; return not(parseUnary()); }
    let e = parsePrimary();
    while (peek()?.k === "post") { p++; e = not(e); }
    return e;
  }
  function parsePrimary() {
    const t = peek();
    if (!t) fail("expected a variable, 0, 1 or (");
    if (t.k === "var") { p++; return v(t.s); }
    if (t.k === "const") { p++; return c(Number(t.s)); }
    if (t.k === "(") {
      p++;
      const e = parseOr();
      if (peek()?.k !== ")") fail("expected )");
      p++;
      return e;
    }
    fail(`unexpected "${t.s}"`);
  }

  if (tokens.length === 0) throw new SyntaxError("empty expression");
  const e = parseOr();
  if (p < tokens.length) fail(`unexpected "${peek().s}"`);
  return e;
}

export const isVariableName = (name) => VARIABLE.test(name);

/** Variables in an expression, sorted: letters alphabetically, then by number (A, A0, A1, A10, B). */
export function variablesOf(e) {
  const names = new Set();
  (function walk(n) {
    if (n.t === "var") names.add(n.name);
    else if (n.t === "not") walk(n.a);
    else if (n.args) n.args.forEach(walk);
  })(e);
  return [...names].sort(compareNames);
}

export function compareNames(a, b) {
  const [, la, na] = a.match(/^([A-Za-z])([0-9]*)$/);
  const [, lb, nb] = b.match(/^([A-Za-z])([0-9]*)$/);
  if (la !== lb) return la < lb ? -1 : 1;
  if (na === nb) return 0;
  if (na === "") return -1;
  if (nb === "") return 1;
  return Number(na) - Number(nb) || (na < nb ? -1 : 1);
}

// ------------------------------------------------------------- printing --

const isAtom = (e) => e.t === "var" || e.t === "const";

/** Print with ' for NOT, juxtaposition for AND, ⊕ for XOR and + for OR. */
export function toString(e) {
  switch (e.t) {
    case "var": return e.name;
    case "const": return String(e.v);
    case "not": return isAtom(e.a) || e.a.t === "not" ? `${toString(e.a)}'` : `(${toString(e.a)})'`;
    case "and": {
      let out = "";
      e.args.forEach((a, i) => {
        const s = a.t === "and" || a.t === "or" || a.t === "xor" ? `(${toString(a)})` : toString(a);
        // A constant next to anything needs a visible AND, or "A1" would read as a variable.
        const dot = i > 0 && (a.t === "const" || e.args[i - 1].t === "const");
        out += (dot ? "·" : "") + s;
      });
      return out;
    }
    case "or": return e.args.map((a) => (a.t === "or" || a.t === "xor" ? `(${toString(a)})` : toString(a))).join(" + ");
    case "xor": {
      const [a, b] = e.args;
      const left = a.t === "or" ? `(${toString(a)})` : toString(a);
      const right = b.t === "or" || b.t === "xor" ? `(${toString(b)})` : toString(b);
      return `${left} ⊕ ${right}`;
    }
  }
  throw new Error(`unknown node ${JSON.stringify(e)}`);
}

const latexName = (name) => name.replace(/^([A-Za-z])([0-9]+)$/, "$1_{$2}");

/** LaTeX for MathJax and CircuiTikZ labels: \overline for NOT, \oplus for XOR. */
export function toLatex(e) {
  switch (e.t) {
    case "var": return latexName(e.name);
    case "const": return String(e.v);
    case "not": return `\\overline{${toLatex(e.a)}}`;
    case "and": return e.args.map((a) => (a.t === "and" || a.t === "or" || a.t === "xor" ? `\\left(${toLatex(a)}\\right)` : toLatex(a))).join(e.args.some((a) => a.t === "const") ? " \\cdot " : "\\,");
    case "or": return e.args.map((a) => (a.t === "or" || a.t === "xor" ? `\\left(${toLatex(a)}\\right)` : toLatex(a))).join(" + ");
    case "xor": {
      const [a, b] = e.args;
      const wrap = (x, right) => (x.t === "or" || (right && x.t === "xor") ? `\\left(${toLatex(x)}\\right)` : toLatex(x));
      return `${wrap(a, false)} \\oplus ${wrap(b, true)}`;
    }
  }
  throw new Error(`unknown node ${JSON.stringify(e)}`);
}

// ----------------------------------------------------------- evaluation --

/** Evaluate with env: { name: 0 | 1 }. */
export function evaluate(e, env) {
  switch (e.t) {
    case "var":
      if (!(e.name in env)) throw new Error(`no value for variable ${e.name}`);
      return env[e.name] ? 1 : 0;
    case "const": return e.v;
    case "not": return 1 - evaluate(e.a, env);
    case "and": return e.args.every((a) => evaluate(a, env) === 1) ? 1 : 0;
    case "or": return e.args.some((a) => evaluate(a, env) === 1) ? 1 : 0;
    case "xor": return evaluate(e.args[0], env) ^ evaluate(e.args[1], env);
  }
  throw new Error(`unknown node ${JSON.stringify(e)}`);
}

/**
 * The truth table as a string of "0" and "1", one character per row. Row r
 * gives variables[0] the most significant bit of r.
 */
export function truthTable(e, variables = variablesOf(e)) {
  const unknown = variablesOf(e).filter((n) => !variables.includes(n));
  if (unknown.length) throw new Error(`expression uses ${unknown.join(", ")}, not in the variable list`);
  const n = variables.length;
  let out = "";
  for (let r = 0; r < 1 << n; r++) {
    const env = {};
    variables.forEach((name, i) => { env[name] = (r >> (n - 1 - i)) & 1; });
    out += evaluate(e, env);
  }
  return out;
}

/** A stable text key for a tree, the same for any order of AND and OR arguments. */
export function key(e) {
  switch (e.t) {
    case "var": return e.name;
    case "const": return String(e.v);
    case "not": return `~${key(e.a)}`;
    case "and": return `&(${e.args.map(key).sort().join(",")})`;
    case "or": return `|(${e.args.map(key).sort().join(",")})`;
    case "xor": return `^(${e.args.map(key).join(",")})`;
  }
  throw new Error(`unknown node ${JSON.stringify(e)}`);
}
