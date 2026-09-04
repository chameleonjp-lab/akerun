/**
 * Vault Tumbler Lab — 真鍮の機械製図室。
 * 実機風の鋼板・切削真鍮・ロック機構アセットを用い、重い金庫扉の開錠演出まで同一キャンバスへ描画する。
 */
import {
  createFalseGateTrainingPuzzle,
  createPuzzleFromSeed,
  createReferencePuzzle,
  DIFFICULTY_PROFILES,
  REWARD_DEFINITIONS,
  type DifficultyId,
  type PuzzleDefinition,
  type RewardDefinition,
  type TurnDirection,
} from "./GameDefinitions";
import { LockMechanism } from "./LockMechanism";
import {
  AUDIO_SAMPLE_DEFINITIONS,
  AudioFeedback,
  type AudioSampleId,
} from "./AudioFeedback";
import { HapticFeedback } from "./HapticFeedback";
import { ArchiveLedger } from "./ArchiveLedger";
import {
  ObservationLedger,
  type ObservationCategory,
} from "./ObservationLedger";
import {
  MAX_RUN_TIME_SECONDS,
  RunSession,
  type RunCheckpoint,
  type RunResult,
} from "./RunSession";
import {
  InputController,
  type InputPoint,
  type PhysicalInput,
  type PhysicalInputStartResult,
} from "./InputController";
import {
  canResetMechanism,
  isOfficialProblemIdentity,
  shouldForfeitOfficialReset,
} from "./RunLifecycle";
import {
  expandHitbox,
  getCanvasResolution as calculateCanvasResolution,
  type CanvasResolution,
} from "./CanvasSurface";

const ASSET_BASE_URL = import.meta.env.BASE_URL;
const ASSETS = {
  // 静止している金属面と内部断面の下地はローカルWebP、可動部と状態表示はCanvasで重ねる。
  realDoor: `${ASSET_BASE_URL}assets/vault-door.webp`,
  realDial: `${ASSET_BASE_URL}assets/vault-dial.webp`,
  realLock: `${ASSET_BASE_URL}assets/lock-cutaway.webp`,
} as const;

const DEMO_DIAL_INTERVAL_SECONDS = 0.045;
const DEMO_ACTION_INTERVAL_SECONDS = 0.08;

export type Rect = { x: number; y: number; width: number; height: number };

/**
 * 画像の縦横比を維持したまま、指定矩形の内側へ収める描画領域を返す。
 * 写真素材を機構パネルへ敷くときも、引き伸ばしや角のはみ出しを起こさない。
 */
export const getContainedImageRect = (
  imageWidth: number,
  imageHeight: number,
  target: Rect,
  padding = 0
): Rect | null => {
  if (
    ![
      imageWidth,
      imageHeight,
      target.x,
      target.y,
      target.width,
      target.height,
    ].every(Number.isFinite)
  )
    return null;
  if (
    imageWidth <= 0 ||
    imageHeight <= 0 ||
    target.width <= 0 ||
    target.height <= 0
  )
    return null;
  const safePadding = Number.isFinite(padding) ? Math.max(0, padding) : 0;
  const availableWidth = target.width - safePadding * 2;
  const availableHeight = target.height - safePadding * 2;
  if (availableWidth <= 0 || availableHeight <= 0) return null;
  const scale = Math.min(
    availableWidth / imageWidth,
    availableHeight / imageHeight
  );
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    x: target.x + safePadding + (availableWidth - width) / 2,
    y: target.y + safePadding + (availableHeight - height) / 2,
    width,
    height,
  };
};

/** デモ操作の時間積算を、フレームレートに依存しない回数へ変換する。 */
export const getDemoTurnCount = (
  elapsed: number,
  interval = DEMO_DIAL_INTERVAL_SECONDS,
  maxTurns = 12
) => {
  if (
    !Number.isFinite(elapsed) ||
    elapsed <= 0 ||
    !Number.isFinite(interval) ||
    interval <= 0 ||
    !Number.isFinite(maxTurns) ||
    maxTurns <= 0
  ) {
    return 0;
  }
  return Math.min(Math.floor(maxTurns), Math.floor(elapsed / interval));
};

export type GameSnapshot = {
  readonly status: "idle" | "active" | "paused" | "opened" | "retired";
  readonly canvasOverlay: "none" | "archive" | "notes" | "inspection";
  readonly problemId: string;
  readonly problemVersion: string;
  readonly vaultTitle: string;
  readonly rewardTitle: string;
  readonly phase: string;
  readonly message: string;
  readonly elapsedTime: number;
  readonly faultCount: number;
  readonly totalDialSteps: number;
  readonly excessDialSteps: number;
  readonly falseGateContacts: number;
  readonly avoidableFalseGateContacts: number;
  readonly observationAccuracy: number;
  readonly score: number;
  readonly opened: boolean;
  readonly wheelCount: number;
  readonly activeWheel: number | null;
  readonly stage: number;
  readonly stageCount: number;
  readonly difficulty: string;
  readonly soundMuted: boolean;
  readonly hapticsEnabled: boolean;
  readonly hapticsSupported: boolean;
  readonly newlyUnlockedRewards: readonly string[];
  readonly runResult: RunResult | null;
  /** 公式問題として保存・ランキング送信してよい結果か。 */
  readonly recordable: boolean;
};
export type ScreenLayout = {
  width: number;
  height: number;
  compact: boolean;
  dial: { x: number; y: number; radius: number; deadZoneRadius: number };
  internal: Rect;
  /** 縦長画面で、ダイヤルと内部機構の因果を残すための要約表示。 */
  compactMechanism: Rect | null;
  footerY: number;
};

export const COMPACT_WORKBENCH_ONLY_MAX_HEIGHT = 550;

const INSPECTION_STEPS = [
  {
    label: "錠ケースカバー / CASE COVER",
    detail:
      "取り外し可能なケースカバーが、ホイールパックとレバー機構を保護します。観察では保安部材として扱い、解除操作の対象にはしません。",
  },
  {
    label: "駆動軸 / SPINDLE & TUBE",
    detail:
      "ダイヤルの回転はスピンドルと位置決め管を通り、最初のドライブカムへ渡されます。",
  },
  {
    label: "支持枠 / BRIDGE & WHEEL POST",
    detail:
      "ブリッジアセンブリとホイールポストが、問題ごとのホイールパックを同軸上に保ちます。",
  },
  {
    label: "変更式ホイール / KEY-CHANGE WHEEL",
    detail:
      "変更式ホイールの内輪とハブは、整備時の再設定に関わる部分です。通常の開錠手順には持ち込みません。",
  },
  {
    label: "接触部 / FENCE & LEVER NOSE",
    detail:
      "フェンスとレバーノーズがカムの接触点を読み、全ゲートが整った時だけ落ち込みます。",
  },
  {
    label: "錠ボルト / LOCK BOLT",
    detail:
      "錠ボルトが後退して初めて、扉内のキャリーバーと複数の扉側ボルトをハンドルで動かせます。",
  },
  {
    label: "二次拘束 / RELOCKER",
    detail:
      "リロッカーは異常時にボルトワークを二次的に拘束する保安機構です。このゲームでは安全な観察対象として表示します。",
  },
  {
    label: "保安カラー / ANTI-PUNCH COLLAR",
    detail:
      "アンチパンチカラーはスピンドル周辺を補強する保安部材です。解除対象ではなく、金庫の保護設計として記録します。",
  },
] as const;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const easeOut = (value: number) => 1 - (1 - value) * (1 - value);
const JAPANESE_FONT_STACK =
  '"Noto Sans JP", "Hiragino Sans", "Hiragino Kaku Gothic ProN", -apple-system, BlinkMacSystemFont, "Yu Gothic", sans-serif';

const canvasUnit = (width: number, height: number, compact: boolean) =>
  compact
    ? Math.max(14, Math.min(width, height) / 52)
    : Math.max(10, Math.min(width, height) / 85);

/**
 * 操作面の座標を一か所で決める。描画と入力が同じ値を参照し、
 * 縦長端末でもダイヤル・メッセージ・物理操作盤が重ならないようにする。
 */
export const calculateScreenLayout = (
  width: number,
  height: number,
  trainingContract: boolean
): ScreenLayout => {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 1;
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 1;
  const compact = safeWidth / safeHeight < 1.12;
  if (compact) {
    const unit = canvasUnit(safeWidth, safeHeight, compact);
    const bottomReserve = trainingContract
      ? Math.min(300, Math.max(230, safeHeight * 0.33))
      : Math.min(175, Math.max(120, safeHeight * 0.18));
    const contentHeight = Math.max(unit * 30, safeHeight - bottomReserve);
    const radius = trainingContract
      ? Math.min(safeWidth * 0.27, contentHeight * 0.17)
      : Math.min(safeWidth * 0.255, contentHeight * 0.15);
    // React HUDと写真面が重ならない上端を確保しつつ、旧実装の
    // unit*18依存を外して、端末の高さに対して安定した位置にする。
    const dialY = Math.max(
      unit * 4.5 + radius * 1.12,
      // iPhoneのsafe-area上端でReact HUDが下がっても、機構ストリップを
      // HUDへ食い込ませないため、十分な縦長画面ではダイヤルを少し下げる。
      safeHeight * 0.34,
      unit * 8 + radius * 1.12
    );
    const dialTop = dialY - radius * 1.12;
    const compactMechanismHeight = unit * 2.15;
    const compactMechanismY = Math.max(
      unit * 10.0,
      dialTop - compactMechanismHeight - unit * 0.25
    );
    const compactMechanism =
      compactMechanismY + compactMechanismHeight <= dialTop - unit * 0.12
        ? {
            x: unit * 1.1,
            y: compactMechanismY,
            width: safeWidth - unit * 2.2,
            height: compactMechanismHeight,
          }
        : null;
    const controlBottom = dialY + radius * 1.42 + unit * 2.35;
    const footerY = Math.max(
      trainingContract ? safeHeight * 0.49 : safeHeight * 0.5,
      controlBottom + unit * 0.7
    );
    const internalY = dialY + radius * 1.55;
    const internalHeight = Math.min(
      156,
      Math.max(unit * 11.5, contentHeight * 0.21)
    );

    return {
      width: safeWidth,
      height: safeHeight,
      compact,
      dial: {
        x: safeWidth * 0.5,
        y: dialY,
        radius,
        deadZoneRadius: radius * 0.42,
      },
      internal: {
        x: safeWidth * 0.05,
        y: internalY,
        width: safeWidth * 0.9,
        height: internalHeight,
      },
      compactMechanism,
      footerY,
    };
  }
  return {
    width: safeWidth,
    height: safeHeight,
    compact,
    dial: (() => {
      const radius = Math.min(safeWidth * 0.235, safeHeight * 0.293);
      return {
        x: safeWidth * 0.295,
        y: safeHeight * 0.545,
        radius,
        deadZoneRadius: radius * 0.42,
      };
    })(),
    internal: {
      x: safeWidth * 0.61,
      y: safeHeight * 0.18,
      width: safeWidth * 0.345,
      height: safeHeight * 0.63,
    },
    compactMechanism: null,
    footerY: safeHeight * 0.855,
  };
};

export class VaultWorld {
  private context: CanvasRenderingContext2D;
  private mechanism: LockMechanism;
  private readonly audio = new AudioFeedback();
  private readonly haptics = new HapticFeedback();
  private readonly images: Record<string, HTMLImageElement> = {};
  private readonly hitboxes = new Map<string, Rect>();
  private inputController: InputController;
  private keyboardFocus: "dial" | "tension" | "fence" | "bolt" | "handle" =
    "dial";
  private lastPhysicalPhase = "dial";
  private demoElapsed = 0;
  private demoMode = new URLSearchParams(window.location.search).has("demo");
  private readonly demoSpeed = new URLSearchParams(window.location.search).has(
    "fast"
  )
    ? 18
    : 1;
  private openingProgress = 0;
  private lastRotationAt = 0;
  private smoothedRotationSpeed = 0;
  private lastDimensions = { width: 0, height: 0, pixelRatio: 0 };
  private tutorialVisible = true;
  private difficulty: DifficultyId = "standard";
  private puzzleSeed = 7201855;
  private developmentSeed = false;
  private runElapsed = 0;
  private runStarted = false;
  private sessionActive = false;
  private sessionPaused = false;
  private retired = false;
  private runSession: RunSession | null = null;
  private lastSnapshotAt = 0;
  private resultSummary: {
    elapsed: number;
    faults: number;
    seed: number;
    reward: string;
  } | null = null;
  private highContrast = false;
  private reducedMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  private preciseInput = false;
  private blindAssist = false;
  private blindSignal:
    | "IDLE"
    | "EDGE"
    | "PICKUP"
    | "LATCH"
    | "TENSION"
    | "SEAT"
    | "JAM"
    | null = null;
  private blindSignalUntil = 0;
  private telemetry = {
    contracts: 0,
    completions: 0,
    resets: 0,
    faults: 0,
    lastElapsed: 0,
  };
  private readonly archive = new ArchiveLedger();
  private newlyUnlockedRewards: readonly RewardDefinition[] = [];
  private archiveOpen = false;
  private readonly observations = new ObservationLedger();
  private notesOpen = false;
  private inspectionOpen = false;
  private inspectionStep = 0;
  private trainingContract = false;
  private lastRunRecordable = false;
  private runRecordableOverride: boolean | null = null;
  private progressionEligible = true;

  constructor(
    context: CanvasRenderingContext2D,
    private readonly canvas: HTMLCanvasElement,
    private readonly onStatusChange?: (status: string) => void,
    private readonly onSnapshotChange?: (snapshot: GameSnapshot) => void
  ) {
    this.context = context;
    const params = new URLSearchParams(window.location.search);
    const requestedDifficulty = params.get("difficulty");
    if (
      requestedDifficulty === "observe" ||
      requestedDifficulty === "standard" ||
      requestedDifficulty === "expert" ||
      requestedDifficulty === "blind"
    )
      this.difficulty = requestedDifficulty;
    this.archiveOpen = params.has("archive");
    this.notesOpen = params.has("notes");
    this.inspectionOpen = params.has("inspect");
    this.trainingContract = params.get("training") === "false-gate";
    const requestedSeed = Number(params.get("seed"));
    if (Number.isFinite(requestedSeed) && requestedSeed > 0) {
      this.puzzleSeed = Math.floor(requestedSeed);
      this.developmentSeed = true;
    }
    this.mechanism = this.trainingContract
      ? new LockMechanism(createFalseGateTrainingPuzzle())
      : params.has("seed")
        ? new LockMechanism(
            createPuzzleFromSeed(this.puzzleSeed, this.difficulty)
          )
        : new LockMechanism(createReferencePuzzle(this.difficulty));
    if (this.trainingContract)
      this.mechanism.lastMessage =
        "訓練契約：浅い偽ゲートと深い正規ゲートの、音・反発・接触深さを比べてください。";
    if (this.demoMode || params.has("seed") || this.trainingContract) {
      this.sessionActive = true;
      this.runStarted = true;
      this.runSession = new RunSession(this.mechanism.puzzle);
    }
    this.haptics.setReducedMotion(this.reducedMotion);
    this.restoreTelemetry();
    Object.entries(ASSETS).forEach(([key, url]) => this.loadImage(key, url));
    this.inputController = new InputController({
      canvas: this.canvas,
      windowTarget: window,
      getSurfaceSize: () => this.getCanvasResolution(),
      getDialLayout: () => this.getLayout().dial,
      getHitboxes: () => this.hitboxes,
      isBlindMode: () => this.isBlindMode,
      isInputEnabled: () =>
        (this.sessionActive || this.demoMode) &&
        !this.sessionPaused &&
        !this.mechanism.opened,
      onGesture: () => {
        this.audio.enableFromGesture();
        this.haptics.enableFromGesture();
      },
      onAction: action => this.handleAction(action),
      onRotateDial: steps => this.rotateDial(steps),
      onBeginPhysicalInput: action => this.beginPhysicalInput(action),
      onUpdatePhysicalInput: (input, start, point) =>
        this.updatePhysicalInput(input, start, point),
      onEndPhysicalInput: input => this.endPhysicalInput(input),
      onKeyDown: event => this.handleKeyDown(event),
      onKeyUp: event => this.handleKeyUp(event),
    });
    this.draw();
  }

  update(delta: number) {
    if (this.sessionPaused) {
      this.draw();
      this.emitSnapshot();
      return;
    }
    const visualDelta = Number.isFinite(delta) && delta > 0 ? delta : 0;
    const gameDelta = this.demoMode
      ? visualDelta * this.demoSpeed
      : visualDelta;
    const safeDelta =
      Number.isFinite(gameDelta) && gameDelta > 0 ? gameDelta : 0;
    // The timer and the deterministic mechanism now advance over the same interval.
    // This keeps the server replay aligned with the browser at frame boundaries.
    if (this.sessionActive && !this.mechanism.opened) {
      const trackedDelta = Math.min(
        safeDelta,
        Math.max(0, MAX_RUN_TIME_SECONDS - this.runElapsed)
      );
      this.runElapsed = Math.min(
        MAX_RUN_TIME_SECONDS,
        this.runElapsed + trackedDelta
      );
      this.runSession?.advance(trackedDelta);
    }
    const previousFaults = this.mechanism.faultCount;
    const wasOpened = this.mechanism.opened;
    let remainingDelta = safeDelta;
    while (remainingDelta > 0 && !this.mechanism.opened) {
      const step = Math.min(0.25, remainingDelta);
      this.mechanism.tick(step);
      remainingDelta -= step;
    }
    if (this.demoMode) this.advanceDemo(safeDelta);
    // Faults are raised by LockMechanism.tick(), not by rotate(). Transfer
    // them at the same frame so the HUD, checkpoint, result and telemetry all
    // observe the same count as the deterministic mechanism.
    if (this.mechanism.faultCount > previousFaults) {
      // syncPhysicalFeedback() announces a newly jammed phase itself. Avoid
      // playing the fault cue twice, while still announcing a lockout fault.
      this.registerFaultTelemetry(
        previousFaults,
        this.mechanism.phase !== "jammed"
      );
    }
    if (!wasOpened && this.mechanism.opened) this.completeUnlock();
    this.syncPhysicalFeedback();
    const targetOpening = this.mechanism.opened ? 1 : 0;
    this.openingProgress = this.reducedMotion
      ? targetOpening
      : this.openingProgress +
        (targetOpening - this.openingProgress) * Math.min(1, visualDelta * 1.3);
    this.draw();
    this.emitSnapshot();
  }

