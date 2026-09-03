import { describe, expect, it } from "vitest";
import { isDialTrainingComplete } from "./TrainingProgress";

const aligned = {
  status: "active" as const,
  phase: "tension-ready",
  stage: 1,
  stageCount: 1,
};

describe("TrainingProgress", () => {
  it("finishes the dial-only contracts after all wheels are aligned", () => {
    expect(isDialTrainingComplete(1, aligned)).toBe(true);
    expect(
      isDialTrainingComplete(2, { ...aligned, stage: 2, stageCount: 2 })
    ).toBe(true);
  });

  it("does not finish while the dial or a later training step is active", () => {
    expect(
      isDialTrainingComplete(1, { ...aligned, phase: "dial", stage: 0 })
    ).toBe(false);
    expect(isDialTrainingComplete(1, { ...aligned, status: "paused" })).toBe(
      false
    );
    expect(isDialTrainingComplete(3, aligned)).toBe(false);
  });
});
