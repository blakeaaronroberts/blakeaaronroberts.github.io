// R1.4 (circuit/0.3): a straight leg snaps to 45 degrees by default; the editor's snap_degrees can change it; 0 is free.
import { snapAngle } from "../src/router.js";
import { assertEquals } from "./helpers.js";

Deno.test("straight legs snap to the nearest 45-degree direction, on grid points", () => {
  assertEquals(snapAngle([0, 0], [5, 1]), [5, 0]);
  assertEquals(snapAngle([0, 0], [4, 3]), [4, 4]);
  assertEquals(snapAngle([0, 0], [-3, 4]), [-4, 4]);
  assertEquals(snapAngle([2, 2], [2, -7]), [2, -7]);
  assertEquals(snapAngle([0, 0], [1, 6]), [0, 6]);
});

Deno.test("another step angle, or none (a free angle: Shift+Alt, or snap_degrees 0)", () => {
  assertEquals(snapAngle([0, 0], [5, 2], 0), [5, 2]);
  assertEquals(snapAngle([0, 0], [10, 1], 90), [10, 0]);
  assertEquals(snapAngle([0, 0], [10, 5], 30), [10, 6]);
  assertEquals(snapAngle([3, 3], [3, 3]), [3, 3]);
});
