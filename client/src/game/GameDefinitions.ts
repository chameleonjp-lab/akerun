/**
 * Vault Tumbler Lab — 金庫問題、金庫型、難易度をデータとして管理する。
 * 通常プレイは公式問題を使い、seed生成は開発・検査用として残す。
 */

export type TurnDirection = "cw" | "ccw";
export type DifficultyId = "observe" | "standard" | "expert" | "blind";
export type ProblemTier = "beginner" | "standard" | "advanced";

export type TumblerStage = {
  readonly target: number;
  readonly direction: TurnDirection;
  readonly wheel: number;
  readonly passes: number;
  readonly instruction: string;
};

export type DifficultyProfile = {
  readonly id: DifficultyId;
  readonly label: string;
  readonly description: string;
  readonly tensionBand: readonly [number, number];
  readonly tensionHoldSeconds: number;
  readonly fenceBand: readonly [number, number];
  readonly fenceHoldSeconds: number;
  readonly faultRollback: number;
  readonly maxFaults: number;
  readonly showExactInstruction: boolean;
  readonly showInternalGatePositions: boolean;
  readonly showFalseGatePositions: boolean;
  readonly blindMode: boolean;
};

export type RewardDefinition = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly catalogNumber: string;
  readonly material: string;
  readonly provenance: string;
  readonly observation: string;
};

export type VaultDefinition = {
  readonly id: string;
  readonly title: string;
  readonly artifact: string;
  readonly description: string;
  readonly wheelCount: number;
  readonly preload: PackPreloadProfile;
  readonly boltLayout: DoorBoltLayout;
};

export type PackPreloadProfile = {
  readonly label: string;
  readonly baseResistance: number;
  readonly flyStickiness: number;
  readonly edgeHardness: number;
};

export type DoorBoltLayout = {
  readonly label: string;
  readonly boltRatios: readonly number[];
  readonly carrierSide: "left" | "right";
  readonly handleResistance: number;
};

export type PuzzleDefinition = {
  readonly id: string;
  readonly seed: number;
  readonly vault: VaultDefinition;
  readonly difficulty: DifficultyProfile;
  readonly stages: readonly TumblerStage[];
  readonly falseGates: readonly FalseGateDefinition[];
  readonly reward: RewardDefinition;
  readonly problemId?: string;
  readonly problemVersion?: string;
  readonly parTime?: number;
  readonly parDialSteps?: number;
  readonly parFaults?: number;
  readonly difficultyWeight?: number;
  readonly problemTier?: ProblemTier;
};

export type FalseGateDefinition = {
  readonly wheel: number;
  readonly position: number;
  readonly depth: number;
};

export type OfficialProblemDefinition = {
  readonly problemId: string;
  readonly problemVersion: string;
  readonly seed: number;
  readonly tier: ProblemTier;
  readonly vaultId: string;
  readonly wheelCount: number;
  readonly startDirection: TurnDirection;
  readonly targets: readonly number[];
  readonly parTime: number;
  readonly parDialSteps: number;
  readonly parFaults: number;
  readonly difficultyWeight: number;
};

export const VAULT_DEFINITIONS: readonly VaultDefinition[] = [
  {
    id: "museum-aurora",
    title: "AURORA COLLECTION VAULT",
    artifact: "黎明の懐中時計",
    description: "博物館の修復室に残された、六層ホイール式の保管金庫。",
    wheelCount: 6,
    preload: { label: "CALIBRATED BRASS", baseResistance: 0.42, flyStickiness: 0.38, edgeHardness: 0.45 },
    boltLayout: { label: "TRIPLE VERTICAL", boltRatios: [0.18, 0.5, 0.82], carrierSide: "right", handleResistance: 0.42 },
  },
  {
    id: "reliquary-nocturne",
    title: "NOCTURNE RELIQUARY VAULT",
    artifact: "夜想の封印函",
    description: "黒鉄の祭具函と航海用儀器を保管する、鈍い青緑の錠前金庫。",
    wheelCount: 6,
    preload: { label: "DAMPED IRON", baseResistance: 0.72, flyStickiness: 0.64, edgeHardness: 0.76 },
    boltLayout: { label: "QUAD CROSSBAR", boltRatios: [0.12, 0.36, 0.64, 0.88], carrierSide: "left", handleResistance: 0.72 },
  },
  {
    id: "chronometer-pelagic",
    title: "PELAGIC CHRONOMETER VAULT",
    artifact: "深海の航海時計",
    description: "青い航海時計と銀鍵を収蔵する、真鍮と鋼の精密保管庫。",
    wheelCount: 6,
    preload: { label: "MARINE CHRONOMETER", baseResistance: 0.34, flyStickiness: 0.27, edgeHardness: 0.82 },
    boltLayout: { label: "OFFSET MARINE", boltRatios: [0.24, 0.43, 0.59, 0.76], carrierSide: "right", handleResistance: 0.3 },
  },
];

