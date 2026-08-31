import {
  isRunCheckpoint,
  isRunResult,
  type RunCheckpoint,
  type RunResult,
} from "./RunSession";
import { isStoredArchiveRecord } from "./ArchiveLedger";
import { OFFICIAL_PROBLEM_CATALOG } from "./GameDefinitions";
import { isCompleteRunTrace } from "./RunTrace";

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
  readonly runMode: "official" | "competition";
  readonly competitionDay?: string;
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
const PLAY_COUNT_KEY = "akerun-play-start-count-v1";

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isNonEmptyString = (value: unknown, maxLength = 256): value is string =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.length <= maxLength;

const isSafeNonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const incrementCounter = (value: number) =>
  value >= Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : value + 1;

const OFFICIAL_PROBLEM_KEYS = new Set(
  OFFICIAL_PROBLEM_CATALOG.map(
    problem => `${problem.problemId}@${problem.problemVersion}`
  )
);

const isStoredDate = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length <= 64 &&
  /^\d{4}-\d{2}-\d{2}T/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;

const isBetterResult = (candidate: RunResult, previous: RunResult) => {
  if (candidate.score !== previous.score)
    return candidate.score > previous.score;
  if (candidate.faultCount !== previous.faultCount)
    return candidate.faultCount < previous.faultCount;
  if (candidate.elapsedTime !== previous.elapsedTime)
    return candidate.elapsedTime < previous.elapsedTime;
  return candidate.excessDialSteps < previous.excessDialSteps;
};

const isCompetitionDay = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
};

const submittedFalseGateContacts = (result: RunResult) =>
  result.avoidableFalseGateContacts ?? result.falseGateContacts;

export const normalizePlayerName = (value: string) =>
  value.trim().replace(/\s+/g, " ").slice(0, 16);

export class ProgressStore {
  private sessionTrainingComplete = false;
  private sessionPlayCount = 0;
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

  getPlayCount() {
    const stored = readJson<unknown>(PLAY_COUNT_KEY, 0);
    const persisted = isSafeNonNegativeInteger(stored) ? stored : 0;
    return Math.min(
      Number.MAX_SAFE_INTEGER,
      Math.max(this.sessionPlayCount, persisted)
    );
  }

  recordPlayStart() {
    const next = incrementCounter(this.getPlayCount());
    this.sessionPlayCount = next;
    writeJson(PLAY_COUNT_KEY, next);
    return next;
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
    const records = readJson<unknown>(OFFICIAL_PROGRESS_KEY, []);
    if (!Array.isArray(records)) return [];
    const normalized = new Map<string, OfficialClearRecord>();
    for (const item of records) {
      if (!isRecord(item)) continue;
      const problemId =
        typeof item.problemId === "string" ? item.problemId.trim() : "";
      const problemVersion =
        typeof item.problemVersion === "string"
          ? item.problemVersion.trim()
          : "";
      const firstClearedAt = item.firstClearedAt;
      const clearCount = item.clearCount;
      const key = `${problemId}@${problemVersion}`;
      if (
        !OFFICIAL_PROBLEM_KEYS.has(key) ||
        !isStoredDate(firstClearedAt) ||
        !isSafeNonNegativeInteger(clearCount) ||
        clearCount === 0
      ) {
        continue;
      }
      const previous = normalized.get(key);
      const earliest =
        previous &&
        Date.parse(previous.firstClearedAt) <= Date.parse(firstClearedAt)
          ? previous.firstClearedAt
          : firstClearedAt;
      normalized.set(key, {
        problemId,
        problemVersion,
        firstClearedAt: earliest,
        clearCount: previous
          ? Math.min(Number.MAX_SAFE_INTEGER, previous.clearCount + clearCount)
          : clearCount,
      });
    }
    return Array.from(normalized.values());
  }

  getOfficialClearKeys() {
    const keys = new Set(
      this.getOfficialClearRecords().map(
        record => record.problemId + "@" + record.problemVersion
      )
    );
    this.sessionOfficialClearKeys.forEach(key => keys.add(key));
    return Array.from(keys);
  }

  recordOfficialClear(problemId: string, problemVersion: string) {
    const normalizedProblemId =
      typeof problemId === "string" ? problemId.trim() : "";
    const normalizedProblemVersion =
      typeof problemVersion === "string" ? problemVersion.trim() : "";
    if (
      !normalizedProblemId ||
      !normalizedProblemVersion ||
      !OFFICIAL_PROBLEM_KEYS.has(
        `${normalizedProblemId}@${normalizedProblemVersion}`
      )
    )
      return null;

    const key = normalizedProblemId + "@" + normalizedProblemVersion;
    this.sessionOfficialClearKeys.add(key);
    const records = this.getOfficialClearRecords();
    const index = records.findIndex(
      record =>
        record.problemId === normalizedProblemId &&
        record.problemVersion === normalizedProblemVersion
    );
    const previous = index >= 0 ? records[index] : null;
    const nextRecord: OfficialClearRecord = previous
      ? { ...previous, clearCount: incrementCounter(previous.clearCount) }
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
    const records = readJson<unknown>(BEST_KEY, {});
    if (!isRecord(records)) return null;
    const result = records[problemId + "@" + problemVersion];
    return isRunResult(result) ? result : null;
  }

