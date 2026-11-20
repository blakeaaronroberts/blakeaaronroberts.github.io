# Engine memo: SystemVerilog, simulation and analog

Status: **approved by Blake 2026-11-19** (all decisions in section 7). Written by the Steward, 2026-11-19. Research only; no code.
Unblocks: circuit-model C11 (SystemVerilog import and export) and site F22 (SystemVerilog in the editor).
Closes: the third item in VISION.md section 9.

## 1. Recommendation

1. **Do not add a SystemVerilog simulator in Phase 1.** Our own four-valued simulator (`sim/`, model-v0.7.0) already runs every `circuit`. SystemVerilog only has to be *read* (to a `circuit` and a `scenario`) and *written* (from a `circuit` and a `scenario`). That needs a front end, not an engine.
2. **Front end: slang (MIT), reached through an adapter.** slang parses, type-checks and elaborates the whole language and can dump its result as JSON. Our importer reads that neutral JSON, so the engine can be swapped later without touching the mapper.
3. **Yosys (ISC) with yosys-slang (ISC) is the second stage, for behavioural code only** (`always_comb`, `always_ff`, `case`). It turns those into muxes, gates and flip-flops, which we map to `circuit` elements. Structural code (gate primitives, `assign`, instances, parameters) is mapped directly from slang's output, so the figure keeps the names, hierarchy and shape the author wrote.
4. **Testbench to `scenario`: a small stimulus interpreter on slang's output** (assignments, `#` delays, `repeat`, simple `for`). Anything else is reported as unsupported with a line number. No second simulator decides behaviour.
5. **Run it offline first, in the browser second.** C11 builds the importer as a Node command that works on any Linux machine (the VISION build rule). The browser route is a separate spike (section 5); if it fails, the editor accepts the converted JSON and the site stays static.
6. **Use Icarus Verilog and Verilator in CI only, as reference oracles** against our simulator. They never ship, so their copyleft licences do not touch the suite.
7. **Analog (Phase 3): ngspice compiled to WebAssembly** (BSD-3-Clause), through the existing `eecircuit-engine` package route. Decide at the start of Phase 3, not now; nothing in Phase 1 blocks it.
8. **Phase 2 "full language in the browser":** revisit Verilator or Icarus in WebAssembly then, with a licence review first (section 3).

## 2. What each candidate is

| Candidate | Job | Licence (as found) | Browser route | Verdict |
|---|---|---|---|---|
| slang | Parse, elaborate, AST as JSON | MIT | Its own site runs it live in a browser, so a WebAssembly build exists; we must confirm we can build and pin our own | **Primary front end** |
| yosys-slang | Gives Yosys the slang front end (`read_slang`) | ISC; embeds modified slang code under MIT | Needs Yosys in WebAssembly plus the plugin; not confirmed | **Stage 2, behavioural code** |
| Yosys | Synthesis: turns behaviour into gates, muxes, flip-flops | ISC | YoWASP publishes Yosys for WebAssembly on npm (ISC); about 30 MB unpacked in one version I saw | Stage 2 |
| Surelog / UHDM (Synlig) | Alternative SystemVerilog front end | Apache-2.0 (my recollection; not re-checked) | Not investigated | Fallback only; slang is stronger on compliance |
| Icarus Verilog | Event simulator | GPL-2.0-or-later | Third-party sites run it; not investigated | CI oracle only |
| Verilator | Cycle simulator via C++ | LGPL-3.0 or Artistic-2.0 (my recollection; not re-checked) | Antmicro announced a Verilator and Clang playground running in the browser (ORCONF 2026) | CI oracle now; revisit in Phase 2 |
| CXXRTL (in Yosys) | Compiled simulation from Yosys | ISC | Needs a C++ compiler in the browser | Not needed |
| ngspice | Analog simulator | Modified BSD (BSD-3-Clause); a few files carry other licences | `eecircuit-engine` (MIT wrapper) ships it as WebAssembly | **Phase 3 engine** |
| DigitalJS | Already embedded on the site (Blake, 2026-11-12) | Not re-checked | Runs Yosys on a server or in the browser | Leave as is; replace when C11 ships |

