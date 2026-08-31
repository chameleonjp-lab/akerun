/**
 * Vault Tumbler Lab — 2Dキャンバスの描画と、Reactの画面状態をつなぐ境界。
 */
import { VaultWorld, type GameSnapshot } from "./VaultWorld";
import type { PuzzleDefinition } from "./GameDefinitions";
import type { RunCheckpoint } from "./RunSession";

export type PuzzleStartOptions = {
  readonly training?: boolean;
  readonly postDial?: boolean;
  readonly resume?: RunCheckpoint;
  readonly recordable?: boolean;
  /** 競技など、検証はするが端末内の進行・収蔵品へ保存しない実行。 */
  readonly persistProgress?: boolean;
};

export type GameHandle = {
  update: (delta: number) => void;
  startPuzzle: (puzzle: PuzzleDefinition, options?: PuzzleStartOptions) => void;
  startDemo: () => void;
  setPaused: (paused: boolean) => void;
  retire: () => void;
  reset: () => void;
  performAction: (action: string) => void;
  getSnapshot: () => GameSnapshot;
  getCheckpoint: () => RunCheckpoint | null;
  dispose: () => void;
};

export async function createGameScene(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  onStatusChange?: (status: string) => void,
  onSnapshotChange?: (snapshot: GameSnapshot) => void
): Promise<GameHandle> {
  const world = new VaultWorld(
    context,
    canvas,
    onStatusChange,
    onSnapshotChange
  );
  let lastWorldErrorAt = 0;

  const update = (delta: number) => {
    try {
      world.update(delta);
    } catch (error) {
      const now = performance.now();
      if (now - lastWorldErrorAt > 1500) {
        console.error(
          "Vault Tumbler Lab frame recovered after a render error.",
          error
        );
        lastWorldErrorAt = now;
      }
      world.renderRecoveryOverlay();
    }
  };

  return {
    update,
    startPuzzle: (puzzle, options) => world.startPuzzle(puzzle, options),
    startDemo: () => world.startDemo(),
    setPaused: paused => world.setPaused(paused),
    retire: () => world.retire(),
    reset: () => world.performAction("reset"),
    performAction: action => world.performAction(action),
    getSnapshot: () => world.getSnapshot(),
    getCheckpoint: () => world.getCheckpoint(),
    dispose: () => world.dispose(),
  };
}
