import { describe, expect, it } from "vitest";
import { isOfficialProblemIdentity, shouldForfeitOfficialReset } from "./RunLifecycle";

const context = {
  sessionActive: true,
  demoMode: false,
  trainingContract: false,
  developmentSeed: false,
  problemId: "AKERUN-01-V1",
  problemVersion: "V1",
};

describe("RunLifecycle", () => {
  it("recognizes only versioned official problem identities", () => {
    expect(isOfficialProblemIdentity("AKERUN-01-V1", "V1")).toBe(true);
    expect(isOfficialProblemIdentity("AKERUN-1-V1", "V1")).toBe(false);
    expect(isOfficialProblemIdentity("AKERUN-01", "DEV")).toBe(false);
  });

  it("forfeits RESET during a ranked official run", () => {
    expect(shouldForfeitOfficialReset(context)).toBe(true);
  });

  it.each([
    ["inactive", { sessionActive: false }],
    ["demo", { demoMode: true }],
    ["training", { trainingContract: true }],
    ["development seed", { developmentSeed: true }],
    ["non-official puzzle", { problemId: "DEV-01", problemVersion: "DEV" }],
  ])("allows ordinary reset for %s", (_label, override) => {
    expect(shouldForfeitOfficialReset({ ...context, ...override })).toBe(false);
  });
});
