import type { RunResult } from "./RunSession";

export type RankingRow = {
  readonly rank?: number;
  readonly playerName?: string;
  readonly score?: number;
  readonly display_name?: string;
  readonly best_score?: number;
  readonly first_score?: number;
};

export type RankingSubmission = {
  readonly accepted: boolean;
  readonly message: string;
  readonly raw: unknown;
};

const SUPABASE_URL = "https://mlpnjgezrnhdxsxolyzj.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_drzcy0v97knU6FgjqSgBHw_0A9XPdFM";
const SUPABASE_MODULE_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.9/+esm";
const GAME_SLUG = "akerun";
const CLIENT_VERSION = "akerun-web-official-v1";

type RpcClient = {
  rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

export class RankingClient {
  private clientPromise: Promise<RpcClient | null> | null = null;

  private connect() {
    if (!this.clientPromise) {
      this.clientPromise = import(/* @vite-ignore */ SUPABASE_MODULE_URL)
        .then((module) => module.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        }) as RpcClient)
        .catch((error) => {
          console.warn("ランキング機能の読み込みに失敗しました。", error);
          this.clientPromise = null;
          return null;
        });
    }
    return this.clientPromise;
  }

  async submit(playerName: string, result: RunResult): Promise<RankingSubmission> {
    const client = await this.connect();
    if (!client) throw new Error("ranking client unavailable");
    const response = await client.rpc("submit_score", {
      p_display_name: playerName,
      p_game_slug: GAME_SLUG,
      p_score: Math.trunc(result.score),
      p_client_version: CLIENT_VERSION,
    });
    if (response.error) throw response.error;
    const raw = Array.isArray(response.data) ? response.data[0] : response.data;
    const accepted = Boolean((raw as { accepted?: boolean } | null)?.accepted);
    if (!accepted) throw new Error("score was not accepted");
    return { accepted, message: "ランキングへ送信しました。", raw };
  }

  async getBestScores(limit = 10): Promise<RankingRow[]> {
    const client = await this.connect();
    if (!client) throw new Error("ranking client unavailable");
    const response = await client.rpc("get_best_score_ranking", {
      p_game_slug: GAME_SLUG,
      p_limit: Math.max(1, Math.min(100, Math.trunc(limit))),
    });
    if (response.error) throw response.error;
    const rows = Array.isArray(response.data) ? response.data : [];
    return rows as RankingRow[];
  }

  static displayName(row: RankingRow) {
    return row.playerName ?? row.display_name ?? "匿名";
  }

  static score(row: RankingRow) {
    return Number(row.score ?? row.best_score ?? 0);
  }
}
