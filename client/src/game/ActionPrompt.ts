import type { GameSnapshot } from "./VaultWorld";

export type ActionPrompt = {
  readonly title: string;
  readonly instruction: string;
  /** 画面幅が狭くても一行ずつ読める短い状態ラベル。 */
  readonly details: readonly string[];
};

type ActionPromptSnapshot = Pick<
  GameSnapshot,
  | "phase"
  | "activeWheel"
  | "activeDirection"
  | "activeTarget"
  | "currentPass"
  | "requiredPasses"
  | "targetStopPending"
  | "protocolInstruction"
  | "opened"
  | "status"
  | "stage"
  | "stageCount"
>;

const phaseTitles: Readonly<Record<string, string>> = {
  dial: "ダイヤルを回す",
  settling: "停止後の反応を見る",
  "tension-ready": "テンションを掛ける",
  "tension-test": "抵抗帯で保持する",
  "fence-ready": "フェンスを着座させる",
  "fence-seated": "ボルトの退避を試す",
  "bolt-test": "ロックボルトを確認する",
  "boltwork-ready": "扉ハンドルを回す",
  "handle-test": "扉側ボルトを後退させる",
  jammed: "力を抜いて復帰する",
  lockout: "安全停止中",
  open: "開錠しました",
};

const phaseSummaries: Readonly<Record<string, string>> = {
  dial: "反応を探して、止めた位置を観察",
  settling: "ダイヤルを止めて、反応が落ち着くまで待つ",
  "tension-ready": "静かに負荷を掛ける",
  "tension-test": "抵抗針が沈む帯域で保持",
  "fence-ready": "ゆっくり押して、座りを確かめる",
  "fence-seated": "フェンスを保持して、ボルトを試す",
  "bolt-test": "退避量が安定する位置を読む",
  "boltwork-ready": "ハンドルでボルトワークを後退",
  "handle-test": "受け金から抜けるまで保持",
  jammed: "指を離し、整列の仮説を見直す",
  lockout: "RESETで安全に最初から再開",
  open: "結果を確認できます",
};

const directionLabel = (direction: "cw" | "ccw") =>
  direction === "cw" ? "右回り" : "左回り";

const targetLabel = (target: number) =>
  `目標 ${String(target).padStart(2, "0")}`;

/**
 * CanvasとHTMLが同じスナップショットを読むための、短い行動表示を作る。
 * activeTargetは難易度が許可した場合だけ渡されるため、ここでは隠し情報を
 * 推測して補わない。
 */
export const getActionPrompt = (
  snapshot: ActionPromptSnapshot | null
): ActionPrompt => {
  if (!snapshot) {
    return {
      title: "問題を準備中",
      instruction: "ゲーム画面を準備しています。",
      details: ["ダイヤルを操作できます"],
    };
  }

  const title =
    snapshot.status === "retired"
      ? "プレイを終了しました"
      : snapshot.opened || snapshot.phase === "open"
        ? "開錠しました"
        : (phaseTitles[snapshot.phase] ?? "次の操作を確認");
  const details: string[] = [];

  if (snapshot.phase === "dial") {
    if (snapshot.activeWheel !== null)
      details.push(`輪 ${snapshot.activeWheel + 1}`);
    if (snapshot.activeDirection)
      details.push(directionLabel(snapshot.activeDirection));
    if (snapshot.activeTarget !== null)
      details.push(targetLabel(snapshot.activeTarget));
    if (
      snapshot.currentPass !== null &&
      snapshot.requiredPasses !== null &&
      snapshot.requiredPasses > 0
    ) {
      details.push(`${snapshot.currentPass}/${snapshot.requiredPasses}回目`);
    }
    if (snapshot.targetStopPending) details.push("停止確認中");
    if (snapshot.activeTarget === null && !snapshot.targetStopPending)
      details.push("反応で探す");
  } else {
    details.push(phaseSummaries[snapshot.phase] ?? "画面の反応を確認");
    if (snapshot.stageCount > 0 && snapshot.phase !== "open")
      details.push(`段階 ${snapshot.stage}/${snapshot.stageCount}`);
  }

  return {
    title,
    instruction:
      snapshot.protocolInstruction ||
      phaseSummaries[snapshot.phase] ||
      "画面の反応を確認してください。",
    details,
  };
};
