import type { RunResult } from "./RunSession";

export type PendingRankingRecord = {
  readonly id: string;
  readonly playerName: string;
  readonly result: RunResult;
  readonly createdAt: string;
};

export type ActiveRunRecord = {
  readonly problemId: string;
  readonly problemVersion: string;
  readonly playerName: string;
};

const PLAYER_NAME_KEY = "akerun-player-name";
const TRAINING_KEY = "akerun-training-complete";
const BEST_KEY = "akerun-self-bests";
const PENDING_KEY = "akerun-pending-rankings";
const ACTIVE_RUN_KEY = "akerun-active-run";
const ARCHIVE_KEY = "vault-tumbler-lab-archive";

const storage = () => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const readJson = <T>(key: string, fallback: T): T => {
  try {
    const raw = storage()?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown) => {
  try {
    storage()?.setItem(key, JSON.stringify(value));
  } catch {
    // 保存できない環境でもプレイは継続する。
  }
};

const isBetterResult = (candidate: RunResult, previous: RunResult) => {
  if (candidate.score !== previous.score) return candidate.score > previous.score;
  if (candidate.faultCount !== previous.faultCount) return candidate.faultCount < previous.faultCount;
  if (candidate.elapsedTime !== previous.elapsedTime) return candidate.elapsedTime < previous.elapsedTime;
  return candidate.excessDialSteps < previous.excessDialSteps;
};

export const normalizePlayerName = (value: string) =>
  value.trim().replace(/\s+/g, " ").slice(0, 16);

export class ProgressStore {
  private sessionTrainingComplete = false;

  getPlayerName() {
    try {
      return normalizePlayerName(storage()?.getItem(PLAYER_NAME_KEY) ?? "");
    } catch {
      return "";
    }
  }

  savePlayerName(value: string) {
    const name = normalizePlayerName(value);
    try {
      storage()?.setItem(PLAYER_NAME_KEY, name);
    } catch {
      // 名前保存に失敗しても、開始時に確定した値は画面状態で保持する。
    }
    return name;
  }

  get trainingComplete() {
    if (this.sessionTrainingComplete) return true;
    try {
      return storage()?.getItem(TRAINING_KEY) === "1";
    } catch {
      return false;
    }
  }

  markTrainingComplete() {
    this.sessionTrainingComplete = true;
    try {
      storage()?.setItem(TRAINING_KEY, "1");
    } catch {
      // 保存できない端末では当該セッションだけ訓練完了として扱う。
    }
  }

  getBest(problemId: string, problemVersion: string) {
    const records = readJson<Record<string, RunResult>>(BEST_KEY, {});
    return records[problemId + "@" + problemVersion] ?? null;
  }

  recordBest(result: RunResult) {
    const records = readJson<Record<string, RunResult>>(BEST_KEY, {});
    const key = result.problemId + "@" + result.problemVersion;
    const previous = records[key];
    const improved = !previous || isBetterResult(result, previous);
    if (improved) {
      records[key] = result;
      writeJson(BEST_KEY, records);
    }
    return { improved, best: records[key] ?? result };
  }

  saveActiveRun(problemId: string, problemVersion: string, playerName: string) {
    const record: ActiveRunRecord = {
      problemId: String(problemId),
      problemVersion: String(problemVersion),
      playerName: normalizePlayerName(playerName),
    };
    writeJson(ACTIVE_RUN_KEY, record);
    return record;
  }

  getActiveRun(): ActiveRunRecord | null {
    const record = readJson<Partial<ActiveRunRecord> | null>(ACTIVE_RUN_KEY, null);
    if (!record?.problemId || !record.problemVersion || !record.playerName) return null;
    return {
      problemId: String(record.problemId),
      problemVersion: String(record.problemVersion),
      playerName: normalizePlayerName(String(record.playerName)),
    };
  }

  clearActiveRun() {
    try {
      storage()?.removeItem(ACTIVE_RUN_KEY);
    } catch {
      // 保存できない環境でもプレイは継続する。
    }
  }

  pendingId(result: RunResult) {
    return [
      result.problemId + "@" + result.problemVersion,
      result.score,
      result.elapsedTime,
      result.faultCount,
      result.totalDialSteps,
      result.excessDialSteps,
      result.falseGateContacts,
    ].join(":");
  }

  enqueueRanking(playerName: string, result: RunResult) {
    const existing = this.getPendingRankings();
    const id = this.pendingId(result);
    if (existing.some((item) => item.id === id)) return existing;
    // 通信失敗の記録は、端末容量が許す限りすべて保持する。
    // 件数制限で古い結果を静かに捨てると、再送要件を満たせない。
    const next = [
      ...existing,
      { id, playerName: normalizePlayerName(playerName), result, createdAt: new Date().toISOString() },
    ];
    writeJson(PENDING_KEY, next);
    return next;
  }

  getPendingRankings(): PendingRankingRecord[] {
    const records = readJson<PendingRankingRecord[]>(PENDING_KEY, []);
    return Array.isArray(records) ? records.filter((item) => item?.id && item.playerName && item.result) : [];
  }

  removePending(id: string) {
    const next = this.getPendingRankings().filter((item) => item.id !== id);
    writeJson(PENDING_KEY, next);
  }

  removePendingForResult(result: RunResult) {
    this.removePending(this.pendingId(result));
  }

  getArchiveIds(): string[] {
    const records = readJson<Array<{ rewardId?: string }>>(ARCHIVE_KEY, []);
    return Array.isArray(records)
      ? records.filter((item) => item?.rewardId).map((item) => String(item.rewardId))
      : [];
  }
}
