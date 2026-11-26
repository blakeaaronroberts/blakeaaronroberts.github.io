// L2.1: number systems. Pure functions, no page code. Values and bit patterns are BigInt, so 32 bits is exact.
// Systems: unsigned, sign-magnitude, ones' complement, two's complement.

export const MAX_WIDTH = 32;
export const SYSTEMS = ["unsigned", "signmag", "ones", "twos"];
export const SYSTEM_NAMES = { unsigned: "Unsigned", signmag: "Sign-magnitude", ones: "Ones' complement", twos: "Two's complement" };
export const BASES = { 2: "Binary", 10: "Decimal", 16: "Hexadecimal" };

const DIGITS = { 2: "01", 10: "0123456789", 16: "0123456789ABCDEF" };
const DIGIT_HELP = { 2: "use 0 and 1", 10: "use 0 to 9", 16: "use 0 to 9 and A to F" };
const BASE_WORD = { 2: "binary", 10: "decimal", 16: "hexadecimal" };

const pow2 = (k) => 1n << BigInt(k);
const mask = (n) => pow2(n) - 1n;

export const checkWidth = (n) => (Number.isInteger(n) && n >= 1 && n <= MAX_WIDTH ? null : `The width must be a whole number from 1 to ${MAX_WIDTH}.`);
export const toBits = (pattern, n) => pattern.toString(2).padStart(n, "0");
export const toHex = (pattern, n) => pattern.toString(16).toUpperCase().padStart(Math.ceil(n / 4), "0");
const invert = (bits) => [...bits].map((b) => (b === "0" ? "1" : "0")).join("");
const addOne = (bits) => toBits((BigInt("0b" + bits) + 1n) & mask(bits.length), bits.length);

/** Smallest and largest value of `system` in n bits. */
export function rangeFor(n, system) {
  const half = pow2(n - 1);
  if (system === "unsigned") return { min: 0n, max: pow2(n) - 1n };
  if (system === "twos") return { min: -half, max: half - 1n };
  return { min: -(half - 1n), max: half - 1n };   // sign-magnitude and ones' complement have two zeros
}

/** Read the text the person typed in `base`. Returns {empty} | {error} | {value, negative}. Binary and hex are bit patterns, so they take no sign. */
export function parseNumber(text, base) {
  let s = String(text).replace(/[\s_]/g, "");
  if (s === "") return { empty: true };
  let negative = false;
  if (s[0] === "-" || s[0] === "+") {
    if (base !== 10) return { error: `A sign goes only with decimal entry. A ${BASE_WORD[base]} entry is a bit pattern; choose decimal to enter a negative number.` };
    negative = s[0] === "-"; s = s.slice(1);
    if (s === "") return { error: "A sign needs digits after it." };
  }
  if (base === 2) s = s.replace(/^0[bB]/, "");
  if (base === 16) s = s.replace(/^0[xX]/, "");
  if (s === "") return { error: `No digits after the prefix.` };
  for (const ch of s) {
    if (!DIGITS[base].includes(ch.toUpperCase())) return { error: `"${ch}" is not a ${BASE_WORD[base]} digit (${DIGIT_HELP[base]}).` };
  }
  const value = base === 10 ? BigInt(s) : BigInt((base === 2 ? "0b" : "0x") + s);
  return { value: negative ? -value : value, negative };
}

/** Value to bit pattern. `steps` lists the working for a negative value. */
export function encode(value, n, system) {
  const range = rangeFor(n, system);
  if (value < range.min || value > range.max) {
    return { ok: false, overflow: true, range, message: `${value} does not fit in ${n} ${n === 1 ? "bit" : "bits"} as ${SYSTEM_NAMES[system].toLowerCase()}. The range is ${range.min} to ${range.max}.` };
  }
  const steps = [];
  let pattern;
  if (value >= 0n) pattern = value;
  else {
    const mag = -value, magBits = toBits(mag, n);
    steps.push({ label: `Magnitude ${mag} in ${n} bits`, bits: magBits });
    if (system === "signmag") { pattern = pow2(n - 1) | mag; steps.push({ label: "Set the sign bit to 1", bits: toBits(pattern, n) }); }
    else if (system === "ones") { pattern = BigInt("0b" + invert(magBits)); steps.push({ label: "Invert every bit", bits: toBits(pattern, n) }); }
    else {
      const inv = invert(magBits);
      steps.push({ label: "Invert every bit", bits: inv });
      pattern = BigInt("0b" + addOne(inv));
      steps.push({ label: "Add 1", bits: toBits(pattern, n) });
    }
  }
  return { ok: true, pattern, bits: toBits(pattern, n), steps };
}

