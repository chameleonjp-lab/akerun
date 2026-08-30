import { describe, expect, it } from "vitest";
import { getStartCountdownSteps, START_COUNTDOWN_SECONDS } from "./StartCountdown";

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
});