  startPuzzle(
    puzzle: PuzzleDefinition,
    options?: {
      training?: boolean;
      postDial?: boolean;
      resume?: RunCheckpoint;
      recordable?: boolean;
      persistProgress?: boolean;
    }
  ) {
    this.releasePhysicalInput();
    this.demoMode = false;
    this.mechanism = new LockMechanism(puzzle);
    this.trainingContract = Boolean(options?.training);
    this.runRecordableOverride =
      typeof options?.recordable === "boolean" ? options.recordable : null;
    this.progressionEligible = options?.persistProgress !== false;
    this.sessionActive = true;
    this.sessionPaused = false;
    this.retired = false;
    this.runStarted = true;
    this.runElapsed = 0;
    this.runSession = new RunSession(puzzle);
    this.developmentSeed = false;
    this.lastRunRecordable = false;
    this.newlyUnlockedRewards = [];
    this.resultSummary = null;
    this.openingProgress = 0;
    this.lastPhysicalPhase = this.mechanism.phase;
    this.tutorialVisible = true;
    this.archiveOpen = false;
    this.notesOpen = false;
    this.inspectionOpen = false;
    this.blindAssist = false;
    this.blindSignal = null;
    this.lastRotationAt = 0;
    this.smoothedRotationSpeed = 0;
    if (options?.postDial) this.mechanism.preparePostDialTraining();
    const checkpoint = options?.resume;
    const resumed =
      !options?.training &&
      checkpoint !== undefined &&
      checkpoint.mechanism.tumblerValues.length ===
        this.mechanism.tumblerValues.length &&
      checkpoint.mechanism.locked.length === this.mechanism.locked.length &&
      this.mechanism.restore(checkpoint.mechanism) &&
      this.runSession?.restore(checkpoint.session) === true;
    if (resumed && checkpoint) {
      this.runElapsed = checkpoint.runElapsed;
      this.mechanism.lastMessage =
        "前回のプレイを同じ機構状態から再開しました。計測値は保持されています。";
    } else {
      this.mechanism.lastMessage = options?.postDial
        ? "ゲートは整列済みです。テンションから順番に操作してください。"
        : "問題が固定されました。接触の反応を観察して開錠してください。";
    }
    this.emitSnapshot();
  }

  startDemo() {
    this.handleAction("demo");
  }

  setPaused(paused: boolean) {
    if ((!this.sessionActive && !this.demoMode) || this.mechanism.opened)
      return;
    this.sessionPaused = paused;
    if (paused) {
      this.releasePhysicalInput();
      this.mechanism.lastMessage =
        "一時停止中です。再開すると同じ問題の続きから進めます。";
    } else {
      this.mechanism.lastMessage =
        "プレイを再開しました。前の反応を手掛かりに続けてください。";
    }
    this.emitSnapshot();
  }

  retire() {
    if ((!this.sessionActive && !this.demoMode) || this.mechanism.opened)
      return;
    this.releasePhysicalInput();
    this.sessionActive = false;
    this.sessionPaused = false;
    this.runStarted = false;
    this.lastRunRecordable = false;
    this.demoMode = false;
    this.retired = true;
    this.mechanism.lastMessage =
      "このプレイはリタイアしました。ランキングへは送信しません。";
    this.emitSnapshot();
  }

  performAction(action: string) {
    this.handleAction(action);
    this.emitSnapshot();
  }

  getSnapshot(): GameSnapshot {
    const metrics = this.runSession?.snapshot;
    const result = this.runSession?.finalResult ?? null;
    return {
      status: this.retired
        ? "retired"
        : this.mechanism.opened
          ? "opened"
          : this.sessionPaused
            ? "paused"
            : this.sessionActive || this.demoMode
              ? "active"
              : "idle",
      canvasOverlay: this.notesOpen
        ? "notes"
        : this.archiveOpen
          ? "archive"
          : this.inspectionOpen
            ? "inspection"
            : "none",
      problemId: this.mechanism.puzzle.problemId ?? this.mechanism.puzzle.id,
      problemVersion: this.mechanism.puzzle.problemVersion ?? "DEV",
      vaultTitle: this.mechanism.puzzle.vault.title,
      rewardTitle: this.mechanism.puzzle.reward.title,
      phase: this.mechanism.phase,
      message: this.mechanism.lastMessage,
      elapsedTime: metrics?.elapsedTime ?? this.runElapsed,
      faultCount: metrics?.faultCount ?? this.mechanism.faultCount,
      totalDialSteps: metrics?.totalDialSteps ?? 0,
      excessDialSteps: metrics?.excessDialSteps ?? 0,
      falseGateContacts: metrics?.falseGateContacts ?? 0,
      avoidableFalseGateContacts: metrics?.avoidableFalseGateContacts ?? 0,
      observationAccuracy: metrics?.observationAccuracy ?? 100,
      score: metrics?.score ?? 0,
      opened: this.mechanism.opened,
      wheelCount: this.mechanism.puzzle.vault.wheelCount,
      activeWheel: this.mechanism.activeStage?.wheel ?? null,
      stage: this.mechanism.stage,
      stageCount: this.mechanism.puzzle.stages.length,
      difficulty:
        this.mechanism.puzzle.problemTier ??
        this.mechanism.puzzle.difficulty.label,
      soundMuted: this.audio.isMuted,
      hapticsEnabled: this.haptics.isEnabled,
      hapticsSupported: this.haptics.isSupported,
      newlyUnlockedRewards: this.newlyUnlockedRewards.map(
        reward => reward.title
      ),
      runResult: result,
      recordable: this.lastRunRecordable || this.canRecordOfficialRun(),
    };
  }

  getCheckpoint(): RunCheckpoint | null {
    if (
      !this.canRecordRun() ||
      !this.runSession ||
      this.mechanism.opened ||
      this.retired
    )
      return null;
    return {
      runElapsed: this.runElapsed,
      mechanism: this.mechanism.snapshot,
      session: this.runSession.snapshot,
    };
  }

  private emitSnapshot() {
    if (!this.onSnapshotChange) return;
    const now = performance.now();
    if (now - this.lastSnapshotAt < 80 && !this.mechanism.opened) return;
    this.lastSnapshotAt = now;
    this.onSnapshotChange(this.getSnapshot());
  }

  dispose() {
    this.inputController.dispose();
    this.audio.dispose();
    this.haptics.dispose();
  }

  /** 描画系の一時例外をレンダーループ外へ漏らさず、操作可能な復旧画面を表示する。 */
  renderRecoveryOverlay() {
    try {
      const resolution = this.getCanvasResolution();
      this.resizeCanvas(resolution);
      const { width, height } = resolution;
      const ctx = this.context;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#071015";
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = "#c9a963";
      ctx.lineWidth = 2;
      ctx.strokeRect(width * 0.08, height * 0.28, width * 0.84, height * 0.32);
      ctx.fillStyle = "#e8dfc4";
      ctx.font = `700 ${Math.max(18, width * 0.025)}px "DM Mono", monospace`;
      ctx.textAlign = "center";
      ctx.fillText("機構表示を復旧中", width * 0.5, height * 0.43);
      ctx.fillStyle = "#7c9397";
      ctx.font = `500 ${Math.max(13, width * 0.014)}px ${JAPANESE_FONT_STACK}`;
      ctx.fillText(
        "表示を安全に復旧しています。公式プレイ中のリセットはリタイア扱いです。",
        width * 0.5,
        height * 0.52
      );
      ctx.textAlign = "left";
    } catch {
      // 最後の防御線。描画ループを継続させるため例外は握りつぶす。
    }
  }

  private handleKeyDown(event: KeyboardEvent) {
    this.audio.enableFromGesture();
    this.haptics.enableFromGesture();
    if (!event.shiftKey && ["ArrowRight", "d", "D"].includes(event.key)) {
      event.preventDefault();
      this.rotateDial(1);
    }
    if (!event.shiftKey && ["ArrowLeft", "a", "A"].includes(event.key)) {
      event.preventDefault();
      this.rotateDial(-1);
    }
    if (event.key.toLowerCase() === "r") this.handleAction("reset");
    if (event.key.toLowerCase() === "g") this.handleAction("guide");
    if (event.key.toLowerCase() === "n") this.handleAction("contract");
    if (event.key.toLowerCase() === "q") this.handleAction("training");
    if (event.key.toLowerCase() === "l") this.handleAction("archive");
    if (event.key.toLowerCase() === "o") this.handleAction("notes");
    if (event.key.toLowerCase() === "j") this.handleAction("note-capture");
    if (event.key.toLowerCase() === "i") this.handleAction("inspect");
    if (event.key === "[") this.handleAction("inspect-prev");
    if (event.key === "]") this.handleAction("inspect-next");
    if (event.key.toLowerCase() === "h") this.handleAction("contrast");
    if (event.key.toLowerCase() === "m") this.handleAction("motion");
    if (event.key.toLowerCase() === "p") this.handleAction("precision");
    if (event.key.toLowerCase() === "k") this.handleAction("haptics");
    if (event.key.toLowerCase() === "s") this.handleAction("sound");
    if (event.key.toLowerCase() === "v") this.handleAction("blind-assist");
    if (event.key === "1") this.setDifficulty("observe");
    if (event.key === "2") this.setDifficulty("standard");
    if (event.key === "3") this.setDifficulty("expert");
    if (event.key === "4") this.setDifficulty("blind");
    if (event.key.toLowerCase() === "f") this.focusPhysicalActuator();
    if (event.shiftKey && ["ArrowRight", "ArrowLeft"].includes(event.key)) {
      event.preventDefault();
      this.adjustFocusedActuator(event.key === "ArrowRight" ? 1 : -1);
    }
    if (
      this.keyboardFocus === "fence" &&
      ["ArrowDown", "ArrowUp"].includes(event.key)
    ) {
      event.preventDefault();
      this.adjustFocusedActuator(event.key === "ArrowDown" ? 1 : -1);
    }
    if (event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      this.holdFocusedActuator();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      this.releaseFocusedActuator();
    }
    if (event.key === "Enter") this.focusPhysicalActuator();
  }

  private handleKeyUp(event: KeyboardEvent) {
    if (event.key === " " || event.key === "Spacebar")
      this.releaseFocusedActuator();
  }

  private beginPhysicalInput(action: string): PhysicalInputStartResult {
    const phase = this.mechanism.phase;
    const input =
      action === "tension-grip"
        ? "tension"
        : action === "fence-lever"
          ? "fence"
          : action === "bolt-tab"
            ? "bolt"
            : action === "door-handle"
              ? "handle"
              : null;
    if (!input) return "not-physical";
    const allowed =
      (input === "tension" &&
        (phase === "tension-ready" ||
          phase === "tension-test" ||
          phase === "jammed")) ||
      (input === "fence" &&
        (phase === "fence-ready" ||
          phase === "fence-seated" ||
          phase === "jammed")) ||
      (input === "bolt" &&
        (phase === "fence-seated" || phase === "bolt-test")) ||
      (input === "handle" &&
        (phase === "boltwork-ready" || phase === "handle-test"));
    if (!allowed) {
      this.mechanism.lastMessage =
        phase === "settling"
          ? "停止後の反応を確認してから、テンションを掛けてください。"
          : "いま前に出ている部品だけが、機構へ安全に届きます。";
      return "blocked";
    }
    return input;
  }

  private updatePhysicalInput(
    input: PhysicalInput,
    physicalPointerStart: InputPoint,
    point: InputPoint
  ) {
    const layout = this.getLayout();
    const touch = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    const deadZone = touch ? 18 : 8;
    const travel = Math.max(
      touch ? 72 : 56,
      layout.width * (touch ? 0.18 : 0.11)
    );
    if (input === "tension") {
      const value = clamp(
        (point.x - physicalPointerStart.x - deadZone) / travel,
        0,
        1
      );
      this.setTension(value);
      this.audio.tensionLoad(value);
      return;
    }
    if (input === "fence") {
      if (Math.abs(point.x - physicalPointerStart.x) > 24) {
        this.setFenceTravel(0);
        return;
      }
      const value = clamp(
        (physicalPointerStart.y - point.y - deadZone) / travel,
        0,
        1
      );
      this.setFenceTravel(value);
      this.audio.fenceProbe(value);
      return;
    }
    const value = clamp(
      (point.x - physicalPointerStart.x - deadZone) / travel,
      0,
      1
    );
    if (input === "bolt") {
      this.setBoltTravel(value);
      this.audio.boltSlide(value);
      return;
    }
    this.setHandleTurn(value);
    this.audio.boltworkSlide(value);
  }

  private focusPhysicalActuator() {
    const phase = this.mechanism.phase;
    if (phase === "settling") {
      this.keyboardFocus = "dial";
      this.mechanism.lastMessage =
        "停止後の反応を確認してから、テンションへ進みます。";
      return;
    }
    if (
      phase === "tension-ready" ||
      phase === "tension-test" ||
      phase === "jammed"
    )
      this.keyboardFocus = "tension";
    else if (phase === "fence-ready") this.keyboardFocus = "fence";
    else if (phase === "fence-seated" || phase === "bolt-test")
      this.keyboardFocus = "bolt";
    else if (phase === "boltwork-ready" || phase === "handle-test")
      this.keyboardFocus = "handle";
    else {
      this.keyboardFocus = "dial";
      this.mechanism.lastMessage =
        "ダイヤルを使い、接触針からホイールの仮説を組み立ててください。";
      return;
    }
    const labels = {
      tension: "テンション・ハンドル",
      fence: "フェンス・レバー",
      bolt: "ロックボルト・タブ",
      handle: "扉ハンドル",
      dial: "ダイヤル",
    } as const;
    this.mechanism.lastMessage = `${labels[this.keyboardFocus]}へ焦点を移しました。${this.mechanism.protocolInstruction}。`;
  }

  private adjustFocusedActuator(direction: number) {
    const step = this.preciseInput ? 0.04 : 0.08;
    if (this.keyboardFocus === "tension")
      this.setTension(
        clamp(this.mechanism.desiredTorque + direction * step, 0, 1)
      );
    if (this.keyboardFocus === "fence")
      this.setFenceTravel(
        clamp(this.mechanism.desiredFenceTravel + direction * step, 0, 1)
      );
    if (this.keyboardFocus === "bolt")
      this.setBoltTravel(
        clamp(this.mechanism.desiredBoltTravel + direction * step, 0, 1)
      );
    if (this.keyboardFocus === "handle")
      this.setHandleTurn(
        clamp(this.mechanism.desiredHandleTurn + direction * step, 0, 1)
      );
  }

  private holdFocusedActuator() {
    const tensionBand = this.mechanism.puzzle.difficulty.tensionBand;
    const fenceBand = this.mechanism.puzzle.difficulty.fenceBand;
    if (this.keyboardFocus === "tension")
      this.setTension((tensionBand[0] + tensionBand[1]) / 2);
    if (this.keyboardFocus === "fence")
      this.setFenceTravel((fenceBand[0] + fenceBand[1]) / 2);
    if (this.keyboardFocus === "bolt") this.setBoltTravel(0.82);
    if (this.keyboardFocus === "handle") this.setHandleTurn(0.92);
  }

  private releaseFocusedActuator() {
    if (this.keyboardFocus === "tension") this.setTension(0);
    if (
      this.keyboardFocus === "fence" &&
      this.mechanism.phase !== "fence-seated"
    )
      this.setFenceTravel(0);
    if (this.keyboardFocus === "bolt" && !this.mechanism.opened)
      this.setBoltTravel(0);
    if (this.keyboardFocus === "handle" && !this.mechanism.opened)
      this.setHandleTurn(0);
  }

