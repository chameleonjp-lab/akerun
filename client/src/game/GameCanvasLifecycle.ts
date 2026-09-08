import { createGameScene, type GameHandle } from "./scene";
import type { GameSnapshot } from "./VaultWorld";
import { createRenderLoopController } from "./RenderLoopController";

type CanvasCallbacks = {
  onReady: (handle: GameHandle | null) => void;
  onSnapshot: (snapshot: GameSnapshot) => void;
  onStatus: (status: string) => void;
  onVisibilityPause: () => void;
  onError: (error: unknown) => void;
};

type CanvasEnvironment = {
  window: Pick<
    Window,
    | "addEventListener"
    | "removeEventListener"
    | "requestAnimationFrame"
    | "cancelAnimationFrame"
  >;
  document: Pick<
    Document,
    "addEventListener" | "removeEventListener" | "hidden"
  >;
  createScene: typeof createGameScene;
};

/** 1回の初期化に属する描画・入力・イベントを、再試行時にまとめて破棄する。 */
export function mountGameCanvas(
  canvas: HTMLCanvasElement,
  callbacks: CanvasCallbacks,
  environment: CanvasEnvironment = {
    window,
    document,
    createScene: createGameScene,
  }
) {
  let disposed = false;
  let handle: GameHandle | null = null;
  let renderLoop: ReturnType<typeof createRenderLoopController> | null = null;
  let lastSnapshotMessage = "";
  const onResize = () => handle?.update(0);
  const onVisibilityChange = () => {
    if (environment.document.hidden) {
      renderLoop?.stop();
      if (!handle) return;
      handle.setPaused(true);
      callbacks.onVisibilityPause();
    } else {
      renderLoop?.start();
    }
  };
  const releaseResources = () => {
    environment.window.removeEventListener("resize", onResize);
    environment.document.removeEventListener(
      "visibilitychange",
      onVisibilityChange
    );
    renderLoop?.dispose();
    renderLoop = null;
    handle?.dispose();
    handle = null;
  };

  environment.window.addEventListener("resize", onResize);
  environment.document.addEventListener("visibilitychange", onVisibilityChange);
  const initialize = async () => {
    try {
      const context = canvas.getContext("2d", {
        alpha: false,
        desynchronized: true,
      });
      if (!context) throw new Error("2D canvas is unavailable");
      const nextHandle = await environment.createScene(
        canvas,
        context,
        status => {
          if (!disposed) callbacks.onStatus(status);
        },
        snapshot => {
          if (disposed) return;
          if (snapshot.message && snapshot.message !== lastSnapshotMessage) {
            lastSnapshotMessage = snapshot.message;
            callbacks.onStatus(snapshot.message);
          }
          callbacks.onSnapshot(snapshot);
        }
      );
      if (disposed) {
        nextHandle.dispose();
        return;
      }
      handle = nextHandle;
      renderLoop = createRenderLoopController(
        {
          requestAnimationFrame: callback =>
            environment.window.requestAnimationFrame(callback),
          cancelAnimationFrame: frameId =>
            environment.window.cancelAnimationFrame(frameId),
        },
        delta => nextHandle.update(delta)
      );
      callbacks.onReady(nextHandle);
      if (environment.document.hidden) {
        nextHandle.setPaused(true);
        callbacks.onVisibilityPause();
      } else {
        renderLoop.start();
      }
    } catch (error) {
      if (disposed) return;
      disposed = true;
      releaseResources();
      callbacks.onReady(null);
      callbacks.onError(error);
    }
  };
  void initialize();

  return () => {
    if (disposed) return;
    disposed = true;
    releaseResources();
    callbacks.onReady(null);
  };
}