  recordBest(result: RunResult) {
    const records = readJson<unknown>(BEST_KEY, {});
    const safeRecords: Record<string, RunResult> = {};
    if (isRecord(records)) {
      Object.entries(records).forEach(([key, value]) => {
        if (isRunResult(value)) safeRecords[key] = value;
      });
    }
    const runtimeResult: unknown = result;
    if (!isRunResult(runtimeResult)) {
      const key =
        isRecord(runtimeResult) &&
        typeof runtimeResult.problemId === "string" &&
        typeof runtimeResult.problemVersion === "string"
          ? `${runtimeResult.problemId}@${runtimeResult.problemVersion}`
          : null;
      return {
        improved: false,
        best: key ? safeRecords[key] : undefined,
      };
    }
    const key = result.problemId + "@" + result.problemVersion;
    const previous = safeRecords[key];
    const improved = !previous || isBetterResult(result, previous);
    if (improved) {
      // The browser only needs the best score locally. Keep the full trace in
      // the retry queue, but do not duplicate it in the self-best record.
      const { operationTrace: _operationTrace, ...localResult } = result;
      safeRecords[key] = localResult;
      writeJson(BEST_KEY, safeRecords);
    }
    return { improved, best: safeRecords[key] ?? result };
  }

  persistOfficialCompletion(
    playerName: string,
    result: RunResult,
    rankingRunToken?: string | null
  ) {
    this.recordBest(result);
    this.recordOfficialClear(result.problemId, result.problemVersion);
    if (rankingRunToken)
      this.enqueueRanking(playerName, result, rankingRunToken);
    // 開錠済みの実行を、途中状態として再開できる記録から外す。
    this.clearActiveRun();
  }

  persistCompetitionCompletion(
    playerName: string,
    result: RunResult,
    rankingRunToken?: string | null
  ) {
    // 競技は端末内の自己ベスト・公式進行・収蔵品へ混ぜない。通信断時
    // でも、検証済みトークンと完全な操作履歴だけを再送キューへ残す。
    if (rankingRunToken)
      this.enqueueRanking(playerName, result, rankingRunToken);
    this.clearActiveRun();
  }

  saveActiveRun(
    problemId: string,
    problemVersion: string,
    playerName: string,
    rankingRunToken?: string | null,
    checkpoint?: RunCheckpoint | null,
    runMode: "official" | "competition" = "official",
    competitionDay?: string | null
  ) {
    const normalizedRunMode =
      runMode === "competition" ? "competition" : "official";
    const normalizedProblemId =
      typeof problemId === "string" ? problemId.trim() : "";
    const normalizedProblemVersion =
      typeof problemVersion === "string" ? problemVersion.trim() : "";
    const normalizedPlayerName = normalizePlayerName(
      typeof playerName === "string" ? playerName : ""
    );
    const record: ActiveRunRecord = {
      problemId: normalizedProblemId,
      problemVersion: normalizedProblemVersion,
      playerName: normalizedPlayerName,
      runMode: normalizedRunMode,
      ...(normalizedRunMode === "competition" &&
      isCompetitionDay(competitionDay)
        ? { competitionDay }
        : {}),
      ...(typeof rankingRunToken === "string" && rankingRunToken.trim()
        ? { rankingRunToken: rankingRunToken.trim() }
        : {}),
      ...(checkpoint && isRunCheckpoint(checkpoint) ? { checkpoint } : {}),
    };
    writeJson(ACTIVE_RUN_KEY, record);
    return record;
  }