/** Bit pattern to value. `terms` are the weights and bits; `steps` is the working for a pattern whose sign bit is set. */
export function decode(pattern, n, system) {
  const bits = toBits(pattern, n);
  const terms = [];
  for (let i = 0; i < n; i++) {
    const pos = n - 1 - i, bit = Number(bits[i]);
    let weight = pow2(pos);
    if (pos === n - 1 && system === "twos") weight = -weight;
    if (pos === n - 1 && system === "ones") weight = -(weight - 1n);
    if (pos === n - 1 && system === "signmag") weight = null;
    terms.push({ pos, bit, weight });
  }
  const sum = terms.reduce((a, t) => a + (t.weight === null ? 0n : t.weight * BigInt(t.bit)), 0n);
  const signBit = system === "signmag" ? Number(bits[0]) : null;
  const value = system === "signmag" && signBit ? -sum : sum;
  const negativeZero = value === 0n && (system === "signmag" || system === "ones") && pattern !== 0n;
  const steps = [];
  const negative = system !== "unsigned" && bits[0] === "1";
  if (negative && !negativeZero) {
    if (system === "signmag") steps.push({ label: "Clear the sign bit", bits: toBits(pattern & mask(n - 1), n) });
    else if (system === "ones") steps.push({ label: "Invert every bit", bits: invert(bits) });
    else { const inv = invert(bits); steps.push({ label: "Invert every bit", bits: inv }, { label: "Add 1", bits: addOne(inv) }); }
    steps.push({ label: `Magnitude ${-value}, so the value is ${value}`, bits: null });
  }
  return { bits, terms, sum, signBit, value, negativeZero, steps };
}

/** One call for the page. `base` is how `text` is written; for decimal it is a value, for binary and hex it is the bit pattern. */
export function convert({ text, base, width, system }) {
  const w = checkWidth(width);
  if (w) return { error: w };
  const p = parseNumber(text, base);
  if (p.empty) return { empty: true };
  if (p.error) return { error: p.error };
  const range = rangeFor(width, system);
  let pattern, encoded = null;
  if (base === 10) {
    encoded = encode(p.value, width, system);
    if (!encoded.ok) return { overflow: true, message: encoded.message, range, all: allSystems(p.value, width, true) };
    pattern = encoded.pattern;
  } else {
    pattern = p.value;
    if (pattern > mask(width)) {
      const need = pattern.toString(2).length;
      return { overflow: true, message: `${String(text).trim()} needs ${need} bits, but the width is ${width}. The largest pattern is ${toBits(mask(width), width)} (${toHex(mask(width), width)}).`, range, all: null };
    }
  }
  const decoded = decode(pattern, width, system);
  return {
    ok: true, width, system, range, pattern, bits: toBits(pattern, width), hex: toHex(pattern, width), unsigned: pattern,
    value: decoded.value, negativeZero: decoded.negativeZero, decoded, encoded, all: allSystems(base === 10 ? p.value : pattern, width, base === 10),
  };
}

/** The same input in all four systems: from a value (bit pattern or "does not fit"), or from a pattern (value). */
export function allSystems(input, n, fromValue) {
  return SYSTEMS.map((system) => {
    const range = rangeFor(n, system);
    if (fromValue) {
      const e = encode(input, n, system);
      return { system, range, bits: e.ok ? e.bits : null, hex: e.ok ? toHex(e.pattern, n) : null, value: input, overflow: !e.ok };
    }
    const d = decode(input, n, system);
    return { system, range, bits: toBits(input, n), hex: toHex(input, n), value: d.value, negativeZero: d.negativeZero, overflow: false };
  });
}
