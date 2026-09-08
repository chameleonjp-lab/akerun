/**
 * Vault Tumbler Lab — 2Dキャンバスを保持し、画面遷移はReactへ返す。
 */
import { useEffect, useRef, useState } from "react";
import type { GameHandle } from "@/game/scene";
import type { GameSnapshot } from "@/game/VaultWorld";
import { mountGameCanvas } from "@/game/GameCanvasLifecycle";

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
  const errorDialogRef = useRef<HTMLDialogElement>(null);
  const callbacksRef = useRef({ onReady, onSnapshot, onVisibilityPause });
  const [attempt, setAttempt] = useState(0);
  const [initializationFailed, setInitializationFailed] = useState(false);
  const [liveStatus, setLiveStatus] =
    useState("タイトルから問題を開始してください。");

  callbacksRef.current = { onReady, onSnapshot, onVisibilityPause };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return mountGameCanvas(canvas, {
      onReady: handle => callbacksRef.current.onReady?.(handle),
      onSnapshot: snapshot => callbacksRef.current.onSnapshot?.(snapshot),
      onStatus: setLiveStatus,
      onVisibilityPause: () => callbacksRef.current.onVisibilityPause?.(),
      onError: error => {
        console.error("Vault Tumbler Labの初期化に失敗しました。", error);
        setInitializationFailed(true);
        setLiveStatus(
          "ゲーム画面を準備できませんでした。もう一度お試しください。"
        );
      },
    });
  }, [attempt]);

  useEffect(() => {
    const dialog = errorDialogRef.current;
    if (!initializationFailed || !dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, [initializationFailed]);

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
      {initializationFailed ? (
        <dialog
          ref={errorDialogRef}
          className="akerun-canvas-error"
          role="alertdialog"
          aria-labelledby="canvas-error-title"
          aria-describedby="canvas-error-description"
          onCancel={event => event.preventDefault()}
        >
          <section className="akerun-modal-card">
            <h2 id="canvas-error-title">ゲーム画面を準備できませんでした</h2>
            <p id="canvas-error-description">
              もう一度、画面を準備し直してください。保存した記録は残ります。
            </p>
            <button
              type="button"
              className="akerun-button akerun-button-primary"
              autoFocus
              onClick={() => {
                setInitializationFailed(false);
                setLiveStatus("ゲーム画面を準備しています。");
                setAttempt(current => current + 1);
              }}
            >
              もう一度試す
            </button>
          </section>
        </dialog>
      ) : null}
    </>
  );
}
