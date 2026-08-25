/**
 * Babylonの描画ループを、表示状態とReactのライフサイクルから安全に制御する。
 * ゲーム状態の一時停止とは分離し、描画負荷だけを止める。
 */
export type RenderLoopTarget = {
  runRenderLoop: (renderFunction: () => void) => void;
  stopRenderLoop: (renderFunction?: () => void) => void;
};

export type RenderLoopController = {
  start: () => void;
  stop: () => void;
  dispose: () => void;
  readonly running: boolean;
};

export function createRenderLoopController(target: RenderLoopTarget, render: () => void): RenderLoopController {
  let running = false;
  let disposed = false;

  return {
    start: () => {
      if (disposed || running) return;
      running = true;
      target.runRenderLoop(render);
    },
    stop: () => {
      if (!running) return;
      running = false;
      target.stopRenderLoop(render);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      if (running) {
        running = false;
        target.stopRenderLoop(render);
      }
    },
    get running() {
      return running;
    },
  };
}
