import { isRunCheckpoint, type RunCheckpoint, type RunResult } from "./RunSession";

export type PendingRankingRecord = {
  readonly id: string;
  readonly playerName: string;
  readonly result: RunResult;
  /** サーバー発行の検証済みプレイID。旧保存形式では存在しない。 */
  readonly rankingRunToken?: string;
  readonly createdAt: string;
};

export type PendingRunAbandonment = {
  readonly runToken: string;
  readonly createdAt: string;
};

export type OfficialClearRecord = {
  readonly problemId: string;
  readonly problemVersion: string;
  readonly firstClearedAt: string;
  readonly clearCount: number;
};

export type ActiveRunRecord = {
  readonly problemId: string;
  readonly problemVersion: string;
  readonly playerName: string;
  /** 現在のプレイを同じ検証済み実行へ戻すためのID。 */
  readonly rankingRunToken?: string;
  /** 再読込後に計測を初期化せず、同じ機構状態から復帰するためのチェックポイント。 */
  readonly checkpoint?: RunCheckpoint;
};

const PLAYER_NAME_KEY = "akerun-player-name";
const TRAINING_KEY = "akerun-training-complete";
const OFFICIAL_PROGRESS_KEY = "akerun-official-clears-v1";
const BEST_KEY = "akerun-self-bests";
const PENDING_KEY = "akerun-pending-rankings";
const PENDING_ABANDON_KEY = "akerun-pending-abandonments";
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

const submittedFalseGateContacts = (result: RunResult) =>
  result.avoidableFalseGateContacts ?? result.falseGateContacts;

export const normalizePlayerName = (value: string) =>
  value.trim().replace(/\s+/g, " ").slice(0, 16);

export class ProgressStore {
  private sessionTrainingComplete = false;
  private readonly sessionOfficialClearKeys = new Set<string>();

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

  getOfficialClearRecords(): OfficialClearRecord[] {
    const records = readJson<OfficialClearRecord[]>(OFFICIAL_PROGRESS_KEY, []);
    return Array.isArray(records)
      ? records
        .filter((record) =>
          typeof record?.problemId === "string"
          && typeof record.problemVersion === "string"
          && typeof record.firstClearedAt === "string"
          && Number.isInteger(record.clearCount)
          && record.clearCount > 0
        )
        .map((record) => ({
          problemId: String(record.problemId),
          problemVersion: String(record.problemVersion),
          firstClearedAt: String(record.firstClearedAt),
          clearCount: Math.max(1, Math.floor(record.clearCount)),
        }))
      : [];
  }

  getOfficialClearKeys() {
    const keys = new Set(
      this.getOfficialClearRecords().map(
        (record) => record.problemId + "@" + record.problemVersion
      )
    );
    this.sessionOfficialClearKeys.forEach((key) => keys.add(key));
    return Array.from(keys);
  }