## 3. Licence position, both doors open

- **MIT, ISC, BSD:** compatible with open release and with transfer to a university. slang, yosys-slang, Yosys, ngspice and `eecircuit-engine` sit here.
- **GPL and LGPL (Icarus, Verilator):** serving a compiled copy from our site is distribution, which brings source-offer duties and a harder transfer. Keeping them in CI only avoids that. If Phase 2 wants them in the browser, the IP Inspector reviews first and the trade-off is written in `DECISIONS.md`.
- **Generated output:** text our own tools write (SystemVerilog, SPICE netlists) is ours. Do not embed copied standard text; cite clauses by number.
- **I am not a lawyer.** Items marked "my recollection" must be checked against the pinned release's licence files before we ship anything.
- Each shipped binary is pinned by release tag, vendored into the site build, and listed with its licence in `DECISIONS.md` (VISION section 3).

## 4. How the pieces fit the formats

```
SystemVerilog source
   |  slang (JSON AST)                    structural code: mapped directly
   |  Yosys + yosys-slang (proc, opt)     behavioural code: mapped from cells
   v
circuit (hierarchy kept)  +  scenario (from testbench `initial` blocks)
   |  our simulator (model-v0.7.0)
   v
trace  ->  timing diagram, frames, animation
```

Export is ours end to end: `circuit` to a module, `scenario` to a testbench. The round trip test is: export, read back with slang, import, compare circuits; CI also runs Icarus or Verilator on the exported pair and compares its waveform to our `trace`.

## 5. Spike before C11.1 (one short batch, no product code)

Run as step C11.0 so C11 stays honest about the browser route. Each question has a pass line.

| Question | Pass line |
|---|---|
| Can we build slang for WebAssembly ourselves and get the JSON AST for the course examples? | Yes, under a stated size, from a pinned tag, in CI |
| Can Yosys with yosys-slang run in WebAssembly (YoWASP or our own build) and write a netlist for a flip-flop and a case statement? | Yes, or a clear reason it cannot |
| What does the browser download cost? | Under 25 MB total, loaded only when someone imports SystemVerilog |
| Does every shipped file have a licence we can list? | Yes |

If the first two fail, C11 ships as the Node command and the editor loads its output; nothing else changes.

## 6. Risks

- **Name churn:** the yosys-slang project says it will be renamed slang-elab and may be usable without Yosys. Pin by tag and keep the adapter thin.
- **"Incomplete" front end:** yosys-slang describes itself as covering a synthesizable subset. That matches our scope; unsupported constructs are reported, never guessed.
- **Two behaviours:** if a real simulator ever drives figures, a mismatch with our simulator would show. The CI oracle exists to catch that early.
- **Download size:** WebAssembly builds are large. Load them on demand and cache them.

## 7. Decisions for Blake

1. Approve recommendations 1 to 6 (front end, staging, offline first, CI oracles).
2. Confirm Icarus and Verilator stay out of the shipped site in Phase 1.
3. Approve the spike C11.0 as the first step of C11.

Once approved, the Steward updates VISION.md section 9, queues C11.0 and re-words C11 and F22 to match.

## Sources

- slang: https://github.com/MikePopoloski/slang and https://sv-lang.com (MIT)
- yosys-slang: https://github.com/povik/yosys-slang (ISC; planned rename to slang-elab noted at https://registry.bazel.build/modules/yosys-slang)
- Yosys: https://github.com/YosysHQ/yosys (ISC)
- YoWASP: https://yowasp.org and https://www.npmjs.com/package/@yowasp/yosys (ISC)
- Synlig / Surelog: https://github.com/antmicro/yosys-systemverilog
- Icarus Verilog: https://en.wikipedia.org/wiki/Icarus_Verilog (GPL-2.0-or-later)
- Verilator in the browser (Antmicro, announced via staff posts, 2026): not independently verified; treat as a lead
- ngspice: https://ngspice.sourceforge.io/faq.html (modified BSD)
- eecircuit-engine: https://github.com/eelab-dev/EEcircuit (MIT)
