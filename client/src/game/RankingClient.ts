import { createOfficialPuzzle } from "./GameDefinitions";
import {
  avoidableFalseGateContacts,
  isRunResult,
  type RunResult,
} from "./RunSession";
import { isCompleteRunTrace } from "./RunTrace";

export type RankingRow = {
  readonly rank?: number;
  readonly rank_no?: number;
  readonly playerName?: string;
  readonly display_name?: string;
  readonly score?: number;
  readonly best_score?: number;
  readonly first_score?: number;
  readonly play_count?: number;
  readonly fault_count?: number;
  readonly elapsed_time_ms?: number;
  readonly excess_dial_steps?: number;
  readonly problem_id?: string;
  readonly problem_version?: string;
  readonly updated_at?: string;
};

export type RankingSubmission = {
  readonly accepted: boolean;
  readonly message: string;
  readonly raw: unknown;
};

export type RankingRunPreparation = {
  readonly status: "ok" | "disabled" | "error";
  readonly runToken: string | null;
  readonly problemId: string | null;
  readonly problemVersion: string | null;
};

export type CompetitionRunPreparation = {
  readonly status: "ok" | "disabled" | "error";
  readonly runToken: string | null;
  readonly problemId: string | null;
  readonly problemVersion: string | null;
  readonly competitionDay: string | null;
};

export type RankingRunStart = {
  readonly status: "ok" | "error";
  readonly problemId: string | null;
  readonly problemVersion: string | null;
};

const SUPABASE_URL = "https://mlpnjgezrnhdxsxolyzj.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_drzcy0v97knU6FgjqSgBHw_0A9XPdFM";
const SUPABASE_MODULE_URL =
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.9/+esm";
export const GAME_SLUG = "akerun";
export const CLIENT_VERSION = "akerun-web-verified-v2";
export const CONTRACT_VERSION = "akerun-play-v2";
export const COMPETITION_FUNCTION = "akerun-competition";
const REQUEST_TIMEOUT_MS = 8000;
const CLIENT_INSTANCE_STORAGE_KEY = "akerun-client-instance-v1";

let ephemeralClientInstanceId: string | null = null;

