import { describe, expect, it, vi } from "vitest";
import { RankingClient } from "./RankingClient";
import type { RunResult } from "./RunSession";

const result: RunResult = {
  elapsedTime: 31.25,
  faultCount: 0,
  totalDialSteps: 1198,
  excessDialSteps: 0,
  falseGateContacts: 0,
  avoidableFalseGateContacts: 2,
  observationAccuracy: 100,
  score: 11720,
  problemId: "AKERUN-01-V1",
  problemVersion: "V1",
  difficulty: "beginner",
};

describe("RankingClient", () => {
  it("uses the verified contract and deduplicates a run token", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.clientVersion).toBe("akerun-web-verified-v2");
      expect(body.contractVersion).toBe("akerun-play-v2");
      expect(body.action).toBe("finish");
      expect(body.runToken).toBe("run-token-1");
      expect(body.elapsedTimeMs).toBe(31250);
      expect(body.falseGateContacts).toBe(2);
      return new Response(JSON.stringify({ accepted: true, score: result.score }), { status: 200 });
    });
    const client = new RankingClient({ fetch });

    await expect(client.submit("player one", result, "run-token-1")).resolves.toMatchObject({ accepted: true });
    await expect(client.submit("player one", result, "run-token-1")).resolves.toMatchObject({ accepted: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("sends a replay token only when retrying the same completed problem", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.action).toBe("prepare");
      expect(body.problemId).toBe("AKERUN-01-V1");
      expect(body.replayRunToken).toBe("completed-run-1");
      return new Response(JSON.stringify({
        accepted: true,
        runToken: "run-token-2",
        problemId: "AKERUN-01-V1",
        problemVersion: "V1",
      }), { status: 200 });
    });
    const client = new RankingClient({ fetch });

    await expect(client.prepareOfficialRun("player one", "AKERUN-01-V1", "completed-run-1"))
      .resolves.toMatchObject({ status: "ok", problemId: "AKERUN-01-V1" });
  });

  it("normalizes legacy saved results before v2 submission", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.falseGateContacts).toBe(1);
      return new Response(JSON.stringify({ accepted: true }), { status: 200 });
    });
    const client = new RankingClient({ fetch });
    const legacy = {
      ...result,
      falseGateContacts: 25,
      avoidableFalseGateContacts: undefined,
    } satisfies RunResult;

    await expect(client.submit("player one", legacy, "run-token-legacy"))
      .resolves.toMatchObject({ accepted: true });
  });

  it("reads metric tie-break rows from the akerun ranking RPC", async () => {
    const rpc = {
      rpc: vi.fn(async () => ({
        data: [{ rank_no: 1, display_name: "player one", best_score: 11720, fault_count: 0 }],
        error: null,
      })),
    };
    const client = new RankingClient({ rpcClient: rpc });
    const rows = await client.getBestScores(10);
    expect(rpc.rpc).toHaveBeenCalledWith("get_akerun_ranking_v1", { p_limit: 10 });
    expect(RankingClient.rank(rows[0]!, 1)).toBe(1);
    expect(RankingClient.score(rows[0]!)).toBe(11720);
  });
});
