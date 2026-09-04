import {
  createOfficialPuzzle,
  OFFICIAL_PROBLEM_CATALOG,
  type OfficialProblemDefinition,
  type ProblemTier,
  type TurnDirection,
} from "./GameDefinitions";
import { LockMechanism } from "./LockMechanism";
import { calculateRunScore } from "./RunSession";
import { scoreTimeReferenceSeconds } from "../../../shared/akerun/ScoreContract";

export const OFFICIAL_PROBLEM_BALANCE_LIMITS = {
  maxBaselineScoreRange: 200,
  maxNormalizedRouteDeviation: 0.2,
} as const;

export type OfficialProblemBalance = {
  readonly problemId: string;
  readonly problemVersion: string;
  readonly vault: string;
  readonly wheelCount: number;
  readonly minimumDialSteps: number;
  readonly minimumFalseGateContacts: number;
  readonly totalPasses: number;
  readonly falseGateCount: number;
  readonly parTime: number;
  readonly scoreTimeReferenceSeconds: number;
  readonly parDialSteps: number;
  readonly parFaults: number;
  readonly difficulty: ProblemTier;
  readonly difficultyWeight: number;
  readonly baselineScore: number;
};

export type OfficialProblemAudit = {
  readonly problemId: string;
  readonly problemVersion: string;
  readonly dialSolved: boolean;
  readonly fullyUnlockable: boolean;
  readonly regularGateOverlapCount: number;
  readonly falseGateDuplicateCount: number;
  readonly invalidDirectionCount: number;
  readonly invalidPassCount: number;
  readonly invalidStageWheelCount: number;
  readonly invalidPositionCount: number;
  readonly extremeBalanceOutlier: boolean;
  readonly issueCodes: readonly string[];
};

export type OfficialProblemCatalogAudit = {
  readonly problems: readonly OfficialProblemAudit[];
  readonly scoreRange: number;
  readonly scoreRangeWithinLimit: boolean;
  readonly outlierProblemIds: readonly string[];
  readonly valid: boolean;
};

type DialRouteResult = {
  readonly lock: LockMechanism;
  readonly steps: number;
  readonly falseGateContacts: number;
  readonly solved: boolean;
};

const oppositeDirection = (direction: TurnDirection): TurnDirection =>
  direction === "cw" ? "ccw" : "cw";

const expectedDirection = (
  firstDirection: TurnDirection,
  stageIndex: number
): TurnDirection =>
  stageIndex % 2 === 0 ? firstDirection : oppositeDirection(firstDirection);

const advance = (lock: LockMechanism, seconds: number) => {
  let remaining = Math.max(0, seconds);
  while (remaining > 0) {
    const delta = Math.min(0.05, remaining);
    lock.tick(delta);
    remaining -= delta;
  }
};

const measureDialRoute = (problemId: string): DialRouteResult => {
  const puzzle = createOfficialPuzzle(problemId);
  const totalPasses = puzzle.stages.reduce(
    (sum, stage) => sum + Math.max(0, stage.passes),
    0
  );
  const maximumSteps = Math.max(
    100,
    totalPasses * 100 + puzzle.stages.length * 2
  );
  const lock = new LockMechanism(puzzle);
  let steps = 0;
  let falseGateContacts = 0;

  while (lock.stage < puzzle.stages.length && steps < maximumSteps) {
    const stage = lock.activeStage;
    if (!stage) break;
    const stageBefore = lock.stage;
    lock.rotate(stage.direction === "cw" ? 1 : -1);
    steps += 1;
    falseGateContacts += lock.lastRotationFalseGateContacts;
    if (lock.stage < stageBefore) break;
  }

  const solved =
    lock.stage === puzzle.stages.length &&
    (lock.phase === "tension-ready" || lock.phase === "settling");

  return { lock, steps, falseGateContacts, solved };
};

const finishThroughExistingMechanism = (route: DialRouteResult) => {
  if (!route.solved) return false;
  const lock = route.lock;
  const puzzle = lock.puzzle;

  if (lock.phase === "settling") {
    advance(lock, puzzle.vault.personality.settlingDelaySeconds + 0.06);
  }
  if (lock.phase !== "tension-ready") return false;

  const [tensionMinimum, tensionMaximum] = puzzle.difficulty.tensionBand;
  lock.setTension((tensionMinimum + tensionMaximum) / 2);
  advance(lock, puzzle.difficulty.tensionHoldSeconds + 0.06);
  const phaseAfterTension: string = lock.phase;
  if (phaseAfterTension !== "fence-ready") return false;

  const [fenceMinimum, fenceMaximum] = puzzle.difficulty.fenceBand;
  lock.setFenceTravel((fenceMinimum + fenceMaximum) / 2);
  advance(lock, puzzle.difficulty.fenceHoldSeconds + 0.06);
  const phaseAfterFence: string = lock.phase;
  if (phaseAfterFence !== "fence-seated") return false;

  lock.setBoltTravel(0.84);
  advance(lock, 0.3);
  const phaseAfterBolt: string = lock.phase;
  if (phaseAfterBolt !== "boltwork-ready") return false;

  lock.setHandleTurn(Math.min(1, lock.requiredHandleTurn + 0.02));
  advance(lock, 0.3);
  return lock.opened;
};