  recordOfficialClear(problemId: string, problemVersion: string) {
    const normalizedProblemId = String(problemId).trim();
    const normalizedProblemVersion = String(problemVersion).trim();
    if (!normalizedProblemId || !normalizedProblemVersion) return null;

    const key = normalizedProblemId + "@" + normalizedProblemVersion;
    this.sessionOfficialClearKeys.add(key);
    const records = this.getOfficialClearRecords();
    const index = records.findIndex(
      (record) =>
        record.problemId === normalizedProblemId
        && record.problemVersion === normalizedProblemVersion
    );
    const previous = index >= 0 ? records[index] : null;
    const nextRecord: OfficialClearRecord = previous
      ? { ...previous, clearCount: previous.clearCount + 1 }
      : {
        problemId: normalizedProblemId,
        problemVersion: normalizedProblemVersion,
        firstClearedAt: new Date().toISOString(),
        clearCount: 1,
      };
    const next = [...records];
    if (index >= 0) next[index] = nextRecord;
    else next.push(nextRecord);
    writeJson(OFFICIAL_PROGRESS_KEY, next);
    return nextRecord;
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
      // The browser only needs the best score locally. Keep the full trace in
      // the retry queue, but do not duplicate it in the self-best record.
      const { operationTrace: _operationTrace, ...localResult } = result;
      records[key] = localResult;
      writeJson(BEST_KEY, records);
    }
    return { improved, best: records[key] ?? result };
  }

  persistOfficialCompletion(
    playerName: string,
    result: RunResult,
    rankingRunToken?: string | null,
  ) {
    this.recordBest(result);
    this.recordOfficialClear(result.problemId, result.problemVersion);
    if (rankingRunToken) this.enqueueRanking(playerName, result, rankingRunToken);
    // 開錠済みの実行を、途中状態として再開できる記録から外す。
    this.clearActiveRun();
  }

  saveActiveRun(
    problemId: string,
    problemVersion: string,
    playerName: string,
    rankingRunToken?: string | null,
    checkpoint?: RunCheckpoint | null,
  ) {
    const record: ActiveRunRecord = {
      problemId: String(problemId),
      problemVersion: String(problemVersion),
      playerName: normalizePlayerName(playerName),
      ...(rankingRunToken ? { rankingRunToken: String(rankingRunToken) } : {}),
      ...(checkpoint && isRunCheckpoint(checkpoint) ? { checkpoint } : {}),
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
      ...(record.rankingRunToken ? { rankingRunToken: String(record.rankingRunToken) } : {}),
      ...(isRunCheckpoint(record.checkpoint) ? { checkpoint: record.checkpoint } : {}),
    };
  }

  clearActiveRun() {
    try {
      storage()?.removeItem(ACTIVE_RUN_KEY);
    } catch {
      // 保存できない環境でもプレイは継続する。
    }
  }

  enqueueRunAbandonment(runToken: string) {
    const token = String(runToken).trim();
    if (!token) return this.getPendingRunAbandonments();
    const existing = this.getPendingRunAbandonments();
    if (existing.some((item) => item.runToken === token)) return existing;
    const next = [
      ...existing,
      { runToken: token, createdAt: new Date().toISOString() },
    ];
    writeJson(PENDING_ABANDON_KEY, next);
    return next;
  }

  getPendingRunAbandonments(): PendingRunAbandonment[] {
    const records = readJson<PendingRunAbandonment[]>(PENDING_ABANDON_KEY, []);
    return Array.isArray(records)
      ? records
        .filter((item) => item?.runToken)
        .map((item) => ({
          runToken: String(item.runToken),
          createdAt: typeof item.createdAt === "string" ? item.createdAt : "",
        }))
      : [];
  }

  removeRunAbandonment(runToken: string) {
    const token = String(runToken).trim();
    const next = this.getPendingRunAbandonments().filter((item) => item.runToken !== token);
    writeJson(PENDING_ABANDON_KEY, next);
  }

  pendingId(result: RunResult, rankingRunToken?: string | null) {
    return [
      rankingRunToken || "legacy",
      result.problemId + "@" + result.problemVersion,
      result.score,
      result.elapsedTime,
      result.faultCount,
      result.totalDialSteps,
      result.excessDialSteps,
      submittedFalseGateContacts(result),
    ].join(":");
  }

  private legacyPendingId(result: RunResult) {
    return [
      result.problemId + "@" + result.problemVersion,
      result.score,
      result.elapsedTime,
      result.faultCount,
      result.totalDialSteps,
      result.excessDialSteps,
      submittedFalseGateContacts(result),
    ].join(":");
  }

  enqueueRanking(playerName: string, result: RunResult, rankingRunToken?: string | null) {
    const existing = this.getPendingRankings();
    const id = this.pendingId(result, rankingRunToken);
    if (existing.some((item) => item.id === id)) return existing;
    // 通信失敗の記録は、端末容量が許す限りすべて保持する。
    // 件数制限で古い結果を静かに捨てると、再送要件を満たせない。
    const next = [
      ...existing,
      {
        id,
        playerName: normalizePlayerName(playerName),
        result,
        ...(rankingRunToken ? { rankingRunToken: String(rankingRunToken) } : {}),
        createdAt: new Date().toISOString(),
      },
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

  removePendingForResult(result: RunResult, rankingRunToken?: string | null) {
    const ids = new Set([this.pendingId(result, rankingRunToken), this.legacyPendingId(result)]);
    const next = this.getPendingRankings().filter((item) => !ids.has(item.id));
    writeJson(PENDING_KEY, next);
  }

  getArchiveIds(): string[] {
    const records = readJson<Array<{ rewardId?: string }>>(ARCHIVE_KEY, []);
    return Array.isArray(records)
      ? records.filter((item) => item?.rewardId).map((item) => String(item.rewardId))
      : [];
  }
}
