// L2.1: number systems core. Run: quarto run tools/logic/number-systems/test/run.js
import { rangeFor, parseNumber, encode, decode, convert, allSystems, checkWidth, toBits, toHex, SYSTEMS } from "../src/numbers.js";

const assert = (c, m) => { if (!c) throw new Error(m ?? "assertion failed"); };
const eq = (a, b, m = "") => assert(String(a) === String(b), `${m} expected ${b}, got ${a}`);

Deno.test("range for width n", () => {
  const r = (n, s) => { const x = rangeFor(n, s); return `${x.min}..${x.max}`; };
  eq(r(4, "twos"), "-8..7");
  eq(r(4, "unsigned"), "0..15");
  eq(r(4, "signmag"), "-7..7");
  eq(r(4, "ones"), "-7..7");
  eq(r(8, "twos"), "-128..127");
  eq(r(1, "twos"), "-1..0");
  eq(r(32, "twos"), "-2147483648..2147483647");
  eq(r(32, "unsigned"), "0..4294967295");
});

Deno.test("two's complement encodes both ways for every 4-bit value", () => {
  for (let v = -8; v <= 7; v++) {
    const e = encode(BigInt(v), 4, "twos");
    assert(e.ok, `${v} should fit`);
    eq(decode(e.pattern, 4, "twos").value, v, `round trip ${v}`);
  }
  eq(encode(-3n, 4, "twos").bits, "1101");
  eq(encode(-8n, 4, "twos").bits, "1000");
  eq(encode(7n, 4, "twos").bits, "0111");
});

Deno.test("every system round-trips over its whole range", () => {
  for (const s of SYSTEMS) {
    for (const n of [1, 2, 3, 4, 5]) {
      const { min, max } = rangeFor(n, s);
      for (let v = min; v <= max; v++) {
        const e = encode(v, n, s);
        assert(e.ok, `${s} ${n} ${v}`);
        eq(decode(e.pattern, n, s).value, v, `${s} ${n}-bit ${v}`);
      }
    }
  }
});

Deno.test("known patterns in each system", () => {
  eq(encode(-5n, 4, "signmag").bits, "1101");
  eq(encode(-5n, 4, "ones").bits, "1010");
  eq(encode(-5n, 4, "twos").bits, "1011");
  eq(decode(0b1011n, 4, "unsigned").value, 11);
  eq(decode(0b1011n, 4, "signmag").value, -3);
  eq(decode(0b1011n, 4, "ones").value, -4);
  eq(decode(0b1011n, 4, "twos").value, -5);
});

Deno.test("overflow is flagged with the range, never wrapped", () => {
  const e = encode(8n, 4, "twos");
  assert(!e.ok && e.overflow);
  assert(e.message.includes("-8 to 7"), e.message);
  assert(!encode(-9n, 4, "twos").ok);
  assert(!encode(-1n, 4, "unsigned").ok);
  assert(!encode(-8n, 4, "signmag").ok);
  assert(!encode(16n, 4, "unsigned").ok);
  assert(encode(15n, 4, "unsigned").ok);
});

Deno.test("two's complement working: magnitude, invert, add one", () => {
  const e = encode(-6n, 4, "twos");
  eq(e.steps.map((s) => s.bits).join(" "), "0110 1001 1010");
  eq(e.steps.map((s) => s.label).join("|"), "Magnitude 6 in 4 bits|Invert every bit|Add 1");
  const d = decode(0b1010n, 4, "twos");
  eq(d.steps.map((s) => s.bits).join(" "), "0101 0110 ");
  eq(d.value, -6);
  eq(encode(5n, 4, "twos").steps.length, 0, "no steps for a positive value");
});

Deno.test("weights: the sign bit of two's complement counts negative", () => {
  const d = decode(0b1101n, 4, "twos");
  eq(d.terms.map((t) => t.weight).join(","), "-8,4,2,1");
  eq(d.sum, -3);
  eq(decode(0b1101n, 4, "ones").terms.map((t) => t.weight).join(","), "-7,4,2,1");
  const s = decode(0b1101n, 4, "signmag");
  eq(s.terms[0].weight, null); eq(s.signBit, 1); eq(s.sum, 5); eq(s.value, -5);
});

