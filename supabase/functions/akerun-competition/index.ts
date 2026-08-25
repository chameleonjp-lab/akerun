import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CLIENT_VERSION = "akerun-web-verified-v2";
const CONTRACT_VERSION = "akerun-play-v2";
const MAX_REQUEST_BYTES = 20_000;
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
    Vary: "Origin",
  };
}

function json(req: Request, status: number, value: Record<string, unknown>) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      ...corsHeaders(req),
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

    if (body.action === "finish") {
      const result = await callInternalRpc("akerun_finalize_run_internal", {
        p_run_token: requiredString(body, "runToken"),
        p_display_name: requiredString(body, "playerName"),
        p_client_version: CLIENT_VERSION,
        p_problem_id: requiredString(body, "problemId"),
        p_problem_version: requiredString(body, "problemVersion"),
        p_elapsed_time_ms: requiredInteger(body, "elapsedTimeMs"),
        p_fault_count: requiredInteger(body, "faultCount"),
        p_total_dial_steps: requiredInteger(body, "totalDialSteps"),
        p_excess_dial_steps: requiredInteger(body, "excessDialSteps"),
        p_false_gate_contacts: requiredInteger(body, "falseGateContacts"),
        p_observation_accuracy: requiredInteger(body, "observationAccuracy"),
        p_score: requiredInteger(body, "score"),
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