export const measureOfficialProblemBalance = (
  problemId: string
): OfficialProblemBalance => {
  const definition = OFFICIAL_PROBLEM_CATALOG.find(
    item => item.problemId === problemId
  );
  if (!definition) throw new Error("Unknown official problem: " + problemId);
  const puzzle = createOfficialPuzzle(problemId);
  const route = measureDialRoute(problemId);
  if (!route.solved) {
    throw new Error(`公式問題 ${problemId} の自動計測が停止しました。`);
  }
  const minimumDialSteps = route.steps;
  const totalPasses = puzzle.stages.reduce(
    (sum, stage) => sum + stage.passes,
    0
  );

  return {
    problemId,
    problemVersion: definition.problemVersion,
    vault: puzzle.vault.title,
    wheelCount: puzzle.vault.wheelCount,
    minimumDialSteps,
    minimumFalseGateContacts: route.falseGateContacts,
    totalPasses,
    falseGateCount: puzzle.falseGates.length,
    parTime: definition.parTime,
    scoreTimeReferenceSeconds: scoreTimeReferenceSeconds(puzzle),
    parDialSteps: definition.parDialSteps,
    parFaults: definition.parFaults,
    difficulty: definition.tier,
    difficultyWeight: definition.difficultyWeight,
    baselineScore: calculateRunScore(
      puzzle,
      scoreTimeReferenceSeconds(puzzle),
      definition.parFaults,
      minimumDialSteps,
      0
    ),
  };
};

export const OFFICIAL_PROBLEM_BALANCE: readonly OfficialProblemBalance[] =
  OFFICIAL_PROBLEM_CATALOG.map(problem =>
    measureOfficialProblemBalance(problem.problemId)
  );

const median = (values: readonly number[]) => {
  const ordered = [...values].sort((left, right) => left - right);
  if (ordered.length === 0) return 0;
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[middle - 1] + ordered[middle]) / 2
    : ordered[middle];
};

const addIssue = (issues: string[], code: string) => {
  if (!issues.includes(code)) issues.push(code);
};

