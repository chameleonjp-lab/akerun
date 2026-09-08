import { describe, expect, it, vi } from "vitest";
import { mountGameCanvas } from "./GameCanvasLifecycle";
import type { GameHandle } from "./scene";

function setup() {
  const windowTarget = Object.assign(new EventTarget(), {
    requestAnimationFrame: vi.fn(() => 1),
    cancelAnimationFrame: vi.fn(),
  });
  const documentTarget = Object.assign(new EventTarget(), { hidden: false });
  const canvas = { getContext: vi.fn(() => ({})) };
  const handle: GameHandle = {
    update: vi.fn(),
    startPuzzle: vi.fn(),
    startDemo: vi.fn(),
    setPaused: vi.fn(),
    retire: vi.fn(),
    reset: vi.fn(),
    performAction: vi.fn(),
    getSnapshot: vi.fn(),
    getCheckpoint: vi.fn(),
    dispose: vi.fn(),
  };
  const callbacks = {
    onReady: vi.fn(),
    onSnapshot: vi.fn(),
    onStatus: vi.fn(),
    onVisibilityPause: vi.fn(),
    onError: vi.fn(),
  };
  const createScene = vi.fn(async () => handle);
  const removedWindow = vi.spyOn(windowTarget, "removeEventListener");
  const removedDocument = vi.spyOn(documentTarget, "removeEventListener");
  const mount = () =>
    mountGameCanvas(canvas as unknown as HTMLCanvasElement, callbacks, {
      window: windowTarget as unknown as Window,
      document: documentTarget as unknown as Document,
      createScene,
    });
  return {
    canvas,
    handle,
    callbacks,
    createScene,
    windowTarget,
    documentTarget,
    removedWindow,
    removedDocument,
    mount,
  };
}

describe("canvas initialization and retry", () => {
  it.each(["null-context", "throwing-context", "scene-failure"])(
    "reports %s, cleans up and permits one fresh initialization",
    async failure => {
      const test = setup();
      const error = new Error("initialization unavailable");
      if (failure === "null-context")
        test.canvas.getContext.mockReturnValueOnce(null as never);
      if (failure === "throwing-context")
        test.canvas.getContext.mockImplementationOnce(() => {
          throw error;
        });
      if (failure === "scene-failure")
        test.createScene.mockRejectedValueOnce(error);
      const disposeFailed = test.mount();
      await Promise.resolve();
      expect(test.callbacks.onError).toHaveBeenCalledOnce();
      expect(test.callbacks.onReady).toHaveBeenLastCalledWith(null);
      expect(test.windowTarget.requestAnimationFrame).not.toHaveBeenCalled();
      expect(test.removedWindow.mock.calls.map(call => call[0])).toContain(
        "resize"
      );
      expect(test.removedDocument.mock.calls.map(call => call[0])).toContain(
        "visibilitychange"
      );
      disposeFailed();
      const disposeRetry = test.mount();
      await Promise.resolve();
      expect(test.callbacks.onReady).toHaveBeenLastCalledWith(test.handle);
      expect(test.windowTarget.requestAnimationFrame).toHaveBeenCalledOnce();
      test.windowTarget.dispatchEvent(new Event("resize"));
      expect(test.handle.update).toHaveBeenCalledOnce();
      expect(test.handle.update).toHaveBeenCalledWith(0);
      test.documentTarget.hidden = true;
      test.documentTarget.dispatchEvent(new Event("visibilitychange"));
      expect(test.handle.setPaused).toHaveBeenCalledOnce();
      expect(test.handle.setPaused).toHaveBeenCalledWith(true);
      expect(test.callbacks.onVisibilityPause).toHaveBeenCalledOnce();
      disposeRetry();
      disposeRetry();
      expect(test.handle.dispose).toHaveBeenCalledOnce();
      test.windowTarget.dispatchEvent(new Event("resize"));
      expect(test.handle.update).toHaveBeenCalledOnce();
    }
  );
  it("disposes a scene that finishes after unmount without publishing it or starting a loop", async () => {
    const test = setup();
    let resolve!: (handle: GameHandle) => void;
    test.createScene.mockImplementationOnce(
      () =>
        new Promise(done => {
          resolve = done;
        })
    );
    const dispose = test.mount();
    dispose();
    resolve(test.handle);
    await Promise.resolve();
    expect(test.handle.dispose).toHaveBeenCalledOnce();
    expect(test.callbacks.onReady).toHaveBeenCalledOnce();
    expect(test.callbacks.onReady).toHaveBeenCalledWith(null);
    expect(test.windowTarget.requestAnimationFrame).not.toHaveBeenCalled();
  });
  it("starts paused when the page becomes hidden during initialization", async () => {
    const test = setup();
    const dispose = test.mount();
    test.documentTarget.hidden = true;
    test.documentTarget.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();
    expect(test.handle.setPaused).toHaveBeenCalledOnce();
    expect(test.handle.setPaused).toHaveBeenCalledWith(true);
    expect(test.windowTarget.requestAnimationFrame).not.toHaveBeenCalled();
    test.documentTarget.hidden = false;
    test.documentTarget.dispatchEvent(new Event("visibilitychange"));
    expect(test.windowTarget.requestAnimationFrame).toHaveBeenCalledOnce();
    expect(test.handle.setPaused).not.toHaveBeenCalledWith(false);
    dispose();
    expect(test.windowTarget.cancelAnimationFrame).toHaveBeenCalledOnce();
  });
});
