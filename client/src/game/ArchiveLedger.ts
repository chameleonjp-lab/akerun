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

export class ArchiveLedger {
  private records = new Map<string, ArchiveRecord>();

  constructor() {
    this.restore();
  }

  unlock(reward: RewardDefinition) {
    const previous = this.records.get(reward.id);
    const record: ArchiveRecord = previous
      ? { ...previous, unlockCount: previous.unlockCount + 1 }
      : { rewardId: reward.id, firstUnlockedAt: new Date().toISOString(), unlockCount: 1 };
    this.records.set(reward.id, record);
    this.persist();
    return record;
  }

  unlockForRun(puzzle: PuzzleDefinition, result: RewardRunMetrics) {
    const newlyUnlocked: RewardDefinition[] = [];
    REWARD_DEFINITIONS.forEach((reward) => {
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
      parsed.forEach((record) => {
        if (record?.rewardId && record.firstUnlockedAt && Number.isFinite(record.unlockCount)) {
          this.records.set(record.rewardId, record);
        }
      });
    } catch {
      // ストレージが使えない環境でも、当該プレイ中の鑑定帳は機能する。
    }
  }

  private persist() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(this.records.values())));
    } catch {
      // 保存に失敗しても開錠体験を阻害しない。
    }
  }
}
