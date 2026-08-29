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

export const shouldForfeitOfficialReset = (context: CompetitiveResetContext) =>
  context.sessionActive
    && !context.demoMode
    && !context.trainingContract
    && !context.developmentSeed
    && context.recordable !== false
    && isOfficialProblemIdentity(context.problemId, context.problemVersion);
