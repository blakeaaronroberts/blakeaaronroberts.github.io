# sim/

The four-valued logic simulator: `simulate(circuit, scenario, options) -> trace`.
Plain JavaScript, no dependencies, no file access, so it runs in the browser,
under Node and under Deno.

```js
import { simulate, describe } from "./sim/simulate.mjs";
const trace = simulate(circuit, scenario);                    // zero delay
const timed = simulate(circuit, scenario, { delays: true });  // 1 unit per output
describe(circuit); // { simulated: [...], notSimulated: [...] }
```

| File | What |
|---|---|
| `logic.mjs` | The levels `0`, `1`, `X`, `Z` and one logic model per element type |
| `simulate.mjs` | Nets, drivers, the event loop, loop detection |
| `cli.mjs` | `node sim/cli.mjs <scenario.json> [--delays]` prints the trace |

- Input: `circuit/0.2` to `circuit/0.4` (0.4 instances are flattened first by `flatten.mjs`: an instance's element `g1` becomes `<instance>_g1`; a flattened name that collides is an error), and `scenario/0.1` or `0.2`. Output:
  `trace/0.1` (see `schema/`).
- `scenario/0.2` `initial` sets a flip-flop's or latch's stored state before
  step 0 (otherwise X). `force` holds
  a net at a level over steps `from` to `to` (inclusive), beating every
  driver; the trace lists those stretches in `forced`. Unknown names,
  stateless elements and overlapping forces on one net (or on nets a closed
  switch joins) are errors.
- `simulate()` checks the scenario's rules itself and throws on the first one
  broken, so it can be called without the validators. Steps times nets may be
  at most 1,000,000 (`STEP_NET_BUDGET`).
- Gates: `and_gate`, `or_gate`, `nand_gate`, `nor_gate`, `xor_gate` (each
  with `params.n`, 2 to 8 inputs A, B, C, ...), `not_gate`, `mux2`,
  `decoder2to4`, `full_adder`, `vdd` and `ground` (a constant 1 and 0 on pin
  1), and `switch` (`params.closed: true` joins its two nets). Anything else, including `block`, is drawn but not simulated;
  `describe()` lists them.
- Latches: `sr_latch` (S, R; `params.active` `"high"` for NOR or `"low"` for
  NAND; optional EN makes it gated), `d_latch` (D and CLK, its enable).
- Flip-flops: `d_flipflop` (D), `jk_flipflop` (J, K), `t_flipflop` (T), each
  with CLK and optional PREn and CLRn (asynchronous, active-low), CE (clock
  enable) and `params.edge` `"rising"` or `"falling"`; `d_flipflop_sr` has
  SET and RST (active-high) in place of PREn and CLRn. An unconnected option
  pin is inactive.
- Sequential models are written for 0 and 1 and made four-valued by trying
  each unknown input both ways: an uncertain edge, enable or control gives X
  only when the result depends on it.
- The first known level (0 or 1) a flip-flop's clock has is where it starts,
  never an edge, whenever it arrives. After that, 0 to X and X to 1 might be
  an edge.
- **Clock races.** With zero delay, a change spreads in rounds. A flip-flop
  clocked straight from a port sees the edge before any flip-flop's output
  moves. One whose clock comes from a gate or another flip-flop sees it a round
  later, and can capture data that the same edge has already changed: a shift
  register whose second stage is clocked through a buffer collapses into one
  stage. HDL simulators do
  the same. The trace carries one `derived_clock` warning naming those
  flip-flops (not latches, whose enable is level-sensitive). Clock every flip-flop
  from a port and use CE, or give the gate a delay and the data path a longer one.
- Z on a gate input reads as X. A net with no driver is Z; drivers that
  disagree give X.
- Delays: `{ delays: true }` or `{ delays: { default: n } }`. An element's
  `params.delay` (a number, or `{ pin: number }`) overrides the default.
- Feedback (cross-coupled gates, rings) is simulated gate by gate and needs no
  special element. A loop that settles is not reported. One that never
  settles is forced to X for the rest of that step, with one `loop` warning,
  so a run always ends.

Tests: `node tests/sim.test.mjs`, and `node tests/parity.test.mjs` for more
latch, flip-flop and feedback cases. Committed traces in `examples/traces/` are
regenerated in CI and must not change.
