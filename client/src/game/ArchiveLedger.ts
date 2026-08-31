/**
 * Vault Tumbler Lab — 端末内だけで保持する報酬鑑定帳。
 * 個人情報は保存せず、解放済み収蔵品の識別子・回数・初回日時のみを記録する。
 */
import {
  isRewardUnlockedByRun,
  REWARD_DEFINITIONS,
  type PuzzleDefinition,
  type RewardDefinition,
  type RewardRunMetrics,
} from "./GameDefinitions";

export type ArchiveRecord = {
  readonly rewardId: string;
  readonly firstUnlockedAt: string;
  readonly unlockCount: number;
};

const STORAGE_KEY = "vault-tumbler-lab-archive";
const REWARD_IDS = new Set(REWARD_DEFINITIONS.map(reward => reward.id));
const isStoredDate = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length <= 64 &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;

const incrementUnlockCount = (value: number) =>
  value >= Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : value + 1;

export const isStoredArchiveRecord = (
  value: unknown
): value is ArchiveRecord => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.rewardId === "string" &&
    REWARD_IDS.has(record.rewardId) &&
    isStoredDate(record.firstUnlockedAt) &&
    typeof record.unlockCount === "number" &&
    Number.isSafeInteger(record.unlockCount) &&
    record.unlockCount >= 1
  );
};

export class ArchiveLedger {
  private records = new Map<string, ArchiveRecord>();

  constructor() {
    this.restore();
  }

  unlock(reward: RewardDefinition) {
    if (!REWARD_IDS.has(reward.id)) return null;
    const previous = this.records.get(reward.id);
    const record: ArchiveRecord = previous
      ? { ...previous, unlockCount: incrementUnlockCount(previous.unlockCount) }
      : {
          rewardId: reward.id,
          firstUnlockedAt: new Date().toISOString(),
          unlockCount: 1,
        };
    this.records.set(reward.id, record);
    this.persist();
    return record;
  }

  unlockForRun(puzzle: PuzzleDefinition, result: RewardRunMetrics) {
    const newlyUnlocked: RewardDefinition[] = [];
    REWARD_DEFINITIONS.forEach(reward => {
      if (!isRewardUnlockedByRun(reward, puzzle, result)) return;
      if (!this.records.has(reward.id)) newlyUnlocked.push(reward);
      this.unlock(reward);
    });
    return newlyUnlocked;
  }

  get(rewardId: string) {
    return this.records.get(rewardId) ?? null;
  }

  get unlockedCount() {
    return this.records.size;
  }

  private restore() {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as ArchiveRecord[];
      if (!Array.isArray(parsed)) return;
      parsed.forEach(record => {
        if (!isStoredArchiveRecord(record)) return;
        const previous = this.records.get(record.rewardId);
        if (!previous) {
          this.records.set(record.rewardId, {
            rewardId: record.rewardId,
            firstUnlockedAt: record.firstUnlockedAt,
            unlockCount: record.unlockCount,
          });
          return;
        }
        const firstUnlockedAt =
          Date.parse(record.firstUnlockedAt) <
          Date.parse(previous.firstUnlockedAt)
            ? record.firstUnlockedAt
            : previous.firstUnlockedAt;
        const unlockCount = Math.max(previous.unlockCount, record.unlockCount);
        if (
          firstUnlockedAt !== previous.firstUnlockedAt ||
          unlockCount !== previous.unlockCount
        ) {
          this.records.set(record.rewardId, {
            rewardId: record.rewardId,
            firstUnlockedAt,
            unlockCount,
          });
        }
      });
    } catch {
      // ストレージが使えない環境でも、当該プレイ中の鑑定帳は機能する。
    }
  }

  private persist() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(Array.from(this.records.values()))
      );
    } catch {
      // 保存に失敗しても開錠体験を阻害しない。
    }
  }
}
