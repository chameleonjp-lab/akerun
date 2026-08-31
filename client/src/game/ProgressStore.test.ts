import { describe, expect, it, vi } from "vitest";
import { ProgressStore } from "./ProgressStore";
import { LockMechanism } from "./LockMechanism";
import { RunSession, type RunResult } from "./RunSession";
import { createOfficialPuzzle } from "./GameDefinitions";

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

const verifiedResult: RunResult = {
  ...result,
  operationTrace: {
    version: 1,
    events: [[0, "rotate", -1]],
    truncated: false,
  },
};

describe("ProgressStore", () => {
  it("keeps every pending result instead of truncating the queue", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
    const store = new ProgressStore();
    for (let index = 0; index < 12; index += 1) {
      store.enqueueRanking("player one", {
        ...result,
        score: result.score + index,
        elapsedTime: result.elapsedTime + index,
      });
    }
    expect(store.getPendingRankings()).toHaveLength(12);
    expect(store.getPendingRankings()[0]?.result.score).toBe(result.score);
    vi.unstubAllGlobals();
  });

  it("uses faults, time, and excess rotation to break equal-score ties", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
    const store = new ProgressStore();
    expect(
      store.recordBest({
        ...result,
        faultCount: 2,
        elapsedTime: 30,
        excessDialSteps: 20,
      }).improved
    ).toBe(true);
    expect(
      store.recordBest({
        ...result,
        faultCount: 1,
        elapsedTime: 30,
        excessDialSteps: 20,
      }).improved
    ).toBe(true);
    expect(
      store.recordBest({
        ...result,
        faultCount: 1,
        elapsedTime: 25,
        excessDialSteps: 20,
      }).improved
    ).toBe(true);
    expect(
      store.recordBest({
        ...result,
        faultCount: 1,
        elapsedTime: 25,
        excessDialSteps: 10,
      }).improved
    ).toBe(true);
    vi.unstubAllGlobals();
  });

  it("records official clears for the progression mode", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
    const store = new ProgressStore();

    expect(store.recordOfficialClear("AKERUN-01-V1", "V1")?.clearCount).toBe(1);
    expect(store.recordOfficialClear("AKERUN-01-V1", "V1")?.clearCount).toBe(2);
    expect(store.getOfficialClearKeys()).toEqual(["AKERUN-01-V1@V1"]);

    vi.unstubAllGlobals();
  });

  it("saves and restores the player name and best result", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
    const store = new ProgressStore();
    expect(store.savePlayerName("  player   one  ")).toBe("player one");
    expect(store.getPlayerName()).toBe("player one");
    expect(store.recordBest(result).improved).toBe(true);
    expect(store.getBest("AKERUN-01-V1", "V1")?.score).toBe(11000);
    expect(
      store.saveActiveRun("AKERUN-01-V1", "V1", "player one").problemId
    ).toBe("AKERUN-01-V1");
    expect(store.getActiveRun()?.playerName).toBe("player one");
    store.enqueueRanking("player one", result);
    expect(store.getPendingRankings()).toHaveLength(1);
    store.removePendingForResult(result);
    expect(store.getPendingRankings()).toHaveLength(0);
    store.clearActiveRun();
    expect(store.getActiveRun()).toBeNull();
    vi.unstubAllGlobals();
  });

  it("keeps failed run cleanup durable until the server confirms it", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
    const store = new ProgressStore();

    store.enqueueRunAbandonment("run-token-1");
    store.enqueueRunAbandonment("run-token-1");

    expect(store.getPendingRunAbandonments()).toHaveLength(1);
    expect(store.getPendingRunAbandonments()[0]?.runToken).toBe("run-token-1");
    store.removeRunAbandonment("run-token-1");
    expect(store.getPendingRunAbandonments()).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it("keeps the verified run token with an active and pending result", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
    const store = new ProgressStore();
    store.saveActiveRun("AKERUN-01-V1", "V1", "player one", "run-token-1");
    expect(store.getActiveRun()?.rankingRunToken).toBe("run-token-1");
    store.enqueueRanking("player one", verifiedResult, "run-token-1");
    expect(store.getPendingRankings()[0]?.rankingRunToken).toBe("run-token-1");
    store.removePendingForResult(verifiedResult, "run-token-1");
    expect(store.getPendingRankings()).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it("persists a completed official result before clearing its active run", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
    const store = new ProgressStore();
    store.saveActiveRun("AKERUN-01-V1", "V1", "player one", "run-token-1");

    store.persistOfficialCompletion(
      "player one",
      verifiedResult,
      "run-token-1"
    );

    expect(store.getActiveRun()).toBeNull();
    expect(store.getBest("AKERUN-01-V1", "V1")).toEqual(result);
    expect(store.getPendingRankings()).toHaveLength(1);
    expect(store.getPendingRankings()[0]?.rankingRunToken).toBe("run-token-1");
    vi.unstubAllGlobals();
  });

  it("persists a completed competition only for durable ranking retry", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
    const store = new ProgressStore();
    store.saveActiveRun(
      "AKERUN-01-V1",
      "V1",
      "player one",
      "competition-token",
      undefined,
      "competition",
      "2026-02-01"
    );

    store.persistCompetitionCompletion(
      "player one",
      verifiedResult,
      "competition-token"
    );

    expect(store.getActiveRun()).toBeNull();
    expect(store.getBest("AKERUN-01-V1", "V1")).toBeNull();
    expect(store.getOfficialClearRecords()).toEqual([]);
    expect(store.getPendingRankings()).toMatchObject([
      { rankingRunToken: "competition-token" },
    ]);
    vi.unstubAllGlobals();
  });

  it("keeps the React archive view consistent with the strict archive ledger", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
    values.set(
      "vault-tumbler-lab-archive",
      JSON.stringify([
        {
          rewardId: "aurora-cache",
          firstUnlockedAt: "2026-02-01T00:00:00.000Z",
          unlockCount: 1,
        },
        {
          rewardId: "aurora-cache",
          firstUnlockedAt: "2026-02-01T00:00:00.000Z",
          unlockCount: 1,
        },
        {
          rewardId: "aurora-needle",
          firstUnlockedAt: "2026-02-30T00:00:00.000Z",
          unlockCount: 2,
        },
        {
          rewardId: "unknown",
          firstUnlockedAt: "2026-02-01T00:00:00.000Z",
          unlockCount: 1,
        },
      ])
    );

    expect(new ProgressStore().getArchiveIds()).toEqual(["aurora-cache"]);
    vi.unstubAllGlobals();
  });

  it("rejects unknown clear records and invalid competition days", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
    values.set(
      "akerun-official-clears-v1",
      JSON.stringify([
        {
          problemId: "AKERUN-01-V1",
          problemVersion: "V1",
          firstClearedAt: "2026-02-30T00:00:00.000Z",
          clearCount: 1,
        },
        {
          problemId: "UNKNOWN",
          problemVersion: "V1",
          firstClearedAt: "2026-01-01T00:00:00.000Z",
          clearCount: 99,
        },
        {
          problemId: "AKERUN-01-V1",
          problemVersion: "V1",
          firstClearedAt: "2026-01-01T00:00:00.000Z",
          clearCount: 2,
        },
      ])
    );
    values.set(
      "akerun-active-run",
      JSON.stringify({
        problemId: "AKERUN-01-V1",
        problemVersion: "V1",
        playerName: "player one",
        runMode: "competition",
        competitionDay: "2026-02-30",
      })
    );

    const store = new ProgressStore();
    expect(store.getOfficialClearRecords()).toEqual([
      {
        problemId: "AKERUN-01-V1",
        problemVersion: "V1",
        firstClearedAt: "2026-01-01T00:00:00.000Z",
        clearCount: 2,
      },
    ]);
    expect(store.getActiveRun()).toBeNull();
    expect(store.recordOfficialClear("UNKNOWN", "V1")).toBeNull();
    vi.unstubAllGlobals();
  });

  it("does not enqueue a tokened result without a complete replay trace", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
    const store = new ProgressStore();
    expect(
      store.enqueueRanking("player one", result, "run-token-1")
    ).toHaveLength(0);
    expect(store.getPendingRankings()).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it("persists a valid active checkpoint and rejects malformed checkpoint data", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
    const puzzle = createOfficialPuzzle("AKERUN-01-V1");
    const mechanism = new LockMechanism(puzzle);
    const session = new RunSession(puzzle);
    session.advance(4.25);
    session.recordDial(7);
    const checkpoint = {
      runElapsed: 4.25,
      mechanism: mechanism.snapshot,
      session: session.snapshot,
    };
    const store = new ProgressStore();

    store.saveActiveRun(
      "AKERUN-01-V1",
      "V1",
      "player one",
      "run-token-1",
      checkpoint
    );
    expect(store.getActiveRun()?.checkpoint?.session.elapsedTime).toBe(4.25);

    values.set(
      "akerun-active-run",
      JSON.stringify({
        problemId: "AKERUN-01-V1",
        problemVersion: "V1",
        playerName: "player one",
        rankingRunToken: "run-token-1",
        checkpoint: { runElapsed: "not-a-number" },
      })
    );
    expect(store.getActiveRun()?.checkpoint).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it("restores competition mode and its Japan-local day", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
    const store = new ProgressStore();

    store.saveActiveRun(
      "AKERUN-07-V1",
      "V1",
      "player one",
      "competition-run-1",
      null,
      "competition",
      "2026-08-29"
    );

    expect(store.getActiveRun()).toMatchObject({
      runMode: "competition",
      competitionDay: "2026-08-29",
      rankingRunToken: "competition-run-1",
    });
    vi.unstubAllGlobals();
  });

  it("rejects malformed local results, pending rows, and blank active runs", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
    values.set(
      "akerun-self-bests",
      JSON.stringify({
        "AKERUN-01-V1@V1": { ...result, score: "not-a-number" },
      })
    );
    values.set(
      "akerun-pending-rankings",
      JSON.stringify([
        {
          id: "bad-result",
          playerName: "player",
          result: { ...result, elapsedTime: "later" },
        },
        { id: "blank-name", playerName: "   ", result },
      ])
    );
    values.set(
      "akerun-active-run",
      JSON.stringify({
        problemId: "AKERUN-01-V1",
        problemVersion: "V1",
        playerName: "   ",
      })
    );

    const store = new ProgressStore();
    expect(store.getBest("AKERUN-01-V1", "V1")).toBeNull();
    expect(store.getPendingRankings()).toHaveLength(0);
    expect(store.getActiveRun()).toBeNull();
    vi.unstubAllGlobals();
  });
});
