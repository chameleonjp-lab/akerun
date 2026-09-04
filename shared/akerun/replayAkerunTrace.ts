import { createOfficialPuzzle } from "./GameDefinitions.ts";
import { LockMechanism } from "./LockMechanism.ts";
import { isCompleteRunTrace, type RunTrace } from "./RunTrace.ts";
import {
  calculateAkerunScore,
  observationAccuracy,
  scoreExcessDialSteps,
} from "./ScoreContract.ts";

export type AkerunTraceReplay =
  | {
      readonly ok: true;
      readonly elapsedTimeMs: number;
      readonly eventCount: number;
      readonly totalDialSteps: number;
      readonly faultCount: number;
      readonly falseGateContacts: number;
      readonly avoidableFalseGateContacts: number;
      readonly excessDialSteps: number;
      readonly observationAccuracy: number;
      readonly score: number;
      readonly phase: string;
    }
  | {
      readonly ok: false;
      readonly reason: string;
    };

const failed = (reason: string): AkerunTraceReplay => ({ ok: false, reason });

const advanceMechanism = (
  mechanism: LockMechanism,
  fromMs: number,
  toMs: number
) => {
  let cursor = fromMs;
  while (cursor < toMs && !mechanism.opened) {
    const stepMs = Math.min(250, toMs - cursor);
    mechanism.tick(stepMs / 1000);
    cursor += stepMs;
  }
  return cursor;
};

export const replayAkerunTrace = (
  problemId: string,
  trace: unknown,
  elapsedTimeMs: number
): AkerunTraceReplay => {
  if (
    !Number.isInteger(elapsedTimeMs) ||
    elapsedTimeMs < 1000 ||
    elapsedTimeMs > 1_800_000
  ) {
    return failed("elapsed_time_invalid");
  }
  if (!isCompleteRunTrace(trace)) return failed("trace_invalid");

  let puzzle;
  try {
    puzzle = createOfficialPuzzle(problemId);
  } catch {
    return failed("problem_unavailable");
  }
  const mechanism = new LockMechanism(puzzle);
  let cursorMs = 0;
  let totalDialSteps = 0;
  let falseGateContacts = 0;
  let sawRotation = false;

  for (const event of trace.events) {
    const [atMs, kind, value] = event;
    if (atMs < cursorMs || atMs > elapsedTimeMs)
      return failed("trace_time_invalid");
    cursorMs = advanceMechanism(mechanism, cursorMs, atMs);
    if (mechanism.opened) return failed("trace_after_open");
    if (kind === "rotate") {
      sawRotation = true;
      mechanism.rotate(value);
      totalDialSteps += Math.abs(value);
      falseGateContacts += mechanism.lastRotationFalseGateContacts;
    } else if (kind === "tension") {
      mechanism.setTension(value);
    } else if (kind === "fence") {
      mechanism.setFenceTravel(value);
    } else if (kind === "bolt") {
      mechanism.setBoltTravel(value);
    } else {
      mechanism.setHandleTurn(value);
    }
    cursorMs = atMs;
  }

  cursorMs = advanceMechanism(mechanism, cursorMs, elapsedTimeMs);
  if (!sawRotation || !mechanism.opened || mechanism.phase !== "open") {
    return failed("trace_did_not_open");
  }
  const unavoidable = Math.max(0, puzzle.parFalseGateContacts ?? 0);
  const avoidableFalseGateContacts = Math.max(
    0,
    falseGateContacts - unavoidable
  );
  return {
    ok: true,
    elapsedTimeMs,
    eventCount: trace.events.length,
    totalDialSteps,
    faultCount: mechanism.faultCount,
    falseGateContacts,
    avoidableFalseGateContacts,
    excessDialSteps: scoreExcessDialSteps(puzzle, totalDialSteps),
    observationAccuracy: observationAccuracy(
      avoidableFalseGateContacts,
      mechanism.faultCount
    ),
    score: calculateAkerunScore(
      puzzle,
      elapsedTimeMs / 1000,
      mechanism.faultCount,
      totalDialSteps,
      avoidableFalseGateContacts
    ),
    phase: mechanism.phase,
  };
};

export type { RunTrace };
