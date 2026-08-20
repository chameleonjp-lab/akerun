/**
 * Vault Tumbler Lab — 真鍮の機械製図室。
 * 物理的な推理を優先し、描画と切り離して金庫・難易度・解除許容帯を定義する。
 */

export type TurnDirection = "cw" | "ccw";
export type DifficultyId = "observe" | "standard" | "expert" | "blind";

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

/** 扉内のキャリーバーとロッキングボルトを、金庫ごとに異なる安全な観察対象として定義する。 */
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
};

export type FalseGateDefinition = {
  readonly wheel: number;
  readonly position: number;
  /** 正規ゲートを1とした浅い切欠きの深さ。 */
  readonly depth: number;
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
    description: "機構の因果を学ぶ観察モード。抵抗帯とゲートの位置をすべて表示する。",
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
    description: "機構と数値を暗転・遮蔽し、空転、縁、フライ、座りの音だけで推理する高難度モード。",
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

const toInstruction = (direction: TurnDirection, target: number, passes: number) => `${direction === "cw" ? "右" : "左"}へ ${String(target).padStart(2, "0")} を ${passes}回目に止める`;

const createMechanicalStages = (targets: readonly number[], firstDirection: TurnDirection): readonly TumblerStage[] => {
  return targets.map((target, index) => {
    const direction: TurnDirection = index % 2 === 0 ? firstDirection : firstDirection === "ccw" ? "cw" : "ccw";
    const passes = targets.length - index + 1;
    const wheel = targets.length - index - 1;
    return { target, direction, wheel, passes, instruction: toInstruction(direction, target, passes) };
  });
};

/** 正規ゲートの近くに、深さの異なる二つの偽ゲートを決定論的に配置する。 */
const createFalseGates = (targets: readonly number[]): readonly FalseGateDefinition[] => {
  const offsets = [[7, -9], [-8, 10], [9, -7]] as const;
  return targets.flatMap((target, index) => {
    const [first, second] = offsets[index % offsets.length];
    const wheel = targets.length - index - 1;
    return [
      { wheel, position: normalize(target + first), depth: 0.28 },
      { wheel, position: normalize(target + second), depth: 0.42 },
    ];
  });
};

const isDistantFrom = (target: number, selected: readonly number[]) =>
  selected.every((value) => {
    const distance = Math.abs(target - value);
    return Math.min(distance, 100 - distance) >= 12;
  });

/** 既存の基準金庫。自動デモとルール回帰の基準として残す。 */
export const createReferencePuzzle = (difficulty: DifficultyId = "standard"): PuzzleDefinition => {
  const profile = DIFFICULTY_PROFILES[difficulty];
  const stages = createMechanicalStages([72, 18, 55, 37, 84, 6], "ccw");
  return {
    id: `museum-aurora-reference-${profile.id}`,
    seed: 7201855,
    vault: VAULT_DEFINITIONS[0],
    difficulty: profile,
    stages,
    falseGates: createFalseGates(stages.map((stage) => stage.target)),
    reward: DEFAULT_REWARD,
  };
};

/**
 * 浅い切欠きと正規ゲートの接触差を比較する、二輪の短期観察契約。
 * 現実の保安機構へ作用する手順は含めず、ゲーム内ホイールパックの反証練習に限定する。
 */
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
  };
};

/** 同じseedから必ず同じ、かつ相互に十分離れた組合せを生成する。 */
export const createPuzzleFromSeed = (seed: number, difficulty: DifficultyId = "standard"): PuzzleDefinition => {
  const random = mulberry32(seed);
  const profile = DIFFICULTY_PROFILES[difficulty];
  const variantIndex = Math.abs(seed >>> 0) % VAULT_DEFINITIONS.length;
  const vault = VAULT_DEFINITIONS[variantIndex];
  const selected: number[] = [];
  const stages: TumblerStage[] = [];

  for (let wheel = 0; wheel < vault.wheelCount; wheel += 1) {
    let target = Math.floor(random() * 100);
    let guard = 0;
    while (!isDistantFrom(target, selected) && guard < 24) {
      target = normalize(target + 17 + guard * 3);
      guard += 1;
    }
    selected.push(target);
    stages.push({ target, direction: "cw", wheel, passes: 1, instruction: "" });
  }

  const firstDirection: TurnDirection = variantIndex === 1 ? "cw" : "ccw";
  const mechanicalStages = createMechanicalStages(stages.map((stage) => stage.target), firstDirection);

  return {
    id: `museum-aurora-${difficulty}-${seed >>> 0}`,
    seed: seed >>> 0,
    vault,
    difficulty: profile,
    stages: mechanicalStages,
    falseGates: createFalseGates(mechanicalStages.map((stage) => stage.target)),
    reward: REWARD_DEFINITIONS[variantIndex],
  };
};
