export type TrainingSnapshotForProgress = {
  readonly status: "idle" | "active" | "paused" | "opened" | "retired";
  readonly phase: string;
  readonly stage: number;
  readonly stageCount: number;
};

/**
 * 訓練1・2はダイヤル観察だけを教える契約なので、全ホイールの整列を
 * 完了条件とする。後半の物理操作は訓練3・4で扱う。
 */
export const isDialTrainingComplete = (
  step: number,
  snapshot: TrainingSnapshotForProgress
) =>
  (step === 1 || step === 2) &&
  snapshot.status === "active" &&
  snapshot.phase === "tension-ready" &&
  snapshot.stage > 0 &&
  snapshot.stage === snapshot.stageCount;