  private handleAction(action: string) {
    this.audio.enableFromGesture();
    this.haptics.enableFromGesture();
    if (action === "minus") this.rotateDial(-1);
    if (action === "plus") this.rotateDial(1);
    if (action === "reset") {
      if (!canResetMechanism(this.mechanism.opened)) return;
      if (this.demoMode) {
        // Resetting the example must leave a usable example session. A plain
        // mechanism.reset() would stop the demo while React still shows the
        // play screen, leaving every input disabled.
        this.releasePhysicalInput();
        this.mechanism.reset();
        this.sessionActive = false;
        this.sessionPaused = false;
        this.runStarted = true;
        this.runElapsed = 0;
        this.demoElapsed = 0;
        this.runSession = new RunSession(this.mechanism.puzzle);
        this.runRecordableOverride = false;
        this.progressionEligible = false;
        this.lastRunRecordable = false;
        this.lastPhysicalPhase = this.mechanism.phase;
        this.lastRotationAt = 0;
        this.smoothedRotationSpeed = 0;
        this.openingProgress = 0;
        this.resultSummary = null;
        this.mechanism.lastMessage = "自動観察モードを最初から再開しました。";
        return;
      }
      const problemId =
        this.mechanism.puzzle.problemId ?? this.mechanism.puzzle.id;
      const problemVersion = this.mechanism.puzzle.problemVersion ?? "DEV";
      if (
        shouldForfeitOfficialReset({
          sessionActive: this.sessionActive,
          demoMode: this.demoMode,
          trainingContract: this.trainingContract,
          developmentSeed: this.developmentSeed,
          recordable: this.runRecordableOverride ?? undefined,
          problemId,
          problemVersion,
        })
      ) {
        this.releasePhysicalInput();
        this.sessionActive = false;
        this.sessionPaused = false;
        this.runStarted = false;
        this.lastRunRecordable = false;
        this.retired = true;
        this.newlyUnlockedRewards = [];
        this.resultSummary = null;
        this.telemetry.resets += 1;
        this.persistTelemetry();
        this.mechanism.lastMessage =
          "公式プレイ中のリセットはリタイア扱いです。計測値を初期化せず、ランキングへ送信しません。";
        this.onStatusChange?.(this.mechanism.lastMessage);
        return;
      }
      this.releasePhysicalInput();
      this.demoMode = false;
      this.mechanism.reset();
      this.newlyUnlockedRewards = [];
      this.keyboardFocus = "dial";
      this.openingProgress = 0;
      this.runElapsed = 0;
      this.runStarted = false;
      this.runSession = this.sessionActive
        ? new RunSession(this.mechanism.puzzle)
        : null;
      this.lastRunRecordable = false;
      this.resultSummary = null;
      this.telemetry.resets += 1;
      this.persistTelemetry();
    }
    if (action === "demo") {
      if (this.sessionActive && !this.demoMode) {
        this.mechanism.lastMessage =
          "プレイ中はお手本へ切り替えられません。現在の問題を続けてください。";
        return;
      }
      this.releasePhysicalInput();
      this.mechanism.reset();
      this.newlyUnlockedRewards = [];
      this.sessionActive = false;
      this.sessionPaused = false;
      this.runSession = new RunSession(this.mechanism.puzzle);
      this.lastRunRecordable = false;
      this.runRecordableOverride = false;
      this.progressionEligible = false;
      this.demoMode = true;
      this.demoElapsed = 0;
      this.runElapsed = 0;
      this.runStarted = true;
      this.resultSummary = null;
      this.mechanism.lastMessage = "自動観察モード。ゲートを順に揃えています。";
    }
    if (action === "sound") this.audio.toggleMute();
    if (action === "haptics") this.haptics.toggle();
    if (action.startsWith("audio-preview:")) {
      const sampleId = action.slice("audio-preview:".length) as AudioSampleId;
      const sample = AUDIO_SAMPLE_DEFINITIONS.find(
        item => item.id === sampleId
      );
      if (sample) {
        this.audio.preview(sample.id);
        this.onStatusChange?.(
          `音の試験室：${sample.title}。${sample.visualMeaning}`
        );
      }
    }
    if (action === "blind-assist" && this.isBlindMode)
      this.blindAssist = !this.blindAssist;
    if (action === "guide") this.tutorialVisible = !this.tutorialVisible;
    if (action === "training" && !this.sessionActive && !this.demoMode)
      this.startFalseGateTraining();
    if (action === "contrast") this.highContrast = !this.highContrast;
    if (action === "motion") {
      this.reducedMotion = !this.reducedMotion;
      this.haptics.setReducedMotion(this.reducedMotion);
    }
    if (action === "precision") this.preciseInput = !this.preciseInput;
    if (action === "archive") this.archiveOpen = !this.archiveOpen;
    if (action === "notes") this.notesOpen = !this.notesOpen;
    if (action === "note-capture") this.captureObservation();
    if (action === "inspect") this.inspectionOpen = !this.inspectionOpen;
    if (action === "inspect-prev")
      this.inspectionStep =
        (this.inspectionStep + INSPECTION_STEPS.length - 1) %
        INSPECTION_STEPS.length;
    if (action === "inspect-next")
      this.inspectionStep = (this.inspectionStep + 1) % INSPECTION_STEPS.length;
  }

  private setDifficulty(difficulty: DifficultyId) {
    // 公式・訓練・お手本の実行中は、問題機構だけを差し替えない。
    if (this.sessionActive || this.demoMode) return;
    if (this.difficulty === difficulty) return;
    this.releasePhysicalInput();
    this.difficulty = difficulty;
    this.puzzleSeed = (this.puzzleSeed * 1664525 + 1013904223) >>> 0;
    this.mechanism = new LockMechanism(
      createPuzzleFromSeed(this.puzzleSeed, difficulty)
    );
    this.newlyUnlockedRewards = [];
    this.openingProgress = 0;
    this.tutorialVisible = true;
    this.runElapsed = 0;
    this.runStarted = false;
    this.resultSummary = null;
    this.runSession = null;
    this.lastRunRecordable = false;
    this.runRecordableOverride = null;
    this.progressionEligible = true;
    this.trainingContract = false;
    this.blindAssist = false;
    this.blindSignal = null;
    this.mechanism.lastMessage = `${DIFFICULTY_PROFILES[difficulty].label}に切替。新しい保管契約を解析してください。`;
  }

  private startFalseGateTraining() {
    // 実行中の公式結果を訓練機構へ差し替えない。
    if (this.sessionActive || this.demoMode) return;
    this.releasePhysicalInput();
    const puzzle = createFalseGateTrainingPuzzle();
    this.demoMode = false;
    this.trainingContract = true;
    this.sessionActive = true;
    this.sessionPaused = false;
    this.retired = false;
    this.runStarted = true;
    this.runElapsed = 0;
    this.runSession = new RunSession(puzzle);
    this.developmentSeed = false;
    this.lastRunRecordable = false;
    this.runRecordableOverride = false;
    this.progressionEligible = false;
    this.mechanism = new LockMechanism(puzzle);
    this.lastPhysicalPhase = this.mechanism.phase;
    this.newlyUnlockedRewards = [];
    this.openingProgress = 0;
    this.resultSummary = null;
    this.tutorialVisible = true;
    this.mechanism.lastMessage =
      "訓練契約：橙の浅い切欠きはフェンスを座らせません。深い接触と短い音の減衰を比べてください。";
  }

  private captureObservation() {
    const phase = this.mechanism.phase;
    const contact = this.mechanism.contactProfile;
    const category: ObservationCategory =
      contact === "false-gate"
        ? "false-gate"
        : contact === "true-gate" || contact === "edge"
          ? "contact"
          : phase === "boltwork-ready" ||
              phase === "handle-test" ||
              phase === "open"
            ? "boltwork"
            : "preload";
    const contactLabel =
      contact === "true-gate"
        ? "正規ゲート"
        : contact === "edge"
          ? "ゲート縁"
          : "待機";
    const text =
      category === "false-gate"
        ? `浅い切欠き：深さ ${Math.round(this.mechanism.contactDepth * 100)}%。短い反発で、フェンスは座らない。`
        : category === "contact"
          ? `接触：${contactLabel}。深さ ${Math.round(this.mechanism.contactDepth * 100)}%、予圧 ${Math.round(this.mechanism.packResistance * 100)}%。`
          : category === "boltwork"
            ? `扉ボルト：${this.mechanism.puzzle.vault.boltLayout.label}。${this.mechanism.puzzle.vault.boltLayout.boltRatios.length}本の扉側ボルトとキャリーバーを観察。`
            : `ホイールパック予圧：${this.mechanism.puzzle.vault.preload.label}。基準抵抗 ${Math.round(this.mechanism.puzzle.vault.preload.baseResistance * 100)}%。`;
    const note = this.observations.add(
      this.mechanism.puzzle.vault.id,
      category,
      text
    );
    this.mechanism.lastMessage = note.text
      ? `観察メモを端末内に保存しました。メモ / O で閲覧できます。`
      : "保存する観察がありません。";
  }

  private advanceDemo(delta: number) {
    const safeDelta = Number.isFinite(delta) && delta > 0 ? delta : 0;
    this.demoElapsed += safeDelta;
    if (this.mechanism.phase === "dial") {
      const turns = getDemoTurnCount(this.demoElapsed);
      if (!turns) return;
      this.demoElapsed = Math.max(
        0,
        this.demoElapsed - turns * DEMO_DIAL_INTERVAL_SECONDS
      );
      for (
        let turn = 0;
        turn < turns && this.mechanism.phase === "dial";
        turn += 1
      ) {
        const stage = this.mechanism.activeStage;
        this.rotateDial(stage?.direction === "ccw" ? -1 : 1);
      }
      return;
    }
    if (
      (this.mechanism.phase === "tension-ready" ||
        this.mechanism.phase === "tension-test") &&
      this.demoElapsed >= DEMO_ACTION_INTERVAL_SECONDS
    ) {
      this.demoElapsed = Math.max(
        0,
        this.demoElapsed - DEMO_ACTION_INTERVAL_SECONDS
      );
      const band = this.mechanism.puzzle.difficulty.tensionBand;
      this.setTension((band[0] + band[1]) / 2);
      return;
    }
    if (
      this.mechanism.phase === "fence-ready" &&
      this.demoElapsed >= DEMO_ACTION_INTERVAL_SECONDS
    ) {
      this.demoElapsed = Math.max(
        0,
        this.demoElapsed - DEMO_ACTION_INTERVAL_SECONDS
      );
      const band = this.mechanism.puzzle.difficulty.fenceBand;
      this.setFenceTravel((band[0] + band[1]) / 2);
      return;
    }
    if (
      (this.mechanism.phase === "fence-seated" ||
        this.mechanism.phase === "bolt-test") &&
      this.demoElapsed >= DEMO_ACTION_INTERVAL_SECONDS
    ) {
      this.demoElapsed = Math.max(
        0,
        this.demoElapsed - DEMO_ACTION_INTERVAL_SECONDS
      );
      this.setBoltTravel(0.84);
      return;
    }
    if (
      (this.mechanism.phase === "boltwork-ready" ||
        this.mechanism.phase === "handle-test") &&
      this.demoElapsed >= DEMO_ACTION_INTERVAL_SECONDS
    ) {
      this.demoElapsed = Math.max(
        0,
        this.demoElapsed - DEMO_ACTION_INTERVAL_SECONDS
      );
      this.setHandleTurn(0.92);
      return;
    }
    if (this.mechanism.phase === "open") this.demoMode = false;
  }

  private rotateDial(steps: number) {
    const now = performance.now();
    const elapsed =
      this.lastRotationAt > 0 ? Math.max(10, now - this.lastRotationAt) : 130;
    const instantaneousSpeed = clamp(
      Math.abs(steps) / (elapsed / 1000) / 108,
      0,
      1
    );
    this.smoothedRotationSpeed =
      this.smoothedRotationSpeed * 0.56 + instantaneousSpeed * 0.44;
    this.lastRotationAt = now;
    const inputSteps = Number.isFinite(steps) ? Math.round(steps) : 0;
    const appliedSteps = this.preciseInput
      ? inputSteps > 0
        ? 1
        : inputSteps < 0
          ? -1
          : 0
      : inputSteps;
    // LockMechanism caps one call at 32 steps. Record and replay the effective
    // operation so the client total cannot diverge from the server state.
    const effectiveSteps =
      Math.sign(appliedSteps) * Math.min(32, Math.abs(appliedSteps));
    if (!effectiveSteps) return;
    const previousDial = this.mechanism.dial;
    const previousStage = this.mechanism.stage;
    const previousPass = this.mechanism.currentPass;
    const previousDirection = this.mechanism.lastDirection;
    const previousActiveStage = this.mechanism.activeStage;
    this.runStarted = true;
    this.mechanism.setRotationSpeed(this.smoothedRotationSpeed);
    this.mechanism.rotate(effectiveSteps);
    this.runSession?.recordRotation(effectiveSteps);
    if (this.mechanism.dial !== previousDial) {
      const preload = this.mechanism.puzzle.vault.preload;
      const personality = this.mechanism.puzzle.vault.personality;
      const audioSpeed = clamp(
        this.smoothedRotationSpeed *
          (0.72 + personality.speedSensitivity * 0.28),
        0,
        1
      );
      this.audio.dialTick(
        effectiveSteps > 0 ? "cw" : "ccw",
        audioSpeed,
        preload.baseResistance
      );
      const cueStage = this.mechanism.activeStage ?? previousActiveStage;
      const rotationFalseGateContacts =
        this.mechanism.lastRotationFalseGateContacts;
      for (let contact = 0; contact < rotationFalseGateContacts; contact += 1)
        this.runSession?.recordFalseGate();
      const falseGate = this.mechanism.falseGateAtDial;
      if (falseGate) {
        this.audio.falseGate(
          this.mechanism.contactDepth,
          preload.edgeHardness,
          personality.falseGateSimilarity
        );
        this.haptics.pulse("false-gate");
        this.setBlindSignal("EDGE");
      } else if (cueStage && this.mechanism.stage === previousStage) {
        const directDistance = Math.abs(this.mechanism.dial - cueStage.target);
        if (
          Math.min(directDistance, 100 - directDistance) <= 1 &&
          this.mechanism.currentPass === previousPass
        ) {
          this.audio.gateEdge(
            preload.edgeHardness * (0.7 + personality.contactContrast * 0.3)
          );
          this.haptics.pulse("edge");
          this.setBlindSignal("EDGE");
        } else {
          this.audio.flyBrush(
            this.mechanism.currentPass /
              Math.max(1, this.mechanism.requiredPasses),
            preload.flyStickiness
          );
        }
      }
    } else {
      this.audio.camIdle();
      this.haptics.pulse("idle");
      this.setBlindSignal("IDLE");
    }
    if (
      this.mechanism.lastDirection !== previousDirection &&
      this.mechanism.dial !== previousDial
    )
      this.audio.flyRelease();
    if (
      this.mechanism.stage === previousStage &&
      this.mechanism.currentPass > previousPass
    ) {
      this.audio.flyPickup(
        this.mechanism.currentPass / Math.max(1, this.mechanism.requiredPasses),
        this.mechanism.puzzle.vault.preload.flyStickiness
      );
      this.haptics.pulse("pickup");
      this.setBlindSignal("PICKUP");
    }
    if (this.mechanism.stage > previousStage) {
      this.audio.gateLatch();
      this.haptics.pulse("latch");
      this.setBlindSignal("LATCH");
    }
  }

  private isOfficialPuzzle(puzzle: PuzzleDefinition = this.mechanism.puzzle) {
    const problemId = puzzle.problemId ?? puzzle.id;
    const problemVersion = puzzle.problemVersion ?? "DEV";
    return isOfficialProblemIdentity(problemId, problemVersion);
  }

  private canRecordRun() {
    return (
      this.sessionActive &&
      !this.demoMode &&
      !this.trainingContract &&
      !this.developmentSeed &&
      this.runRecordableOverride !== false &&
      this.isOfficialPuzzle()
    );
  }

  private canRecordOfficialRun() {
    return this.canRecordRun() && this.progressionEligible;
  }

  private completeUnlock() {
    this.audio.unlockRelease();
    this.haptics.pulse("unlock");
    const result =
      this.runSession?.finish({
        elapsedTime: this.runElapsed,
        faultCount: this.mechanism.faultCount,
      }) ?? null;
    this.resultSummary = {
      elapsed: this.runElapsed,
      faults: this.mechanism.faultCount,
      seed: this.mechanism.puzzle.seed,
      reward: this.mechanism.puzzle.reward.title,
    };
    // 競技はサーバー検証用の記録としては有効だが、端末内の公式進行
    // と収蔵品へは書き込まない。
    const recordable = this.canRecordRun();
    const persistable = this.canRecordOfficialRun();
    this.lastRunRecordable = recordable;
    this.newlyUnlockedRewards =
      persistable && result
        ? this.archive.unlockForRun(this.mechanism.puzzle, result)
        : [];
    if (persistable) {
      this.telemetry.completions += 1;
      this.telemetry.lastElapsed = this.runElapsed;
      this.persistTelemetry();
    }
    this.sessionActive = false;
    this.runStarted = false;
    this.sessionPaused = false;
    this.retired = false;
    if (result) {
      const archiveMessage = this.newlyUnlockedRewards.length
        ? ` 収蔵品を${this.newlyUnlockedRewards.length}件解放しました。`
        : "";
      this.onStatusChange?.(
        "開錠しました。結果を確認してください。" + archiveMessage
      );
    }
  }

  private syncPhysicalFeedback() {
    const phase = this.mechanism.phase;
    if (phase !== this.lastPhysicalPhase) {
      const previous = this.lastPhysicalPhase;
      this.lastPhysicalPhase = phase;
      if (phase === "fence-ready") {
        this.audio.tensionCandidate();
        this.haptics.pulse("tension");
        this.setBlindSignal("TENSION");
      }
      if (phase === "settling") {
        this.onStatusChange?.(this.mechanism.lastMessage);
      }
      if (phase === "fence-seated") {
        this.audio.fenceSeat();
        this.haptics.pulse("seat");
        this.setBlindSignal("SEAT");
      }
      if (phase === "boltwork-ready") {
        this.audio.boltworkRelease();
        this.haptics.pulse("boltwork");
        this.setBlindSignal("LATCH");
      }
      if (phase === "jammed") {
        this.audio.safetyFault();
        this.haptics.pulse("fault");
        this.setBlindSignal("JAM");
      }
      if (previous === "tension-test" && phase === "tension-ready")
        this.audio.tensionStop();
      if (
        [
          "settling",
          "tension-ready",
          "fence-ready",
          "fence-seated",
          "bolt-test",
          "boltwork-ready",
          "handle-test",
          "jammed",
          "open",
        ].includes(phase)
      )
        this.onStatusChange?.(this.mechanism.lastMessage);
    }
  }

  private setTension(value: number) {
    this.mechanism.setTension(value);
    this.runSession?.recordActuator("tension", value);
  }

  private setFenceTravel(value: number) {
    this.mechanism.setFenceTravel(value);
    this.runSession?.recordActuator("fence", value);
  }

  private setBoltTravel(value: number) {
    this.mechanism.setBoltTravel(value);
    this.runSession?.recordActuator("bolt", value);
  }

  private setHandleTurn(value: number) {
    this.mechanism.setHandleTurn(value);
    this.runSession?.recordActuator("handle", value);
  }
  private releasePhysicalInput() {
    this.inputController.release();
    this.setTension(0);
    if (this.mechanism.phase !== "fence-seated") this.setFenceTravel(0);
    if (!this.mechanism.opened) this.setBoltTravel(0);
    if (!this.mechanism.opened) this.setHandleTurn(0);
  }

  private endPhysicalInput(input: PhysicalInput) {
    if (input === "tension") this.setTension(0);
    if (input === "fence" && this.mechanism.phase !== "fence-seated")
      this.setFenceTravel(0);
    if (input === "bolt" && !this.mechanism.opened) this.setBoltTravel(0);
    if (input === "handle" && !this.mechanism.opened) this.setHandleTurn(0);
  }