  getActiveRun(): ActiveRunRecord | null {
    const record = readJson<unknown>(ACTIVE_RUN_KEY, null);
    if (!isRecord(record)) return null;
    const problemId =
      typeof record.problemId === "string" ? record.problemId.trim() : "";
    const problemVersion =
      typeof record.problemVersion === "string"
        ? record.problemVersion.trim()
        : "";
    const playerName =
      typeof record.playerName === "string"
        ? normalizePlayerName(record.playerName)
        : "";
    if (!problemId || !problemVersion || !playerName) return null;
    if (
      record.runMode !== undefined &&
      record.runMode !== "official" &&
      record.runMode !== "competition"
    ) {
      return null;
    }
    if (
      record.runMode === "competition" &&
      !isCompetitionDay(record.competitionDay)
    )
      return null;
    const runMode =
      record.runMode === "competition" ? "competition" : "official";
    return {
      problemId,
      problemVersion,
      playerName,
      runMode,
      ...(runMode === "competition"
        ? { competitionDay: record.competitionDay as string }
        : {}),
      ...(typeof record.rankingRunToken === "string" &&
      record.rankingRunToken.trim()
        ? { rankingRunToken: record.rankingRunToken.trim() }
        : {}),
      ...(isRunCheckpoint(record.checkpoint)
        ? { checkpoint: record.checkpoint }
        : {}),
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
    const token = typeof runToken === "string" ? runToken.trim() : "";
    if (!token) return this.getPendingRunAbandonments();
    const existing = this.getPendingRunAbandonments();
    if (existing.some(item => item.runToken === token)) return existing;
    const next = [
      ...existing,
      { runToken: token, createdAt: new Date().toISOString() },
    ];
    writeJson(PENDING_ABANDON_KEY, next);
    return next;
  }

  getPendingRunAbandonments(): PendingRunAbandonment[] {
    const records = readJson<unknown>(PENDING_ABANDON_KEY, []);
    return Array.isArray(records)
      ? records
          .filter(
            (item): item is PendingRunAbandonment =>
              isRecord(item) && isNonEmptyString(item.runToken, 256)
          )
          .map(item => ({
            runToken: item.runToken.trim(),
            createdAt: typeof item.createdAt === "string" ? item.createdAt : "",
          }))
      : [];
  }

  removeRunAbandonment(runToken: string) {
    const token = typeof runToken === "string" ? runToken.trim() : "";
    const next = this.getPendingRunAbandonments().filter(
      item => item.runToken !== token
    );
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

  enqueueRanking(
    playerName: string,
    result: RunResult,
    rankingRunToken?: string | null
  ) {
    const existing = this.getPendingRankings();
    const normalizedPlayerName = normalizePlayerName(
      typeof playerName === "string" ? playerName : ""
    );
    if (!normalizedPlayerName || !isRunResult(result)) return existing;
    const tokenProvided =
      rankingRunToken !== undefined && rankingRunToken !== null;
    const normalizedToken =
      typeof rankingRunToken === "string" ? rankingRunToken.trim() : "";
    if (
      tokenProvided &&
      (!normalizedToken || !isCompleteRunTrace(result.operationTrace))
    )
      return existing;
    const id = this.pendingId(result, normalizedToken || null);
    if (existing.some(item => item.id === id)) return existing;
    // 通信失敗の記録は、端末容量が許す限りすべて保持する。
    // 件数制限で古い結果を静かに捨てると、再送要件を満たせない。
    const next = [
      ...existing,
      {
        id,
        playerName: normalizedPlayerName,
        result,
        ...(normalizedToken ? { rankingRunToken: normalizedToken } : {}),
        createdAt: new Date().toISOString(),
      },
    ];
    writeJson(PENDING_KEY, next);
    return next;
  }

  getPendingRankings(): PendingRankingRecord[] {
    const records = readJson<unknown>(PENDING_KEY, []);
    if (!Array.isArray(records)) return [];
    return records.flatMap((item): PendingRankingRecord[] => {
      if (!isRecord(item)) return [];
      const playerName =
        typeof item.playerName === "string"
          ? normalizePlayerName(item.playerName)
          : "";
      if (
        !isNonEmptyString(item.id, 512) ||
        !playerName ||
        !isRunResult(item.result)
      )
        return [];
      if (
        item.rankingRunToken !== undefined &&
        (!isNonEmptyString(item.rankingRunToken, 256) ||
          !item.rankingRunToken.trim())
      )
        return [];
      if (
        typeof item.rankingRunToken === "string" &&
        !isCompleteRunTrace(item.result.operationTrace)
      )
        return [];
      return [
        {
          id: item.id,
          playerName,
          result: item.result,
          ...(typeof item.rankingRunToken === "string" &&
          item.rankingRunToken.trim()
            ? { rankingRunToken: item.rankingRunToken.trim() }
            : {}),
          createdAt: typeof item.createdAt === "string" ? item.createdAt : "",
        },
      ];
    });
  }

  removePending(id: string) {
    const next = this.getPendingRankings().filter(item => item.id !== id);
    writeJson(PENDING_KEY, next);
  }

  removePendingForResult(result: RunResult, rankingRunToken?: string | null) {
    const ids = new Set([
      this.pendingId(result, rankingRunToken),
      this.legacyPendingId(result),
    ]);
    const next = this.getPendingRankings().filter(item => !ids.has(item.id));
    writeJson(PENDING_KEY, next);
  }

  getArchiveIds(): string[] {
    const records = readJson<unknown>(ARCHIVE_KEY, []);
    if (!Array.isArray(records)) return [];
    return Array.from(
      new Set(
        records.filter(isStoredArchiveRecord).map(record => record.rewardId)
      )
    );
  }
}
