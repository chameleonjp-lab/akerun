export const RUN_TRACE_VERSION = 1 as const;
export const MAX_RUN_TRACE_EVENTS = 8192;
export const MAX_RUN_TRACE_TIME_MS = 1_800_000;

export type RunTraceKind = "rotate" | "tension" | "fence" | "bolt" | "handle";
export type RunTraceEvent = readonly [
  atMs: number,
  kind: RunTraceKind,
  value: number,
];
export type RunTrace = {
  readonly version: typeof RUN_TRACE_VERSION;
  readonly events: readonly RunTraceEvent[];
  readonly truncated: boolean;
};

const TRACE_KINDS: readonly RunTraceKind[] = [
  "rotate",
  "tension",
  "fence",
  "bolt",
  "handle",
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isTraceKind = (value: unknown): value is RunTraceKind =>
  typeof value === "string" && TRACE_KINDS.includes(value as RunTraceKind);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const isRunTrace = (value: unknown): value is RunTrace => {
  if (
    !isRecord(value) ||
    value.version !== RUN_TRACE_VERSION ||
    typeof value.truncated !== "boolean" ||
    !Array.isArray(value.events) ||
    value.events.length > MAX_RUN_TRACE_EVENTS
  )
    return false;

  let previousAtMs = -1;
  for (const event of value.events) {
    if (!Array.isArray(event) || event.length !== 3) return false;
    const [atMs, kind, rawValue] = event;
    if (!Number.isInteger(atMs) || atMs < 0 || atMs > MAX_RUN_TRACE_TIME_MS)
      return false;
    if (atMs < previousAtMs) return false;
    previousAtMs = atMs;
    if (!isTraceKind(kind) || !isFiniteNumber(rawValue)) return false;
    if (kind === "rotate") {
      if (
        !Number.isInteger(rawValue) ||
        rawValue === 0 ||
        Math.abs(rawValue) > 32
      )
        return false;
      continue;
    }
    if (rawValue < 0 || rawValue > 1) return false;
  }
  return true;
};

export const isCompleteRunTrace = (value: unknown): value is RunTrace =>
  isRunTrace(value) && !value.truncated && value.events.length > 0;

const normalizeActuator = (value: number) => Math.min(1, Math.max(0, value));

export class RunTraceRecorder {
  private events: RunTraceEvent[] = [];
  private truncated = false;

  recordRotation(atSeconds: number, steps: number) {
    this.record(atSeconds, "rotate", steps);
  }

  recordActuator(
    atSeconds: number,
    kind: Exclude<RunTraceKind, "rotate">,
    value: number
  ) {
    this.record(atSeconds, kind, value);
  }

  private record(atSeconds: number, kind: RunTraceKind, value: number) {
    if (this.truncated) return;
    if (
      !Number.isFinite(atSeconds) ||
      atSeconds < 0 ||
      atSeconds * 1000 > MAX_RUN_TRACE_TIME_MS
    ) {
      this.truncated = true;
      return;
    }
    if (!isFiniteNumber(value)) {
      this.truncated = true;
      return;
    }
    const atMs = Math.round(atSeconds * 1000);
    const normalized =
      kind === "rotate" ? Math.round(value) : normalizeActuator(value);
    const previous = this.events[this.events.length - 1];
    // A recorder is also a public boundary for restored/queued input. Do not
    // let a caller create a trace that is only discovered as invalid later,
    // and do not let an out-of-order duplicate disappear through the actuator
    // de-duplication below.
    if (previous && atMs < previous[0]) {
      this.truncated = true;
      return;
    }
    // Actuator values are sampled every frame, so identical adjacent values
    // are redundant. Rotation events are discrete evidence: two equal
    // gestures in a row still represent two effective operations and must be
    // replayable on the server.
    if (
      kind !== "rotate" &&
      previous &&
      previous[1] === kind &&
      previous[2] === normalized
    )
      return;
    const candidate: RunTraceEvent = [atMs, kind, normalized];
    if (
      !isRunTrace({
        version: RUN_TRACE_VERSION,
        events: [candidate],
        truncated: false,
      })
    ) {
      this.truncated = true;
      return;
    }
    if (this.events.length >= MAX_RUN_TRACE_EVENTS) {
      this.truncated = true;
      return;
    }
    this.events.push(candidate);
  }

  restore(value: RunTrace | undefined) {
    if (!value) {
      this.clear();
      return;
    }
    this.events = isRunTrace(value)
      ? value.events.map(
          event => [event[0], event[1], event[2]] as RunTraceEvent
        )
      : [];
    this.truncated = !isRunTrace(value) || value.truncated;
  }

  clear() {
    this.events = [];
    this.truncated = false;
  }

  get snapshot(): RunTrace {
    return {
      version: RUN_TRACE_VERSION,
      events: this.events.map(
        event => [event[0], event[1], event[2]] as RunTraceEvent
      ),
      truncated: this.truncated,
    };
  }
}
