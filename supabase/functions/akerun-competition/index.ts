import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { replayAkerunTrace } from "./trace-verifier.ts";

const CLIENT_VERSION = "akerun-web-verified-v2";
const CONTRACT_VERSION = "akerun-play-v2";
const MAX_REQUEST_BYTES = 256_000;
const ALLOWED_ORIGINS = new Set([
  "https://chameleonjp-lab.github.io",
  "http://localhost:3000",
  "http://localhost:5173",
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin)
      ? origin
      : "https://chameleonjp-lab.github.io",
    "Access-Control-Allow-Headers": "apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Expose-Headers": "Retry-After",
    Vary: "Origin",
  };
}

function json(
  req: Request,
  status: number,
  value: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      ...corsHeaders(req),
      ...extraHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function originAllowed(req: Request) {
  const origin = req.headers.get("origin");
  return !origin || ALLOWED_ORIGINS.has(origin);
}

function parseNamedKeys(value: string | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Object.values(parsed).filter(
      (candidate): candidate is string => typeof candidate === "string",
    );
  } catch {
    return [];
  }
}

function publicKeys() {
  return [
    ...parseNamedKeys(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")),
    Deno.env.get("SUPABASE_ANON_KEY") || "",
  ].filter(Boolean);
}

function secretKey() {
  return (
    parseNamedKeys(Deno.env.get("SUPABASE_SECRET_KEYS"))[0] ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    ""
  );
}

async function callInternalRpc(name: string, body: Record<string, unknown>) {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = secretKey();
  if (!url || !key) throw new Error("server_configuration_missing");
  const response = await fetch(
    `${url.replace(/\/$/, "")}/rest/v1/rpc/${encodeURIComponent(name)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    },
  );
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`internal_rpc_${response.status}`);
  return Array.isArray(data) && data.length === 1 ? data[0] : data;
}

type RateLimitAction = "prepare" | "begin" | "abandon" | "finish";

const rateLimitAction = (value: unknown): RateLimitAction | null =>
  value === "prepare" || value === "begin" || value === "abandon" || value === "finish"
    ? value
    : null;

const sourceIdentity = (req: Request) => {
  const cloudflareAddress = req.headers.get("cf-connecting-ip")?.trim();
  const realAddress = req.headers.get("x-real-ip")?.trim();
  const forwardedAddress = (req.headers.get("x-forwarded-for") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .pop();
  return (cloudflareAddress || realAddress || forwardedAddress || "unknown").slice(0, 256);
};

const valueOrFallback = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, 256) : fallback;

async function requestIdentityHash(scope: string, value: string) {
  const secret = secretKey();
  if (!secret) throw new Error("server_configuration_missing");
  const bytes = new TextEncoder().encode(`${secret}\u0000${scope}\u0000${value}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function checkRequestLimit(
  req: Request,
  action: RateLimitAction,
  playerName: unknown,
  clientInstanceId: unknown,
) {
  const [sourceKey, deviceKey, nameKey] = await Promise.all([
    requestIdentityHash("source", sourceIdentity(req)),
    requestIdentityHash("device", valueOrFallback(clientInstanceId, "missing")),
    requestIdentityHash("name", valueOrFallback(playerName, "missing")),
  ]);
  const result = await callInternalRpc("akerun_request_gate_internal", {
    p_action: action,
    p_source_key: `source:${sourceKey}`,
    p_device_key: `device:${deviceKey}`,
    p_name_key: `name:${nameKey}`,
  }) as Record<string, unknown> | null;
  const retryAfterSeconds = Number(result?.retry_after_seconds);
  return {
    allowed: result?.allowed === true,
    retryAfterSeconds: Number.isInteger(retryAfterSeconds) && retryAfterSeconds > 0
      ? retryAfterSeconds
      : 1,
  };
}

async function readJsonObject(req: Request) {
  if (!req.body) throw new Error("invalid_json");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new Error("request_too_large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("invalid_json_shape");
  }
  return parsed as Record<string, unknown>;
}

function requiredString(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`missing_${key}`);
  return value.trim();
}

function requiredInteger(body: Record<string, unknown>, key: string) {
  const value = Number(body[key]);
  if (!Number.isInteger(value)) throw new Error(`invalid_${key}`);
  return value;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return json(req, 405, { accepted: false, reason: "method_not_allowed" });
  }
  if (!originAllowed(req)) {
    return json(req, 403, { accepted: false, reason: "origin_not_allowed" });
  }

  const suppliedKey = req.headers.get("apikey") || "";
  if (!suppliedKey || !publicKeys().includes(suppliedKey)) {
    return json(req, 401, { accepted: false, reason: "invalid_api_key" });
  }
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return json(req, 413, { accepted: false, reason: "request_too_large" });
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(req);
  } catch (error) {
    return json(req, error instanceof Error && error.message === "request_too_large" ? 413 : 400, {
      accepted: false,
      reason: error instanceof Error ? error.message : "invalid_json",
    });
  }

  if (body.clientVersion !== CLIENT_VERSION || body.contractVersion !== CONTRACT_VERSION) {
    return json(req, 409, { accepted: false, reason: "version_mismatch" });
  }

  try {
    const action = rateLimitAction(body.action);
    if (action) {
      const rate = await checkRequestLimit(
        req,
        action,
        body.playerName,
        body.clientInstanceId,
      );
      if (!rate.allowed) {
        return json(
          req,
          429,
          { accepted: false, reason: "rate_limited" },
          { "Retry-After": String(rate.retryAfterSeconds) },
        );
      }
    }

    if (body.action === "prepare") {
      const result = await callInternalRpc("akerun_prepare_run_internal", {
        p_display_name: requiredString(body, "playerName"),
        p_client_version: CLIENT_VERSION,
        p_problem_id: typeof body.problemId === "string" && body.problemId.trim()
          ? body.problemId.trim()
          : null,
        p_replay_run_token: typeof body.replayRunToken === "string" && body.replayRunToken.trim()
          ? body.replayRunToken.trim()
          : null,
      }) as Record<string, unknown> | null;
      return json(req, 200, {
        accepted: result?.accepted === true,
        runToken: result?.run_token || null,
        problemId: result?.problem_id || null,
        problemVersion: result?.problem_version || null,
      });
    }

    if (body.action === "begin") {
      const result = await callInternalRpc("akerun_begin_run_internal", {
        p_run_token: requiredString(body, "runToken"),
        p_client_version: CLIENT_VERSION,
      }) as Record<string, unknown> | null;
      return json(req, 200, {
        accepted: result?.accepted === true,
        problemId: result?.problem_id || null,
        problemVersion: result?.problem_version || null,
      });
    }

    if (body.action === "abandon") {
      const result = await callInternalRpc("akerun_abandon_run_internal", {
        p_run_token: requiredString(body, "runToken"),
        p_client_version: CLIENT_VERSION,
      }) as Record<string, unknown> | null;
      return json(req, 200, {
        accepted: result?.abandoned === true,
        abandoned: result?.abandoned === true,
        status: typeof result?.status === "string" ? result.status : null,
      });
    }

    if (body.action === "finish") {
      const runToken = requiredString(body, "runToken");
      const displayName = requiredString(body, "playerName");
      const problemId = requiredString(body, "problemId");
      const problemVersion = requiredString(body, "problemVersion");
      const elapsedTimeMs = requiredInteger(body, "elapsedTimeMs");
      const faultCount = requiredInteger(body, "faultCount");
      const totalDialSteps = requiredInteger(body, "totalDialSteps");
      const excessDialSteps = requiredInteger(body, "excessDialSteps");
      const falseGateContacts = requiredInteger(body, "falseGateContacts");
      const observationAccuracy = requiredInteger(body, "observationAccuracy");
      const score = requiredInteger(body, "score");
      const operationTrace = body.operationTrace;
      const replay = replayAkerunTrace(problemId, operationTrace, elapsedTimeMs);
      if (!replay.ok) {
        return json(req, 422, { accepted: false, reason: replay.reason });
      }
      if (replay.totalDialSteps !== totalDialSteps
        || replay.faultCount !== faultCount
        || replay.avoidableFalseGateContacts !== falseGateContacts) {
        return json(req, 422, { accepted: false, reason: "trace_metrics_mismatch" });
      }
      const result = await callInternalRpc("akerun_finalize_run_internal", {
        p_run_token: runToken,
        p_display_name: displayName,
        p_client_version: CLIENT_VERSION,
        p_problem_id: problemId,
        p_problem_version: problemVersion,
        p_elapsed_time_ms: elapsedTimeMs,
        p_fault_count: faultCount,
        p_total_dial_steps: totalDialSteps,
        p_excess_dial_steps: excessDialSteps,
        p_false_gate_contacts: falseGateContacts,
        p_observation_accuracy: observationAccuracy,
        p_score: score,
        p_operation_trace: operationTrace,
      }) as Record<string, unknown> | null;
      return json(req, 200, result || { accepted: false });
    }

    return json(req, 400, { accepted: false, reason: "invalid_action" });
  } catch (error) {
    console.error(JSON.stringify({
      event: "akerun_competition_rejected",
      reason: error instanceof Error ? error.message : "unknown",
    }));
    return json(req, 422, { accepted: false, reason: "verification_failed" });
  }
});
