/**
 * Vault Tumbler Lab — 真鍮の機械製図室。
 * React は額縁、Babylon の全画面キャンバスがダイヤルとカットアウェイを描く。
 */
import { useEffect, useRef, useState } from "react";
import { Engine } from "@babylonjs/core/Engines/engine";
import { createGameScene, type GameHandle } from "@/game/scene";

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startedRef = useRef(false);
  const [liveStatus, setLiveStatus] = useState("接触針で最初のホイールを観察してください。");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || startedRef.current) return;
    startedRef.current = true;

    const engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      adaptToDeviceRatio: true,
    });

    let handle: GameHandle | null = null;
    let disposed = false;

    createGameScene(engine, canvas, setLiveStatus)
      .then((nextHandle: GameHandle) => {
        if (disposed) {
          nextHandle.dispose();
          return;
        }
        handle = nextHandle;
        engine.runRenderLoop(() => nextHandle.scene.render());
      })
      .catch((error: unknown) => {
        console.error("Vault Tumbler Lab の初期化に失敗しました。", error);
      });

    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      handle?.dispose();
      engine.dispose();
      startedRef.current = false;
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="application"
        aria-label="Vault Tumbler Lab: ダイヤル式金庫の内部機構を観察する開錠ゲーム"
        aria-description="6輪ホイールパックを扱う開錠ゲームです。矢印キーまたはAとDでダイヤルを回します。低い鈍い音はドライブカムの空転、短い高音はゲート縁、明瞭な二重音はフライ接続を示しますが、いずれも単独では正解を保証しません。対応するモバイル端末では同じ手掛かりが短い振動でも届き、KまたはHAPTICで切り替えられます。4で画面を遮蔽して音だけを手掛かりにするブラインドモードへ切り替えます。ブラインドモードではVで視覚補助、Sで音の切替を行えます。Fで現在の物理部品へ焦点を移し、Shiftと左右矢印でテンション、上下矢印でフェンスを調整し、Spaceで保持、Escapeで力を抜きます。Rでリセット、Gでガイド、1から3で他の難易度、Nで新しい契約、Tで日替わり契約、Bで自己ベスト、Lで鑑定帳、Iで分解観察、角括弧で観察対象を切り替え、Hで高コントラスト、Mで低モーション、Pで精密操作を切り替えます。"
        style={{ backgroundColor: "#0B1118", backgroundImage: "url('/manus-storage/vault-tumbler-reference_35720048.png')", backgroundPosition: "center", backgroundSize: "cover" }}
        className="fixed inset-0 h-full w-full touch-none outline-none"
      />
      <p className="sr-only" aria-live="polite" aria-atomic="true">{liveStatus}</p>
    </>
  );
}
