import { describe, expect, it } from "vitest";
import {
  getStartCountdownSteps,
  shouldAbortStartCountdown,
  START_COUNTDOWN_SECONDS,
} from "./StartCountdown";

describe("getStartCountdownSteps", () => {
  it("uses a visible 3, 2, 1 sequence by default", () => {
    expect(getStartCountdownSteps()).toEqual([3, 2, 1]);
    expect(START_COUNTDOWN_SECONDS).toBe(3);
  });

  it("normalizes invalid and fractional durations", () => {
    expect(getStartCountdownSteps(2.8)).toEqual([2, 1]);
    expect(getStartCountdownSteps(0)).toEqual([1]);
    expect(getStartCountdownSteps(Number.NaN)).toEqual([3, 2, 1]);
  });

  it("aborts startup when the countdown is interrupted or the document is hidden", () => {
    expect(shouldAbortStartCountdown(false, false, false)).toBe(true);
    expect(shouldAbortStartCountdown(true, true, false)).toBe(true);
    expect(shouldAbortStartCountdown(true, false, true)).toBe(true);
    expect(shouldAbortStartCountdown(true, false, false)).toBe(false);
  });
});
