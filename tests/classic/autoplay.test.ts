import { expect, it } from "vitest";
import { autoBoundary, autoGap, cancelAutoReservation, recordAuto, startAuto, stopAuto, type AutoRun } from "@/classic/autoplay";
import { beginSpin, changeBet, createClassic, settleSpin, type ClassicSpin } from "@/classic/engine";

const options = { count: 10, lossLimit: 100, stopOnBig: true };
const spin = (ordinal: number, payout: number): ClassicSpin => ({ ordinal, bet: 10, payout, stops: [0, 0, 0], at: 0 });
const settle = (run: AutoRun, payout: number) => recordAuto({ ...run, pending: true }, spin(run.lastOrdinal + 1, payout), 1000);

it("validates explicit options and reserves only within a fixed net-loss budget", () => {
  expect(() => startAuto({ ...options, count: Infinity }, 10, 0)).toThrow();
  const run = startAuto({ ...options, lossLimit: 50 }, 25, 0);
  expect(autoBoundary({ ...run, wagered: 50 }, 1000)).toBe("limit");
  expect(autoBoundary({ ...run, wagered: 50, paid: 25 }, 1000)).toBeNull();
  expect(autoBoundary(run, 24)).toBe("funds");
});

it("counts only the reserved next result once and honors manual stop after settlement", () => {
  const run = { ...startAuto(options, 10, 0), pending: true };
  expect(recordAuto(run, spin(2, 10), 1000)).toBe(run);
  expect(recordAuto(run, { ...spin(1, 10), bet: 25 }, 1000)).toBe(run);
  const stopped = recordAuto(stopAuto(run, "manual"), spin(1, 20), 1010);
  expect(stopped).toMatchObject({ status: "stopped", reason: "manual", completed: 1, wagered: 10, paid: 20 });
  expect(recordAuto(stopped, spin(1, 20), 1010)).toBe(stopped);
  expect(cancelAutoReservation(stopAuto(run, "background"))).toMatchObject({ status: "stopped", pending: false, completed: 0 });
});

it("stops on count, budget or an optional big win and gives bigger awards time", () => {
  let run = startAuto(options, 10, 0);
  for (let i = 0; i < 10; i++) run = settle(run, 10);
  expect(run).toMatchObject({ completed: 10, status: "stopped", reason: "complete" });
  let losses = startAuto({ ...options, lossLimit: 50 }, 10, 0);
  for (let i = 0; i < 5; i++) losses = settle(losses, 0);
  expect(losses).toMatchObject({ completed: 5, reason: "limit" });
  expect(settle(startAuto(options, 10, 0), 120).reason).toBe("big-win");
  expect(settle(startAuto({ ...options, stopOnBig: false }, 10, 0), 120).status).toBe("running");
  expect(autoGap(spin(1, 120))).toBeGreaterThan(autoGap(spin(1, 20)));
});

it("100 automatic spins use unchanged seeded rules and retain totals beyond the 80-entry ledger", () => {
  let state = changeBet(createClassic(8), 5);
  let run = startAuto({ count: 100, lossLimit: 500, stopOnBig: false }, 5, 0);
  for (let i = 0; i < 100; i++) {
    expect(autoBoundary(run, state.credits)).toBeNull();
    state = settleSpin(beginSpin(state, i));
    run = recordAuto({ ...run, pending: true }, state.history[0]!, state.credits);
  }
  expect(state.history).toHaveLength(80);
  expect(run).toMatchObject({ completed: 100, wagered: state.wagered, paid: state.paid, reason: "complete" });
});