  private draw() {
    const resolution = this.getCanvasResolution();
    this.resizeCanvas(resolution);
    const { width, height } = resolution;

    const ctx = this.context;
    ctx.clearRect(0, 0, width, height);
    this.hitboxes.clear();
    const layout = this.getLayout();
    this.drawBackground(layout);
    this.drawHeader(layout);
    this.drawDialPanel(layout);
    if (layout.compact) this.drawCompactMechanismStrip(layout);
    else this.drawInternalPanel(layout);
    this.drawCausalLink(layout);
    this.drawFooter(layout);
    if (this.isBlindMode) {
      this.hitboxes.clear();
      this.drawBlindOverlay(layout);
    } else {
      if (this.inspectionOpen && !this.archiveOpen && !this.notesOpen) {
        this.hitboxes.clear();
        this.drawInspectionOverlay(layout);
      }
      if (this.archiveOpen) {
        this.hitboxes.clear();
        this.drawArchiveOverlay(layout);
      }
      if (this.notesOpen) {
        this.hitboxes.clear();
        this.drawObservationOverlay(layout);
      }
    }
  }

  private getCanvasResolution(): CanvasResolution {
    const bounds = this.canvas.getBoundingClientRect();
    return calculateCanvasResolution(
      this.canvas.clientWidth || bounds.width,
      this.canvas.clientHeight || bounds.height,
      window.devicePixelRatio
    );
  }

  private resizeCanvas(resolution: CanvasResolution) {
    if (
      resolution.pixelWidth !== this.canvas.width ||
      resolution.pixelHeight !== this.canvas.height
    ) {
      this.canvas.width = resolution.pixelWidth;
      this.canvas.height = resolution.pixelHeight;
      this.lastDimensions = {
        width: resolution.width,
        height: resolution.height,
        pixelRatio: resolution.pixelRatio,
      };
    }
    this.context.setTransform(
      resolution.pixelRatio,
      0,
      0,
      resolution.pixelRatio,
      0,
      0
    );
  }

  private getLayout(): ScreenLayout {
    const size = this.getCanvasResolution();
    return calculateScreenLayout(
      size.width,
      size.height,
      this.trainingContract
    );
  }

