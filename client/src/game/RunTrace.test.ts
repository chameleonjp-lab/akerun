import { describe, expect, it } from "vitest";
import {
  MAX_RUN_TRACE_EVENTS,
  RunTraceRecorder,
  isCompleteRunTrace,
  isRunTrace,
} from "./RunTrace";

describe("RunTrace", () => {
  it("records signed dial movement and actuator changes in game time", () => {
    const recorder = new RunTraceRecorder();
    recorder.recordRotation(1.234, -3);
    recorder.recordActuator(1.5, "tension", 0.6234);
    recorder.recordActuator(1.6, "tension", 0.6234);
    recorder.recordActuator(1.7, "fence", 0.4);

    expect(recorder.snapshot).toEqual({
      version: 1,
      events: [[1234, "rotate", -3], [1500, "tension", 0.6234], [1700, "fence", 0.4]],
      truncated: false,
    });
    expect(isCompleteRunTrace(recorder.snapshot)).toBe(true);
  });

  it("marks an over-cap trace incomplete instead of silently dropping evidence", () => {
    const recorder = new RunTraceRecorder();
    for (let index = 0; index <= MAX_RUN_TRACE_EVENTS; index += 1) {
      recorder.recordRotation(index / 1000, index % 2 === 0 ? 1 : -1);
    }
    expect(recorder.snapshot.events).toHaveLength(MAX_RUN_TRACE_EVENTS);
    expect(recorder.snapshot.truncated).toBe(true);
    expect(isRunTrace(recorder.snapshot)).toBe(true);
    expect(isCompleteRunTrace(recorder.snapshot)).toBe(false);
  });

  it("rejects malformed tuples and empty traces", () => {
    expect(isCompleteRunTrace({ version: 1, events: [], truncated: false })).toBe(false);
    expect(isRunTrace({ version: 1, events: [[0, "rotate", 33]], truncated: false })).toBe(false);
    expect(isRunTrace({ version: 1, events: [[0, "unknown", 1]], truncated: false })).toBe(false);
  });
});
