/**
 * 2Dキャンバスの描画ループを、表示状態とReactのライフサイクルから安全に制御する。
 * ゲーム状態の一時停止とは分離し、表示負荷だけを止める。
 */
export type RenderLoopTarget = {
  requestAnimationFrame: (callback: (timestamp: number) => void) => number;
  cancelAnimationFrame: (frameId: number) => void;
};

export type RenderLoopController = {
  start: () => void;
  stop: () => void;
  dispose: () => void;
  readonly running: boolean;
};

export function createRenderLoopController(
  target: RenderLoopTarget,
  render: (deltaSeconds: number) => void,
): RenderLoopController {
  let running = false;
  let disposed = false;
  let frameId: number | null = null;
  let lastTimestamp: number | null = null;

  const tick = (timestamp: number) => {
    if (!running) return;
    const deltaSeconds = lastTimestamp === null
      ? 0
      : Math.min(0.25, Math.max(0, (timestamp - lastTimestamp) / 1000));
    lastTimestamp = timestamp;
    render(deltaSeconds);
    if (running) frameId = target.requestAnimationFrame(tick);
  };

  return {
    start: () => {
      if (disposed || running) return;
      running = true;
      lastTimestamp = null;
      frameId = target.requestAnimationFrame(tick);
    },
    stop: () => {
      if (!running) return;
      running = false;
      lastTimestamp = null;
      if (frameId !== null) {
        target.cancelAnimationFrame(frameId);
        frameId = null;
      }
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      if (running) {
        running = false;
        lastTimestamp = null;
        if (frameId !== null) {
          target.cancelAnimationFrame(frameId);
          frameId = null;
        }
      }
    },
    get running() {
      return running;
    },
  };
}
