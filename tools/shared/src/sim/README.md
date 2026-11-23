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

- Input: `circuit/0.2` or `circuit/0.3`, and `scenario/0.1` or `0.2`. Output:
  `trace/0.1` (see `schema/`).
- `scenario/0.2` `initial` sets a flip-flop's or latch's stored state before
  step 0 (otherwise X); the start of step 0 is not a clock edge. `force` holds
  a net at a level over steps `from` to `to` (inclusive), beating every
  driver; the trace lists those stretches in `forced`. Unknown names,
  stateless elements and overlapping forces on one net are errors.
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
- Z on a gate input reads as X. A net with no driver is Z; drivers that
  disagree give X.
- Delays: `{ delays: true }` or `{ delays: { default: n } }`. An element's
  `params.delay` (a number, or `{ pin: number }`) overrides the default.
- Feedback (cross-coupled gates, rings) is simulated gate by gate and needs no
  special element. A loop that settles is not reported. One that never
  settles is forced to X for the rest of that step, with one `loop` warning,
  so a run always ends.

Tests: `node tests/sim.test.mjs`, and `node tests/parity.test.mjs` for the
cases ported from the site beta's own evaluator. Committed traces in `examples/traces/` are
regenerated in CI and must not change.
