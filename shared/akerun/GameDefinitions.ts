/**
 * Vault Tumbler Lab — 金庫問題、金庫型、難易度をデータとして管理する。
 * 通常プレイは公式問題を使い、seed生成は開発・検査用として残す。
 */

export type TurnDirection = "cw" | "ccw";
export type DifficultyId = "observe" | "standard" | "expert" | "blind";
export type ProblemTier = "beginner" | "standard" | "advanced";
export type RewardRarity = "standard" | "rare" | "special";

export type RewardUnlockCondition =
  | { readonly type: "vault"; readonly vaultId: string }
  | { readonly type: "problem"; readonly problemId: string }
  | { readonly type: "faults-at-most"; readonly count: number }
  | { readonly type: "excess-dial-at-most"; readonly steps: number }
  | { readonly type: "accuracy-at-least"; readonly percent: number }
  | { readonly type: "score-at-least"; readonly score: number };

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
  readonly rarity: RewardRarity;
  readonly conditionLabel: string;
  readonly unlockConditions: readonly RewardUnlockCondition[];
  readonly catalogNumber: string;
  readonly material: string;
  readonly provenance: string;
  readonly observation: string;
};

export type VaultPersonalityId = "clear-contact" | "comparison" | "timing";

export type VaultPersonality = {
  readonly id: VaultPersonalityId;
  readonly label: string;
  readonly description: string;
  readonly contactContrast: number;
  readonly falseGateSimilarity: number;
  /** 公式問題の抵抗帯を金庫固有に広げる量。スコア補助ではなく操作感だけに使う。 */
  readonly toleranceExpansion: number;
  /** 金庫ごとの偽ゲート密度。比較型だけ候補を一つ増やす。 */
  readonly falseGatesPerWheel: 2 | 3;
  readonly settlingDelaySeconds: number;
  readonly speedSensitivity: number;
};