const createClientInstanceId = () => {
  const cryptoApi = globalThis.crypto as
    | (Crypto & { randomUUID?: () => string })
    | undefined;
  const uuid = cryptoApi?.randomUUID?.();
  return (
    uuid ||
    `akerun-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
  );
};

const getClientInstanceId = () => {
  try {
    const stored = globalThis.localStorage?.getItem(
      CLIENT_INSTANCE_STORAGE_KEY
    );
    if (stored && stored.length <= 128) return stored;
    const next = createClientInstanceId();
    globalThis.localStorage?.setItem(CLIENT_INSTANCE_STORAGE_KEY, next);
    return next;
  } catch {
    if (!ephemeralClientInstanceId)
      ephemeralClientInstanceId = createClientInstanceId();
    return ephemeralClientInstanceId;
  }
};

type RpcClient = {
  rpc: (
    name: string,
    params: Record<string, unknown>
  ) => Promise<{ data: unknown; error: unknown }>;
};

type FetchLike = typeof fetch;

export type RankingClientOptions = {
  readonly fetch?: FetchLike;
  readonly rpcClient?: RpcClient;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const stringOrNull = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const playerNameOrNull = (value: unknown) => {
  const normalized =
    stringOrNull(value)?.replace(/\s+/g, " ").slice(0, 16) ?? "";
  return normalized || null;
};

const finiteNumberOrNull = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const nonNegativeIntegerOrNull = (value: unknown) => {
  const parsed = finiteNumberOrNull(value);
  return parsed !== null && Number.isSafeInteger(parsed) && parsed >= 0
    ? parsed
    : null;
};

const validCompetitionDay = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
};

const competitionDayOrNull = (value: unknown) => {
  const day = stringOrNull(value);
  return day && validCompetitionDay(day) ? day : null;
};

const submittedFalseGateContacts = (result: RunResult) => {
  if (result.avoidableFalseGateContacts !== undefined) {
    return result.avoidableFalseGateContacts;
  }
  try {
    return avoidableFalseGateContacts(
      createOfficialPuzzle(result.problemId),
      result.falseGateContacts
    );
  } catch {
    // 旧端末保存の開発用結果は公式問題へ変換できないため、範囲検証だけに委ねる。
    return result.falseGateContacts;
  }
};

export class RankingClient {
  private clientPromise: Promise<RpcClient | null> | null = null;
  private readonly submissionByRunToken = new Map<
    string,
    Promise<RankingSubmission>
  >();

  constructor(private readonly options: RankingClientOptions = {}) {}

  private connect() {
    if (this.options.rpcClient) return Promise.resolve(this.options.rpcClient);
    if (!this.clientPromise) {
      this.clientPromise = import(/* @vite-ignore */ SUPABASE_MODULE_URL)
        .then(
          module =>
            module.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
              auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false,
              },
            }) as RpcClient
        )
        .catch(error => {
          console.warn("ランキング機能の読み込みに失敗しました。", error);
          this.clientPromise = null;
          return null;
        });
    }
    return this.clientPromise;
  }

  private async competitionRequest(
    action: string,
    body: Record<string, unknown>
  ) {
    const fetchImpl = this.options.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== "function")
      throw new Error("ranking fetch unavailable");

    const controller = new AbortController();
    const timer = globalThis.setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS
    );
    try {
      const response = await fetchImpl(
        `${SUPABASE_URL}/functions/v1/${COMPETITION_FUNCTION}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            action,
            clientVersion: CLIENT_VERSION,
            contractVersion: CONTRACT_VERSION,
            ...body,
            clientInstanceId: getClientInstanceId(),
          }),
          signal: controller.signal,
        }
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !isObject(data)) {
        throw new Error(`ranking contract request failed (${response.status})`);
      }
      return data;
    } catch (error) {
      if (controller.signal.aborted)
        throw new Error("ranking contract request timed out");
      throw error;
    } finally {
      globalThis.clearTimeout(timer);
    }
  }

  async prepareOfficialRun(
    playerName: string,
    requestedProblemId?: string,
    replayRunToken?: string | null
  ): Promise<RankingRunPreparation> {
    const normalizedPlayerName = playerNameOrNull(playerName);
    if (!normalizedPlayerName) {
      return {
        status: "error",
        runToken: null,
        problemId: null,
        problemVersion: null,
      };
    }
    try {
      const data = await this.competitionRequest("prepare", {
        playerName: normalizedPlayerName,
        ...(requestedProblemId ? { problemId: requestedProblemId } : {}),
        ...(replayRunToken ? { replayRunToken } : {}),
      });
      if (data.disabled === true) {
        return {
          status: "disabled",
          runToken: null,
          problemId: null,
          problemVersion: null,
        };
      }
      const runToken = stringOrNull(data.runToken);
      const problemId = stringOrNull(data.problemId);
      const problemVersion = stringOrNull(data.problemVersion);
      if (
        data.accepted !== true ||
        !runToken ||
        !problemId ||
        !problemVersion
      ) {
        return {
          status: "error",
          runToken: null,
          problemId: null,
          problemVersion: null,
        };
      }
      return { status: "ok", runToken, problemId, problemVersion };
    } catch {
      return {
        status: "error",
        runToken: null,
        problemId: null,
        problemVersion: null,
      };
    }
  }

  async prepareCompetitionRun(
    playerName: string
  ): Promise<CompetitionRunPreparation> {
    const normalizedPlayerName = playerNameOrNull(playerName);
    if (!normalizedPlayerName) {
      return {
        status: "error",
        runToken: null,
        problemId: null,
        problemVersion: null,
        competitionDay: null,
      };
    }
    try {
      const data = await this.competitionRequest("prepare", {
        playerName: normalizedPlayerName,
        runMode: "competition",
      });
      if (data.disabled === true) {
        return {
          status: "disabled",
          runToken: null,
          problemId: null,
          problemVersion: null,
          competitionDay: null,
        };
      }
      const runToken = stringOrNull(data.runToken);
      const problemId = stringOrNull(data.problemId);
      const problemVersion = stringOrNull(data.problemVersion);
      const competitionDay = competitionDayOrNull(data.competitionDay);
      if (
        data.accepted !== true ||
        !runToken ||
        !problemId ||
        !problemVersion ||
        !competitionDay
      ) {
        return {
          status: "error",
          runToken: null,
          problemId: null,
          problemVersion: null,
          competitionDay: null,
        };
      }
      return {
        status: "ok",
        runToken,
        problemId,
        problemVersion,
        competitionDay,
      };
    } catch {
      return {
        status: "error",
        runToken: null,
        problemId: null,
        problemVersion: null,
        competitionDay: null,
      };
    }
  }

  async beginOfficialRun(runToken: string): Promise<RankingRunStart> {
    // begin は同じトークンに対して冪等なので、応答だけが失われた
    // 一時的な通信断では同じ実行をもう一度確認できる。
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const data = await this.competitionRequest("begin", { runToken });
        const problemId = stringOrNull(data.problemId);
        const problemVersion = stringOrNull(data.problemVersion);
        if (data.accepted !== true || !problemId || !problemVersion) {
          return { status: "error", problemId: null, problemVersion: null };
        }
        return { status: "ok", problemId, problemVersion };
      } catch {
        if (attempt === 1) {
          return { status: "error", problemId: null, problemVersion: null };
        }
      }
    }
    return { status: "error", problemId: null, problemVersion: null };
  }

  /**
   * 開始確認に失敗して端末内プレイへ退避する前に、サーバー側の予約を
   * 競技用トークンとして残さない。通信断時はサーバー側の短い予約期限に
   * 任せるため、この操作自体は呼び出し元へ失敗を返さない。
   */
  async abandonOfficialRun(runToken: string): Promise<boolean> {
    try {
      const data = await this.competitionRequest("abandon", { runToken });
      return (
        data.abandoned === true ||
        data.status === "completed" ||
        data.status === "expired" ||
        data.status === "rejected"
      );
    } catch {
      return false;
    }
  }

  async submit(
    playerName: string,
    result: RunResult,
    rankingRunToken?: string | null
  ): Promise<RankingSubmission> {
    if (!isRunResult(result)) throw new Error("invalid run result");
    const normalizedPlayerName = playerNameOrNull(playerName);
    if (!normalizedPlayerName) throw new Error("player name is unavailable");
    const runToken = stringOrNull(rankingRunToken);
    if (!runToken) throw new Error("verified ranking run is unavailable");
    if (!isCompleteRunTrace(result.operationTrace)) {
      throw new Error("verified operation trace is unavailable");
    }
    const existing = this.submissionByRunToken.get(runToken);
    if (existing) return existing;

    const promise = this.competitionRequest("finish", {
      runToken,
      playerName: normalizedPlayerName,
      problemId: result.problemId,
      problemVersion: result.problemVersion,
      elapsedTimeMs: Math.max(0, Math.round(result.elapsedTime * 1000)),
      faultCount: Math.max(0, Math.round(result.faultCount)),
      totalDialSteps: Math.max(0, Math.round(result.totalDialSteps)),
      excessDialSteps: Math.max(0, Math.round(result.excessDialSteps)),
      // 不可避な基準通過は問題側で吸収し、余分な接触だけを検証契約へ送る。
      falseGateContacts: Math.max(
        0,
        Math.round(submittedFalseGateContacts(result))
      ),
      observationAccuracy: Math.max(
        0,
        Math.min(100, Math.round(result.observationAccuracy))
      ),
      score: Math.trunc(result.score),
      operationTrace: result.operationTrace,
    }).then(raw => {
      if (raw.accepted !== true) throw new Error("score was not accepted");
      return { accepted: true, message: "ランキングへ送信しました。", raw };
    });
    this.submissionByRunToken.set(runToken, promise);
    try {
      return await promise;
    } catch (error) {
      this.submissionByRunToken.delete(runToken);
      throw error;
    }
  }

  async getBestScores(limit = 10): Promise<RankingRow[]> {
    const client = await this.connect();
    if (!client) throw new Error("ranking client unavailable");
    const normalizedLimit =
      typeof limit === "number" && Number.isFinite(limit)
        ? Math.trunc(limit)
        : 10;
    const response = await client.rpc("get_akerun_ranking_v1", {
      p_limit: Math.max(1, Math.min(100, normalizedLimit)),
    });
    if (response.error) throw response.error;
    const rows = Array.isArray(response.data)
      ? response.data.filter(isObject)
      : [];
    return rows as RankingRow[];
  }

  async getDailyScores(competitionDay?: string | null): Promise<RankingRow[]> {
    const client = await this.connect();
    if (!client) throw new Error("ranking client unavailable");
    const day = competitionDayOrNull(competitionDay);
    const response = await client.rpc(
      "get_akerun_daily_ranking_v1",
      day ? { p_competition_day: day } : {}
    );
    if (response.error) throw response.error;
    const rows = Array.isArray(response.data)
      ? response.data.filter(isObject)
      : [];
    return rows as RankingRow[];
  }

  static displayName(row: RankingRow) {
    return (
      playerNameOrNull(row.playerName) ??
      playerNameOrNull(row.display_name) ??
      "匿名"
    );
  }

  static score(row: RankingRow) {
    for (const candidate of [row.score, row.best_score, row.first_score]) {
      const value = nonNegativeIntegerOrNull(candidate);
      if (value !== null) return value;
    }
    return 0;
  }

  static rank(row: RankingRow, fallback: number) {
    const safeFallback = nonNegativeIntegerOrNull(fallback);
    const fallbackRank = safeFallback && safeFallback > 0 ? safeFallback : 1;
    for (const candidate of [row.rank, row.rank_no]) {
      const value = nonNegativeIntegerOrNull(candidate);
      if (value !== null && value > 0) return value;
    }
    return fallbackRank;
  }
}
