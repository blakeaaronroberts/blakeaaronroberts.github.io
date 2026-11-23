// Step-by-step Boolean simplification. Every line names the rule that turned
// the line before it into this one, and every line equals the original.
//
// simplify("(A + B)(A + C)") gives, for example:
//   (A + B)(A + C)         given
//   AA + AC + BA + BC      distributive
//   A + AC + BA + BC       idempotent
//   A + BA + BC            absorption
//   A + BC                 absorption
//
// Strategy: remove XOR, push NOT inward (De Morgan), tidy constants and
// repeats, then expand to a sum of products and shrink it with absorption,
// combining, simplification and consensus. If that greedy pass does not reach
// a minimal SOP, consensus terms are added until every prime implicant is
// present (Blake's canonical form) and the terms outside a minimal cover are
// removed again by consensus. AND and OR are n-ary and the rules match their
// arguments in any order (commutative); a "commutative" line is added at the
// end only to put the answer in its usual order.

import { parse, toString, toLatex, key, variablesOf, c, not, and, or, truthTable } from "./expr.mjs";
import { minimize, compareCubes, literalCount } from "./qm.mjs";
import { cubesOfSop, sopFromCubes } from "./function.mjs";

/** The rules, with the law each one uses (shown by tools next to the name). */
export const RULES = {
  given: "",
  associative: "X(YZ) = XYZ,  X + (Y + Z) = X + Y + Z",
  commutative: "XY = YX,  X + Y = Y + X",
  "complement of a constant": "0' = 1,  1' = 0",
  involution: "X'' = X",
  identity: "X·1 = X,  X + 0 = X",
  "null element": "X·0 = 0,  X + 1 = 1",
  idempotent: "XX = X,  X + X = X",
  complement: "XX' = 0,  X + X' = 1",
  "XOR definition": "X ⊕ Y = XY' + X'Y",
  "De Morgan": "(XY)' = X' + Y',  (X + Y)' = X'Y'",
  absorption: "X + XY = X,  X(X + Y) = X",
  combining: "XY + XY' = X,  (X + Y)(X + Y') = X",
  simplification: "X + X'Y = X + Y,  X(X' + Y) = XY",
  consensus: "XY + X'Z + YZ = XY + X'Z",
  distributive: "X(Y + Z) = XY + XZ",
  "redundant term": "a term covered by the other terms is removed",
};

const MAX_STEPS = 400;
const mkAnd = (args) => (args.length === 0 ? c(1) : args.length === 1 ? args[0] : and(...args));
const mkOr = (args) => (args.length === 0 ? c(0) : args.length === 1 ? args[0] : or(...args));
const flatAnd = (args) => mkAnd(args.flatMap((a) => (a.t === "and" ? a.args : [a])));
const flatOr = (args) => mkOr(args.flatMap((a) => (a.t === "or" ? a.args : [a])));
const isComplement = (a, b) => key(a) === key(not(b)) || key(b) === key(not(a));
const DUAL = { or: "and", and: "or" };

/** The parts of a term of an `outer` node: factors of a product (outer or), terms of a sum (outer and). */
const parts = (term, outer) => (term.t === DUAL[outer] ? term.args : [term]);
const rebuild = (outer, items) => (outer === "or" ? mkAnd(items) : mkOr(items));
const keys = (items) => new Set(items.map(key));
const subset = (a, b) => [...a].every((k) => b.has(k));