export const DIFFICULTY_PROFILES: Readonly<Record<DifficultyId, DifficultyProfile>> = {
  observe: {
    id: "observe",
    label: "OBSERVE",
    description: "機構の因果を学ぶ観察モード。抵抗帯とゲートの位置を表示する。",
    tensionBand: [0.52, 0.82],
    tensionHoldSeconds: 0.12,
    fenceBand: [0.57, 0.78],
    fenceHoldSeconds: 0.12,
    faultRollback: 0,
    maxFaults: 99,
    showExactInstruction: true,
    showInternalGatePositions: true,
    showFalseGatePositions: true,
    blindMode: false,
  },
  standard: {
    id: "standard",
    label: "STANDARD",
    description: "観察、抵抗の検証、回復可能な誤操作で推理する標準プロトコル。",
    tensionBand: [0.62, 0.76],
    tensionHoldSeconds: 0.22,
    fenceBand: [0.64, 0.72],
    fenceHoldSeconds: 0.36,
    faultRollback: 1,
    maxFaults: 5,
    showExactInstruction: false,
    showInternalGatePositions: false,
    showFalseGatePositions: false,
    blindMode: false,
  },
  expert: {
    id: "expert",
    label: "EXPERT",
    description: "最小限の手掛かり、狭い抵抗帯、短い座り時間で読み解く専門モード。",
    tensionBand: [0.66, 0.72],
    tensionHoldSeconds: 0.22,
    fenceBand: [0.65, 0.7],
    fenceHoldSeconds: 0.22,
    faultRollback: 2,
    maxFaults: 3,
    showExactInstruction: false,
    showInternalGatePositions: false,
    showFalseGatePositions: false,
    blindMode: false,
  },
  blind: {
    id: "blind",
    label: "BLIND",
    description: "機構と数値を暗転・遮蔽し、音だけで推理する高難度モード。",
    tensionBand: [0.67, 0.71],
    tensionHoldSeconds: 0.28,
    fenceBand: [0.66, 0.7],
    fenceHoldSeconds: 0.3,
    faultRollback: 2,
    maxFaults: 2,
    showExactInstruction: false,
    showInternalGatePositions: false,
    showFalseGatePositions: false,
    blindMode: true,
  },
};

export const DEFAULT_REWARD: RewardDefinition = {
  id: "aurora-cache",
  title: "AURORA CACHE",
  description: "金貨、宝石、刻印入りの懐中時計が収められた保管トレイ。",
  catalogNumber: "VTL-AU-1903",
  material: "金、黄銅、赤紫のガーネット、黒漆",
  provenance: "北方の時計工房から、1911年に修復室へ移管された私設収蔵品。",
  observation: "懐中時計の裏蓋には、6枚のホイールと同じ間隔で浅い刻印が残る。",
};