  private drawBackground(layout: ScreenLayout) {
    const { width, height } = layout;
    const ctx = this.context;
    const base = ctx.createLinearGradient(0, 0, width, height);
    base.addColorStop(0, this.highContrast ? "#02070a" : "#091018");
    base.addColorStop(0.55, this.highContrast ? "#10232a" : "#111b24");
    base.addColorStop(1, this.highContrast ? "#010304" : "#070b10");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.strokeStyle = this.highContrast
      ? "rgba(165, 238, 231, 0.2)"
      : "rgba(145, 194, 198, 0.09)";
    ctx.lineWidth = 1;
    const spacing = Math.max(34, width / 36);
    for (let x = 0; x < width; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawHeader(layout: ScreenLayout) {
    const ctx = this.context;
    const unit = canvasUnit(layout.width, layout.height, layout.compact);
    const y = unit * 2.6;

    if (layout.compact) {
      // プレイ中のタイトルと状態はReact HUDに一本化する。Canvas側にも
      // 同じ見出しを描くと、縦画面でタイトル・説明カード・ダイヤルが重なる。
      return;
    }
    // 画面上部はReact HUDと共有するため、Canvasは機構だけを担当する。
    // ここには細い基準線だけを置き、タイトルの二重描画と重なりを防ぐ。
    ctx.strokeStyle = "rgba(218, 181, 104, 0.48)";
    ctx.lineWidth = 1;
    const headerLineY = y + unit * 6.3;
    ctx.beginPath();
    ctx.moveTo(unit * 3, headerLineY);
    ctx.lineTo(layout.width - unit * 3, headerLineY);
    ctx.stroke();
  }

  private drawDialPanel(layout: ScreenLayout) {
    const { dial } = layout;
    const ctx = this.context;
    const unit = canvasUnit(layout.width, layout.height, layout.compact);
    const plate = this.images.realDoor;
    const opening = easeOut(this.openingProgress);
    const doorScale = layout.compact ? 1.12 : 1.42;
    const faceRadius = dial.radius * doorScale;

    if (opening > 0.008) this.drawVaultInterior(dial, opening, layout.compact);
    ctx.save();
    if (opening > 0.008) {
      const hingeX = dial.x - dial.radius * doorScale;
      ctx.translate(hingeX, dial.y);
      ctx.scale(1 - opening * 0.76, 1);
      ctx.translate(-hingeX, -dial.y);
      ctx.globalAlpha = 1 - opening * 0.12;
    }

    if (plate) {
      ctx.save();
      ctx.globalAlpha = 0.94;
      // 写真素材は正方形でも、金庫の正面は円形の面として見せる。
      // クリップなしで描くと、角が残って「丸くない金庫」になる。
      ctx.beginPath();
      ctx.arc(dial.x, dial.y, faceRadius, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(
        plate,
        dial.x - faceRadius,
        dial.y - faceRadius,
        faceRadius * 2,
        faceRadius * 2
      );
      ctx.restore();
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(dial.x, dial.y, faceRadius, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(213, 181, 108, 0.56)";
    ctx.lineWidth = Math.max(1.5, unit * 0.13);
    ctx.stroke();
    ctx.restore();

    this.drawMetalCircle(
      dial.x,
      dial.y,
      dial.radius * 1.08,
      "#23333d",
      "#071015"
    );
    const realDial = this.images.realDial;
    if (realDial) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(dial.x, dial.y, dial.radius * 0.975, 0, Math.PI * 2);
      ctx.clip();
      ctx.globalAlpha = 0.96;
      ctx.drawImage(
        realDial,
        dial.x - dial.radius,
        dial.y - dial.radius,
        dial.radius * 2,
        dial.radius * 2
      );
      ctx.restore();
    } else {
      this.drawMetalCircle(
        dial.x,
        dial.y,
        dial.radius * 0.96,
        "#bd9650",
        "#3f2a16"
      );
    }
    this.drawDialTicks(dial.x, dial.y, dial.radius * 0.88, layout.compact);

    const dialAngle = (this.mechanism.dial / 100) * Math.PI * 2 - Math.PI / 2;
    ctx.save();
    ctx.translate(dial.x, dial.y);
    ctx.rotate(dialAngle);
    ctx.strokeStyle = "rgba(54, 34, 14, 0.88)";
    ctx.lineWidth = Math.max(1.5, dial.radius * 0.022);
    ctx.beginPath();
    ctx.moveTo(0, -dial.radius * 0.71);
    ctx.lineTo(0, -dial.radius * 0.53);
    ctx.stroke();
    ctx.restore();

    this.drawMetalCircle(
      dial.x,
      dial.y,
      dial.radius * 0.49,
      "#0d161a",
      "#020406"
    );
    this.drawMetalCircle(
      dial.x,
      dial.y,
      dial.radius * 0.4,
      "#17252b",
      "#060b0d"
    );
    ctx.fillStyle = "#e9dfc8";
    ctx.textAlign = "center";
    ctx.font = `700 ${dial.radius * 0.24}px "DM Mono", monospace`;
    ctx.fillText(
      String(this.mechanism.dial).padStart(2, "0"),
      dial.x,
      dial.y + dial.radius * 0.085
    );
    ctx.fillStyle = "#83a1a1";
    ctx.font = `600 ${dial.radius * 0.065}px "DM Mono", monospace`;
    ctx.fillText(
      this.mechanism.lastDirection === "cw" ? "右回り" : "左回り",
      dial.x,
      dial.y + dial.radius * 0.22
    );
    ctx.textAlign = "left";
    ctx.restore();
    if (opening > 0.008) this.drawOpenDoorEdge(dial, opening, layout.compact);

    // 縦長画面では、この上端に機構ストリップを置く。ポインタと英語見出しを
    // 同じ場所へ描くと、ダイヤルと機構のどちらが正本か分からなくなるため、
    // compact ではReact HUDとストリップへ役割を譲る。
    if (!layout.compact) {
      ctx.fillStyle = "#e9dfc8";
      ctx.beginPath();
      ctx.moveTo(dial.x, dial.y - dial.radius * 1.12);
      ctx.lineTo(dial.x - unit * 0.7, dial.y - dial.radius * 1.25);
      ctx.lineTo(dial.x + unit * 0.7, dial.y - dial.radius * 1.25);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#c9a963";
      ctx.font = `600 ${unit * 0.82}px "DM Mono", monospace`;
      ctx.fillText(
        "正面ダイヤル / FRONT DIAL",
        dial.x - dial.radius * 1.08,
        dial.y - dial.radius * 1.35
      );
    }
    ctx.fillStyle = "#799095";
    ctx.font = `500 ${unit * 0.72}px ${JAPANESE_FONT_STACK}`;
    ctx.fillText(
      "ドラッグ / ホイール / ← →",
      dial.x - dial.radius * 1.08,
      dial.y + dial.radius * 1.32
    );

    const controlY = dial.y + dial.radius * 1.42;
    this.drawControlButton(
      "minus",
      {
        x: dial.x - dial.radius * 0.73,
        y: controlY,
        width: dial.radius * 0.34,
        height: unit * 2.35,
      },
      "−  1"
    );
    this.drawControlButton(
      "plus",
      {
        x: dial.x + dial.radius * 0.39,
        y: controlY,
        width: dial.radius * 0.34,
        height: unit * 2.35,
      },
      "+  1"
    );
  }

  private drawVaultInterior(
    dial: ScreenLayout["dial"],
    opening: number,
    compact = false
  ) {
    const ctx = this.context;
    const resolution = this.getCanvasResolution();
    const unit = canvasUnit(resolution.width, resolution.height, compact);
    const scale = compact ? 1.08 : 1.34;
    const left = dial.x - dial.radius * scale;
    const top = dial.y - dial.radius * scale;
    const width = dial.radius * 2 * scale;
    const height = dial.radius * 2 * scale;
    const cavityRadius = Math.min(width, height) / 2;
    const cavity = ctx.createLinearGradient(
      left,
      top,
      left + width,
      top + height
    );
    cavity.addColorStop(0, "#020508");
    cavity.addColorStop(0.5, "#111d23");
    cavity.addColorStop(1, "#010304");
    ctx.beginPath();
    ctx.arc(dial.x, dial.y, cavityRadius, 0, Math.PI * 2);
    ctx.fillStyle = cavity;
    ctx.fill();
    ctx.strokeStyle = "rgba(83, 224, 194, 0.34)";
    ctx.lineWidth = Math.max(1, unit * 0.12);
    ctx.stroke();

    const reveal = clamp((opening - 0.1) / 0.9, 0, 1);
    const glowX = left + width * 0.56;
    const glowY = top + height * 0.69;
    const treasureGlow = ctx.createRadialGradient(
      glowX,
      glowY,
      unit * 0.4,
      glowX,
      glowY,
      width * 0.6
    );
    treasureGlow.addColorStop(0, `rgba(255, 205, 96, ${reveal * 0.42})`);
    treasureGlow.addColorStop(0.32, `rgba(193, 132, 47, ${reveal * 0.19})`);
    treasureGlow.addColorStop(0.72, `rgba(26, 133, 125, ${reveal * 0.1})`);
    treasureGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.save();
    try {
      ctx.beginPath();
      ctx.arc(
        dial.x,
        dial.y,
        Math.max(1, cavityRadius - unit * 0.8),
        0,
        Math.PI * 2
      );
      ctx.clip();
      ctx.fillStyle = treasureGlow;
      ctx.fillRect(left, top, width, height);
      const treasureKey =
        this.mechanism.puzzle.vault.id === "reliquary-nocturne"
          ? "treasureReliquary"
          : this.mechanism.puzzle.vault.id === "chronometer-pelagic"
            ? "treasureChronometer"
            : "treasure";
      const treasure = this.images[treasureKey];
      let treasureDrawn = false;
      if (this.isDrawableImage(treasure)) {
        try {
          ctx.globalAlpha = reveal;
          ctx.shadowColor = `rgba(255, 193, 73, ${reveal * 0.72})`;
          ctx.shadowBlur = unit * 1.8;
          ctx.drawImage(
            treasure,
            left + unit * 1.1,
            top + height * 0.25,
            width - unit * 2.2,
            height * 0.67
          );
          ctx.globalCompositeOperation = "screen";
          ctx.globalAlpha = reveal * 0.42;
          ctx.drawImage(
            treasure,
            left + unit * 1.1,
            top + height * 0.25,
            width - unit * 2.2,
            height * 0.67
          );
          treasureDrawn = true;
        } catch (error) {
          console.warn("Treasure asset skipped after a drawing error", error);
        } finally {
          ctx.globalCompositeOperation = "source-over";
        }
      }
      if (!treasureDrawn && reveal > 0)
        this.drawTreasureFallback(left, top, width, height, unit, reveal);

      const glints = [
        [0.33, 0.67, "#ffe0a0"],
        [0.54, 0.58, "#4de0c0"],
        [0.68, 0.72, "#ffe7a7"],
      ] as const;
      ctx.globalAlpha = reveal;
      for (const [xRatio, yRatio, color] of glints) {
        const x = left + width * xRatio;
        const y = top + height * yRatio;
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1, unit * 0.09);
        ctx.shadowColor = color;
        ctx.shadowBlur = unit * 0.72;
        ctx.beginPath();
        ctx.moveTo(x - unit * 0.38, y);
        ctx.lineTo(x + unit * 0.38, y);
        ctx.moveTo(x, y - unit * 0.38);
        ctx.lineTo(x, y + unit * 0.38);
        ctx.stroke();
      }
    } finally {
      ctx.restore();
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(
      dial.x,
      dial.y,
      Math.max(1, cavityRadius - unit * 1.3),
      0,
      Math.PI * 2
    );
    ctx.clip();
    ctx.globalAlpha = opening * 0.42;
    ctx.fillStyle = "#162d31";
    ctx.fillRect(left, top, width, height);
    ctx.strokeStyle = "rgba(192, 157, 79, 0.36)";
    ctx.lineWidth = Math.max(1, unit * 0.09);
    for (
      let x = left + unit * 2;
      x < left + width - unit * 2;
      x += unit * 2.8
    ) {
      ctx.beginPath();
      ctx.moveTo(x, top + unit * 2);
      ctx.lineTo(x - unit * 1.5, top + height - unit * 2);
      ctx.stroke();
    }
    ctx.restore();

    ctx.fillStyle = `rgba(77, 224, 192, ${opening * 0.72})`;
    ctx.font = `700 ${unit * 0.78}px "DM Mono", monospace`;
    ctx.textAlign = "center";
    ctx.fillText(
      `金庫内部 / ${this.mechanism.puzzle.reward.title}`,
      dial.x,
      dial.y + cavityRadius - unit * 1.25
    );
    ctx.textAlign = "left";
  }

  private drawTreasureFallback(
    left: number,
    top: number,
    width: number,
    height: number,
    unit: number,
    reveal: number
  ) {
    const ctx = this.context;
    const baseY = top + height * 0.76;
    ctx.save();
    ctx.globalAlpha = reveal;
    ctx.fillStyle = "#b98932";
    this.roundRect(
      left + width * 0.2,
      baseY - unit * 1.5,
      width * 0.56,
      unit * 1.7,
      unit * 0.24
    );
    ctx.fill();
    for (let index = 0; index < 11; index += 1) {
      const x = left + width * (0.25 + ((index * 0.071) % 0.47));
      const y = baseY - unit * (0.75 + (index % 3) * 0.3);
      ctx.fillStyle =
        index % 4 === 0 ? "#4de0c0" : index % 5 === 0 ? "#497ad8" : "#e6bc5a";
      ctx.beginPath();
      ctx.arc(x, y, unit * (index % 4 === 0 ? 0.38 : 0.29), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawOpenDoorEdge(
    dial: ScreenLayout["dial"],
    opening: number,
    compact = false
  ) {
    const ctx = this.context;
    const resolution = this.getCanvasResolution();
    const unit = canvasUnit(resolution.width, resolution.height, compact);
    const scale = compact ? 1.12 : 1.42;
    const hingeX = dial.x - dial.radius * scale;
    const doorWidth = dial.radius * 2 * scale;
    const edgeX = hingeX + doorWidth * (1 - opening * 0.76);
    const top = dial.y - dial.radius * scale;
    const height = dial.radius * 2 * scale;
    const thickness = Math.max(unit * 0.65, dial.radius * opening * 0.27);
    const edge = ctx.createLinearGradient(edgeX, top, edgeX + thickness, top);
    edge.addColorStop(0, "#0a0f11");
    edge.addColorStop(0.45, "#714d23");
    edge.addColorStop(0.7, "#d0a864");
    edge.addColorStop(1, "#151a1b");
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.72)";
    ctx.shadowBlur = thickness * 0.6;
    ctx.fillStyle = edge;
    ctx.beginPath();
    ctx.moveTo(edgeX, top + unit * 0.3);
    ctx.lineTo(edgeX + thickness, top + unit * 1.2);
    ctx.lineTo(edgeX + thickness, top + height - unit * 1.2);
    ctx.lineTo(edgeX, top + height - unit * 0.3);
    ctx.closePath();
    ctx.fill();
    const reflectedGold = ctx.createLinearGradient(
      edgeX,
      top,
      edgeX + thickness,
      top + height
    );
    reflectedGold.addColorStop(0, "rgba(255, 221, 132, 0)");
    reflectedGold.addColorStop(0.46, `rgba(255, 205, 96, ${opening * 0.36})`);
    reflectedGold.addColorStop(0.74, `rgba(77, 224, 192, ${opening * 0.16})`);
    reflectedGold.addColorStop(1, "rgba(255, 221, 132, 0)");
    ctx.fillStyle = reflectedGold;
    ctx.fill();
    ctx.strokeStyle = "rgba(224, 191, 122, 0.5)";
    ctx.lineWidth = Math.max(1, unit * 0.08);
    ctx.stroke();
    ctx.restore();
  }

  private drawDialTicks(
    cx: number,
    cy: number,
    radius: number,
    compact = false
  ) {
    const ctx = this.context;
    const resolution = this.getCanvasResolution();
    const unit = canvasUnit(resolution.width, resolution.height, compact);
    for (let value = 0; value < 100; value += 1) {
      const angle = (value / 100) * Math.PI * 2 - Math.PI / 2;
      const major = value % 5 === 0;
      const outer = radius;
      const inner = radius - (major ? unit * 1.4 : unit * 0.68);
      ctx.strokeStyle = major ? "#342512" : "rgba(70, 48, 22, 0.68)";
      ctx.lineWidth = major ? Math.max(1.3, unit * 0.16) : 1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      ctx.lineTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.stroke();
      if (value % 10 === 0) {
        ctx.fillStyle = "#2a1d0f";
        ctx.font = `600 ${unit * 0.88}px "DM Mono", monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(
          String(value).padStart(2, "0"),
          cx + Math.cos(angle) * (radius - unit * 3.3),
          cy + Math.sin(angle) * (radius - unit * 3.3)
        );
      }
    }
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  private drawInternalPanel(layout: ScreenLayout) {
    const ctx = this.context;
    const { internal } = layout;
    const unit = canvasUnit(layout.width, layout.height, layout.compact);
    this.drawFrame(internal, "#0d171e", "rgba(187, 150, 77, 0.54)");
    // 断面写真を薄い下地として使い、操作可能な状態・ラベルは合成図形で
    // 上書きする。写真だけに依存しないので、読込失敗や高コントラスト時も
    // 機構の意味と入力状態は失われない。
    const cutaway = this.images.realLock;
    const imageRect =
      cutaway && this.isDrawableImage(cutaway)
        ? getContainedImageRect(cutaway.naturalWidth, cutaway.naturalHeight, {
            x: internal.x + unit * 0.8,
            y: internal.y + unit * 0.8,
            width: internal.width - unit * 1.6,
            height: internal.height - unit * 1.6,
          })
        : null;
    if (cutaway && imageRect) {
      ctx.save();
      this.roundRect(
        internal.x + unit * 0.8,
        internal.y + unit * 0.8,
        internal.width - unit * 1.6,
        internal.height - unit * 1.6,
        unit * 0.35
      );
      ctx.clip();
      ctx.globalAlpha = 0.2;
      ctx.drawImage(
        cutaway,
        imageRect.x,
        imageRect.y,
        imageRect.width,
        imageRect.height
      );
      ctx.restore();
    }
    ctx.fillStyle = "#d9c28a";
    ctx.font = `600 ${unit * 0.86}px "DM Mono", monospace`;
    ctx.fillText(
      layout.compact ? "内部機構 / LOCK MECHANISM" : "錠前断面 / LOCK CUTAWAY",
      internal.x + unit * 1.5,
      internal.y + unit * 2.2
    );
    ctx.fillStyle = "#708a90";
    ctx.font = `500 ${unit * 0.72}px ${JAPANESE_FONT_STACK}`;
    ctx.fillText(
      layout.compact
        ? `${this.mechanism.puzzle.vault.wheelCount}輪 / カム・フライ・フェンス`
        : `${this.mechanism.puzzle.vault.wheelCount}輪パック / カム・フライ・フェンスを観察`,
      internal.x + unit * 1.5,
      internal.y + unit * 3.7
    );
    ctx.fillStyle = "#c9a963";
    ctx.font = `600 ${unit * 0.48}px "DM Mono", monospace`;
    ctx.fillText(
      `ホイールパック予圧 / ${this.mechanism.puzzle.vault.preload.label}`,
      internal.x + unit * 1.5,
      internal.y + unit * 4.65
    );

    const shaftX = internal.x + internal.width * 0.52;
    const wheelCount = this.mechanism.puzzle.vault.wheelCount;
    const headerHeight = layout.compact ? unit * 5.0 : internal.height * 0.22;
    const contentTop = internal.y + headerHeight;
    const contentBottom =
      internal.y + internal.height * (layout.compact ? 0.85 : 0.79);
    const rowGap = (contentBottom - contentTop) / wheelCount;
    const wheelWidth = internal.width * (layout.compact ? 0.72 : 0.78);
    const wheelHeight = Math.min(rowGap * 0.62, internal.width * 0.082);

    ctx.save();
    ctx.strokeStyle = "rgba(194, 211, 207, 0.76)";
    ctx.lineWidth = Math.max(3, unit * 0.34);
    ctx.beginPath();
    ctx.moveTo(shaftX, contentTop - unit * 0.7);
    ctx.lineTo(shaftX, contentBottom + unit * 0.7);
    ctx.stroke();
    ctx.restore();

    this.drawDriveCam(shaftX, contentTop - unit * 1.15, unit, internal);

    for (let wheel = 0; wheel < wheelCount; wheel += 1) {
      const y = contentTop + rowGap * (wheel + 0.5);
      this.drawTumbler(layout, wheel, shaftX, y, wheelWidth, wheelHeight);
    }

    const fenceDrop = this.mechanism.fenceDropped
      ? 1
      : this.mechanism.fenceTravel;
    const fenceY = contentTop - unit * 0.1 + fenceDrop * unit * 1.7;
    const fenceColor = this.mechanism.fenceDropped
      ? "#4de0c0"
      : this.mechanism.phase === "fence-ready"
        ? "#d9c28a"
        : "#aeb2a8";
    ctx.strokeStyle = fenceColor;
    ctx.lineWidth = Math.max(2, unit * 0.3);
    ctx.beginPath();
    ctx.moveTo(shaftX - wheelWidth * 0.18, fenceY);
    ctx.lineTo(shaftX + wheelWidth * 0.18, fenceY);
    ctx.stroke();
    ctx.fillStyle = fenceColor;
    ctx.font = `700 ${unit * 0.69}px "DM Mono", monospace`;
    ctx.fillText(
      this.mechanism.fenceDropped
        ? "フェンス / 着座"
        : this.mechanism.phase === "fence-ready"
          ? "フェンス / 検証"
          : "フェンス / 待機",
      internal.x + unit * 1.5,
      fenceY + unit * 0.45
    );

    const boltY = internal.y + internal.height * 0.88;
    const retract = this.mechanism.boltTravel * internal.width * 0.19;
    ctx.fillStyle = this.mechanism.boltworkReleased ? "#4de0c0" : "#485c61";
    this.roundRect(
      internal.x + internal.width * 0.48 + retract,
      boltY,
      internal.width * 0.37,
      unit * 1.18,
      unit * 0.25
    );
    ctx.fill();
    ctx.strokeStyle = "#c3d1cb";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = this.mechanism.boltworkReleased ? "#4de0c0" : "#8da4a5";
    ctx.font = `600 ${unit * 0.68}px "DM Mono", monospace`;
    ctx.fillText(
      this.mechanism.boltworkReleased
        ? "ロックボルト / 退避済み"
        : "ロックボルト / 係合中",
      internal.x + unit * 1.5,
      boltY + unit * 0.85
    );

    const boltLayout = this.mechanism.puzzle.vault.boltLayout;
    const carryOrigin =
      internal.x +
      internal.width * (boltLayout.carrierSide === "right" ? 0.89 : 0.11);
    const carryX =
      carryOrigin +
      (boltLayout.carrierSide === "right" ? -1 : 1) *
        this.mechanism.doorBoltTravel *
        internal.width *
        0.09;
    const carryTop = contentTop + unit * 0.6;
    const carryBottom = contentBottom - unit * 0.2;
    ctx.strokeStyle = this.mechanism.boltworkReleased ? "#4de0c0" : "#526467";
    ctx.lineWidth = Math.max(unit * 0.3, 3);
    ctx.beginPath();
    ctx.moveTo(carryX, carryTop);
    ctx.lineTo(carryX, carryBottom);
    ctx.stroke();
    for (const ratio of boltLayout.boltRatios) {
      const y = carryTop + (carryBottom - carryTop) * ratio;
      const extension =
        (1 - this.mechanism.doorBoltTravel) * internal.width * 0.075;
      ctx.fillStyle = this.mechanism.opened
        ? "#4de0c0"
        : this.mechanism.boltworkReleased
          ? "#c9a963"
          : "#58676a";
      const boltX =
        boltLayout.carrierSide === "right" ? carryX : carryX - extension;
      this.roundRect(
        boltX,
        y - unit * 0.24,
        extension + unit * 0.58,
        unit * 0.48,
        unit * 0.12
      );
      ctx.fill();
    }
    ctx.fillStyle = this.mechanism.opened ? "#4de0c0" : "#8da4a5";
    ctx.font = `600 ${unit * 0.48}px "DM Mono", monospace`;
    ctx.fillText(
      this.mechanism.opened
        ? `扉ボルト / 退避済み / ${boltLayout.label}`
        : this.mechanism.boltworkReleased
          ? `ボルトワーク / 準備完了 / ${boltLayout.label}`
          : `扉ボルト / 施錠中 / ${boltLayout.label}`,
      internal.x + unit * 1.5,
      carryBottom + unit * 0.7
    );

    const meterY = boltY - unit * 2.25;
    const meterLeft = internal.x + internal.width * 0.49;
    const meterWidth = internal.width * 0.33;
    this.roundRect(meterLeft, meterY, meterWidth, unit * 0.55, unit * 0.18);
    ctx.fillStyle = "rgba(22, 40, 43, 0.92)";
    ctx.fill();
    ctx.strokeStyle = "rgba(143, 180, 177, 0.55)";
    ctx.stroke();
    const resistance =
      this.mechanism.phase === "tension-test"
        ? this.mechanism.appliedTorque
        : this.mechanism.phase === "fence-ready"
          ? this.mechanism.fenceTravel
          : this.mechanism.phase === "bolt-test"
            ? this.mechanism.boltTravel
            : this.mechanism.phase === "handle-test"
              ? this.mechanism.doorBoltTravel *
                (0.58 + boltLayout.handleResistance * 0.42)
              : this.mechanism.packResistance;
    const meterX = meterLeft + meterWidth * resistance;
    ctx.fillStyle =
      this.mechanism.resistanceState === "candidate" ||
      this.mechanism.resistanceState === "seated"
        ? "#4de0c0"
        : this.mechanism.resistanceState === "jammed"
          ? "#d39566"
          : "#ad8d4e";
    ctx.beginPath();
    ctx.moveTo(meterX, meterY - unit * 0.24);
    ctx.lineTo(meterX - unit * 0.22, meterY + unit * 0.76);
    ctx.lineTo(meterX + unit * 0.22, meterY + unit * 0.76);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle =
      this.mechanism.resistanceState === "candidate" ||
      this.mechanism.resistanceState === "seated"
        ? "#4de0c0"
        : "#8da4a5";
    ctx.font = `600 ${unit * 0.56}px "DM Mono", monospace`;
    const resistanceLabel =
      this.mechanism.resistanceState === "candidate"
        ? "候補"
        : this.mechanism.resistanceState === "seated"
          ? "着座"
          : this.mechanism.resistanceState === "jammed"
            ? "噛み込み"
            : "待機";
    ctx.fillText(
      `抵抗 / ${resistanceLabel}`,
      internal.x + unit * 1.5,
      meterY + unit * 0.3
    );
  }

  /**
   * ポートレートでは断面パネルを縦に置く余白がないため、機構の因果を
   * 輪ごとの状態ストリップへ圧縮する。正解位置を隠す設定では、中央線を
   * フェンス基準として残し、ターゲットや偽ゲートの位置は表示しない。
   */
  private drawCompactMechanismStrip(layout: ScreenLayout) {
    const panel = layout.compactMechanism;
    if (!panel) return;

    const ctx = this.context;
    const unit = canvasUnit(layout.width, layout.height, layout.compact);
    const wheelCount = this.mechanism.puzzle.vault.wheelCount;
    const activeStage = this.mechanism.activeStage;
    const activeWheel = activeStage?.wheel ?? -1;
    const header = activeStage
      ? `機構 / ${wheelCount}輪   駆動カム → 第${activeWheel + 1}輪   ${activeStage.direction === "cw" ? "右" : "左"} ${this.mechanism.currentPass}/${activeStage.passes}`
      : `機構 / ${wheelCount}輪   ${this.mechanism.opened ? "扉ボルト / 退避済み" : "後半機構を確認"}`;

    this.drawFrame(panel, "rgba(5, 15, 19, 0.9)", "rgba(77, 224, 192, 0.48)");
    ctx.fillStyle = "#d9c28a";
    ctx.font = `600 ${unit * 0.52}px "DM Mono", monospace`;
    ctx.fillText(header, panel.x + unit * 0.75, panel.y + unit * 0.78);

    const cellTop = panel.y + unit * 1.02;
    const cellHeight = panel.height - unit * 1.28;
    const gap = unit * 0.25;
    const cellWidth =
      (panel.width - unit * 1.5 - gap * Math.max(0, wheelCount - 1)) /
      Math.max(1, wheelCount);
    for (let wheel = 0; wheel < wheelCount; wheel += 1) {
      const cell = {
        x: panel.x + unit * 0.75 + wheel * (cellWidth + gap),
        y: cellTop,
        width: cellWidth,
        height: cellHeight,
      };
      const aligned = this.mechanism.locked[wheel];
      const active = activeWheel === wheel;
      const coupled = this.mechanism.coupledWheels.includes(wheel);
      const revealGate =
        this.mechanism.puzzle.difficulty.showInternalGatePositions || aligned;

      this.roundRect(cell.x, cell.y, cell.width, cell.height, unit * 0.16);
      ctx.fillStyle = aligned
        ? "rgba(46, 128, 112, 0.88)"
        : active
          ? "rgba(124, 93, 42, 0.9)"
          : coupled
            ? "rgba(27, 83, 78, 0.82)"
            : "rgba(25, 39, 43, 0.9)";
      ctx.fill();
      ctx.strokeStyle = active ? "#e9d7a7" : "rgba(180, 203, 194, 0.42)";
      ctx.lineWidth = active ? Math.max(1, unit * 0.1) : 1;
      ctx.stroke();

      const centerX = cell.x + cell.width * 0.5;
      ctx.strokeStyle = "rgba(214, 225, 213, 0.38)";
      ctx.lineWidth = Math.max(1, unit * 0.07);
      ctx.beginPath();
      ctx.moveTo(centerX, cell.y + unit * 0.15);
      ctx.lineTo(centerX, cell.y + cell.height - unit * 0.15);
      ctx.stroke();

      if (revealGate) {
        const gateX = clamp(
          centerX + this.mechanism.gateOffset(wheel) * cell.width * 0.26,
          cell.x + unit * 0.4,
          cell.x + cell.width - unit * 0.4
        );
        ctx.strokeStyle = aligned ? "#c7fff0" : "#e8c477";
        ctx.lineWidth = Math.max(1, unit * 0.12);
        ctx.beginPath();
        ctx.moveTo(gateX, cell.y + unit * 0.12);
        ctx.lineTo(gateX, cell.y + cell.height - unit * 0.12);
        ctx.stroke();
      }

      if (this.mechanism.puzzle.difficulty.showFalseGatePositions) {
        for (const falseGate of this.mechanism.puzzle.falseGates) {
          if (falseGate.wheel !== wheel) continue;
          const raw =
            ((falseGate.position - this.mechanism.tumblerValues[wheel] + 150) %
              100) -
            50;
          const falseX = clamp(
            centerX + (raw / 50) * cell.width * 0.26,
            cell.x + unit * 0.32,
            cell.x + cell.width - unit * 0.32
          );
          ctx.fillStyle = "#d39566";
          ctx.beginPath();
          ctx.arc(
            falseX,
            cell.y + cell.height * 0.78,
            unit * 0.11,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
      }

      ctx.fillStyle = aligned ? "#05201e" : "#e8dfc4";
      ctx.font = `700 ${Math.max(5, unit * 0.42)}px "DM Mono", monospace`;
      ctx.textAlign = "center";
      ctx.fillText(String(wheel + 1), centerX, cell.y + cell.height * 0.5);
      ctx.textAlign = "left";
    }
  }

  private drawCausalLink(layout: ScreenLayout) {
    if (layout.compact) {
      const panel = layout.compactMechanism;
      if (!panel) return;
      const ctx = this.context;
      const unit = canvasUnit(layout.width, layout.height, layout.compact);
      const startX = panel.x + panel.width * 0.5;
      const startY = panel.y + panel.height;
      const endX = layout.dial.x;
      const endY = layout.dial.y - layout.dial.radius * 1.12;

      ctx.save();
      ctx.strokeStyle = "rgba(77, 224, 192, 0.72)";
      ctx.shadowColor = "rgba(77, 224, 192, 0.8)";
      ctx.shadowBlur = unit * 0.45;
      ctx.lineWidth = Math.max(1.25, unit * 0.1);
      ctx.setLineDash([unit * 0.28, unit * 0.24]);
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#4de0c0";
      ctx.beginPath();
      ctx.moveTo(endX, endY + unit * 0.18);
      ctx.lineTo(endX - unit * 0.3, endY - unit * 0.28);
      ctx.lineTo(endX + unit * 0.3, endY - unit * 0.28);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      return;
    }
    const ctx = this.context;
    const unit = canvasUnit(layout.width, layout.height, layout.compact);
    const wheelCount = this.mechanism.puzzle.vault.wheelCount;
    const activeWheel = this.mechanism.activeStage?.wheel ?? wheelCount - 1;
    const startX = layout.dial.x + layout.dial.radius * 1.08;
    const startY = layout.dial.y;
    const endX = layout.internal.x + unit * 1.2;
    const endY =
      layout.internal.y +
      layout.internal.height *
        (0.22 + 0.57 * ((activeWheel + 0.5) / wheelCount));
    const elbowX = startX + (endX - startX) * 0.48;

    ctx.save();
    ctx.strokeStyle = "rgba(77, 224, 192, 0.18)";
    ctx.lineWidth = Math.max(1, unit * 0.08);
    ctx.setLineDash([unit * 0.42, unit * 0.5]);
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(elbowX, startY);
    ctx.lineTo(elbowX, endY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowColor = "rgba(77, 224, 192, 0.88)";
    ctx.shadowBlur = unit * 0.8;
    ctx.strokeStyle = "rgba(77, 224, 192, 0.78)";
    ctx.lineWidth = Math.max(1.25, unit * 0.12);
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(elbowX, startY);
    ctx.lineTo(elbowX, endY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.fillStyle = "#4de0c0";
    for (const [x, y] of [
      [startX, startY],
      [endX, endY],
    ]) {
      ctx.beginPath();
      ctx.arc(x, y, unit * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawTumbler(
    layout: ScreenLayout,
    wheel: number,
    cx: number,
    cy: number,
    width: number,
    height: number
  ) {
    const ctx = this.context;
    const unit = canvasUnit(layout.width, layout.height, layout.compact);
    const gateOffset = this.mechanism.gateOffset(wheel);
    const aligned = this.mechanism.locked[wheel];
    const revealGate =
      this.mechanism.puzzle.difficulty.showInternalGatePositions || aligned;
    const gateX = revealGate ? cx + gateOffset * width * 0.36 : cx;
    const active = this.mechanism.activeStage?.wheel === wheel;
    const coupled = this.mechanism.coupledWheels.includes(wheel);
    const left = cx - width / 2;
    const top = cy - height / 2;

    this.roundRect(left, top, width, height, height * 0.48);
    const body = ctx.createLinearGradient(left, top, left, top + height);
    body.addColorStop(0, "rgba(230, 201, 130, 0.76)");
    body.addColorStop(0.22, "rgba(91, 68, 39, 0.78)");
    body.addColorStop(0.66, "rgba(35, 31, 23, 0.82)");
    body.addColorStop(1, "rgba(158, 117, 51, 0.72)");
    ctx.fillStyle = body;
    ctx.fill();
    ctx.strokeStyle = active ? "#4de0c0" : "rgba(211, 181, 117, 0.48)";
    ctx.lineWidth = active ? Math.max(2, unit * 0.2) : Math.max(1, unit * 0.12);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 232, 172, 0.32)";
    ctx.lineWidth = 1;
    for (let spoke = -2; spoke <= 2; spoke += 1) {
      ctx.beginPath();
      ctx.moveTo(cx + spoke * width * 0.11, top + unit * 0.6);
      ctx.lineTo(cx + spoke * width * 0.11, top + height - unit * 0.6);
      ctx.stroke();
    }

    if (revealGate) {
      ctx.fillStyle = aligned ? "#4de0c0" : "#0b1216";
      this.roundRect(
        gateX - width * 0.085,
        top - unit * 0.24,
        width * 0.17,
        height * 0.53,
        unit * 0.22
      );
      ctx.fill();
      ctx.strokeStyle = aligned ? "#c7fff0" : "#a2773a";
      ctx.lineWidth = Math.max(1, unit * 0.1);
      ctx.stroke();
      ctx.strokeStyle = "rgba(77, 224, 192, 0.2)";
      ctx.lineWidth = Math.max(1, unit * 0.08);
      ctx.beginPath();
      ctx.moveTo(gateX, top - unit * 0.8);
      ctx.lineTo(gateX, top + height + unit * 0.8);
      ctx.stroke();
    } else {
      ctx.fillStyle = "rgba(4, 11, 14, 0.78)";
      this.roundRect(
        cx - width * 0.16,
        top + height * 0.2,
        width * 0.32,
        height * 0.6,
        unit * 0.2
      );
      ctx.fill();
      ctx.strokeStyle = "rgba(124, 147, 151, 0.32)";
      ctx.stroke();
    }

    if (this.mechanism.puzzle.difficulty.showFalseGatePositions) {
      const falseGates = this.mechanism.puzzle.falseGates.filter(
        gate => gate.wheel === wheel
      );
      for (const falseGate of falseGates) {
        const raw =
          ((falseGate.position - this.mechanism.tumblerValues[wheel] + 150) %
            100) -
          50;
        const falseX = cx + (raw / 50) * width * 0.36;
        ctx.fillStyle = "rgba(211, 149, 102, 0.72)";
        this.roundRect(
          falseX - width * 0.058,
          top - unit * 0.14,
          width * 0.116,
          height * (0.16 + falseGate.depth * 0.18),
          unit * 0.14
        );
        ctx.fill();
        ctx.strokeStyle = "rgba(236, 188, 136, 0.62)";
        ctx.lineWidth = Math.max(1, unit * 0.07);
        ctx.stroke();
      }
    }

    const flyX = left + width * 0.08;
    const flyY = cy - height * 0.18;
    ctx.fillStyle = coupled ? "#4de0c0" : "#5d6562";
    this.roundRect(flyX, flyY, width * 0.12, height * 0.36, unit * 0.12);
    ctx.fill();
    ctx.strokeStyle = coupled ? "#d0fff5" : "rgba(205, 194, 165, 0.35)";
    ctx.stroke();

    ctx.fillStyle = aligned ? "#70f2d9" : active ? "#e9d7a7" : "#758d8f";
    ctx.font = `700 ${Math.max(6, Math.min(unit * 0.68, height * 0.34))}px "DM Mono", monospace`;
    const profile =
      this.mechanism.contactProfile === "false-gate" && active
        ? "偽ゲート"
        : aligned
          ? "正規ゲート"
          : coupled
            ? "フライ接続"
            : active
              ? "待機"
              : revealGate
                ? "自由"
                : "遮蔽";
    ctx.fillText(
      `第${wheel + 1}輪  ${profile}`,
      left + unit * 1.1,
      cy + unit * 0.25
    );
  }

  private drawDriveCam(x: number, y: number, unit: number, internal: Rect) {
    const ctx = this.context;
    const radius = Math.min(internal.width * 0.09, unit * 2.15);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.mechanism.driveCamAngle);
    this.drawMetalCircle(0, 0, radius, "#c9a963", "#172125");
    ctx.fillStyle = "#4de0c0";
    this.roundRect(
      radius * 0.52,
      -radius * 0.17,
      radius * 0.72,
      radius * 0.34,
      radius * 0.1
    );
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#c9a963";
    ctx.font = `600 ${unit * 0.48}px "DM Mono", monospace`;
    const stage = this.mechanism.activeStage;
    const direction = stage?.direction === "cw" ? "右回り" : "左回り";
    const pass =
      this.mechanism.currentPass && this.mechanism.requiredPasses
        ? ` ${this.mechanism.currentPass}/${this.mechanism.requiredPasses}`
        : "";
    ctx.fillText(
      `駆動カム / ${direction}${pass}`,
      internal.x + unit * 1.5,
      y - unit * 0.6
    );
  }

  private drawFooter(layout: ScreenLayout) {
    const ctx = this.context;
    const unit = canvasUnit(layout.width, layout.height, layout.compact);
    const y = layout.footerY;
    const pad = unit * 2.2;

    const messageWidth = layout.compact
      ? layout.width - pad * 2
      : layout.width * 0.57;
    const active = this.mechanism.activeStage;
    const nextAction = active
      ? this.mechanism.puzzle.difficulty.showExactInstruction
        ? `${active.instruction} / 駆動カム → ${active.wheel + 1}輪目`
        : `${active.direction === "cw" ? "右回り" : "左回り"} / ${active.wheel + 1}輪目を拾う / ${this.mechanism.currentPass}/${active.passes}回目`
      : this.mechanism.protocolInstruction;
    const hint = `次の操作 / ${nextAction}`;
    const guide = this.getGuideText();

    if (
      layout.compact &&
      (this.trainingContract ||
        layout.height <= COMPACT_WORKBENCH_ONLY_MAX_HEIGHT)
    ) {
      const workbenchHeight = this.trainingContract
        ? Math.min(unit * 10.0, layout.height * 0.115)
        : Math.min(unit * 9.0, layout.height * 0.11);
      const bench = {
        x: pad,
        y,
        width: layout.width - pad * 2,
        height: workbenchHeight,
      };
      this.drawPhysicalWorkbench(bench, layout);
      return;
    }

    if (layout.compact) {
      this.drawFrame(
        { x: pad, y, width: messageWidth, height: unit * 4.2 },
        "rgba(11, 20, 26, 0.9)",
        "rgba(146, 181, 177, 0.3)"
      );
      ctx.fillStyle = "#4de0c0";
      ctx.font = `700 ${unit * 0.66}px "DM Mono", monospace`;
      this.drawWrappedText(
        hint,
        pad + unit * 1.1,
        y + unit * 1.42,
        messageWidth - unit * 2.2,
        unit * 0.9,
        1
      );
      ctx.fillStyle = "#d9c28a";
      ctx.font = `600 ${unit * 0.5}px "DM Mono", monospace`;
      ctx.fillText(
        `段階 / ${this.mechanism.phase}  ·  失敗 ${this.mechanism.faultCount}/${this.mechanism.puzzle.difficulty.maxFaults}`,
        pad + unit * 1.1,
        y + unit * 2.28
      );
      ctx.fillStyle = "#d5d9cc";
      ctx.font = `500 ${unit * 0.64}px ${JAPANESE_FONT_STACK}`;
      this.drawWrappedText(
        this.mechanism.lastMessage,
        pad + unit * 1.1,
        y + unit * 3.12,
        messageWidth - unit * 2.2,
        unit * 0.82,
        2
      );
      const bench = {
        x: pad,
        y: y + unit * 4.85,
        width: layout.width - pad * 2,
        height: Math.min(unit * 9.0, layout.height * 0.11),
      };
      this.drawPhysicalWorkbench(bench, layout);
      // ポートレートではHTMLのモバイルメニューを使うため、補助レールは描かない。
      return;
    }

    this.drawFrame(
      { x: pad, y, width: messageWidth, height: unit * 5.35 },
      "rgba(11, 20, 26, 0.9)",
      "rgba(146, 181, 177, 0.3)"
    );
    ctx.fillStyle = "#4de0c0";
    ctx.font = `700 ${unit * 0.72}px "DM Mono", monospace`;
    ctx.fillText(hint, pad + unit * 1.25, y + unit * 1.5);
    ctx.fillStyle = "#d9c28a";
    ctx.font = `600 ${unit * 0.52}px "DM Mono", monospace`;
    ctx.fillText(
      `モード / ${DIFFICULTY_PROFILES[this.difficulty].label}   ${this.tutorialVisible ? `案内 / ${guide}` : "案内 / OFF"}   ${this.preciseInput ? "精密入力" : "自由入力"}   ${this.haptics.label}`,
      pad + unit * 1.25,
      y + unit * 2.18
    );
    ctx.fillStyle = this.mechanism.faultCount > 0 ? "#d39566" : "#7e9b98";
    ctx.font = `600 ${unit * 0.56}px "DM Mono", monospace`;
    ctx.fillText(
      `段階 / ${this.mechanism.phase}   失敗 / ${this.mechanism.faultCount}/${this.mechanism.puzzle.difficulty.maxFaults}`,
      pad + unit * 1.25,
      y + unit * 2.9
    );
    ctx.fillStyle = "#d5d9cc";
    ctx.font = `500 ${unit * 0.93}px ${JAPANESE_FONT_STACK}`;
    this.drawWrappedText(
      this.mechanism.lastMessage,
      pad + unit * 1.25,
      y + unit * 3.48,
      messageWidth - unit * 2.4,
      unit * 1.05
    );

    const bench = layout.compact
      ? {
          x: pad,
          y: y + unit * 6.2,
          width: layout.width - pad * 2,
          height: unit * 8.15,
        }
      : {
          x: layout.width * 0.61,
          y: y + unit * 0.4,
          width: layout.width * 0.35,
          height: unit * 6.0,
        };
    this.drawPhysicalWorkbench(bench, layout);

    const railY = layout.compact
      ? bench.y + bench.height + unit * 0.55
      : bench.y + bench.height + unit * 0.55;
    const railX = layout.compact ? pad : layout.width * 0.61;
    const railWidth = layout.compact
      ? (layout.width - pad * 2) / 5
      : bench.width / 6;
    const railHeight = unit * 2.0;
    this.drawControlButton(
      "reset",
      {
        x: railX,
        y: railY,
        width: railWidth - unit * 0.35,
        height: railHeight,
      },
      this.canRecordRun() ? "リセット / リタイア" : "リセット / R"
    );
    if (!this.sessionActive || this.demoMode) {
      this.drawControlButton(
        "demo",
        {
          x: railX + railWidth,
          y: railY,
          width: railWidth - unit * 0.35,
          height: railHeight,
        },
        "お手本 / DEMO"
      );
    }
    this.drawControlButton(
      "sound",
      {
        x: railX + railWidth * 2,
        y: railY,
        width: railWidth - unit * 0.35,
        height: railHeight,
      },
      this.audio.isMuted ? "音 / OFF" : "音 / ON"
    );
    const hapticButtonLabel = !this.haptics.isSupported
      ? "振動 / 非対応"
      : this.reducedMotion
        ? "振動 / 一時停止"
        : this.haptics.isEnabled
          ? "振動 / ON"
          : "振動 / OFF";
    this.drawControlButton(
      "haptics",
      {
        x: railX + railWidth * 3,
        y: railY,
        width: railWidth - unit * 0.35,
        height: railHeight,
      },
      hapticButtonLabel,
      this.haptics.isActive ? "#4de0c0" : "#758d8f"
    );
    this.drawControlButton(
      "guide",
      {
        x: railX + railWidth * 4,
        y: railY,
        width: railWidth - unit * 0.35,
        height: railHeight,
      },
      this.tutorialVisible ? "案内 / ON" : "案内 / OFF"
    );
    if (!layout.compact)
      this.drawControlButton(
        "note-capture",
        {
          x: railX + railWidth * 5,
          y: railY + railHeight + unit * 0.38,
          width: railWidth - unit * 0.35,
          height: railHeight,
        },
        "メモ / J",
        "#4de0c0"
      );
  }

  private drawPhysicalWorkbench(rect: Rect, layout: ScreenLayout) {
    const ctx = this.context;
    const unit = canvasUnit(layout.width, layout.height, layout.compact);
    const phase = this.mechanism.phase;
    const isTension =
      phase === "tension-ready" ||
      phase === "tension-test" ||
      phase === "jammed";
    const isFence = phase === "fence-ready";
    const isBolt = phase === "fence-seated" || phase === "bolt-test";
    const isHandle = phase === "boltwork-ready" || phase === "handle-test";
    const title = isTension
      ? "テンション / 抵抗針"
      : isFence
        ? "フェンス / 着座"
        : isBolt
          ? "ロックボルト / 退避量"
          : isHandle
            ? "扉ハンドル / ボルトワーク"
            : "接触記録 / 候補メモ";
    this.drawFrame(
      rect,
      "rgba(6, 15, 19, 0.94)",
      isTension || isFence || isBolt || isHandle
        ? "rgba(77, 224, 192, 0.65)"
        : "rgba(202, 169, 99, 0.42)"
    );
    ctx.fillStyle = "#e8dfc4";
    ctx.font = `700 ${unit * 0.67}px "DM Mono", monospace`;
    ctx.fillText(title, rect.x + unit * 1.1, rect.y + unit * 1.25);
    if (!isTension && !isFence && !isBolt) {
      ctx.fillStyle = this.audio.isMuted ? "#d39566" : "#4de0c0";
      ctx.font = `600 ${unit * 0.48}px "DM Mono", monospace`;
      ctx.fillText(
        this.audio.isMuted
          ? "音 OFF — 画面の手掛かりを使用"
          : "聴く / 待機は低音・縁は高音・拾いは二重音",
        rect.x + unit * 1.1,
        rect.y + unit * 1.94
      );
      ctx.fillStyle = "#7e9b98";
      ctx.font = `500 ${unit * 0.72}px ${JAPANESE_FONT_STACK}`;
      this.drawWrappedText(
        "ダイヤルの接触痕を記録し、候補が揃ったら抵抗で検証します。標準・専門では内部の正解ゲートは遮蔽されます。",
        rect.x + unit * 1.1,
        rect.y + unit * 2.72,
        rect.width - unit * 2.2,
        unit * 0.95,
        2
      );
      if (this.mechanism.puzzle.difficulty.showInternalGatePositions) {
        const profile =
          this.mechanism.contactProfile === "false-gate"
            ? "偽ゲート"
            : this.mechanism.contactProfile === "true-gate"
              ? "正規ゲート"
              : "待機";
        ctx.fillStyle =
          this.mechanism.contactProfile === "false-gate"
            ? "#d39566"
            : this.mechanism.contactProfile === "true-gate"
              ? "#4de0c0"
              : "#8da4a5";
        ctx.font = `600 ${unit * 0.5}px "DM Mono", monospace`;
        ctx.fillText(
          `接触 / ${profile}  深さ / ${Math.round(this.mechanism.contactDepth * 100)}%  抵抗 / ${Math.round(this.mechanism.packResistance * 100)}%`,
          rect.x + unit * 1.1,
          rect.y + rect.height * 0.52
        );
      }
      ctx.strokeStyle = "rgba(202, 169, 99, 0.58)";
      ctx.lineWidth = Math.max(1, unit * 0.1);
      for (let index = 0; index < 3; index += 1) {
        const x = rect.x + rect.width * (0.2 + index * 0.28);
        ctx.beginPath();
        ctx.moveTo(x, rect.y + rect.height * 0.64);
        ctx.lineTo(x + unit * 1.2, rect.y + rect.height * 0.84);
        ctx.stroke();
      }
      return;
    }
    if (isTension) this.drawTensionHandle(rect, unit);
    if (isFence) this.drawFenceLever(rect, unit);
    if (isBolt) this.drawBoltTab(rect, unit);
    if (isHandle) this.drawDoorHandle(rect, unit);
  }

  private drawTensionHandle(rect: Rect, unit: number) {
    const ctx = this.context;
    const centerX = rect.x + rect.width * 0.52;
    const centerY = rect.y + rect.height * 0.62;
    const angle = (-32 + this.mechanism.appliedTorque * 32) * (Math.PI / 180);
    const arm = Math.min(rect.width * 0.26, unit * 8.2);
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(angle);
    ctx.strokeStyle = "#20292c";
    ctx.lineWidth = Math.max(unit * 0.82, 9);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(arm, 0);
    ctx.stroke();
    const grip = ctx.createLinearGradient(0, -unit * 0.52, 0, unit * 0.52);
    grip.addColorStop(0, "#e5c477");
    grip.addColorStop(0.45, "#72511f");
    grip.addColorStop(1, "#22180d");
    ctx.strokeStyle = grip;
    ctx.lineWidth = Math.max(unit * 1.05, 12);
    ctx.beginPath();
    ctx.moveTo(arm * 0.62, 0);
    ctx.lineTo(arm, 0);
    ctx.stroke();
    ctx.restore();
    this.drawResistanceNeedle(
      rect.x + rect.width * 0.16,
      rect.y + rect.height * 0.84,
      rect.width * 0.68,
      this.mechanism.appliedTorque,
      this.mechanism.resistanceState,
      unit
    );
    this.setHitbox("tension-grip", {
      x: centerX - unit * 2.4,
      y: centerY - unit * 2.4,
      width: arm + unit * 5.0,
      height: unit * 4.8,
    });
  }

  private drawFenceLever(rect: Rect, unit: number) {
    const ctx = this.context;
    const x = rect.x + rect.width * 0.52;
    const trackTop = rect.y + rect.height * 0.32;
    const trackHeight = rect.height * 0.46;
    const travel = this.mechanism.fenceTravel;
    ctx.strokeStyle = "#1d292d";
    ctx.lineWidth = Math.max(unit * 1.15, 12);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, trackTop);
    ctx.lineTo(x, trackTop + trackHeight);
    ctx.stroke();
    const handleY = trackTop + trackHeight * (1 - travel);
    ctx.fillStyle = this.mechanism.fenceDropped ? "#4de0c0" : "#c9a963";
    this.roundRect(
      x - unit * 1.1,
      handleY - unit * 0.55,
      unit * 2.2,
      unit * 1.1,
      unit * 0.28
    );
    ctx.fill();
    ctx.strokeStyle = "#e8dfc4";
    ctx.stroke();
    ctx.fillStyle = "#8da4a5";
    ctx.font = `500 ${unit * 0.58}px ${JAPANESE_FONT_STACK}`;
    this.drawWrappedText(
      this.mechanism.fenceDropped
        ? "座りを保持。次はボルトを確認します。"
        : "上へゆっくり押し、止まる位置を読む。",
      rect.x + unit * 1.1,
      rect.y + rect.height * 0.88,
      rect.width - unit * 2.2,
      unit * 0.7,
      1
    );
    this.setHitbox("fence-lever", {
      x: x - unit * 3.2,
      y: trackTop - unit * 1.2,
      width: unit * 6.4,
      height: trackHeight + unit * 2.4,
    });
  }

  private drawBoltTab(rect: Rect, unit: number) {
    const ctx = this.context;
    const x = rect.x + rect.width * 0.16;
    const y = rect.y + rect.height * 0.54;
    const travel = this.mechanism.boltTravel;
    const trackWidth = rect.width * 0.66;
    ctx.strokeStyle = "#1d292d";
    ctx.lineWidth = Math.max(unit * 1.2, 13);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + trackWidth, y);
    ctx.stroke();
    const tabX = x + trackWidth * travel;
    ctx.fillStyle = "#4de0c0";
    this.roundRect(
      tabX - unit * 0.75,
      y - unit * 1.1,
      unit * 1.5,
      unit * 2.2,
      unit * 0.25
    );
    ctx.fill();
    ctx.strokeStyle = "#e8dfc4";
    ctx.stroke();
    ctx.fillStyle = "#8da4a5";
    ctx.font = `500 ${unit * 0.58}px ${JAPANESE_FONT_STACK}`;
    this.drawWrappedText(
      "右へ押し、引っ掛かりではなく滑らかな後退を確認する。",
      rect.x + unit * 1.1,
      rect.y + rect.height * 0.88,
      rect.width - unit * 2.2,
      unit * 0.7,
      1
    );
    this.setHitbox("bolt-tab", {
      x: x - unit * 1.6,
      y: y - unit * 2.4,
      width: trackWidth + unit * 3.2,
      height: unit * 4.8,
    });
  }

  private drawDoorHandle(rect: Rect, unit: number) {
    const ctx = this.context;
    const centerX = rect.x + rect.width * 0.5;
    const centerY = rect.y + rect.height * 0.54;
    const radius = Math.min(rect.height * 0.24, unit * 2.2);
    const rotation = -0.72 + this.mechanism.doorBoltTravel * 1.18;
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(rotation);
    ctx.strokeStyle = "#20292c";
    ctx.lineWidth = Math.max(unit * 0.36, 4);
    for (let spoke = 0; spoke < 3; spoke += 1) {
      ctx.save();
      ctx.rotate((Math.PI * 2 * spoke) / 3);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(radius * 1.55, 0);
      ctx.stroke();
      ctx.restore();
    }
    this.drawMetalCircle(0, 0, radius, "#c9a963", "#1d292d");
    ctx.restore();
    const trackX = rect.x + rect.width * 0.16;
    const trackY = rect.y + rect.height * 0.84;
    this.drawResistanceNeedle(
      trackX,
      trackY,
      rect.width * 0.68,
      this.mechanism.doorBoltTravel,
      this.mechanism.boltworkReleased ? "seated" : "idle",
      unit
    );
    ctx.fillStyle = "#8da4a5";
    ctx.font = `500 ${unit * 0.58}px ${JAPANESE_FONT_STACK}`;
    this.drawWrappedText(
      "右へ回し、キャリーバーと扉側ボルトを受け金から後退させる。",
      rect.x + unit * 1.1,
      rect.y + rect.height * 0.92,
      rect.width - unit * 2.2,
      unit * 0.7,
      1
    );
    this.setHitbox("door-handle", {
      x: centerX - radius * 2.4,
      y: centerY - radius * 2.4,
      width: radius * 4.8,
      height: radius * 4.8,
    });
  }

  private drawResistanceNeedle(
    x: number,
    y: number,
    width: number,
    amount: number,
    state: string,
    unit?: number
  ) {
    const ctx = this.context;
    const resolvedUnit =
      unit ??
      (() => {
        const resolution = this.getCanvasResolution();
        return canvasUnit(
          resolution.width,
          resolution.height,
          resolution.width / resolution.height < 1.12
        );
      })();
    this.roundRect(
      x,
      y - resolvedUnit * 0.35,
      width,
      resolvedUnit * 0.7,
      resolvedUnit * 0.18
    );
    ctx.fillStyle = "#111b20";
    ctx.fill();
    ctx.strokeStyle =
      state === "candidate" || state === "seated"
        ? "#4de0c0"
        : state === "jammed"
          ? "#d39566"
          : "#7e9b98";
    ctx.stroke();
    const needleX = x + width * amount;
    ctx.strokeStyle = ctx.strokeStyle;
    ctx.lineWidth = Math.max(1.5, resolvedUnit * 0.12);
    ctx.beginPath();
    ctx.moveTo(needleX, y - resolvedUnit * 0.7);
    ctx.lineTo(needleX, y + resolvedUnit * 0.7);
    ctx.stroke();
  }

  private drawInspectionOverlay(layout: ScreenLayout) {
    const ctx = this.context;
    const unit = canvasUnit(layout.width, layout.height, layout.compact);
    const panel = layout.internal;
    const step = INSPECTION_STEPS[this.inspectionStep];
    ctx.save();
    this.roundRect(panel.x, panel.y, panel.width, panel.height, unit * 0.6);
    ctx.fillStyle = "rgba(3, 13, 16, 0.92)";
    ctx.fill();
    ctx.strokeStyle = "rgba(77, 224, 192, 0.72)";
    ctx.lineWidth = Math.max(1, unit * 0.11);
    ctx.stroke();

    ctx.fillStyle = "#e8dfc4";
    ctx.font = `700 ${unit * (layout.compact ? 0.86 : 1.03)}px "DM Mono", monospace`;
    this.drawWrappedText(
      layout.compact
        ? `機構観察 / ${this.inspectionStep + 1}-${INSPECTION_STEPS.length}`
        : `機構を分解して見る / ${this.inspectionStep + 1}-${INSPECTION_STEPS.length}`,
      panel.x + unit * 1.25,
      panel.y + unit * 1.65,
      panel.width - unit * 2.5,
      unit * 0.82,
      1
    );
    ctx.fillStyle = "#74f2da";
    ctx.font = `700 ${unit * (layout.compact ? 0.94 : 1.15)}px "DM Mono", monospace`;
    this.drawWrappedText(
      step.label,
      panel.x + unit * 1.25,
      panel.y + unit * 3.15,
      panel.width - unit * 2.5,
      unit * 0.86,
      1
    );
    ctx.fillStyle = "#c5d3cf";
    ctx.font = `500 ${unit * (layout.compact ? 0.62 : 0.72)}px ${JAPANESE_FONT_STACK}`;
    this.drawWrappedText(
      step.detail,
      panel.x + unit * 1.25,
      panel.y + unit * 4.25,
      panel.width - unit * 2.5,
      unit * 0.92,
      layout.compact ? 1 : Number.POSITIVE_INFINITY
    );

    const mechanismTop =
      panel.y + panel.height * (layout.compact ? 0.49 : 0.58);
    const segmentWidth = panel.width * 0.088;
    const segmentHeight = Math.max(unit * 1.55, panel.height * 0.1);
    const segmentGap = panel.width * 0.018;
    INSPECTION_STEPS.forEach((item, index) => {
      const x =
        panel.x + panel.width * 0.07 + index * (segmentWidth + segmentGap);
      const y =
        mechanismTop + (index === this.inspectionStep ? -unit * 0.72 : 0);
      this.roundRect(x, y, segmentWidth, segmentHeight, unit * 0.28);
      ctx.fillStyle =
        index === this.inspectionStep
          ? "rgba(77, 224, 192, 0.72)"
          : "rgba(130, 96, 43, 0.55)";
      ctx.fill();
      ctx.strokeStyle = index === this.inspectionStep ? "#d0fff5" : "#bd9b53";
      ctx.lineWidth = Math.max(1, unit * 0.08);
      ctx.stroke();
      if (index < INSPECTION_STEPS.length - 1) {
        ctx.strokeStyle = "rgba(77, 224, 192, 0.55)";
        ctx.beginPath();
        ctx.moveTo(x + segmentWidth, y + segmentHeight / 2);
        ctx.lineTo(x + segmentWidth + segmentGap, y + segmentHeight / 2);
        ctx.stroke();
      }
      ctx.fillStyle = index === this.inspectionStep ? "#05201e" : "#e7d7ad";
      ctx.font = `700 ${unit * 0.48}px "DM Mono", monospace`;
      ctx.textAlign = "center";
      ctx.fillText(
        String(index + 1),
        x + segmentWidth / 2,
        y + segmentHeight / 2 + unit * 0.16
      );
      if (!layout.compact) {
        ctx.textAlign = "left";
        ctx.fillStyle = "#90a7a4";
        ctx.font = `500 ${unit * 0.38}px "DM Mono", monospace`;
        ctx.fillText(
          item.label.split(" /")[0],
          x - unit * 0.15,
          y + segmentHeight + unit * 0.7
        );
      }
    });

    const controlY = panel.y + panel.height - unit * 3.2;
    const compactControls = layout.compact
      ? {
          previous: {
            x: panel.x + unit * 1.0,
            width: unit * 5.5,
          },
          next: {
            x: panel.x + unit * 6.8,
            width: unit * 5.5,
          },
          close: {
            x: panel.x + unit * 13.2,
            width: unit * 6.8,
          },
        }
      : null;
    this.drawControlButton(
      "inspect-prev",
      {
        x: compactControls?.previous.x ?? panel.x + unit * 1.25,
        y: controlY,
        width: compactControls?.previous.width ?? unit * 7.5,
        height: unit * 2.0,
      },
      "前へ [",
      "#7e9b98"
    );
    this.drawControlButton(
      "inspect-next",
      {
        x: compactControls?.next.x ?? panel.x + unit * 9.55,
        y: controlY,
        width: compactControls?.next.width ?? unit * 7.5,
        height: unit * 2.0,
      },
      "次へ ]",
      "#4de0c0"
    );
    this.drawControlButton(
      "inspect",
      {
        x: compactControls?.close.x ?? panel.x + panel.width - unit * 9.2,
        y: controlY,
        width: compactControls?.close.width ?? unit * 7.9,
        height: unit * 2.0,
      },
      "閉じる / I",
      "#c9a963"
    );
    ctx.restore();
  }

  private drawObservationOverlay(layout: ScreenLayout) {
    const ctx = this.context;
    const unit = canvasUnit(layout.width, layout.height, layout.compact);
    const panel: Rect = {
      x: layout.width * (layout.compact ? 0.045 : 0.16),
      y: layout.height * (layout.compact ? 0.08 : 0.13),
      width: layout.width * (layout.compact ? 0.91 : 0.68),
      height: layout.height * (layout.compact ? 0.82 : 0.72),
    };
    ctx.save();
    ctx.fillStyle = "rgba(1, 5, 7, 0.5)";
    ctx.fillRect(0, 0, layout.width, layout.height);
    this.drawFrame(panel, "rgba(7, 17, 21, 0.84)", "rgba(77, 224, 192, 0.72)");
    ctx.save();
    ctx.strokeStyle = "rgba(145, 194, 198, 0.09)";
    ctx.lineWidth = 1;
    const gridTop = panel.y + unit * (layout.compact ? 6.65 : 3.6);
    for (
      let x = panel.x + unit * 1.2;
      x < panel.x + panel.width - unit;
      x += unit * 2.2
    ) {
      ctx.beginPath();
      ctx.moveTo(x, gridTop);
      ctx.lineTo(x, panel.y + panel.height - unit);
      ctx.stroke();
    }
    for (
      let y = panel.y + unit * (layout.compact ? 6.95 : 4);
      y < panel.y + panel.height - unit;
      y += unit * 2.2
    ) {
      ctx.beginPath();
      ctx.moveTo(panel.x + unit, y);
      ctx.lineTo(panel.x + panel.width - unit, y);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = "#e8dfc4";
    ctx.font = `700 ${unit * (layout.compact ? 0.86 : 1.15)}px "DM Mono", monospace`;
    this.drawWrappedText(
      "観察メモ / 端末内保存",
      panel.x + unit * 1.4,
      panel.y + unit * (layout.compact ? 1.7 : 2.0),
      panel.width - unit * 2.8,
      unit * 0.86,
      1
    );
    ctx.fillStyle = "#7c9397";
    ctx.font = `500 ${unit * 0.66}px ${JAPANESE_FONT_STACK}`;
    this.drawWrappedText(
      "接触、浅い切欠き、予圧、扉側ボルトの観察をこの端末だけに保存します。",
      panel.x + unit * 1.4,
      panel.y + unit * (layout.compact ? 2.7 : 3.0),
      panel.width - unit * 2.8,
      unit * 0.76,
      layout.compact ? 2 : 1
    );
    const controlTop = panel.y + unit * (layout.compact ? 4.55 : 0.95);
    this.drawControlButton(
      "notes",
      {
        x: panel.x + panel.width - unit * 9.1,
        y: controlTop,
        width: unit * 7.6,
        height: unit * 2.05,
      },
      "閉じる / O",
      "#c9a963"
    );
    this.drawControlButton(
      "note-capture",
      {
        x: panel.x + panel.width - unit * 18.0,
        y: controlTop,
        width: unit * 7.6,
        height: unit * 2.05,
      },
      "保存 / J",
      "#4de0c0"
    );

    const notes = this.observations.recent;
    const top = panel.y + unit * (layout.compact ? 7.0 : 4.15);
    const rowHeight = Math.max(
      unit * 3.35,
      (panel.height - unit * (layout.compact ? 8.1 : 5.5)) /
        Math.max(1, Math.min(notes.length, 5))
    );
    if (!notes.length) {
      ctx.fillStyle = "#a9b8b5";
      ctx.font = `600 ${unit * 0.78}px ${JAPANESE_FONT_STACK}`;
      this.drawWrappedText(
        "まだ観察メモがありません。Jキーまたは 保存 / J で現在の接触を記録してください。",
        panel.x + unit * 1.4,
        top + unit * 1.5,
        panel.width - unit * 2.8,
        unit * 0.88,
        layout.compact ? 3 : 2
      );
    }
    notes.slice(0, 5).forEach((note, index) => {
      const y = top + index * rowHeight;
      this.roundRect(
        panel.x + unit * 1.0,
        y,
        panel.width - unit * 2.0,
        rowHeight - unit * 0.35,
        unit * 0.28
      );
      ctx.fillStyle =
        note.category === "false-gate"
          ? "rgba(94, 55, 32, 0.74)"
          : note.category === "boltwork"
            ? "rgba(20, 67, 65, 0.7)"
            : "rgba(15, 26, 29, 0.9)";
      ctx.fill();
      ctx.strokeStyle =
        note.category === "false-gate"
          ? "rgba(211, 149, 102, 0.7)"
          : "rgba(202, 169, 99, 0.38)";
      ctx.stroke();
      ctx.fillStyle =
        note.category === "false-gate"
          ? "#efc091"
          : note.category === "boltwork"
            ? "#74f2da"
            : "#e8dfc4";
      ctx.font = `700 ${unit * 0.58}px "DM Mono", monospace`;
      ctx.fillText(
        `${note.category.toUpperCase()} / ${note.vaultId.toUpperCase()}`,
        panel.x + unit * 1.7,
        y + unit * 0.95
      );
      ctx.fillStyle = "#c7d3cf";
      ctx.font = `500 ${unit * 0.68}px ${JAPANESE_FONT_STACK}`;
      this.drawWrappedText(
        note.text,
        panel.x + unit * 1.7,
        y + unit * 1.75,
        panel.width - unit * 3.4,
        unit * 0.82,
        layout.compact ? 2 : Number.POSITIVE_INFINITY
      );
    });
    ctx.restore();
  }

  private drawArchiveOverlay(layout: ScreenLayout) {
    const ctx = this.context;
    const unit = canvasUnit(layout.width, layout.height, layout.compact);
    const panel: Rect = {
      x: layout.width * (layout.compact ? 0.04 : 0.11),
      y: layout.height * (layout.compact ? 0.055 : 0.1),
      width: layout.width * (layout.compact ? 0.92 : 0.78),
      height: layout.height * (layout.compact ? 0.89 : 0.8),
    };
    ctx.save();
    ctx.fillStyle = "rgba(1, 5, 7, 0.86)";
    ctx.fillRect(0, 0, layout.width, layout.height);
    this.drawFrame(panel, "rgba(7, 17, 21, 0.98)", "rgba(202, 169, 99, 0.72)");

    ctx.fillStyle = "#e8dfc4";
    ctx.font = `700 ${unit * (layout.compact ? 1.15 : 1.45)}px "DM Mono", monospace`;
    this.drawWrappedText(
      "鑑定帳 / ARCHIVE LEDGER",
      panel.x + unit * 1.45,
      panel.y + unit * 1.8,
      panel.width - unit * 2.8,
      unit * 0.9,
      1
    );
    ctx.fillStyle = "#7c9397";
    ctx.font = `500 ${unit * 0.66}px ${JAPANESE_FONT_STACK}`;
    this.drawWrappedText(
      `解放済み ${this.archive.unlockedCount}/${REWARD_DEFINITIONS.length}  —  観察メモ ${this.observations.count}件  —  保管物の来歴と機構上の痕跡`,
      panel.x + unit * 1.45,
      panel.y + unit * (layout.compact ? 2.75 : 3.12),
      panel.width - unit * 2.8,
      unit * 0.76,
      layout.compact ? 2 : 1
    );
    if (!layout.compact) {
      ctx.fillStyle = "#c9a963";
      ctx.font = `600 ${unit * 0.5}px "DM Mono", monospace`;
      this.drawWrappedText(
        "機構記録 / ケースカバー · 支持枠 · ホイールポスト · 変更式ホイール · 二次拘束 · 保安カラー",
        panel.x + unit * 1.45,
        panel.y + unit * 3.88,
        panel.width - unit * 2.8,
        unit * 0.66,
        1
      );
    }
    const archiveControlTop = panel.y + unit * (layout.compact ? 4.55 : 1.0);
    this.drawControlButton(
      "archive",
      {
        x: panel.x + panel.width - unit * 9.8,
        y: archiveControlTop,
        width: unit * 8.1,
        height: unit * 2.15,
      },
      "閉じる / L",
      "#c9a963"
    );
    this.drawControlButton(
      "notes",
      {
        x: panel.x + panel.width - unit * 18.6,
        y: archiveControlTop,
        width: unit * 7.9,
        height: unit * 2.15,
      },
      "メモ / O",
      "#4de0c0"
    );

    const itemTop = panel.y + unit * (layout.compact ? 6.8 : 5.1);
    const availableHeight = panel.height - unit * (layout.compact ? 7.9 : 6.25);
    if (REWARD_DEFINITIONS.length > 12) {
      const columns = 3;
      const rows = Math.ceil(REWARD_DEFINITIONS.length / columns);
      const gap = unit * 0.5;
      const gridWidth = panel.width - unit * 1.9;
      const cellWidth = (gridWidth - gap * (columns - 1)) / columns;
      const rowHeight = availableHeight / rows;
      REWARD_DEFINITIONS.forEach((reward, index) => {
        const record = this.archive.get(reward.id);
        const column = index % columns;
        const row = Math.floor(index / columns);
        const x = panel.x + unit * 0.95 + column * (cellWidth + gap);
        const y = itemTop + row * rowHeight;
        const unlocked = Boolean(record);
        this.roundRect(x, y, cellWidth, rowHeight - gap, unit * 0.24);
        ctx.fillStyle = unlocked
          ? "rgba(24, 39, 43, 0.94)"
          : "rgba(14, 23, 28, 0.98)";
        ctx.fill();
        ctx.strokeStyle = unlocked
          ? "rgba(202, 169, 99, 0.48)"
          : "rgba(124, 147, 151, 0.2)";
        ctx.lineWidth = Math.max(1, unit * 0.08);
        ctx.stroke();
        if (layout.compact) {
          ctx.fillStyle = unlocked ? "#f1e4bd" : "#8a9492";
          ctx.font = `700 ${unit * 0.4}px "DM Mono", monospace`;
          ctx.fillText(
            `${String(index + 1).padStart(2, "0")} / ${unlocked ? `OPEN ×${record?.unlockCount ?? 1}` : reward.rarity.toUpperCase()}`,
            x + unit * 0.55,
            y + unit * 0.8
          );
          ctx.fillStyle = unlocked ? "#c2d1cd" : "#7c8987";
          ctx.font = `600 ${unit * 0.53}px ${JAPANESE_FONT_STACK}`;
          this.drawWrappedText(
            unlocked ? reward.title : "未解放",
            x + unit * 0.55,
            y + unit * 2.0,
            cellWidth - unit * 1.1,
            unit * 0.72,
            1
          );
        } else {
          ctx.fillStyle = unlocked ? "#f1e4bd" : "#8a9492";
          ctx.font = `700 ${unit * 0.62}px "DM Mono", monospace`;
          ctx.fillText(
            `${String(index + 1).padStart(2, "0")} / ${reward.rarity.toUpperCase()}`,
            x + unit * 0.55,
            y + unit * 0.95
          );
          ctx.fillStyle = unlocked ? "#c2d1cd" : "#7c8987";
          ctx.font = `600 ${unit * 0.7}px ${JAPANESE_FONT_STACK}`;
          ctx.fillText(
            unlocked ? reward.title : "未解放の収蔵品",
            x + unit * 0.55,
            y + unit * 1.8
          );
          ctx.fillStyle = "#7c9397";
          ctx.font = `500 ${unit * 0.5}px ${JAPANESE_FONT_STACK}`;
          this.drawWrappedText(
            unlocked ? `× ${record?.unlockCount ?? 0}` : reward.conditionLabel,
            x + unit * 0.55,
            y + rowHeight - unit * 0.8,
            cellWidth - unit * 1.1,
            unit * 0.66,
            1
          );
        }
      });
      ctx.restore();
      return;
    }
    const itemHeight = availableHeight / REWARD_DEFINITIONS.length;
    REWARD_DEFINITIONS.forEach((reward, index) => {
      const y = itemTop + itemHeight * index;
      const record = this.archive.get(reward.id);
      const active = reward.id === this.mechanism.puzzle.reward.id;
      const unlocked = Boolean(record);
      this.roundRect(
        panel.x + unit * 0.95,
        y,
        panel.width - unit * 1.9,
        itemHeight - unit * 0.58,
        unit * 0.34
      );
      ctx.fillStyle = active
        ? "rgba(20, 72, 67, 0.78)"
        : unlocked
          ? "rgba(24, 39, 43, 0.94)"
          : "rgba(14, 23, 28, 0.98)";
      ctx.fill();
      ctx.strokeStyle = active
        ? "#4de0c0"
        : unlocked
          ? "rgba(202, 169, 99, 0.42)"
          : "rgba(124, 147, 151, 0.2)";
      ctx.lineWidth = Math.max(1, unit * 0.08);
      ctx.stroke();

      const textX = panel.x + unit * 1.8;
      const isTarget = active && !unlocked;
      ctx.fillStyle = unlocked || isTarget ? "#f1e4bd" : "#8a9492";
      ctx.font = `700 ${unit * (layout.compact ? 0.96 : 1.18)}px "DM Mono", monospace`;
      ctx.fillText(
        unlocked
          ? `${reward.catalogNumber}  /  ${reward.title}`
          : isTarget
            ? `現在の収蔵候補 / ${reward.title}`
            : "RESTRICTED COLLECTION / 未解放",
        textX,
        y + unit * 1.58
      );
      ctx.fillStyle = active ? "#74f2da" : unlocked ? "#c2d1cd" : "#7c8987";
      ctx.font = `500 ${unit * (layout.compact ? 0.66 : 0.8)}px ${JAPANESE_FONT_STACK}`;
      if (unlocked) {
        this.drawWrappedText(
          `${reward.material}。${reward.provenance}`,
          textX,
          y + unit * 2.35,
          panel.width - unit * 4.1,
          unit * 0.86
        );
        ctx.fillStyle = "#c9a963";
        ctx.font = `500 ${unit * (layout.compact ? 0.6 : 0.72)}px ${JAPANESE_FONT_STACK}`;
        this.drawWrappedText(
          `観察メモ：${reward.observation}`,
          textX,
          y + itemHeight - unit * 1.0,
          panel.width - unit * 4.1,
          unit * 0.76
        );
      } else if (isTarget) {
        this.drawWrappedText(
          `収蔵物：${reward.description}`,
          textX,
          y + unit * 2.62,
          panel.width - unit * 4.1,
          unit * 1.02
        );
        ctx.fillStyle = "#c9a963";
        ctx.font = `600 ${unit * (layout.compact ? 0.6 : 0.74)}px ${JAPANESE_FONT_STACK}`;
        ctx.fillText(
          "この金庫を開錠すると、来歴と観察メモが解放されます。",
          textX,
          y + itemHeight - unit * 1.1
        );
      } else {
        ctx.fillText(
          "この保管物は未解放です。対応する金庫を開錠してください。",
          textX,
          y + unit * 2.6
        );
      }
      if (record) {
        ctx.fillStyle = "#7c9397";
        ctx.font = `500 ${unit * 0.48}px "DM Mono", monospace`;
        ctx.textAlign = "right";
        ctx.fillText(
          `解放済み × ${record.unlockCount}`,
          panel.x + panel.width - unit * 1.8,
          y + unit * 1.35
        );
        ctx.textAlign = "left";
      }
    });
    ctx.restore();
  }

  private setHitbox(action: string, rect: Rect) {
    this.hitboxes.set(action, expandHitbox(rect));
  }

  private drawControlButton(
    action: string,
    rect: Rect,
    label: string,
    accent = "#7e9b98"
  ) {
    const ctx = this.context;
    const resolution = this.getCanvasResolution();
    const unit = canvasUnit(
      resolution.width,
      resolution.height,
      resolution.width / resolution.height < 1.12
    );
    this.setHitbox(action, rect);
    this.roundRect(rect.x, rect.y, rect.width, rect.height, unit * 0.35);
    ctx.fillStyle = "rgba(8, 15, 19, 0.88)";
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(1, unit * 0.1);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.font = `700 ${unit * 0.7}px "DM Mono", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      label,
      rect.x + rect.width / 2,
      rect.y + rect.height / 2 + unit * 0.03
    );
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  private getGuideText(): string {
    if (!this.tutorialVisible) return "OFF";
    if (this.mechanism.opened)
      return `発見 / ${this.mechanism.puzzle.reward.title}`;
    if (this.isBlindMode)
      return this.audio.isMuted || this.blindAssist
        ? "Vキーで画面の合図を表示"
        : "待機・縁・拾い上げの音を聞く";
    if (this.mechanism.phase === "dial")
      return this.mechanism.stage === 0
        ? "最初のホイールを観察"
        : "選択中のゲートを追う";
    if (this.mechanism.phase === "settling") return "止めて反応を観察";
    if (
      this.mechanism.phase === "tension-ready" ||
      this.mechanism.phase === "tension-test"
    )
      return "抵抗帯の中で保持";
    if (this.mechanism.phase === "fence-ready") return "ゆっくりフェンスを着座";
    if (
      this.mechanism.phase === "fence-seated" ||
      this.mechanism.phase === "bolt-test"
    )
      return "ボルトの退避量を確認";
    if (this.mechanism.phase === "jammed") return "力を抜いて状態を見直す";
    return "リセットして金庫を再準備";
  }

  private get isBlindMode() {
    return this.mechanism.puzzle.difficulty.blindMode;
  }

  private setBlindSignal(signal: NonNullable<VaultWorld["blindSignal"]>) {
    if (!this.isBlindMode) return;
    this.blindSignal = signal;
    this.blindSignalUntil = performance.now() + (this.reducedMotion ? 0 : 420);
    if (this.blindAssist || this.audio.isMuted)
      this.onStatusChange?.(`ブラインド補助: ${signal}`);
  }

  private drawBlindOverlay(layout: ScreenLayout) {
    const ctx = this.context;
    const unit = canvasUnit(layout.width, layout.height, layout.compact);
    const { width, height } = layout;
    ctx.save();
    ctx.fillStyle = "rgba(1, 3, 5, 0.986)";
    ctx.fillRect(0, 0, width, height);

    const showAssist =
      this.blindAssist || this.audio.isMuted || this.highContrast;
    if (this.mechanism.opened) {
      ctx.fillStyle = "#4de0c0";
      ctx.font = `700 ${unit * 1.1}px "DM Mono", monospace`;
      ctx.textAlign = "center";
      ctx.fillText("ロックボルト退避済み", width / 2, height / 2);
    } else if (showAssist) {
      const current =
        performance.now() <= this.blindSignalUntil
          ? (this.blindSignal ?? "LISTEN")
          : "LISTEN";
      const symbol =
        current === "IDLE"
          ? "·"
          : current === "EDGE"
            ? "|"
            : current === "PICKUP"
              ? "||"
              : current === "LATCH"
                ? "⌁"
                : current === "TENSION"
                  ? "≈"
                  : current === "SEAT"
                    ? "▼"
                    : current === "JAM"
                      ? "×"
                      : "•";
      ctx.fillStyle = current === "JAM" ? "#d39566" : "#d9c28a";
      ctx.font = `700 ${unit * 3.2}px "DM Mono", monospace`;
      ctx.textAlign = "center";
      ctx.fillText(symbol, width / 2, height * 0.47);
      ctx.fillStyle = "#7e9b98";
      ctx.font = `600 ${unit * 0.56}px "DM Mono", monospace`;
      ctx.fillText(
        `ブラインド補助 / ${current}   V / 表示   S / 音`,
        width / 2,
        height * 0.59
      );
    } else {
      ctx.fillStyle = "rgba(217, 194, 138, 0.16)";
      ctx.font = `600 ${unit * 0.5}px "DM Mono", monospace`;
      ctx.textAlign = "center";
      ctx.fillText("ブラインド / 音を聞く", width / 2, height * 0.92);
    }
    ctx.textAlign = "left";
    ctx.restore();
  }

  private formatElapsed(elapsed: number): string {
    const seconds = Number.isFinite(elapsed)
      ? Math.max(0, Math.floor(elapsed))
      : 0;
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }

  private registerFaultTelemetry(previousFaults: number, playCue = true) {
    const newFaults = this.mechanism.faultCount - previousFaults;
    if (newFaults <= 0) return;
    if (playCue) this.audio.safetyFault();
    this.telemetry.faults += newFaults;
    this.runSession?.recordFault(newFaults);
    this.persistTelemetry();
  }

  private restoreTelemetry() {
    try {
      const stored = window.localStorage.getItem("vault-tumbler-lab-metrics");
      if (!stored) return;
      const parsed = JSON.parse(stored) as Partial<typeof this.telemetry>;
      const safeCount = (value: unknown) =>
        typeof value === "number" && Number.isSafeInteger(value) && value >= 0
          ? value
          : 0;
      const safeElapsed = (value: unknown) =>
        typeof value === "number" && Number.isFinite(value) && value >= 0
          ? Math.min(MAX_RUN_TIME_SECONDS, value)
          : 0;
      this.telemetry = {
        contracts: safeCount(parsed.contracts),
        completions: safeCount(parsed.completions),
        resets: safeCount(parsed.resets),
        faults: safeCount(parsed.faults),
        lastElapsed: safeElapsed(parsed.lastElapsed),
      };
    } catch {
      // 計測不能な環境でもゲーム本体は継続する。
    }
  }

  private persistTelemetry() {
    try {
      window.localStorage.setItem(
        "vault-tumbler-lab-metrics",
        JSON.stringify(this.telemetry)
      );
    } catch {
      // 保存拒否・容量超過でもプレイ体験を阻害しない。
    }
  }

  private drawFrame(rect: Rect, fill: string, stroke: string) {
    const ctx = this.context;
    const resolution = this.getCanvasResolution();
    const unit = canvasUnit(
      resolution.width,
      resolution.height,
      resolution.width / resolution.height < 1.12
    );
    this.roundRect(rect.x, rect.y, rect.width, rect.height, unit * 0.55);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1, unit * 0.1);
    ctx.stroke();
    ctx.fillStyle = "#ad8d4e";
    for (const [x, y] of [
      [rect.x + unit * 0.65, rect.y + unit * 0.65],
      [rect.x + rect.width - unit * 0.65, rect.y + unit * 0.65],
      [rect.x + unit * 0.65, rect.y + rect.height - unit * 0.65],
      [rect.x + rect.width - unit * 0.65, rect.y + rect.height - unit * 0.65],
    ]) {
      ctx.beginPath();
      ctx.arc(x, y, unit * 0.14, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawMetalCircle(
    x: number,
    y: number,
    radius: number,
    light: string,
    dark: string
  ) {
    const ctx = this.context;
    const gradient = ctx.createRadialGradient(
      x - radius * 0.26,
      y - radius * 0.31,
      radius * 0.08,
      x,
      y,
      radius
    );
    gradient.addColorStop(0, light);
    gradient.addColorStop(0.64, dark);
    gradient.addColorStop(1, "#04070a");
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = "rgba(228, 201, 132, 0.42)";
    ctx.lineWidth = Math.max(1, radius * 0.018);
    ctx.stroke();
  }

  private drawWrappedText(
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number,
    maxLines = Number.POSITIVE_INFINITY
  ) {
    const ctx = this.context;
    const lineLimit = Math.max(1, Math.floor(maxLines));
    let current = "";
    let line = 0;
    let truncated = false;
    for (const character of Array.from(text)) {
      const next = current + character;
      if (ctx.measureText(next).width > maxWidth && current) {
        if (line >= lineLimit - 1) {
          truncated = true;
          break;
        }
        ctx.fillText(current, x, y + line * lineHeight);
        line += 1;
        current = character;
      } else {
        current = next;
      }
    }
    if (!current || line >= lineLimit) return;
    let output = current;
    if (truncated) {
      const ellipsis = "…";
      output = `${output}${ellipsis}`;
      while (output.length > 1 && ctx.measureText(output).width > maxWidth) {
        output = `${Array.from(output).slice(0, -2).join("")}${ellipsis}`;
      }
    }
    ctx.fillText(output, x, y + line * lineHeight);
  }

  private roundRect(
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ) {
    this.context.beginPath();
    this.context.roundRect(
      x,
      y,
      width,
      height,
      clamp(radius, 0, Math.min(width, height) / 2)
    );
  }

  private loadImage(key: string, source: string) {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      if (this.isDrawableImage(image)) this.images[key] = image;
    };
    image.onerror = () => {
      console.warn(`Asset unavailable: ${key}`);
    };
    image.src = source;
  }

  private isDrawableImage(
    image: HTMLImageElement | undefined
  ): image is HTMLImageElement {
    return Boolean(
      image &&
        image.complete &&
        image.naturalWidth > 0 &&
        image.naturalHeight > 0
    );
  }
}
