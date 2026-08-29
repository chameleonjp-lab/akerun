import { describe, expect, it, vi } from "vitest";
import { createRenderLoopController } from "./RenderLoopController";

const createAnimationFrameTarget = () => {
  let nextFrameId = 1;
  const callbacks = new Map<number, (timestamp: number) => void>();
  return {
    callbacks,
    requestAnimationFrame: vi.fn((callback: (timestamp: number) => void) => {
      const frameId = nextFrameId;
      nextFrameId += 1;
      callbacks.set(frameId, callback);
      return frameId;
    }),
    cancelAnimationFrame: vi.fn((frameId: number) => {
      callbacks.delete(frameId);
    }),
    flush: (timestamp: number) => {
      const frameId = Math.min(...callbacks.keys());
      const callback = callbacks.get(frameId);
      callbacks.delete(frameId);
      callback?.(timestamp);
    },
  };
};

describe("RenderLoopController", () => {
  it("schedules one frame at a time and forwards elapsed seconds", () => {
    const target = createAnimationFrameTarget();
    const render = vi.fn();
    const controller = createRenderLoopController(target, render);

    controller.start();
    controller.start();
    expect(target.requestAnimationFrame).toHaveBeenCalledTimes(1);

    target.flush(1000);
    target.flush(1016);

    expect(render).toHaveBeenNthCalledWith(1, 0);
    expect(render.mock.calls[1]?.[0]).toBeCloseTo(0.016, 5);
    expect(target.requestAnimationFrame).toHaveBeenCalledTimes(3);

    controller.stop();
    expect(target.cancelAnimationFrame).toHaveBeenCalledTimes(1);
    expect(controller.running).toBe(false);
  });

  it("restarts with a clean timing baseline after a visibility pause", () => {
    const target = createAnimationFrameTarget();
    const render = vi.fn();
    const controller = createRenderLoopController(target, render);

    controller.start();
    target.flush(2000);
    controller.stop();
    controller.start();
    target.flush(9000);

    expect(render).toHaveBeenNthCalledWith(2, 0);
    expect(controller.running).toBe(true);
  });

  it("does not restart after disposal", () => {
    const target = createAnimationFrameTarget();
    const controller = createRenderLoopController(target, () => undefined);

    controller.start();
    controller.dispose();
    controller.start();
    controller.stop();

    expect(target.cancelAnimationFrame).toHaveBeenCalledTimes(1);
    expect(target.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(controller.running).toBe(false);
  });
});
