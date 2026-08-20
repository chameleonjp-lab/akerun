import type { RunResult } from "./RunSession";

export type PendingRankingRecord = {
  readonly id: string;
  readonly playerName: string;
  readonly result: RunResult;
  readonly createdAt: string;
};

const PLAYER_NAME_KEY = "akerun-player-name";
const TRAINING_KEY = "akerun-training-complete";
const BEST_KEY = "akerun-self-bests";
const PENDING_KEY = "akerun-pending-rankings";
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

export const normalizePlayerName = (value: string) =>
  value.trim().replace(/\s+/g, " ").slice(0, 16);

export class ProgressStore {
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
    try {
      return storage()?.getItem(TRAINING_KEY) === "1";
    } catch {
      return false;
    }
  }

  markTrainingComplete() {
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
    const improved = !previous
      || result.score > previous.score
      || (result.score === previous.score && result.elapsedTime < previous.elapsedTime);
    if (improved) {
      records[key] = result;
      writeJson(BEST_KEY, records);
    }
    return { improved, best: records[key] ?? result };
  }

  enqueueRanking(playerName: string, result: RunResult) {
    const existing = this.getPendingRankings();
    const id = result.problemId + "@" + result.problemVersion + ":" + String(result.score) + ":" + String(result.elapsedTime);
    if (existing.some((item) => item.id === id)) return existing;
    const next = [
      ...existing,
      { id, playerName: normalizePlayerName(playerName), result, createdAt: new Date().toISOString() },
    ].slice(-10);
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

  getArchiveIds(): string[] {
    const records = readJson<Array<{ rewardId?: string }>>(ARCHIVE_KEY, []);
    return Array.isArray(records)
      ? records.filter((item) => item?.rewardId).map((item) => String(item.rewardId))
      : [];
  }
}
