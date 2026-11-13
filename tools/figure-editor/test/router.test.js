// The JS router against fixtures made by the toolbox's Python route() (fixtures/gen_router_fixtures.py).

import { DIRECTIONS } from "../src/geometry.js";
import { directionProblems, roundHalfEven, route } from "../src/router.js";
import { assertEquals, fixture } from "./helpers.js";

const fx = JSON.parse(await fixture("router-fixtures.json"));
const end = (e) => ({ at: e.at, dir: e.direction ? DIRECTIONS[e.direction] : null });

Deno.test(`router matches the toolbox's route() on ${fx.cases.length} fixtures`, () => {
  for (const [i, c] of fx.cases.entries()) {
    assertEquals(route(end(c.start), end(c.end), c.via, c.first), c.corners, `case ${i}: ${JSON.stringify(c)}`);
  }
});

Deno.test("Z midpoints round half to even, like Python's round()", () => {
  assertEquals([0.5, 1.5, 2.5, -0.5, -1.5, 10.5, 11.5].map(roundHalfEven), [0, 2, 2, 0, -2, 10, 12]);
});

Deno.test("a wire leaving its pin backwards is flagged", () => {
  const start = { at: [0, 0], dir: [1, 0] }, stop = { at: [-6, 0], dir: null };
  assertEquals(directionProblems(route(start, stop), start, stop), ["leaves its start pin backwards, through the element"]);
});
