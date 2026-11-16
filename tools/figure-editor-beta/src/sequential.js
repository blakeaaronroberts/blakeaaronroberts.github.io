// One transition for the sequential symbols and cross-coupled gates.

const binary = (value) => value === "0" || value === "1";
const inverse = (value) => value === "0" ? "1" : value === "1" ? "0" : "X";

function chooseQ(choose, reason) {
  const value = choose(reason);
  if (value === null) return null;
  if (!["0", "1", "X"].includes(value)) throw new Error("A state choice must be 0, 1, X, or cancel.");
  return value;
}

/**
 * Compute Q and Qn for one timing step. `previousClock` is null on the first
 * timing step; Frame 0 supplies state but does not define a clock edge.
 */
export function sequentialStep(type, input, previousQ, previousClock, choose) {
  if (typeof choose !== "function") throw new Error("A sequential-state decision handler is required.");
  const hold = () => previousQ === null || previousQ === undefined
    ? chooseQ(choose, "The previous state is not known.") : previousQ;
  const decide = (reason) => chooseQ(choose, reason);
  let q;
  if (type === "nand_latch" || type === "nor_latch") {
    const active = type === "nand_latch" ? "0" : "1";
    const inactive = inverse(active), a = input.A, b = input.B;
    if (!binary(a) || !binary(b)) q = decide("The latch inputs are ambiguous.");
    else if (a === active && b === active) q = decide("Both latch inputs are active.");
    else if (a === active && b === inactive) q = type === "nand_latch" ? "1" : "0";
    else if (b === active && a === inactive) q = type === "nand_latch" ? "0" : "1";
    else q = hold();
  } else if (type === "d_latch") {
    if (input.CLK === "0") q = hold();
    else if (input.CLK === "1") q = binary(input.D) ? input.D : decide("The latch data input is ambiguous.");
    else q = decide("The latch enable is ambiguous.");
  } else if (["d_flipflop", "d_flipflop_sr", "jk_flipflop", "t_flipflop"].includes(type)) {
    if (type === "d_flipflop_sr" && input.SET === "1" && input.RST === "1") q = decide("Set and reset are both active.");
    else if (type === "d_flipflop_sr" && input.SET === "1" && input.RST === "0") q = "1";
    else if (type === "d_flipflop_sr" && input.SET === "0" && input.RST === "1") q = "0";
    else if (type === "d_flipflop_sr" && (input.SET !== "0" || input.RST !== "0")) q = decide("Set or reset is ambiguous.");
    else if (previousClock === null) q = hold();
    else if (previousClock === "1" || input.CLK === "0") q = hold();
    else if (previousClock !== "0" || input.CLK !== "1") q = decide("The clock transition is ambiguous.");
    else if (type === "d_flipflop" || type === "d_flipflop_sr") q = binary(input.D) ? input.D : decide("The flip-flop data input is ambiguous.");
    else if (type === "t_flipflop") {
      if (input.T === "0") q = hold();
      else if (input.T === "1") { const prior = hold(); q = prior === null ? null : inverse(prior); }
      else q = decide("The toggle input is ambiguous.");
    } else if (input.J === "1" && input.K === "0") q = "1";
    else if (input.J === "0" && input.K === "1") q = "0";
    else if (input.J === "0" && input.K === "0") q = hold();
    else if (input.J === "1" && input.K === "1") { const prior = hold(); q = prior === null ? null : inverse(prior); }
    else q = decide("The JK inputs are ambiguous.");
  } else throw new Error(`Unsupported sequential element: ${type}`);
  return q === null ? null : { q, qn: inverse(q) };
}
