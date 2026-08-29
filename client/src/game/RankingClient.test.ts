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
  operationTrace: { version: 1, events: [[0, "rotate", 1]], truncated: false },
};

describe("RankingClient", () => {
  it("uses the verified contract and deduplicates a run token", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.clientVersion).toBe("akerun-web-verified-v2");
      expect(body.contractVersion).toBe("akerun-play-v2");
      expect(body.clientInstanceId).toEqual(expect.any(String));
      expect(body.action).toBe("finish");
      expect(body.runToken).toBe("run-token-1");
      expect(body.elapsedTimeMs).toBe(31250);
      expect(body.falseGateContacts).toBe(2);
      expect(body.operationTrace).toEqual({ version: 1, events: [[0, "rotate", 1]], truncated: false });
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

  it("retries an interrupted begin request with the same token", async () => {
    let attempts = 0;
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      attempts += 1;
      expect(JSON.parse(String(init?.body)).runToken).toBe("run-token-1");
      if (attempts === 1) throw new Error("temporary network failure");
      return new Response(JSON.stringify({
        accepted: true,
        problemId: "AKERUN-01-V1",
        problemVersion: "V1",
      }), { status: 200 });
    });
    const client = new RankingClient({ fetch });

    await expect(client.beginOfficialRun("run-token-1"))
      .resolves.toMatchObject({ status: "ok", problemId: "AKERUN-01-V1" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("abandons an unclaimed verified run after startup falls back locally", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.clientVersion).toBe("akerun-web-verified-v2");
      expect(body.contractVersion).toBe("akerun-play-v2");
      expect(body.action).toBe("abandon");
      expect(body.runToken).toBe("run-token-orphan");
      return new Response(JSON.stringify({
        accepted: true,
        abandoned: true,
        status: "rejected",
      }), { status: 200 });
    });
    const client = new RankingClient({ fetch });

    await expect(client.abandonOfficialRun("run-token-orphan")).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not turn a cleanup network failure into a user-facing startup failure", async () => {
    const fetch = vi.fn(async () => {
      throw new Error("offline");
    });
    const client = new RankingClient({ fetch });

    await expect(client.abandonOfficialRun("run-token-orphan")).resolves.toBe(false);
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

  it("prepares a server-selected daily competition run", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.action).toBe("prepare");
      expect(body.runMode).toBe("competition");
      return new Response(JSON.stringify({
        accepted: true,
        runToken: "competition-run-1",
        problemId: "AKERUN-07-V1",
        problemVersion: "V1",
        competitionDay: "2026-08-29",
      }), { status: 200 });
    });
    const client = new RankingClient({ fetch });

    await expect(client.prepareCompetitionRun("player one"))
      .resolves.toEqual({
        status: "ok",
        runToken: "competition-run-1",
        problemId: "AKERUN-07-V1",
        problemVersion: "V1",
        competitionDay: "2026-08-29",
      });
  });

  it("reads the server-selected daily competition ranking", async () => {
    const rpc = {
      rpc: vi.fn(async (name: string, params: Record<string, unknown>) => {
        expect(name).toBe("get_akerun_daily_ranking_v1");
        expect(params).toEqual({ p_competition_day: "2026-08-29" });
        return {
          data: [{ rank_no: 1, display_name: "player one", score: 12000, fault_count: 0 }],
          error: null,
        };
      }),
    };
    const client = new RankingClient({ rpcClient: rpc });

    await expect(client.getDailyScores("2026-08-29")).resolves.toMatchObject([
      { rank_no: 1, display_name: "player one", score: 12000 },
    ]);
  });

});
