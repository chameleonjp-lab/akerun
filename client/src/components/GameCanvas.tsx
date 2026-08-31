/**
 * Vault Tumbler Lab — 2Dキャンバスを保持し、画面遷移はReactへ返す。
 */
import { useEffect, useRef, useState } from "react";
import { createGameScene, type GameHandle } from "@/game/scene";
import type { GameSnapshot } from "@/game/VaultWorld";
import { createRenderLoopController } from "@/game/RenderLoopController";

type GameCanvasProps = {
  readonly onReady?: (handle: GameHandle | null) => void;
  readonly onSnapshot?: (snapshot: GameSnapshot) => void;
  readonly onVisibilityPause?: () => void;
};

export default function GameCanvas({
  onReady,
  onSnapshot,
  onVisibilityPause,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startedRef = useRef(false);
  const callbacksRef = useRef({ onReady, onSnapshot, onVisibilityPause });
  const [liveStatus, setLiveStatus] =
    useState("タイトルから問題を開始してください。");

  callbacksRef.current = { onReady, onSnapshot, onVisibilityPause };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || startedRef.current) return;
    startedRef.current = true;

    const context = canvas.getContext("2d", {
      alpha: false,
      desynchronized: true,
    });
    if (!context) {
      console.error(
        "Vault Tumbler Labの2D描画コンテキストを作成できませんでした。"
      );
      return;
    }

    let handle: GameHandle | null = null;
    let disposed = false;
    let renderLoop: ReturnType<typeof createRenderLoopController> | null = null;
    let lastSnapshotMessage = "";

    const animationFrameTarget = {
      requestAnimationFrame: (callback: (timestamp: number) => void) =>
        window.requestAnimationFrame(callback),
      cancelAnimationFrame: (frameId: number) =>
        window.cancelAnimationFrame(frameId),
    };

    createGameScene(canvas, context, setLiveStatus, snapshot => {
      // The world emits a snapshot on every frame, while transition cues
      // use onStatusChange. Only publish a changed snapshot message so the
      // live region stays current without making screen readers repeat the
      // same sentence dozens of times per second.
      if (snapshot.message && snapshot.message !== lastSnapshotMessage) {
        lastSnapshotMessage = snapshot.message;
        setLiveStatus(snapshot.message);
      }
      callbacksRef.current.onSnapshot?.(snapshot);
    })
      .then((nextHandle: GameHandle) => {
        if (disposed) {
          nextHandle.dispose();
          return;
        }
        handle = nextHandle;
        callbacksRef.current.onReady?.(nextHandle);
        renderLoop = createRenderLoopController(animationFrameTarget, delta =>
          nextHandle.update(delta)
        );
        renderLoop.start();
      })
      .catch((error: unknown) => {
        console.error("Vault Tumbler Labの初期化に失敗しました。", error);
      });

    const onResize = () => handle?.update(0);
    const onVisibilityChange = () => {
      if (document.hidden) {
        if (!handle) return;
        renderLoop?.stop();
        handle.setPaused(true);
        callbacksRef.current.onVisibilityPause?.();
        return;
      }
      renderLoop?.start();
    };
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      callbacksRef.current.onReady?.(null);
      renderLoop?.dispose();
      handle?.dispose();
      startedRef.current = false;
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="application"
        aria-label="アケルン / Vault Tumbler Lab: ダイヤル式金庫の内部機構を観察する開錠ゲーム"
        aria-description="公式20問から一問が固定されます。ダイヤルを回し、音と画面の反応を観察し、テンション、フェンス、ロックボルト、扉ハンドルの順に開錠します。音・振動・高コントラスト・低モーションは補助であり、使わなくてもプレイできます。"
        className="fixed inset-0 h-full w-full touch-none outline-none"
      />
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {liveStatus}
      </p>
    </>
  );
}
