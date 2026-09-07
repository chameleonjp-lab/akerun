import { describe, expect, it } from "vitest";
import {
  canResetMechanism,
  isCurrentResultSubmission,
  isOfficialProblemIdentity,
  isResultSubmissionPending,
  shouldForfeitOfficialReset,
} from "./RunLifecycle";

const context = {
  sessionActive: true,
  demoMode: false,
  trainingContract: false,
  developmentSeed: false,
  problemId: "AKERUN-01-V1",
  problemVersion: "V1",
};

describe("RunLifecycle", () => {
  it("blocks RESET after the mechanism has opened", () => {
    expect(canResetMechanism(false)).toBe(true);
    expect(canResetMechanism(true)).toBe(false);
  });

  it("recognizes only versioned official problem identities", () => {
    expect(isOfficialProblemIdentity("AKERUN-01-V1", "V1")).toBe(true);
    expect(isOfficialProblemIdentity("AKERUN-1-V1", "V1")).toBe(false);
    expect(isOfficialProblemIdentity("AKERUN-01", "DEV")).toBe(false);
  });

  it("waits for a verified result submission before replaying the same problem", () => {
    expect(isResultSubmissionPending("送信中…")).toBe(true);
    expect(isResultSubmissionPending("再送中…")).toBe(true);
    expect(isResultSubmissionPending("ランキングへ送信しました。")).toBe(false);
    expect(
      isResultSubmissionPending(
        "ランキング受付なし。プレイ結果は端末内へ保存します。"
      )
    ).toBe(false);
  });

  it("does not let a stale submission callback own a later result", () => {
    expect(isCurrentResultSubmission("run-2:result", "run-1:result")).toBe(
      false
    );
    expect(isCurrentResultSubmission("run-2:result", "run-2:result")).toBe(
      true
    );
    expect(isCurrentResultSubmission("", "")).toBe(false);
  });

  it("forfeits RESET during a ranked official run", () => {
    expect(shouldForfeitOfficialReset(context)).toBe(true);
  });

  it.each([
    ["inactive", { sessionActive: false }],
    ["demo", { demoMode: true }],
    ["training", { trainingContract: true }],
    ["development seed", { developmentSeed: true }],
    ["free practice", { recordable: false }],
    ["non-official puzzle", { problemId: "DEV-01", problemVersion: "DEV" }],
  ])("allows ordinary reset for %s", (_label, override) => {
    expect(shouldForfeitOfficialReset({ ...context, ...override })).toBe(false);
  });
});
