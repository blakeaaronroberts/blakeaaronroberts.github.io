// The JS router against fixtures made by the toolbox's Python route() (fixtures/gen_router_fixtures.py).

import { DIRECTIONS } from "../src/geometry.js";
import { directionProblems, nearestOnPolyline, onPolyline, roundHalfEven, route, snapOntoPolyline } from "../src/router.js";
import { assert, assertClose, assertEquals, fixture } from "./helpers.js";

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

Deno.test("straight legs connect their stops directly while auto legs keep orthogonal routing", () => {
  const start = { at: [0, 0], dir: null }, end = { at: [6, 4], dir: null };
  assertEquals(route(start, end, [], null, ["straight"]), [[0, 0], [6, 4]]);
  assertEquals(route(start, end, [[3, 2]], null, ["straight", "auto"]), [[0, 0], [3, 2], [6, 2], [6, 4]]);
});

Deno.test("nearest and snap points work on any-angle grid segments", () => {
  const c = [[0, 0], [4, 6]];
  const nearest = nearestOnPolyline([1, 2], c);
  assertClose(nearest.at[0], 16 / 13);
  assertClose(nearest.at[1], 24 / 13);
  assert(onPolyline([2, 3], c));
  assertEquals(snapOntoPolyline(nearest.at, c), [2, 3]);
  assertEquals(snapOntoPolyline([1, 1.5], [[0, 0], [2, 3]]), [2, 3]);
});