export const REWARD_DEFINITIONS: readonly RewardDefinition[] = [
  DEFAULT_REWARD,
  {
    id: "nocturne-reliquary",
    title: "NOCTURNE RELIQUARY",
    description: "青緑の宝石、古い航海儀器、蝋封された文書を収めた黒鉄の函。",
    catalogNumber: "VTL-NR-1876",
    material: "黒染め鋼、真鍮、緑柱石、蜜蝋",
    provenance: "夜間航海用の測量具として港湾観測所に保管され、廃止後に封印された。",
    observation: "緑柱石の裏にある真鍮円盤は、ゲートの窓幅を測る簡易ゲージとして機能する。",
  },
  {
    id: "pelagic-chronometer",
    title: "PELAGIC CHRONOMETER",
    description: "サファイアの航海時計、銀鍵、封緘文書を備えた海洋保管物。",
    catalogNumber: "VTL-PC-1928",
    material: "銀、青鋼、サファイアガラス、羊皮紙",
    provenance: "深海測量船の船長室から回収された航海時計一式。記録簿は未解読のまま保管されている。",
    observation: "銀鍵の歯形はボルトの退避量を示す。時計の秒針とラッチ窓の周期にも一致が見られる。",
  },
];

const normalize = (value: number) => ((value % 100) + 100) % 100;

const mulberry32 = (seed: number) => {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
};

const toInstruction = (direction: TurnDirection, target: number, passes: number) =>
  (direction === "cw" ? "右" : "左") + "へ " + String(target).padStart(2, "0") + " を " + passes + "回目に止める";

export const createMechanicalStages = (
  targets: readonly number[],
  firstDirection: TurnDirection,
): readonly TumblerStage[] =>
  targets.map((target, index) => {
    const direction: TurnDirection = index % 2 === 0
      ? firstDirection
      : firstDirection === "ccw" ? "cw" : "ccw";
    const passes = targets.length - index + 1;
    const wheel = targets.length - index - 1;
    return { target, direction, wheel, passes, instruction: toInstruction(direction, target, passes) };
  });

export const createFalseGates = (targets: readonly number[]): readonly FalseGateDefinition[] => {
  const offsets = [[7, -9], [-8, 10], [9, -7]] as const;
  return targets.flatMap((target, index) => {
    const pair = offsets[index % offsets.length];
    const wheel = targets.length - index - 1;
    return [
      { wheel, position: normalize(target + pair[0]), depth: 0.28 },
      { wheel, position: normalize(target + pair[1]), depth: 0.42 },
    ];
  });
};

const isDistantFrom = (target: number, selected: readonly number[]) =>
  selected.every((value) => {
    const distance = Math.abs(target - value);
    return Math.min(distance, 100 - distance) >= 12;
  });

export const createReferencePuzzle = (difficulty: DifficultyId = "standard"): PuzzleDefinition => {
  const profile = DIFFICULTY_PROFILES[difficulty];
  const stages = createMechanicalStages([72, 18, 55, 37, 84, 6], "ccw");
  return {
    id: "museum-aurora-reference-" + profile.id,
    seed: 7201855,
    vault: VAULT_DEFINITIONS[0],
    difficulty: profile,
    stages,
    falseGates: createFalseGates(stages.map((stage) => stage.target)),
    reward: DEFAULT_REWARD,
  };
};

export const createFalseGateTrainingPuzzle = (): PuzzleDefinition => {
  const stages = createMechanicalStages([28, 64], "ccw");
  return {
    id: "false-gate-practicum",
    seed: 2864,
    vault: {
      ...VAULT_DEFINITIONS[0],
      title: "FALSE-GATE PRACTICUM",
      description: "浅い切欠きと正規ゲートの接触差だけを観察する、二輪の短期訓練契約。",
      wheelCount: 2,
      preload: { label: "TEACHING BRASS", baseResistance: 0.34, flyStickiness: 0.26, edgeHardness: 0.58 },
    },
    difficulty: DIFFICULTY_PROFILES.observe,
    stages,
    falseGates: [
      { wheel: 1, position: 35, depth: 0.32 },
      { wheel: 1, position: 19, depth: 0.46 },
      { wheel: 0, position: 72, depth: 0.3 },
      { wheel: 0, position: 55, depth: 0.44 },
    ],
    reward: DEFAULT_REWARD,
    problemId: "TRAINING-02",
    problemVersion: "V1",
    parTime: 30,
    parDialSteps: 120,
    parFaults: 0,
    difficultyWeight: 0,
    problemTier: "beginner",
  };
};