const auditProblemShape = (
  definition: OfficialProblemDefinition,
  balance: OfficialProblemBalance
): Omit<OfficialProblemAudit, "extremeBalanceOutlier"> => {
  const puzzle = createOfficialPuzzle(definition.problemId);
  const issues: string[] = [];
  let regularGateOverlapCount = 0;
  let falseGateDuplicateCount = 0;
  let invalidDirectionCount = 0;
  let invalidPassCount = 0;
  let invalidStageWheelCount = 0;
  let invalidPositionCount = 0;

  if (definition.problemVersion !== balance.problemVersion) {
    addIssue(issues, "PROBLEM_VERSION_MISMATCH");
  }
  if (definition.parFalseGateContacts !== balance.minimumFalseGateContacts) {
    addIssue(issues, "PAR_FALSE_GATE_CONTACT_MISMATCH");
  }
  if (definition.targets.length !== definition.wheelCount) {
    addIssue(issues, "TARGET_COUNT_MISMATCH");
  }
  if (puzzle.vault.wheelCount !== definition.wheelCount) {
    addIssue(issues, "VAULT_WHEEL_COUNT_MISMATCH");
  }
  if (puzzle.stages.length !== definition.wheelCount) {
    addIssue(issues, "STAGE_COUNT_MISMATCH");
  }

  const targetByWheel = new Map<number, number>();
  const seenWheels = new Set<number>();
  puzzle.stages.forEach((stage, index) => {
    const expectedWheel = definition.wheelCount - index - 1;
    if (
      !Number.isInteger(stage.wheel) ||
      stage.wheel < 0 ||
      stage.wheel >= definition.wheelCount ||
      seenWheels.has(stage.wheel) ||
      stage.wheel !== expectedWheel
    ) {
      invalidStageWheelCount += 1;
      addIssue(issues, "INVALID_STAGE_WHEEL");
    }
    seenWheels.add(stage.wheel);
    targetByWheel.set(stage.wheel, stage.target);

    if (
      stage.direction !== expectedDirection(definition.startDirection, index)
    ) {
      invalidDirectionCount += 1;
      addIssue(issues, "INVALID_DIRECTION_SEQUENCE");
    }
    if (
      stage.passes !== definition.wheelCount - index + 1 ||
      stage.passes <= 0
    ) {
      invalidPassCount += 1;
      addIssue(issues, "INVALID_PASS_COUNT");
    }

    if (
      !Number.isInteger(stage.target) ||
      stage.target < 0 ||
      stage.target >= 100
    ) {
      invalidPositionCount += 1;
      addIssue(issues, "INVALID_TARGET_POSITION");
    }
  });

  const falseGateKeys = new Set<string>();
  for (const gate of puzzle.falseGates) {
    const target = targetByWheel.get(gate.wheel);
    if (target === undefined) {
      invalidStageWheelCount += 1;
      addIssue(issues, "INVALID_FALSE_GATE_WHEEL");
    } else if (gate.position === target) {
      regularGateOverlapCount += 1;
      addIssue(issues, "FALSE_GATE_OVERLAPS_REGULAR_GATE");
    }

    const key = `${gate.wheel}:${gate.position}`;
    if (falseGateKeys.has(key)) {
      falseGateDuplicateCount += 1;
      addIssue(issues, "DUPLICATE_FALSE_GATE");
    }
    falseGateKeys.add(key);

    if (
      !Number.isInteger(gate.position) ||
      gate.position < 0 ||
      gate.position >= 100 ||
      !Number.isFinite(gate.depth) ||
      gate.depth <= 0 ||
      gate.depth >= 1
    ) {
      invalidPositionCount += 1;
      addIssue(issues, "INVALID_FALSE_GATE_POSITION");
    }
  }

  const expectedFalseGatesPerWheel =
    puzzle.vault.personality.falseGatesPerWheel;
  if (
    puzzle.falseGates.length !==
    definition.wheelCount * expectedFalseGatesPerWheel
  ) {
    addIssue(issues, "FALSE_GATE_COUNT_MISMATCH");
  }
  for (let wheel = 0; wheel < definition.wheelCount; wheel += 1) {
    const count = puzzle.falseGates.filter(gate => gate.wheel === wheel).length;
    if (count !== expectedFalseGatesPerWheel)
      addIssue(issues, "FALSE_GATE_PER_WHEEL_MISMATCH");
  }

  const route = measureDialRoute(definition.problemId);
  const fullyUnlockable = finishThroughExistingMechanism(route);
  if (!route.solved) addIssue(issues, "DIAL_ROUTE_BLOCKED");
  if (!fullyUnlockable) addIssue(issues, "FULL_UNLOCK_BLOCKED");

  return {
    problemId: definition.problemId,
    problemVersion: definition.problemVersion,
    dialSolved: route.solved,
    fullyUnlockable,
    regularGateOverlapCount,
    falseGateDuplicateCount,
    invalidDirectionCount,
    invalidPassCount,
    invalidStageWheelCount,
    invalidPositionCount,
    issueCodes: issues,
  };
};

const appendOutlierIssues = (
  audit: Omit<OfficialProblemAudit, "extremeBalanceOutlier">,
  outlier: boolean
): OfficialProblemAudit => {
  const issueCodes = [...audit.issueCodes];
  if (outlier) addIssue(issueCodes, "EXTREME_BALANCE_OUTLIER");
  return { ...audit, extremeBalanceOutlier: outlier, issueCodes };
};

export const auditOfficialProblemCatalog = (
  balances: readonly OfficialProblemBalance[] = OFFICIAL_PROBLEM_BALANCE
): OfficialProblemCatalogAudit => {
  const balancesById = new Map(
    balances.map(balance => [balance.problemId, balance])
  );
  const shapeAudits = OFFICIAL_PROBLEM_CATALOG.map(definition => {
    const balance = balancesById.get(definition.problemId);
    if (!balance) {
      return {
        problemId: definition.problemId,
        problemVersion: definition.problemVersion,
        dialSolved: false,
        fullyUnlockable: false,
        regularGateOverlapCount: 0,
        falseGateDuplicateCount: 0,
        invalidDirectionCount: 0,
        invalidPassCount: 0,
        invalidStageWheelCount: 0,
        invalidPositionCount: 0,
        extremeBalanceOutlier: false,
        issueCodes: ["MISSING_BALANCE_ROW"],
      } satisfies OfficialProblemAudit;
    }
    return auditProblemShape(definition, balance);
  });

  const outlierIds = new Set<string>();
  const balancesByWheelCount = new Map<number, OfficialProblemBalance[]>();
  for (const balance of balances) {
    const group = balancesByWheelCount.get(balance.wheelCount) ?? [];
    group.push(balance);
    balancesByWheelCount.set(balance.wheelCount, group);
  }

  balancesByWheelCount.forEach(group => {
    const dialMedian = median(
      group.map(balance => balance.minimumDialSteps / balance.totalPasses)
    );
    const timeMedian = median(
      group.map(balance => balance.parTime / balance.totalPasses)
    );
    for (const balance of group) {
      const dialDeviation =
        dialMedian === 0
          ? 0
          : Math.abs(
              balance.minimumDialSteps / balance.totalPasses / dialMedian - 1
            );
      const timeDeviation =
        timeMedian === 0
          ? 0
          : Math.abs(balance.parTime / balance.totalPasses / timeMedian - 1);
      if (
        dialDeviation >
          OFFICIAL_PROBLEM_BALANCE_LIMITS.maxNormalizedRouteDeviation ||
        timeDeviation >
          OFFICIAL_PROBLEM_BALANCE_LIMITS.maxNormalizedRouteDeviation
      ) {
        outlierIds.add(balance.problemId);
      }
    }
  });

  const problems = shapeAudits.map(audit =>
    appendOutlierIssues(audit, outlierIds.has(audit.problemId))
  );
  const scores = balances.map(balance => balance.baselineScore);
  const scoreRange =
    scores.length === 0 ? 0 : Math.max(...scores) - Math.min(...scores);
  const scoreRangeWithinLimit =
    scoreRange <= OFFICIAL_PROBLEM_BALANCE_LIMITS.maxBaselineScoreRange;
  const valid =
    scoreRangeWithinLimit &&
    problems.every(problem => problem.issueCodes.length === 0);

  return {
    problems,
    scoreRange,
    scoreRangeWithinLimit,
    outlierProblemIds: Array.from(outlierIds),
    valid,
  };
};

