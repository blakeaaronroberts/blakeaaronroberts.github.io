// The step editor's model: every edit it makes to the WaveDrom-format source.

import { addSignal, cellsOf, dataAt, empty, moveSignal, nextValue, removeSignal, setCell, setClock, setDelay, setSteps, stepCount } from "../src/model.js";

const assert = (c, m) => { if (!c) throw new Error(m ?? "assertion failed"); };
const eq = (a, b) => assert(JSON.stringify(a) === JSON.stringify(b), `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

Deno.test("a new diagram is empty; added signals start low for every step, clocks as clocks; no duplicates", () => {
  let v = empty();
  eq(v.signal, []);
  v = addSignal(addSignal(v, "D"), "clk", { clock: true });
  eq(v.signal.map((s) => s.wave), ["0.......", "p......."]);
  eq(addSignal(v, "D").signal.length, 2);
});

Deno.test("setting a step makes it explicit; later held steps follow it; shift (hold) continues the step before", () => {
  let v = addSignal(empty(), "D");
  v = setCell(v, 0, 3, "1");
  eq(v.signal[0].wave, "0..1....");
  eq(cellsOf(v.signal[0], 8).map((c) => c.value).join(""), "00011111");
  v = setCell(v, 0, 3, ".");
  eq(v.signal[0].wave, "0.......");
});

Deno.test("data steps keep their labels in order as steps are added and removed", () => {
  let v = addSignal(empty(), "Q");
  v = setCell(v, 0, 2, "=", "A");
  v = setCell(v, 0, 5, "=", "B");
  eq(v.signal[0].data, ["A", "B"]);
  v = setCell(v, 0, 1, "=", "Z0");
  eq(v.signal[0].data, ["Z0", "A", "B"]);
  eq(dataAt(v.signal[0], 6), "B");
  v = setCell(v, 0, 2, "0");
  eq(v.signal[0].data, ["Z0", "B"]);
});

Deno.test("steps, clock, delay, order and removal", () => {
  let v = addSignal(addSignal(empty(), "A"), "B");
  v = setSteps(v, 5);
  eq([stepCount(v), v.signal[0].wave], [5, "0...."]);
  v = setClock(v, 1, true);
  eq(v.signal[1].wave, "p....");
  v = setCell(v, 1, 2, "1");   // editing a clock makes it a plain signal
  eq(v.signal[1].wave, "0.1..");
  v = setDelay(v, 0, 0.25);
  eq(v.signal[0].delay, 0.25);
  eq(moveSignal(v, 1, -1).signal.map((s) => s.name), ["B", "A"]);
  eq(removeSignal(v, 0).signal.map((s) => s.name), ["B"]);
});

Deno.test("the click cycle goes 0, 1, X, Z, data and back", () => {
  eq(["0", "1", "x", "z", "="].map((c) => nextValue(c)), ["1", "x", "z", "=", "0"]);
  eq(nextValue("0", true), "=");
});