const officialDifficulty = (tier: ProblemTier): DifficultyProfile => {
  if (tier === "beginner") {
    return {
      ...DIFFICULTY_PROFILES.standard,
      tensionBand: [0.59, 0.79],
      fenceBand: [0.6, 0.76],
      tensionHoldSeconds: 0.18,
      fenceHoldSeconds: 0.28,
      maxFaults: 7,
    };
  }
  if (tier === "advanced") {
    return {
      ...DIFFICULTY_PROFILES.standard,
      tensionBand: [0.65, 0.73],
      fenceBand: [0.645, 0.715],
      tensionHoldSeconds: 0.24,
      fenceHoldSeconds: 0.28,
      maxFaults: 4,
    };
  }
  return DIFFICULTY_PROFILES.standard;
};

export const OFFICIAL_PROBLEM_CATALOG: readonly OfficialProblemDefinition[] = [
  { problemId: "AKERUN-01-V1", problemVersion: "V1", seed: 40101, tier: "beginner", vaultId: "museum-aurora", wheelCount: 4, startDirection: "ccw", targets: [18, 61, 35, 82], parTime: 31, parDialSteps: 330, parFaults: 0, difficultyWeight: 0.96 },
  { problemId: "AKERUN-02-V1", problemVersion: "V1", seed: 40102, tier: "beginner", vaultId: "reliquary-nocturne", wheelCount: 4, startDirection: "cw", targets: [72, 24, 57, 9], parTime: 34, parDialSteps: 340, parFaults: 0, difficultyWeight: 0.98 },
  { problemId: "AKERUN-03-V1", problemVersion: "V1", seed: 40103, tier: "beginner", vaultId: "chronometer-pelagic", wheelCount: 5, startDirection: "ccw", targets: [43, 8, 69, 27, 84], parTime: 40, parDialSteps: 455, parFaults: 0, difficultyWeight: 1.0 },
  { problemId: "AKERUN-04-V1", problemVersion: "V1", seed: 40104, tier: "beginner", vaultId: "museum-aurora", wheelCount: 5, startDirection: "cw", targets: [12, 66, 31, 88, 49], parTime: 42, parDialSteps: 470, parFaults: 0, difficultyWeight: 1.01 },
  { problemId: "AKERUN-05-V1", problemVersion: "V1", seed: 40105, tier: "beginner", vaultId: "reliquary-nocturne", wheelCount: 6, startDirection: "ccw", targets: [81, 39, 5, 63, 24, 92], parTime: 49, parDialSteps: 540, parFaults: 0, difficultyWeight: 1.03 },
  { problemId: "AKERUN-06-V1", problemVersion: "V1", seed: 40106, tier: "standard", vaultId: "chronometer-pelagic", wheelCount: 4, startDirection: "cw", targets: [26, 74, 11, 58], parTime: 36, parDialSteps: 370, parFaults: 1, difficultyWeight: 1.01 },
  { problemId: "AKERUN-07-V1", problemVersion: "V1", seed: 40107, tier: "standard", vaultId: "museum-aurora", wheelCount: 5, startDirection: "ccw", targets: [64, 17, 86, 42, 7], parTime: 43, parDialSteps: 480, parFaults: 1, difficultyWeight: 1.02 },
  { problemId: "AKERUN-08-V1", problemVersion: "V1", seed: 40108, tier: "standard", vaultId: "reliquary-nocturne", wheelCount: 6, startDirection: "cw", targets: [9, 51, 78, 22, 67, 34], parTime: 51, parDialSteps: 555, parFaults: 1, difficultyWeight: 1.04 },
  { problemId: "AKERUN-09-V1", problemVersion: "V1", seed: 40109, tier: "standard", vaultId: "chronometer-pelagic", wheelCount: 5, startDirection: "ccw", targets: [38, 95, 16, 57, 73], parTime: 46, parDialSteps: 500, parFaults: 1, difficultyWeight: 1.05 },
  { problemId: "AKERUN-10-V1", problemVersion: "V1", seed: 40110, tier: "standard", vaultId: "museum-aurora", wheelCount: 6, startDirection: "cw", targets: [47, 14, 82, 29, 61, 6], parTime: 53, parDialSteps: 575, parFaults: 1, difficultyWeight: 1.06 },
  { problemId: "AKERUN-11-V1", problemVersion: "V1", seed: 40111, tier: "standard", vaultId: "reliquary-nocturne", wheelCount: 4, startDirection: "ccw", targets: [57, 3, 79, 34], parTime: 38, parDialSteps: 390, parFaults: 1, difficultyWeight: 1.03 },
  { problemId: "AKERUN-12-V1", problemVersion: "V1", seed: 40112, tier: "standard", vaultId: "chronometer-pelagic", wheelCount: 6, startDirection: "cw", targets: [23, 69, 44, 8, 91, 52], parTime: 54, parDialSteps: 590, parFaults: 1, difficultyWeight: 1.07 },
  { problemId: "AKERUN-13-V1", problemVersion: "V1", seed: 40113, tier: "standard", vaultId: "museum-aurora", wheelCount: 5, startDirection: "ccw", targets: [86, 32, 12, 64, 48], parTime: 47, parDialSteps: 505, parFaults: 1, difficultyWeight: 1.06 },
  { problemId: "AKERUN-14-V1", problemVersion: "V1", seed: 40114, tier: "standard", vaultId: "reliquary-nocturne", wheelCount: 6, startDirection: "cw", targets: [35, 88, 19, 62, 4, 76], parTime: 55, parDialSteps: 605, parFaults: 1, difficultyWeight: 1.08 },
  { problemId: "AKERUN-15-V1", problemVersion: "V1", seed: 40115, tier: "standard", vaultId: "chronometer-pelagic", wheelCount: 5, startDirection: "ccw", targets: [7, 54, 83, 26, 68], parTime: 48, parDialSteps: 515, parFaults: 1, difficultyWeight: 1.05 },
  { problemId: "AKERUN-16-V1", problemVersion: "V1", seed: 40116, tier: "advanced", vaultId: "museum-aurora", wheelCount: 6, startDirection: "cw", targets: [59, 13, 71, 36, 94, 22], parTime: 58, parDialSteps: 635, parFaults: 2, difficultyWeight: 1.09 },
  { problemId: "AKERUN-17-V1", problemVersion: "V1", seed: 40117, tier: "advanced", vaultId: "reliquary-nocturne", wheelCount: 5, startDirection: "ccw", targets: [44, 2, 73, 18, 91], parTime: 51, parDialSteps: 545, parFaults: 2, difficultyWeight: 1.1 },
  { problemId: "AKERUN-18-V1", problemVersion: "V1", seed: 40118, tier: "advanced", vaultId: "chronometer-pelagic", wheelCount: 6, startDirection: "cw", targets: [15, 67, 39, 82, 28, 54], parTime: 60, parDialSteps: 660, parFaults: 2, difficultyWeight: 1.11 },
  { problemId: "AKERUN-19-V1", problemVersion: "V1", seed: 40119, tier: "advanced", vaultId: "museum-aurora", wheelCount: 5, startDirection: "ccw", targets: [75, 21, 49, 93, 11], parTime: 53, parDialSteps: 570, parFaults: 2, difficultyWeight: 1.12 },
  { problemId: "AKERUN-20-V1", problemVersion: "V1", seed: 40120, tier: "advanced", vaultId: "reliquary-nocturne", wheelCount: 6, startDirection: "cw", targets: [6, 58, 31, 86, 17, 72], parTime: 62, parDialSteps: 680, parFaults: 2, difficultyWeight: 1.14 },
];

