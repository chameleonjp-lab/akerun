import { describe, expect, it, vi } from "vitest";
import { createRenderLoopController } from "./RenderLoopController";

describe("RenderLoopController", () => {
  it("starts the loop once and stops the same callback", () => {
    const target = { runRenderLoop: vi.fn(), stopRenderLoop: vi.fn() };
    const render = vi.fn();
    const controller = createRenderLoopController(target, render);

    controller.start();
    controller.start();
    controller.stop();

    expect(target.runRenderLoop).toHaveBeenCalledTimes(1);
    expect(target.runRenderLoop).toHaveBeenCalledWith(render);
    expect(target.stopRenderLoop).toHaveBeenCalledTimes(1);
    expect(target.stopRenderLoop).toHaveBeenCalledWith(render);
    expect(controller.running).toBe(false);
  });

  it("can restart after a visibility pause", () => {
    const target = { runRenderLoop: vi.fn(), stopRenderLoop: vi.fn() };
    const controller = createRenderLoopController(target, () => undefined);

    controller.start();
    controller.stop();
    controller.start();

    expect(target.runRenderLoop).toHaveBeenCalledTimes(2);
    expect(controller.running).toBe(true);
  });

  it("does not restart after disposal", () => {
    const target = { runRenderLoop: vi.fn(), stopRenderLoop: vi.fn() };
    const controller = createRenderLoopController(target, () => undefined);

    controller.start();
    controller.dispose();
    controller.start();
    controller.stop();

    expect(target.stopRenderLoop).toHaveBeenCalledTimes(1);
    expect(target.runRenderLoop).toHaveBeenCalledTimes(1);
    expect(controller.running).toBe(false);
  });
});
