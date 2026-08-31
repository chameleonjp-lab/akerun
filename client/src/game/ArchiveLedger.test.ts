import { afterEach, describe, expect, it, vi } from "vitest";
import { ArchiveLedger } from "./ArchiveLedger";
import {
  createOfficialPuzzle,
  isRewardUnlockedByRun,
  REWARD_DEFINITIONS,
  type RewardRunMetrics,
} from "./GameDefinitions";

const result = (
  overrides: Partial<RewardRunMetrics> = {}
): RewardRunMetrics => ({
  problemId: "AKERUN-01-V1",
  faultCount: 0,
  excessDialSteps: 0,
  observationAccuracy: 100,
  score: 10000,
  ...overrides,
});

describe("ArchiveLedger", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("収蔵品を通常18・希少9・特別3に分け、重複IDを持たない", () => {
    expect(REWARD_DEFINITIONS).toHaveLength(30);
    expect(
      REWARD_DEFINITIONS.filter(reward => reward.rarity === "standard")
    ).toHaveLength(18);
    expect(
      REWARD_DEFINITIONS.filter(reward => reward.rarity === "rare")
    ).toHaveLength(9);
    expect(
      REWARD_DEFINITIONS.filter(reward => reward.rarity === "special")
    ).toHaveLength(3);
    expect(new Set(REWARD_DEFINITIONS.map(reward => reward.id)).size).toBe(30);
  });

  it("問題、失敗、回転、観察精度、スコアの条件を個別に判定する", () => {
    const puzzle = createOfficialPuzzle("AKERUN-01-V1");
    const normal = REWARD_DEFINITIONS.find(
      reward => reward.id === "aurora-needle"
    );
    const clean = REWARD_DEFINITIONS.find(
      reward => reward.id === "rare-aurora-clean"
    );
    const precision = REWARD_DEFINITIONS.find(
      reward => reward.id === "rare-precision-rule"
    );
    if (!normal || !clean || !precision)
      throw new Error("test rewards missing");

    expect(isRewardUnlockedByRun(normal, puzzle, result())).toBe(true);
    expect(
      isRewardUnlockedByRun(
        normal,
        puzzle,
        result({ problemId: "AKERUN-02-V1" })
      )
    ).toBe(false);
    expect(
      isRewardUnlockedByRun(clean, puzzle, result({ faultCount: 1 }))
    ).toBe(false);
    expect(
      isRewardUnlockedByRun(precision, puzzle, result({ excessDialSteps: 41 }))
    ).toBe(false);
    expect(
      isRewardUnlockedByRun(
        precision,
        puzzle,
        result({ observationAccuracy: 87 })
      )
    ).toBe(false);
  });

  it("条件を満たした収蔵品だけを新規解放し、再挑戦では回数だけ増やす", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    const ledger = new ArchiveLedger();
    const puzzle = createOfficialPuzzle("AKERUN-01-V1");

    const first = ledger.unlockForRun(puzzle, result());
    expect(first.map(reward => reward.id)).toContain("aurora-cache");
    expect(first.map(reward => reward.id)).toContain("aurora-needle");
    expect(first.map(reward => reward.id)).not.toContain(
      "special-aurora-master"
    );
    expect(ledger.get("aurora-cache")?.unlockCount).toBe(1);

    const second = ledger.unlockForRun(puzzle, result());
    expect(second).toHaveLength(0);
    expect(ledger.get("aurora-cache")?.unlockCount).toBe(2);
    expect(ledger.unlockedCount).toBe(first.length);
  });

  it("ignores unknown, fractional, and negative archive records", () => {
    const values = new Map<string, string>();
    values.set(
      "vault-tumbler-lab-archive",
      JSON.stringify([
        {
          rewardId: "not-a-reward",
          firstUnlockedAt: new Date().toISOString(),
          unlockCount: 99,
        },
        {
          rewardId: "aurora-cache",
          firstUnlockedAt: new Date().toISOString(),
          unlockCount: 1.5,
        },
        {
          rewardId: "aurora-cache",
          firstUnlockedAt: new Date().toISOString(),
          unlockCount: 3,
        },
        {
          rewardId: "aurora-needle",
          firstUnlockedAt: new Date().toISOString(),
          unlockCount: -1,
        },
      ])
    );
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });

    const ledger = new ArchiveLedger();

    expect(ledger.unlockedCount).toBe(1);
    expect(ledger.get("aurora-cache")?.unlockCount).toBe(3);
    expect(ledger.get("not-a-reward")).toBeNull();
  });

  it("rejects rollover dates and keeps the earliest valid unlock date", () => {
    const values = new Map<string, string>();
    values.set(
      "vault-tumbler-lab-archive",
      JSON.stringify([
        {
          rewardId: "aurora-cache",
          firstUnlockedAt: "2026-02-30T00:00:00.000Z",
          unlockCount: 99,
        },
        {
          rewardId: "aurora-cache",
          firstUnlockedAt: "2026-02-02T00:00:00.000Z",
          unlockCount: 1,
        },
        {
          rewardId: "aurora-cache",
          firstUnlockedAt: "2026-02-01T00:00:00.000Z",
          unlockCount: 3,
        },
      ])
    );
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });

    const ledger = new ArchiveLedger();

    expect(ledger.get("aurora-cache")).toEqual({
      rewardId: "aurora-cache",
      firstUnlockedAt: "2026-02-01T00:00:00.000Z",
      unlockCount: 3,
    });
  });

  it("does not overflow a hostile unlock counter", () => {
    const values = new Map<string, string>();
    values.set(
      "vault-tumbler-lab-archive",
      JSON.stringify([
        {
          rewardId: "aurora-cache",
          firstUnlockedAt: "2026-02-01T00:00:00.000Z",
          unlockCount: Number.MAX_SAFE_INTEGER,
        },
      ])
    );
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });

    const ledger = new ArchiveLedger();

    expect(
      ledger.unlock(
        REWARD_DEFINITIONS.find(reward => reward.id === "aurora-cache")!
      )
    ).toMatchObject({ unlockCount: Number.MAX_SAFE_INTEGER });
  });
});
