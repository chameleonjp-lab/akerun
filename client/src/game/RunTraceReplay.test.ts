import { describe, expect, it } from "vitest";
import { createOfficialPuzzle } from "./GameDefinitions";
import { LockMechanism } from "./LockMechanism";
import { replayAkerunTrace } from "../../../shared/akerun/replayAkerunTrace";
import type { RunTrace, RunTraceEvent } from "./RunTrace";

const buildOpeningTrace = () => {
  const puzzle = createOfficialPuzzle("AKERUN-01-V1");
  const mechanism = new LockMechanism(puzzle);
  const events: RunTraceEvent[] = [];
  let atMs = 0;

  const apply = (kind: RunTraceEvent[1], value: number) => {
    events.push([atMs, kind, value]);
    if (kind === "rotate") mechanism.rotate(value);
    else if (kind === "tension") mechanism.setTension(value);
    else if (kind === "fence") mechanism.setFenceTravel(value);
    else if (kind === "bolt") mechanism.setBoltTravel(value);
    else mechanism.setHandleTurn(value);
  };

  const wait = (milliseconds: number) => {
    let remaining = Math.max(0, milliseconds);
    while (remaining > 0 && !mechanism.opened) {
      const step = Math.min(250, remaining);
      mechanism.tick(step / 1000);
      atMs += step;
      remaining -= step;
    }
  };

  for (const stage of puzzle.stages) {
    for (let pass = 0; pass < stage.passes; pass += 1) {
      const distance = stage.direction === "cw"
        ? (stage.target - mechanism.dial + 100) % 100
        : (mechanism.dial - stage.target + 100) % 100;
      const steps = distance === 0 ? 100 : distance;
      for (let step = 0; step < steps; step += 1) {
        apply("rotate", stage.direction === "cw" ? 1 : -1);
        atMs += 1;
      }
    }
  }

  if (mechanism.phase === "settling") {
    wait(Math.ceil(puzzle.vault.personality.settlingDelaySeconds * 1000));
  }
  const tensionBand = puzzle.difficulty.tensionBand;
  apply("tension", (tensionBand[0] + tensionBand[1]) / 2);
  wait(Math.ceil(puzzle.difficulty.tensionHoldSeconds * 1000) + 20);
  const fenceBand = puzzle.difficulty.fenceBand;
  apply("fence", (fenceBand[0] + fenceBand[1]) / 2);
  wait(Math.ceil(puzzle.difficulty.fenceHoldSeconds * 1000) + 20);
  apply("bolt", 0.82);
  wait(250);
  apply("handle", mechanism.requiredHandleTurn);
  wait(250);

  return {
    trace: { version: 1, events, truncated: false } satisfies RunTrace,
    elapsedTimeMs: atMs,
  };
};

describe("replayAkerunTrace", () => {
  it("replays a complete official route to the open state", () => {
    const input = buildOpeningTrace();
    const replay = replayAkerunTrace("AKERUN-01-V1", input.trace, input.elapsedTimeMs);
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    expect(replay.phase).toBe("open");
    expect(replay.totalDialSteps).toBeGreaterThan(0);
    expect(replay.eventCount).toBe(input.trace.events.length);
  });

  it("rejects a trace changed after recording", () => {
    const input = buildOpeningTrace();
    const events = input.trace.events.slice() as RunTraceEvent[];
    const last = events[events.length - 1]!;
    events[events.length - 1] = [last[0], "handle", 0];
    const replay = replayAkerunTrace(
      "AKERUN-01-V1",
      { ...input.trace, events },
      input.elapsedTimeMs,
    );
    expect(replay.ok).toBe(false);
  });

  it("rejects empty or too-short result timing", () => {
    expect(replayAkerunTrace(
      "AKERUN-01-V1",
      { version: 1, events: [[0, "rotate", 1]], truncated: false },
      1000,
    )).toMatchObject({ ok: false });
    expect(replayAkerunTrace("AKERUN-01-V1", { version: 1, events: [], truncated: false }, 1000))
      .toMatchObject({ ok: false, reason: "trace_invalid" });
  });
});