const cloneVault = (vault: VaultDefinition, wheelCount: number, tier: ProblemTier): VaultDefinition => ({
  ...vault,
  wheelCount,
  preload: {
    ...vault.preload,
    baseResistance: normalize(vault.preload.baseResistance * 100 + (tier === "advanced" ? 4 : tier === "beginner" ? -3 : 0)) / 100,
  },
});

export const createOfficialPuzzle = (problemId: string): PuzzleDefinition => {
  const problem = OFFICIAL_PROBLEM_CATALOG.find((item) => item.problemId === problemId);
  if (!problem) throw new Error("Unknown official problem: " + problemId);
  const vault = VAULT_DEFINITIONS.find((item) => item.id === problem.vaultId) ?? VAULT_DEFINITIONS[0];
  const stages = createMechanicalStages(problem.targets, problem.startDirection);
  return {
    id: problem.problemId,
    seed: problem.seed,
    vault: cloneVault(vault, problem.wheelCount, problem.tier),
    difficulty: officialDifficulty(problem.tier),
    stages,
    falseGates: createFalseGates(problem.targets),
    reward: REWARD_DEFINITIONS[VAULT_DEFINITIONS.findIndex((item) => item.id === problem.vaultId)] ?? DEFAULT_REWARD,
    problemId: problem.problemId,
    problemVersion: problem.problemVersion,
    parTime: problem.parTime,
    parDialSteps: problem.parDialSteps,
    parFaults: problem.parFaults,
    difficultyWeight: problem.difficultyWeight,
    problemTier: problem.tier,
  };
};

