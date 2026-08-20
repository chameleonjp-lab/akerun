import { describe, expect, it, vi } from "vitest";
import { ProgressStore } from "./ProgressStore";
import type { RunResult } from "./RunSession";

const result: RunResult = {
  elapsedTime: 24,
  faultCount: 0,
  totalDialSteps: 300,
  excessDialSteps: 0,
  falseGateContacts: 0,
  observationAccuracy: 100,
  score: 11000,
  problemId: "AKERUN-01-V1",
  problemVersion: "V1",
  difficulty: "beginner",
};

describe("ProgressStore", () => {
  it("saves and restores the player name and best result", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    const store = new ProgressStore();
    expect(store.savePlayerName("  player   one  ")).toBe("player one");
    expect(store.getPlayerName()).toBe("player one");
    expect(store.recordBest(result).improved).toBe(true);
    expect(store.getBest("AKERUN-01-V1", "V1")?.score).toBe(11000);
    expect(store.saveActiveRun("AKERUN-01-V1", "V1", "player one").problemId).toBe("AKERUN-01-V1");
    expect(store.getActiveRun()?.playerName).toBe("player one");
    store.enqueueRanking("player one", result);
    expect(store.getPendingRankings()).toHaveLength(1);
    store.removePendingForResult(result);
    expect(store.getPendingRankings()).toHaveLength(0);
    store.clearActiveRun();
    expect(store.getActiveRun()).toBeNull();
    vi.unstubAllGlobals();
  });
});