export const OFFICIAL_PROBLEM_AUDIT = auditOfficialProblemCatalog();

const tierLabel = (tier: ProblemTier) => {
  if (tier === "beginner") return "初級";
  if (tier === "advanced") return "上級";
  return "中級";
};

const vaultLabel = (title: string) => title.split(/\s+/)[0] ?? title;

export const renderOfficialProblemBalanceMarkdown = (
  balances: readonly OfficialProblemBalance[] = OFFICIAL_PROBLEM_BALANCE,
  audit: OfficialProblemCatalogAudit = auditOfficialProblemCatalog(balances)
) => {
  const rows = balances.map(
    balance =>
      `| ${balance.problemId} | ${balance.problemVersion} | ${vaultLabel(balance.vault)} | ${balance.wheelCount} | ${balance.minimumDialSteps} | ${balance.minimumFalseGateContacts} | ${balance.totalPasses} | ${balance.falseGateCount} | ${balance.parTime} | ${balance.scoreTimeReferenceSeconds} | ${balance.parFaults} | ${tierLabel(balance.difficulty)} | ${balance.baselineScore} |`
  );
  const status = audit.valid ? "PASS" : "要調整";
  return [
    "# 公式20問の問題バランス表",
    "",
    "この表は `pnpm generate:problem-balance` で、公式問題定義と既存の `LockMechanism` から自動生成します。手書きの基準値と実装値がずれないよう、変更時は生成結果を確認してください。",
    "",
    "最低必要回転数と基準偽ゲート接触数は、各問題を初期状態から正しい方向へ進めた自動解法から計測します。不可避な通過は基準値へ含め、基準を超えた接触だけをスコアと観察精度へ反映します。アクセシビリティ設定や入力方式による減点は含みません。",
    "",
    "`AKERUN-01-V1` と `AKERUN-02-V1` には初回導線用の `guided` フラグがあります。これは表示上の補助（正規ゲート・偽ゲート位置・具体的な通過指示）だけを変更し、問題の目標、通過数、基準値、決定的リプレイには影響しません。`AKERUN-03-V1` 以降は標準の遮蔽表示です。",
    "",
    `自動監査: **${status}**（開錠可能 ${audit.problems.filter(problem => problem.fullyUnlockable).length}/${audit.problems.length}、基準スコア差 ${audit.scoreRange}点、外れ値 ${audit.outlierProblemIds.length}問）`,
    "",
    "| 問題ID | Version | 金庫 | ホイール | 最低必要回転数 | 基準偽ゲート接触 | 総通過回数 | 偽ゲート数 | 機械基準時間(s) | 採点時間基準(s) | 基準失敗数 | 難易度 | 基準スコア |",
    "| ------ | ------- | ---- | -------: | -------------: | ---------------: | ---------: | ---------: | --------------: | --------------: | ---------: | ------ | ---------: |",
    ...rows,
    "",
    "V3の採点時間基準は、機械監査用の `parTime` を10倍した暫定値です。通常の時間項には上限を設け、60秒以内だけ速度ボーナスを加えて人間の観察時間と速度走を分けます。実機プレイ後は操作速度・観察時間・端末性能を含む実測値で時間基準を再調整し、採点契約を変更するときは版を上げます。",
    "",
  ].join("\n");
};