export type VaultDefinition = {
  readonly id: string;
  readonly title: string;
  readonly artifact: string;
  readonly description: string;
  readonly wheelCount: number;
  readonly preload: PackPreloadProfile;
  readonly boltLayout: DoorBoltLayout;
  readonly personality: VaultPersonality;
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
  readonly parFalseGateContacts?: number;
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
  /** 正しい最短経路でも通過する偽ゲート数。これを超えた分だけスコアへ反映する。 */
  readonly parFalseGateContacts: number;
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
    personality: {
      id: "clear-contact",
      label: "CLEAR CONTACT",
      description: "正規ゲート、ゲート縁、偽ゲートの反応差が大きく、最初の観察に向く金庫。",
      contactContrast: 0.92,
      falseGateSimilarity: 0.18,
      toleranceExpansion: 0.02,
      falseGatesPerWheel: 2,
      settlingDelaySeconds: 0,
      speedSensitivity: 0.18,
    },
  },
  {
    id: "reliquary-nocturne",
    title: "NOCTURNE RELIQUARY VAULT",
    artifact: "夜想の封印函",
    description: "黒鉄の祭具函と航海用儀器を保管する、鈍い青緑の錠前金庫。",
    wheelCount: 6,
    preload: { label: "DAMPED IRON", baseResistance: 0.72, flyStickiness: 0.64, edgeHardness: 0.76 },
    boltLayout: { label: "QUAD CROSSBAR", boltRatios: [0.12, 0.36, 0.64, 0.88], carrierSide: "left", handleResistance: 0.72 },
    personality: {
      id: "comparison",
      label: "COMPARISON CONTACT",
      description: "偽ゲートが正規ゲートに近い反応を返すため、候補を比べて判断する金庫。",
      contactContrast: 0.58,
      falseGateSimilarity: 0.82,
      toleranceExpansion: 0,
      falseGatesPerWheel: 3,
      settlingDelaySeconds: 0,
      speedSensitivity: 0.36,
    },
  },
  {
    id: "chronometer-pelagic",
    title: "PELAGIC CHRONOMETER VAULT",
    artifact: "深海の航海時計",
    description: "青い航海時計と銀鍵を収蔵する、真鍮と鋼の精密保管庫。",
    wheelCount: 6,
    preload: { label: "MARINE CHRONOMETER", baseResistance: 0.34, flyStickiness: 0.27, edgeHardness: 0.82 },
    boltLayout: { label: "OFFSET MARINE", boltRatios: [0.24, 0.43, 0.59, 0.76], carrierSide: "right", handleResistance: 0.3 },
    personality: {
      id: "timing",
      label: "TIMING RESPONSE",
      description: "回転速度と停止後のわずかな反応を観察して判断する精密金庫。",
      contactContrast: 0.7,
      falseGateSimilarity: 0.34,
      toleranceExpansion: 0,
      falseGatesPerWheel: 2,
      settlingDelaySeconds: 0.16,
      speedSensitivity: 0.82,
    },
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

const standardReward = (
  id: string,
  title: string,
  description: string,
  catalogNumber: string,
  material: string,
  provenance: string,
  observation: string,
  conditionLabel: string,
  unlockConditions: readonly RewardUnlockCondition[],
): RewardDefinition => ({
  id,
  title,
  description,
  rarity: "standard",
  conditionLabel,
  unlockConditions,
  catalogNumber,
  material,
  provenance,
  observation,
});

const rareReward = (
  id: string,
  title: string,
  description: string,
  catalogNumber: string,
  material: string,
  provenance: string,
  observation: string,
  conditionLabel: string,
  unlockConditions: readonly RewardUnlockCondition[],
): RewardDefinition => ({
  id,
  title,
  description,
  rarity: "rare",
  conditionLabel,
  unlockConditions,
  catalogNumber,
  material,
  provenance,
  observation,
});

const specialReward = (
  id: string,
  title: string,
  description: string,
  catalogNumber: string,
  material: string,
  provenance: string,
  observation: string,
  conditionLabel: string,
  unlockConditions: readonly RewardUnlockCondition[],
): RewardDefinition => ({
  id,
  title,
  description,
  rarity: "special",
  conditionLabel,
  unlockConditions,
  catalogNumber,
  material,
  provenance,
  observation,
});

export const DEFAULT_REWARD: RewardDefinition = standardReward(
  "aurora-cache",
  "AURORA CACHE",
  "金貨、宝石、刻印入りの懐中時計が収められた保管トレイ。",
  "VTL-AU-1903",
  "金、黄銅、赤紫のガーネット、黒漆",
  "北方の時計工房から、1911年に修復室へ移管された私設収蔵品。",
  "懐中時計の裏蓋には、6枚のホイールと同じ間隔で浅い刻印が残る。",
  "Auroraを開錠する",
  [{ type: "vault", vaultId: "museum-aurora" }],
);

export const REWARD_DEFINITIONS: readonly RewardDefinition[] = [
  DEFAULT_REWARD,
  standardReward(
    "nocturne-reliquary",
    "NOCTURNE RELIQUARY",
    "青緑の宝石、古い航海儀器、蝋封された文書を収めた黒鉄の函。",
    "VTL-NR-1876",
    "黒染め鋼、真鍮、緑柱石、蜜蝋",
    "夜間航海用の測量具として港湾観測所に保管され、廃止後に封印された。",
    "緑柱石の裏にある真鍮円盤は、ゲートの窓幅を測る簡易ゲージとして機能する。",
    "Nocturneを開錠する",
    [{ type: "vault", vaultId: "reliquary-nocturne" }],
  ),
  standardReward(
    "pelagic-chronometer",
    "PELAGIC CHRONOMETER",
    "サファイアの航海時計、銀鍵、封緘文書を備えた海洋保管物。",
    "VTL-PC-1928",
    "銀、青鋼、サファイアガラス、羊皮紙",
    "深海測量船の船長室から回収された航海時計一式。記録簿は未解読のまま保管されている。",
    "銀鍵の歯形はボルトの退避量を示す。時計の秒針とラッチ窓の周期にも一致が見られる。",
    "Pelagicを開錠する",
    [{ type: "vault", vaultId: "chronometer-pelagic" }],
  ),
  standardReward("aurora-needle", "AURORA NEEDLE", "修復室の測定針と、微細な目盛りを刻んだ真鍮ケース。", "VTL-AU-1904", "焼入れ鋼、真鍮、琥珀", "北方時計工房の修復台から発見された測定具。", "針先の傷はゲート縁を探った回数を記録している。", "AKERUN-01-V1を開錠する", [{ type: "problem", problemId: "AKERUN-01-V1" }]),
  standardReward("nocturne-brass-seal", "NOCTURNE BRASS SEAL", "夜間観測所の封印具と、候補位置を示す黒い円盤。", "VTL-NR-1877", "真鍮、黒鉄、蜜蝋", "夜間航海用の記録箱に取り付けられていた封印具。", "円盤の二重線は、似た偽ゲートを比較した跡である。", "AKERUN-02-V1を開錠する", [{ type: "problem", problemId: "AKERUN-02-V1" }]),
  standardReward("pelagic-tide-chart", "PELAGIC TIDE CHART", "深海測量の潮流図と、停止後の反応を記した薄い航海板。", "VTL-PC-1929", "青鋼、羊皮紙、銀粉", "深海測量船の航海長が残した補助記録。", "停止後の数秒を待つための短い目盛りが、縁に刻まれている。", "AKERUN-03-V1を開錠する", [{ type: "problem", problemId: "AKERUN-03-V1" }]),
  standardReward("aurora-ivory-dial", "AURORA IVORY DIAL", "白い目盛り板と、明るい反応を示す補助ダイヤル。", "VTL-AU-1905", "象牙色樹脂、黄銅、青銅", "修復訓練用の金庫から取り外された観察用ダイヤル。", "目盛りの間隔は、接触差を見分けるために広く設計されている。", "AKERUN-04-V1を開錠する", [{ type: "problem", problemId: "AKERUN-04-V1" }]),
  standardReward("nocturne-port-record", "NOCTURNE PORT RECORD", "港湾観測所の黒い記録板と、比較済みの接触候補表。", "VTL-NR-1878", "黒染め鋼、紙、緑青", "閉鎖された港湾観測所の保管記録。", "似た反応を並べ、単独の音だけで決めない規則が残されている。", "AKERUN-05-V1を開錠する", [{ type: "problem", problemId: "AKERUN-05-V1" }]),
  standardReward("pelagic-salt-compass", "PELAGIC SALT COMPASS", "塩の結晶が付着した小型コンパスと、海図用の銀針。", "VTL-PC-1930", "銀、青銅、ガラス、塩結晶", "海洋保管庫の航海用具として回収された。", "針の遅れは、回転速度を落として観察する必要を示す。", "AKERUN-06-V1を開錠する", [{ type: "problem", problemId: "AKERUN-06-V1" }]),
  standardReward("aurora-restorer-gloves", "AURORA RESTORER GLOVES", "接触痕を残さない修復用手袋と、小さな保管札。", "VTL-AU-1906", "革、絹、黄銅札", "博物館修復室の作業台に保管されていた。", "手袋の指先には、無駄な回転を減らすための目盛りが縫い込まれている。", "AKERUN-07-V1を開錠する", [{ type: "problem", problemId: "AKERUN-07-V1" }]),
  standardReward("nocturne-black-ink", "NOCTURNE BLACK INK", "候補比較の記録に使われた黒インクと、二重の記録帳。", "VTL-NR-1879", "煤、鉄塩、ガラス", "夜間航海記録の付属品として封印されていた。", "二つの似た接触を別々に記録するため、乾きの遅い配合になっている。", "AKERUN-08-V1を開錠する", [{ type: "problem", problemId: "AKERUN-08-V1" }]),
  standardReward("pelagic-diver-log", "PELAGIC DIVER LOG", "潜水士の観察記録と、停止後の反応を測る防水時計。", "VTL-PC-1931", "防水紙、銀、青鋼", "深海測量船の潜水記録に挟まれていた。", "止めた後に見るべき小さな変化が、時刻と一緒に記録されている。", "AKERUN-09-V1を開錠する", [{ type: "problem", problemId: "AKERUN-09-V1" }]),
  standardReward("aurora-gear-sketch", "AURORA GEAR SKETCH", "ホイールとフライの関係を描いた修復士の設計図。", "VTL-AU-1907", "紙、鉛筆、黄銅留め具", "博物館の機構資料室から移管された設計図。", "通過回数を先に決めてから操作する手順が、余白に書かれている。", "AKERUN-10-V1を開錠する", [{ type: "problem", problemId: "AKERUN-10-V1" }]),
  standardReward("nocturne-lantern-key", "NOCTURNE LANTERN KEY", "暗い保管室の鍵と、反応を書き留めた折り畳み札。", "VTL-NR-1880", "黒鉄、真鍮、油紙", "夜間観測所の照明器具と一緒に保管されていた。", "暗くても抵抗の変化を別の手掛かりで確かめる注意書きがある。", "AKERUN-11-V1を開錠する", [{ type: "problem", problemId: "AKERUN-11-V1" }]),
  standardReward("pelagic-sapphire-thread", "PELAGIC SAPPHIRE THREAD", "サファイア片を通した細い銀糸と、海図の束。", "VTL-PC-1932", "銀、サファイア、羊皮紙", "航海時計の修理用部材として収蔵された。", "反応の強弱を急いで決めず、止めた位置を再確認するための印がある。", "AKERUN-12-V1を開錠する", [{ type: "problem", problemId: "AKERUN-12-V1" }]),
  standardReward("aurora-clockmaker-mark", "AURORA CLOCKMAKER MARK", "時計職人の刻印板と、整列順を示す小さな札。", "VTL-AU-1908", "黄銅、銀、黒漆", "北方の時計工房から寄贈された職人道具。", "輪の順番と方向を混同しないよう、裏面に左右の印がある。", "AKERUN-13-V1を開錠する", [{ type: "problem", problemId: "AKERUN-13-V1" }]),
  standardReward("nocturne-cipher-case", "NOCTURNE CIPHER CASE", "比較結果を隠して保管する黒い暗号ケース。", "VTL-NR-1881", "黒鉄、緑柱石、革", "港湾観測所の記録保全箱として使われていた。", "正規ゲートらしさを一つの反応に頼らず、複数の証拠で確かめる。", "AKERUN-14-V1を開錠する", [{ type: "problem", problemId: "AKERUN-14-V1" }]),
  standardReward("pelagic-depth-needle", "PELAGIC DEPTH NEEDLE", "深度を測る青鋼の針と、海底地形の断片図。", "VTL-PC-1933", "青鋼、銀、羊皮紙", "深海測量器の調整部品として回収された。", "停止後の反応を待つ間に、針が示すわずかな揺れを読む。", "AKERUN-15-V1を開錠する", [{ type: "problem", problemId: "AKERUN-15-V1" }]),
  rareReward("rare-aurora-clean", "AURORA CLEAN ROOM SEAL", "無傷の修復室封印と、失敗のない開錠記録。", "VTL-AU-R01", "白金、黄銅、赤紫石", "修復室の最終検査で一度だけ使われた封印。", "一度も噛み込ませずに開けた記録が、封印の裏に残る。", "Auroraを失敗0で開錠する", [{ type: "vault", vaultId: "museum-aurora" }, { type: "faults-at-most", count: 0 }]),
  rareReward("rare-nocturne-clean", "NOCTURNE CLEAN ROOM SEAL", "比較判断を誤らずに開けた夜間保管室の封印。", "VTL-NR-R01", "黒銀、緑柱石、蜜蝋", "夜間観測所の責任者が保管していた最終封印。", "似た候補を比べたうえで失敗0を達成した印がある。", "Nocturneを失敗0で開錠する", [{ type: "vault", vaultId: "reliquary-nocturne" }, { type: "faults-at-most", count: 0 }]),
  rareReward("rare-pelagic-clean", "PELAGIC CLEAN ROOM SEAL", "停止後の反応を乱さずに開けた海洋保管庫の封印。", "VTL-PC-R01", "銀、青鋼、サファイア", "深海測量船の船長室に保管されていた最終封印。", "止めて待つ判断を守り、失敗0で開けた記録が刻まれている。", "Pelagicを失敗0で開錠する", [{ type: "vault", vaultId: "chronometer-pelagic" }, { type: "faults-at-most", count: 0 }]),
  rareReward("rare-aurora-par-dial", "AURORA CALIBRATION CARD", "基準回転数以内で開けたことを示す較正カード。", "VTL-AU-R02", "黄銅、紙、ガーネット粉", "博物館の較正棚で保管されていた検査カード。", "余分な回転を減らした結果だけが、カードの欄へ記録される。", "Auroraを基準回転数以内で開錠する", [{ type: "vault", vaultId: "museum-aurora" }, { type: "excess-dial-at-most", steps: 0 }]),
  rareReward("rare-nocturne-par-dial", "NOCTURNE CALIBRATION CARD", "比較を続けながら基準回転数に収めた較正カード。", "VTL-NR-R02", "黒鉄、紙、緑青", "港湾観測所の試験台で使われていた検査カード。", "候補を増やしすぎず、必要な回転だけで決めた記録がある。", "Nocturneを基準回転数以内で開錠する", [{ type: "vault", vaultId: "reliquary-nocturne" }, { type: "excess-dial-at-most", steps: 0 }]),
  rareReward("rare-pelagic-par-dial", "PELAGIC CALIBRATION CARD", "停止後の観察を含めて基準回転数に収めた較正カード。", "VTL-PC-R02", "銀、青鋼、羊皮紙", "深海測量器の調整台で使われていた検査カード。", "急回転で見逃さず、必要な移動だけで開けた記録がある。", "Pelagicを基準回転数以内で開錠する", [{ type: "vault", vaultId: "chronometer-pelagic" }, { type: "excess-dial-at-most", steps: 0 }]),
  rareReward("rare-observer-lens", "OBSERVER LENS", "接触反応を正確に読み取った観察者のレンズ。", "VTL-OBS-R01", "光学ガラス、真鍮、黒革", "機構観察室の備品から選別された記録品。", "偽ゲート接触と失敗を抑えた観察精度が、レンズの縁に刻まれる。", "観察精度92%以上で開錠する", [{ type: "accuracy-at-least", percent: 92 }]),
  rareReward("rare-precision-rule", "PRECISION RULE", "余分な回転と誤接触を抑えた精密測定尺。", "VTL-OBS-R02", "鋼、黄銅、黒漆", "金庫研究室の検査器具として残された。", "短い移動と高い観察精度を同時に満たしたときだけ記録が現れる。", "余分な回転40以下かつ観察精度88%以上で開錠する", [{ type: "excess-dial-at-most", steps: 40 }, { type: "accuracy-at-least", percent: 88 }]),
  rareReward("rare-score-ledger", "HIGH SCORE LEDGER", "基準を越えた結果だけを書き留める高得点台帳。", "VTL-OBS-R03", "革、銀箔、青インク", "実験場の成績保管棚から発見された記録帳。", "時間、回転、失敗をすべて整えた結果にだけ、次の欄が開く。", "スコア10000以上で開錠する", [{ type: "score-at-least", score: 10000 }]),
  specialReward("special-aurora-master", "AURORA MASTER KEY", "修復室の最終保管庫へ通じる、光を返す特別な鍵。", "VTL-AU-S01", "白金、黄銅、ガーネット", "AURORAの最終検査に合格した者へ一度だけ渡された。", "高度な問題を失敗なく、正確に読み切った記録が鍵の柄に残る。", "AKERUN-16-V1を失敗0・観察精度92%以上で開錠する", [{ type: "problem", problemId: "AKERUN-16-V1" }, { type: "faults-at-most", count: 0 }, { type: "accuracy-at-least", percent: 92 }]),
  specialReward("special-nocturne-master", "NOCTURNE MASTER SEAL", "夜間観測所の最奥を封じていた、黒い特別封印。", "VTL-NR-S01", "黒銀、緑柱石、蜜蝋", "最終航海記録を守るために作られた特別保管品。", "似た偽ゲートを比較しながら高い成績を残した記録が封印面に刻まれる。", "AKERUN-20-V1を失敗1以下・スコア10000以上で開錠する", [{ type: "problem", problemId: "AKERUN-20-V1" }, { type: "faults-at-most", count: 1 }, { type: "score-at-least", score: 10000 }]),
  specialReward("special-pelagic-master", "PELAGIC MASTER CHRONOMETER", "停止後の反応を完全に読み切った、特別な航海時計。", "VTL-PC-S01", "銀、青鋼、サファイア", "深海測量船の最終航海で使われた特別保管品。", "余分な回転を抑え、ほぼ誤りなく停止後の反応を読んだ記録が秒針に残る。", "AKERUN-18-V1を余分な回転0・観察精度96%以上で開錠する", [{ type: "problem", problemId: "AKERUN-18-V1" }, { type: "excess-dial-at-most", steps: 0 }, { type: "accuracy-at-least", percent: 96 }]),
];

export type RewardRunMetrics = {
  readonly problemId: string;
  readonly faultCount: number;
  readonly excessDialSteps: number;
  readonly observationAccuracy: number;
  readonly score: number;
};

export const isRewardUnlockedByRun = (
  reward: RewardDefinition,
  puzzle: PuzzleDefinition,
  result: RewardRunMetrics,
) => reward.unlockConditions.every((condition) => {
  if (condition.type === "vault") return puzzle.vault.id === condition.vaultId;
  if (condition.type === "problem") return result.problemId === condition.problemId;
  if (condition.type === "faults-at-most") return result.faultCount <= condition.count;
  if (condition.type === "excess-dial-at-most") return result.excessDialSteps <= condition.steps;
  if (condition.type === "accuracy-at-least") return result.observationAccuracy >= condition.percent;
  return result.score >= condition.score;
});

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

export const createFalseGates = (
  targets: readonly number[],
  personality?: Pick<VaultPersonality, "falseGatesPerWheel">,
): readonly FalseGateDefinition[] => {
  const offsets = [[7, -9, 16], [-8, 10, -14], [9, -7, 15]] as const;
  const depths = [0.28, 0.42, 0.36] as const;
  const gatesPerWheel = personality?.falseGatesPerWheel ?? 2;
  return targets.flatMap((target, index) => {
    const pair = offsets[index % offsets.length];
    const wheel = targets.length - index - 1;
    return pair.slice(0, gatesPerWheel).map((offset, gateIndex) => ({
      wheel,
      position: normalize(target + offset),
      depth: depths[gateIndex],
    }));
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
    falseGates: createFalseGates(stages.map((stage) => stage.target), VAULT_DEFINITIONS[0].personality),
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

const expandBand = (
  band: readonly [number, number],
  expansion: number,
): readonly [number, number] => [
  Math.max(0, band[0] - expansion),
  Math.min(1, band[1] + expansion),
];

const officialDifficulty = (
  tier: ProblemTier,
  personality: VaultPersonality,
): DifficultyProfile => {
  if (tier === "beginner") {
    return {
      ...DIFFICULTY_PROFILES.standard,
      tensionBand: expandBand([0.59, 0.79], personality.toleranceExpansion),
      fenceBand: expandBand([0.6, 0.76], personality.toleranceExpansion),
      tensionHoldSeconds: 0.18,
      fenceHoldSeconds: 0.28,
      maxFaults: 7,
    };
  }
  if (tier === "advanced") {
    return {
      ...DIFFICULTY_PROFILES.standard,
      tensionBand: expandBand([0.65, 0.73], personality.toleranceExpansion),
      fenceBand: expandBand([0.645, 0.715], personality.toleranceExpansion),
      tensionHoldSeconds: 0.24,
      fenceHoldSeconds: 0.28,
      maxFaults: 4,
    };
  }
  return {
    ...DIFFICULTY_PROFILES.standard,
    tensionBand: expandBand(DIFFICULTY_PROFILES.standard.tensionBand, personality.toleranceExpansion),
    fenceBand: expandBand(DIFFICULTY_PROFILES.standard.fenceBand, personality.toleranceExpansion),
  };
};

export const OFFICIAL_PROBLEM_CATALOG: readonly OfficialProblemDefinition[] = [
  { problemId: "AKERUN-01-V1", problemVersion: "V1", seed: 40101, tier: "beginner", vaultId: "museum-aurora", wheelCount: 4, startDirection: "ccw", targets: [18, 61, 35, 82], parTime: 31, parDialSteps: 1198, parFaults: 0, parFalseGateContacts: 24, difficultyWeight: 0.96 },
  { problemId: "AKERUN-02-V1", problemVersion: "V1", seed: 40102, tier: "beginner", vaultId: "reliquary-nocturne", wheelCount: 4, startDirection: "cw", targets: [72, 24, 57, 9], parTime: 34, parDialSteps: 1201, parFaults: 0, parFalseGateContacts: 35, difficultyWeight: 0.98 },
  { problemId: "AKERUN-03-V1", problemVersion: "V1", seed: 40103, tier: "beginner", vaultId: "chronometer-pelagic", wheelCount: 5, startDirection: "ccw", targets: [43, 8, 69, 27, 84], parTime: 40, parDialSteps: 1762, parFaults: 0, parFalseGateContacts: 35, difficultyWeight: 1.0 },
  { problemId: "AKERUN-04-V1", problemVersion: "V1", seed: 40104, tier: "beginner", vaultId: "museum-aurora", wheelCount: 5, startDirection: "cw", targets: [12, 66, 31, 88, 49], parTime: 42, parDialSteps: 1727, parFaults: 0, parFalseGateContacts: 35, difficultyWeight: 1.01 },
  { problemId: "AKERUN-05-V1", problemVersion: "V1", seed: 40105, tier: "beginner", vaultId: "reliquary-nocturne", wheelCount: 6, startDirection: "ccw", targets: [81, 39, 5, 63, 24, 92], parTime: 49, parDialSteps: 2376, parFaults: 0, parFalseGateContacts: 72, difficultyWeight: 1.03 },
  { problemId: "AKERUN-06-V1", problemVersion: "V1", seed: 40106, tier: "standard", vaultId: "chronometer-pelagic", wheelCount: 4, startDirection: "cw", targets: [26, 74, 11, 58], parTime: 36, parDialSteps: 1168, parFaults: 1, parFalseGateContacts: 24, difficultyWeight: 1.01 },
  { problemId: "AKERUN-07-V1", problemVersion: "V1", seed: 40107, tier: "standard", vaultId: "museum-aurora", wheelCount: 5, startDirection: "ccw", targets: [64, 17, 86, 42, 7], parTime: 43, parDialSteps: 1711, parFaults: 1, parFalseGateContacts: 35, difficultyWeight: 1.02 },
  { problemId: "AKERUN-08-V1", problemVersion: "V1", seed: 40108, tier: "standard", vaultId: "reliquary-nocturne", wheelCount: 6, startDirection: "cw", targets: [9, 51, 78, 22, 67, 34], parTime: 51, parDialSteps: 2328, parFaults: 1, parFalseGateContacts: 71, difficultyWeight: 1.04 },
  { problemId: "AKERUN-09-V1", problemVersion: "V1", seed: 40109, tier: "standard", vaultId: "chronometer-pelagic", wheelCount: 5, startDirection: "ccw", targets: [38, 95, 16, 57, 73], parTime: 46, parDialSteps: 1823, parFaults: 1, parFalseGateContacts: 35, difficultyWeight: 1.05 },
  { problemId: "AKERUN-10-V1", problemVersion: "V1", seed: 40110, tier: "standard", vaultId: "museum-aurora", wheelCount: 6, startDirection: "cw", targets: [47, 14, 82, 29, 61, 6], parTime: 53, parDialSteps: 2388, parFaults: 1, parFalseGateContacts: 48, difficultyWeight: 1.06 },
  { problemId: "AKERUN-11-V1", problemVersion: "V1", seed: 40111, tier: "standard", vaultId: "reliquary-nocturne", wheelCount: 4, startDirection: "ccw", targets: [57, 3, 79, 34], parTime: 38, parDialSteps: 1168, parFaults: 1, parFalseGateContacts: 37, difficultyWeight: 1.03 },
  { problemId: "AKERUN-12-V1", problemVersion: "V1", seed: 40112, tier: "standard", vaultId: "chronometer-pelagic", wheelCount: 6, startDirection: "cw", targets: [23, 69, 44, 8, 91, 52], parTime: 54, parDialSteps: 2410, parFaults: 1, parFalseGateContacts: 48, difficultyWeight: 1.07 },
  { problemId: "AKERUN-13-V1", problemVersion: "V1", seed: 40113, tier: "standard", vaultId: "museum-aurora", wheelCount: 5, startDirection: "ccw", targets: [86, 32, 12, 64, 48], parTime: 47, parDialSteps: 1648, parFaults: 1, parFalseGateContacts: 35, difficultyWeight: 1.06 },
  { problemId: "AKERUN-14-V1", problemVersion: "V1", seed: 40114, tier: "standard", vaultId: "reliquary-nocturne", wheelCount: 6, startDirection: "cw", targets: [35, 88, 19, 62, 4, 76], parTime: 55, parDialSteps: 2340, parFaults: 1, parFalseGateContacts: 72, difficultyWeight: 1.08 },
  { problemId: "AKERUN-15-V1", problemVersion: "V1", seed: 40115, tier: "standard", vaultId: "chronometer-pelagic", wheelCount: 5, startDirection: "ccw", targets: [7, 54, 83, 26, 68], parTime: 48, parDialSteps: 1812, parFaults: 1, parFalseGateContacts: 36, difficultyWeight: 1.05 },
  { problemId: "AKERUN-16-V1", problemVersion: "V1", seed: 40116, tier: "advanced", vaultId: "museum-aurora", wheelCount: 6, startDirection: "cw", targets: [59, 13, 71, 36, 94, 22], parTime: 58, parDialSteps: 2428, parFaults: 2, parFalseGateContacts: 48, difficultyWeight: 1.09 },
  { problemId: "AKERUN-17-V1", problemVersion: "V1", seed: 40117, tier: "advanced", vaultId: "reliquary-nocturne", wheelCount: 5, startDirection: "ccw", targets: [44, 2, 73, 18, 91], parTime: 51, parDialSteps: 1715, parFaults: 2, parFalseGateContacts: 53, difficultyWeight: 1.1 },
  { problemId: "AKERUN-18-V1", problemVersion: "V1", seed: 40118, tier: "advanced", vaultId: "chronometer-pelagic", wheelCount: 6, startDirection: "cw", targets: [15, 67, 39, 82, 28, 54], parTime: 60, parDialSteps: 2412, parFaults: 2, parFalseGateContacts: 48, difficultyWeight: 1.11 },
  { problemId: "AKERUN-19-V1", problemVersion: "V1", seed: 40119, tier: "advanced", vaultId: "museum-aurora", wheelCount: 5, startDirection: "ccw", targets: [75, 21, 49, 93, 11], parTime: 53, parDialSteps: 1769, parFaults: 2, parFalseGateContacts: 35, difficultyWeight: 1.12 },
  { problemId: "AKERUN-20-V1", problemVersion: "V1", seed: 40120, tier: "advanced", vaultId: "reliquary-nocturne", wheelCount: 6, startDirection: "cw", targets: [6, 58, 31, 86, 17, 72], parTime: 62, parDialSteps: 2348, parFaults: 2, parFalseGateContacts: 71, difficultyWeight: 1.14 },
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
    difficulty: officialDifficulty(problem.tier, vault.personality),
    stages,
    falseGates: createFalseGates(problem.targets, vault.personality),
    reward: REWARD_DEFINITIONS[VAULT_DEFINITIONS.findIndex((item) => item.id === problem.vaultId)] ?? DEFAULT_REWARD,
    problemId: problem.problemId,
    problemVersion: problem.problemVersion,
    parTime: problem.parTime,
    parDialSteps: problem.parDialSteps,
    parFaults: problem.parFaults,
    parFalseGateContacts: problem.parFalseGateContacts,
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
    falseGates: createFalseGates(targets, VAULT_DEFINITIONS[0].personality),
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
    falseGates: createFalseGates(selected, vault.personality),
    reward: REWARD_DEFINITIONS[variantIndex],
  };
};