// Each rule takes a node and returns its replacement, or null if it does not apply there.
const rules = {
  associative(n) {
    if ((n.t === "and" || n.t === "or") && n.args.some((a) => a.t === n.t)) {
      return n.t === "and" ? flatAnd(n.args) : flatOr(n.args);
    }
    return null;
  },
  "complement of a constant"(n) {
    return n.t === "not" && n.a.t === "const" ? c(1 - n.a.v) : null;
  },
  involution(n) {
    return n.t === "not" && n.a.t === "not" ? n.a.a : null;
  },
  identity(n) {
    if (n.t === "and" && n.args.some((a) => a.t === "const" && a.v === 1)) return mkAnd(n.args.filter((a) => !(a.t === "const" && a.v === 1)));
    if (n.t === "or" && n.args.some((a) => a.t === "const" && a.v === 0)) return mkOr(n.args.filter((a) => !(a.t === "const" && a.v === 0)));
    return null;
  },
  "null element"(n) {
    if (n.t === "and" && n.args.some((a) => a.t === "const" && a.v === 0)) return c(0);
    if (n.t === "or" && n.args.some((a) => a.t === "const" && a.v === 1)) return c(1);
    return null;
  },
  idempotent(n) {
    if (n.t !== "and" && n.t !== "or") return null;
    const seen = new Set();
    const kept = n.args.filter((a) => (seen.has(key(a)) ? false : (seen.add(key(a)), true)));
    if (kept.length === n.args.length) return null;
    return n.t === "and" ? mkAnd(kept) : mkOr(kept);
  },
  complement(n) {
    if (n.t !== "and" && n.t !== "or") return null;
    for (const a of n.args) for (const b of n.args) if (isComplement(a, b)) return c(n.t === "and" ? 0 : 1);
    return null;
  },
  "XOR definition"(n) {
    if (n.t !== "xor") return null;
    const [a, b] = n.args;
    return or(flatAnd([a, not(b)]), flatAnd([not(a), b]));
  },
  "De Morgan"(n) {
    if (n.t !== "not" || (n.a.t !== "and" && n.a.t !== "or")) return null;
    const negated = n.a.args.map((x) => not(x));
    return n.a.t === "and" ? flatOr(negated) : flatAnd(negated);
  },
  absorption(n) {
    if (n.t !== "and" && n.t !== "or") return null;
    for (let i = 0; i < n.args.length; i++) {
      const pi = keys(parts(n.args[i], n.t));
      for (let j = 0; j < n.args.length; j++) {
        if (i === j) continue;
        const pj = keys(parts(n.args[j], n.t));
        if (pi.size < pj.size && subset(pi, pj)) return rebuildWithout(n, [j]);
      }
    }
    return null;
  },
  combining(n) {
    if (n.t !== "and" && n.t !== "or") return null;
    for (let i = 0; i < n.args.length; i++) {
      for (let j = i + 1; j < n.args.length; j++) {
        const a = parts(n.args[i], n.t);
        const b = parts(n.args[j], n.t);
        if (a.length !== b.length) continue;
        const kb = keys(b);
        const onlyA = a.filter((x) => !kb.has(key(x)));
        const ka = keys(a);
        const onlyB = b.filter((x) => !ka.has(key(x)));
        if (onlyA.length === 1 && onlyB.length === 1 && isComplement(onlyA[0], onlyB[0])) {
          const common = a.filter((x) => kb.has(key(x)));
          const args = n.args.slice();
          args[i] = rebuild(n.t, common);
          args.splice(j, 1);
          return n.t === "or" ? mkOr(args) : mkAnd(args);
        }
      }
    }
    return null;
  },
  simplification(n) {
    if (n.t !== "and" && n.t !== "or") return null;
    for (let i = 0; i < n.args.length; i++) {
      const a = parts(n.args[i], n.t);
      for (let j = 0; j < n.args.length; j++) {
        if (i === j) continue;
        const b = parts(n.args[j], n.t);
        for (const l of a) {
          const lc = b.find((x) => isComplement(x, l));
          if (!lc) continue;
          const rest = keys(a.filter((x) => x !== l));
          const bRest = b.filter((x) => x !== lc);
          if (subset(rest, keys(bRest))) {
            const args = n.args.slice();
            args[j] = rebuild(n.t, bRest);
            return n.t === "or" ? mkOr(args) : mkAnd(args);
          }
        }
      }
    }
    return null;
  },
  consensus(n) {
    if (n.t !== "and" && n.t !== "or") return null;
    for (let i = 0; i < n.args.length; i++) {
      for (let j = i + 1; j < n.args.length; j++) {
        const cons = consensusOf(parts(n.args[i], n.t), parts(n.args[j], n.t));
        if (!cons) continue;
        const kc = keys(cons);
        for (let k = 0; k < n.args.length; k++) {
          if (k === i || k === j) continue;
          if (subset(kc, keys(parts(n.args[k], n.t)))) return rebuildWithout(n, [k]);
        }
      }
    }
    return null;
  },
  distributive(n) {
    if (n.t !== "and") return null;
    const at = n.args.findIndex((a) => a.t === "or");
    if (at < 0) return null;
    const before = n.args.slice(0, at);
    const after = n.args.slice(at + 1);
    return mkOr(n.args[at].args.map((term) => flatAnd([...before, term, ...after])));
  },
};

function rebuildWithout(n, drop) {
  const args = n.args.filter((_, k) => !drop.includes(k));
  return n.t === "or" ? mkOr(args) : mkAnd(args);
}

/** Consensus of two products (or sums): they must clash in exactly one variable. */
function consensusOf(a, b) {
  const clashes = [];
  for (const x of a) for (const y of b) if (isComplement(x, y)) clashes.push([x, y]);
  if (clashes.length !== 1) return null;
  const [x, y] = clashes[0];
  const merged = [...a.filter((t) => t !== x), ...b.filter((t) => t !== y)];
  const seen = new Set();
  return merged.filter((t) => (seen.has(key(t)) ? false : (seen.add(key(t)), true)));
}

/** Apply `rule` at the first node (top-down, left to right) where it applies. */
function applyOnce(tree, rule) {
  const here = rule(tree);
  if (here) return here;
  if (tree.t === "not") {
    const inner = applyOnce(tree.a, rule);
    return inner ? not(inner) : null;
  }
  if (tree.args) {
    for (let i = 0; i < tree.args.length; i++) {
      const inner = applyOnce(tree.args[i], rule);
      if (inner) {
        const args = tree.args.slice();
        args[i] = inner;
        return { ...tree, args };
      }
    }
  }
  return null;
}

