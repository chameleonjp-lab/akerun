/**
 * 公式ランキング対象プレイのライフサイクル規則。
 *
 * ブラウザ上のリセットは、通常の訓練やお手本では再初期化として使えるが、
 * 公式プレイでは同じ検証済み実行の計測値をゼロへ戻す抜け道にしない。
 */

export type CompetitiveResetContext = {
  readonly sessionActive: boolean;
  readonly demoMode: boolean;
  readonly trainingContract: boolean;
  readonly developmentSeed: boolean;
  readonly problemId: string;
  readonly problemVersion: string;
  /** falseの場合は自由練習として扱い、競技用リセット規則を適用しない。 */
  readonly recordable?: boolean;
};

export const isOfficialProblemIdentity = (problemId: string, problemVersion: string) =>
  /^AKERUN-\d{2}-V\d+$/.test(problemId) && /^V\d+$/.test(problemVersion);

/** 開錠済みの演出中にRESETで結果状態を消さない。 */
export const canResetMechanism = (opened: boolean) => !opened;

/**
 * 完了済みの検証トークンは、結果送信が完了してから同じ問題の再挑戦へ
 * 引き渡せる。送信中に再挑戦を始めると、サーバーはまだ完了していない
 * トークンを replayRunToken として認めない。
 */
export const isResultSubmissionPending = (status: string) =>
  status === "送信中…" || status === "再送中…";

export const shouldForfeitOfficialReset = (context: CompetitiveResetContext) =>
  context.sessionActive
    && !context.demoMode
    && !context.trainingContract
    && !context.developmentSeed
    && context.recordable !== false
    && isOfficialProblemIdentity(context.problemId, context.problemVersion);