export const chooseOfficialProblem = (excludeProblemId?: string): PuzzleDefinition => {
  const available = OFFICIAL_PROBLEM_CATALOG.filter((item) => item.problemId !== excludeProblemId);
  const index = Math.floor(Math.random() * available.length);
  return createOfficialPuzzle(available[index]?.problemId ?? OFFICIAL_PROBLEM_CATALOG[0].problemId);
};

export const createTrainingPuzzle = (step: 1 | 2 | 3 | 4): PuzzleDefinition => {
  if (step === 2) return createFalseGateTrainingPuzzle();
  const wheelCount = step === 1 ? 1 : 3;
  const targets = step === 1 ? [32] : step === 3 ? [18, 63, 41] : [26, 72, 9];
  const firstDirection: TurnDirection = step === 1 ? "cw" : "ccw";
  const stages = createMechanicalStages(targets, firstDirection);
  return {
    id: "training-" + String(step),
    seed: 7100 + step,
    vault: {
      ...VAULT_DEFINITIONS[0],
      title: step === 1 ? "DIAL TRAINING" : step === 3 ? "BACK HALF TRAINING" : "FULL UNLOCK TRAINING",
      description: "公式ゲームへ進む前の短い操作訓練。",
      wheelCount,
    },
    difficulty: step === 1 || step === 3 ? DIFFICULTY_PROFILES.observe : DIFFICULTY_PROFILES.standard,
    stages,
    falseGates: createFalseGates(targets),
    reward: DEFAULT_REWARD,
    problemId: "TRAINING-0" + step,
    problemVersion: "V1",
    parTime: step === 1 ? 12 : 35,
    parDialSteps: step === 1 ? 90 : 260,
    parFaults: 0,
    difficultyWeight: 0,
    problemTier: "beginner",
  };
};

export const createPuzzleFromSeed = (seed: number, difficulty: DifficultyId = "standard"): PuzzleDefinition => {
  const random = mulberry32(seed);
  const profile = DIFFICULTY_PROFILES[difficulty];
  const variantIndex = Math.abs(seed >>> 0) % VAULT_DEFINITIONS.length;
  const vault = VAULT_DEFINITIONS[variantIndex];
  const selected: number[] = [];
  for (let wheel = 0; wheel < vault.wheelCount; wheel += 1) {
    let target = Math.floor(random() * 100);
    let guard = 0;
    while (!isDistantFrom(target, selected) && guard < 24) {
      target = normalize(target + 17 + guard * 3);
      guard += 1;
    }
    selected.push(target);
  }
  const firstDirection: TurnDirection = variantIndex === 1 ? "cw" : "ccw";
  const stages = createMechanicalStages(selected, firstDirection);
  return {
    id: "museum-aurora-" + difficulty + "-" + (seed >>> 0),
    seed: seed >>> 0,
    vault,
    difficulty: profile,
    stages,
    falseGates: createFalseGates(selected),
    reward: REWARD_DEFINITIONS[variantIndex],
  };
};