const GREEDY = [
  "associative", "complement of a constant", "involution", "null element", "identity",
  "complement", "idempotent", "XOR definition", "De Morgan", "absorption", "combining",
  "simplification", "consensus", "distributive",
];

/**
 * Simplify an expression (a string or a tree) to a minimal sum of products,
 * one named rule per line. Returns
 *   { steps: [{ rule, law, expression, latex }], result, minimal }
 * where `minimal` says whether the result is one of the minimal SOP covers.
 */
export function simplify(input, { variables } = {}) {
  let tree = typeof input === "string" ? parse(input) : input;
  const vars = variables ?? variablesOf(tree);
  const steps = [];
  const push = (rule) => {
    if (steps.length > MAX_STEPS) throw new Error("simplification did not finish; please report this expression");
    steps.push({ rule, law: RULES[rule], expression: toString(tree), latex: toLatex(tree) });
  };
  push("given");

  const run = (names) => {
    for (;;) {
      let applied = false;
      for (const name of names) {
        const next = applyOnce(tree, rules[name]);
        if (next) {
          tree = next;
          push(name);
          applied = true;
          break;
        }
      }
      if (!applied) return;
    }
  };
  run(GREEDY);

  const table = truthTable(tree, vars);
  const best = minimize(table).sop.covers;
  const costOf = (cubes) => [cubes.length, cubes.reduce((k, q) => k + literalCount(q), 0)];
  const target = costOf(best[0]);
  const isMinimal = () => {
    const cubes = cubesOfSop(tree, vars);
    if (!cubes || cubes.includes("contradiction")) return false;
    const [t, l] = costOf(cubes);
    return t === target[0] && l === target[1];
  };

  if (!isMinimal() && tree.t === "or") {
    // Add consensus terms until every prime implicant is present.
    const noRemoval = GREEDY.filter((r) => r !== "consensus");
    for (;;) {
      const added = addConsensusTerm(tree);
      if (!added) break;
      tree = added;
      push("consensus");
      run(noRemoval);
    }
    // Remove the terms that are not in a minimal cover, by consensus where possible.
    const cover = chooseCover(tree, vars, best);
    removeOutside(cover);
  }

  function removeOutside(cover) {
    const wanted = new Set(cover);
    const cubeOf = (term) => cubesOfSop(term, vars)[0];
    for (;;) {
      if (tree.t !== "or") return;
      const extra = tree.args.map((t, k) => [t, k]).filter(([t]) => !wanted.has(cubeOf(t)));
      if (extra.length === 0) return;
      let removed = false;
      for (const [, k] of extra) {
        if (redundantByConsensus(tree, k)) {
          tree = rebuildWithout(tree, [k]);
          push("consensus");
          removed = true;
          break;
        }
      }
      if (!removed) {
        tree = rebuildWithout(tree, [extra[0][1]]);
        push("redundant term");
      }
    }
  }

  // Put the answer in its usual order.
  const cubes = cubesOfSop(tree, vars);
  if (cubes && !cubes.includes("contradiction")) {
    const ordered = sopFromCubes([...cubes].sort(compareCubes), vars);
    if (toString(ordered) !== toString(tree)) {
      tree = ordered;
      push("commutative");
    }
  }
  return { steps, result: toString(tree), minimal: isMinimal() };
}

/** Add one consensus term that no existing term already covers. */
function addConsensusTerm(tree) {
  const terms = tree.args;
  for (let i = 0; i < terms.length; i++) {
    for (let j = i + 1; j < terms.length; j++) {
      const cons = consensusOf(parts(terms[i], "or"), parts(terms[j], "or"));
      if (!cons) continue;
      if (cons.some((x) => cons.some((y) => isComplement(x, y)))) continue;
      const kc = keys(cons);
      if (terms.some((t) => subset(keys(parts(t, "or")), kc))) continue;
      return mkOr([...terms, mkAnd(cons)]);
    }
  }
  return null;
}

/** Is term k covered by the consensus of two other terms? */
function redundantByConsensus(tree, k) {
  const terms = tree.args;
  const kk = keys(parts(terms[k], "or"));
  for (let i = 0; i < terms.length; i++) {
    for (let j = i + 1; j < terms.length; j++) {
      if (i === k || j === k) continue;
      const cons = consensusOf(parts(terms[i], "or"), parts(terms[j], "or"));
      if (cons && subset(keys(cons), kk)) return true;
    }
  }
  return false;
}

/** The minimal cover that keeps the most of the terms already present. */
function chooseCover(tree, vars, covers) {
  const present = new Set(cubesOfSop(tree, vars));
  let best = covers[0];
  let score = -1;
  for (const cover of covers) {
    const s = cover.filter((q) => present.has(q)).length;
    if (s > score) { best = cover; score = s; }
  }
  return best;
}