Deno.test("two zeros in sign-magnitude and ones' complement", () => {
  assert(decode(0b1000n, 4, "signmag").negativeZero);
  assert(decode(0b1111n, 4, "ones").negativeZero);
  assert(!decode(0b0000n, 4, "signmag").negativeZero);
  assert(!decode(0b1000n, 4, "twos").negativeZero);
  eq(decode(0b1000n, 4, "twos").value, -8);
});

Deno.test("invalid digits are rejected with a message naming the digit", () => {
  assert(parseNumber("102", 2).error.includes('"2" is not a binary digit'));
  assert(parseNumber("12G", 16).error.includes('"G" is not a hexadecimal digit'));
  assert(parseNumber("12a", 10).error.includes('"a" is not a decimal digit'));
  assert(parseNumber("-101", 2).error.includes("sign"));
  assert(parseNumber("-", 10).error.length > 0);
  assert(parseNumber("0x", 16).error.length > 0);
  assert(parseNumber("  ", 10).empty);
});

Deno.test("parsing accepts prefixes, separators, either hex case and a decimal sign", () => {
  eq(parseNumber("0b1010", 2).value, 10);
  eq(parseNumber("1010_1010", 2).value, 170);
  eq(parseNumber("0xff", 16).value, 255);
  eq(parseNumber("FF", 16).value, 255);
  eq(parseNumber("0B", 16).value, 11, "0B in hex is the digits 0 and B");
  eq(parseNumber("-42", 10).value, -42);
  eq(parseNumber("+42", 10).value, 42);
  eq(parseNumber("007", 10).value, 7);
});

Deno.test("convert from decimal", () => {
  const r = convert({ text: "-3", base: 10, width: 4, system: "twos" });
  assert(r.ok); eq(r.bits, "1101"); eq(r.hex, "D"); eq(r.value, -3); eq(r.unsigned, 13);
  const o = convert({ text: "8", base: 10, width: 4, system: "twos" });
  assert(o.overflow && o.message.includes("-8 to 7"));
  eq(o.all.find((x) => x.system === "unsigned").bits, "1000", "8 still fits as unsigned");
});

Deno.test("convert from binary and hex patterns", () => {
  const r = convert({ text: "1111", base: 2, width: 4, system: "twos" });
  assert(r.ok); eq(r.value, -1); eq(r.unsigned, 15);
  const h = convert({ text: "0xF0", base: 16, width: 8, system: "twos" });
  assert(h.ok); eq(h.bits, "11110000"); eq(h.value, -16);
  const big = convert({ text: "10000", base: 2, width: 4, system: "unsigned" });
  assert(big.overflow && big.message.includes("needs 5 bits"), big.message);
  assert(convert({ text: "00001010", base: 2, width: 4, system: "unsigned" }).ok, "leading zeros do not count");
});

Deno.test("convert reports a bad width and bad digits as errors, not throws", () => {
  assert(convert({ text: "1", base: 10, width: 0, system: "twos" }).error);
  assert(convert({ text: "1", base: 10, width: 33, system: "twos" }).error);
  assert(convert({ text: "1", base: 10, width: 4.5, system: "twos" }).error);
  assert(convert({ text: "2", base: 2, width: 4, system: "twos" }).error);
  eq(checkWidth(32), null);
});

Deno.test("allSystems shows the same pattern's value in each system", () => {
  const a = allSystems(0b1011n, 4, false);
  eq(a.map((x) => x.value).join(","), "11,-3,-4,-5");
  const b = allSystems(-5n, 4, true);
  eq(b.map((x) => x.bits).join(","), ",1101,1010,1011");
});

Deno.test("32-bit values are exact", () => {
  const r = convert({ text: "-2147483648", base: 10, width: 32, system: "twos" });
  assert(r.ok); eq(r.hex, "80000000"); eq(r.bits, "1" + "0".repeat(31));
  eq(toHex(0xABn, 12), "0AB");
  eq(toBits(5n, 6), "000101");
});
