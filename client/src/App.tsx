import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import GameCanvas from "./components/GameCanvas";
import type { GameHandle } from "./game/scene";
import type { GameSnapshot } from "./game/VaultWorld";
import { AUDIO_SAMPLE_DEFINITIONS, type AudioSampleId } from "./game/AudioFeedback";
import {
  chooseOfficialProblem,
  createOfficialPuzzle,
  createTrainingPuzzle,
  REWARD_DEFINITIONS,
  type PuzzleDefinition,
} from "./game/GameDefinitions";
import { ProgressStore, normalizePlayerName } from "./game/ProgressStore";
import { RankingClient, type RankingRow } from "./game/RankingClient";
import { isCoherentLockMechanismSnapshot } from "./game/LockMechanism";
import type { RunCheckpoint } from "./game/RunSession";
import { isCompleteRunTrace } from "./game/RunTrace";

type Screen = "title" | "tutorial" | "training" | "play" | "pause" | "result" | "ranking" | "archive" | "settings" | "sound-lab" | "help";
type RunMode = "official" | "training" | "demo" | "retired";

const formatTime = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  return String(Math.floor(safe / 60)).padStart(2, "0") + ":" + String(safe % 60).padStart(2, "0");
};

const phaseLabel = (phase: string) => {
  const labels: Record<string, string> = {
    dial: "ダイヤル観察",
    settling: "停止後の反応を観察",
    "tension-ready": "テンション待機",
    "tension-test": "抵抗を保持",
    "fence-ready": "フェンス確認",
    "fence-seated": "フェンス着座",
    "bolt-test": "ロックボルト確認",
    "boltwork-ready": "扉ボルト準備",
    "handle-test": "扉ハンドル",
    jammed: "噛み込みから復帰",
    lockout: "安全停止",
    open: "開扉",
  };
  return labels[phase] ?? phase;
};

const rarityLabel: Record<string, string> = {
  standard: "通常品",
  rare: "希少品",
  special: "特別品",
};

const tutorialCards = [
  { title: "訓練1：ダイヤル", text: "ダイヤルを右または左へ回し、指定位置で止めます。まずは一輪だけを動かします。" },
  { title: "訓練2：接触判別", text: "空転、ゲート縁、偽ゲート、正規ゲートの違いを、音・反発・画面の変化から比べます。" },
  { title: "訓練3：後半機構", text: "ホイールは整列済みです。テンション、フェンス、ロックボルト、扉ハンドルを順に操作します。" },
  { title: "訓練4：短い完全開錠", text: "三輪の金庫を最初から最後まで操作します。ここから通常ゲームへ進みます。" },
] as const;

function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "secondary" | "danger" }) {
  const tone = props.tone ?? "secondary";
  const className = ["akerun-button", "akerun-button-" + tone, props.className ?? ""].join(" ");
  return <button {...props} className={className} />;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="akerun-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function App() {
  const store = useMemo(() => new ProgressStore(), []);
  const rankingClient = useMemo(() => new RankingClient(), []);
  const [handle, setHandle] = useState<GameHandle | null>(null);
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [screen, setScreen] = useState<Screen>("title");
  const [returnScreen, setReturnScreen] = useState<Screen>("title");
  const [mode, setMode] = useState<RunMode>("official");
  const [playerName, setPlayerName] = useState(() => store.getPlayerName());
  const [nameError, setNameError] = useState("");
  const [problem, setProblem] = useState<PuzzleDefinition | null>(null);
  const [rankingRunToken, setRankingRunToken] = useState<string | null>(null);
  const [startingOfficial, setStartingOfficial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(1);
  const [submitStatus, setSubmitStatus] = useState("未送信");
  const [retryAvailable, setRetryAvailable] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [rankingRows, setRankingRows] = useState<RankingRow[]>([]);
  const [rankingStatus, setRankingStatus] = useState("まだ読み込んでいません。");
  const [settings, setSettings] = useState({
    contrast: false,
    motion: false,
    precision: false,
  });
  const submittedKeyRef = useRef("");
  const submittingKeyRef = useRef("");
  const startingOfficialRef = useRef(false);
  const retryingPendingRef = useRef(false);
  const gameHandleRef = useRef<GameHandle | null>(null);
  const activeRunContextRef = useRef<{ playerName: string; rankingRunToken: string | null } | null>(null);
  const lastCheckpointSavedAtRef = useRef(0);
  const pendingAbandonmentRequestsRef = useRef(new Map<string, Promise<boolean>>());

  const requestOfficialRunAbandonment = useCallback((runToken: string | null | undefined) => {
    if (!runToken) return Promise.resolve(false);
    const token = String(runToken);
    store.enqueueRunAbandonment(token);
    const existing = pendingAbandonmentRequestsRef.current.get(token);
    if (existing) return existing;
    const request = rankingClient.abandonOfficialRun(token)
      .then((abandoned) => {
        if (abandoned) store.removeRunAbandonment(token);
        return abandoned;
      })
      .finally(() => {
        pendingAbandonmentRequestsRef.current.delete(token);
      });
    pendingAbandonmentRequestsRef.current.set(token, request);
    return request;
  }, [rankingClient, store]);

  const flushPendingRunAbandonments = useCallback(async () => {
    const pending = store.getPendingRunAbandonments();
    await Promise.all(pending.map((item) => requestOfficialRunAbandonment(item.runToken)));
  }, [requestOfficialRunAbandonment, store]);

  const onReady = useCallback((nextHandle: GameHandle | null) => {
    gameHandleRef.current = nextHandle;
    setHandle(nextHandle);
    if (nextHandle) setSnapshot(nextHandle.getSnapshot());
  }, []);

  const saveActiveCheckpointNow = useCallback(() => {
    const activeRun = activeRunContextRef.current;
    const currentHandle = gameHandleRef.current;
    if (!activeRun || !currentHandle) return false;
    const currentSnapshot = currentHandle.getSnapshot();
    if (currentSnapshot.status !== "active" && currentSnapshot.status !== "paused") return false;
    const checkpoint = currentHandle.getCheckpoint();
    if (!checkpoint) return false;
    store.saveActiveRun(
      currentSnapshot.problemId,
      currentSnapshot.problemVersion,
      activeRun.playerName,
      activeRun.rankingRunToken,
      checkpoint,
    );
    lastCheckpointSavedAtRef.current = performance.now();
    return true;
  }, [store]);

  useEffect(() => {
    void flushPendingRunAbandonments();
  }, [flushPendingRunAbandonments]);

  const onSnapshot = useCallback((nextSnapshot: GameSnapshot) => {
    setSnapshot(nextSnapshot);
    const activeRun = activeRunContextRef.current;
    if (activeRun && nextSnapshot.status === "opened" && nextSnapshot.recordable) {
      // 開錠は結果画面への遷移より先に確定させる。iPhoneでこの瞬間に
      // Safariが終了しても、同じ公式実行を未完了として再利用させない。
      if (nextSnapshot.runResult) {
        store.persistOfficialCompletion(activeRun.playerName, nextSnapshot.runResult, activeRun.rankingRunToken);
      } else {
        store.clearActiveRun();
      }
      activeRunContextRef.current = null;
      lastCheckpointSavedAtRef.current = 0;
    }
    if (activeRun && (nextSnapshot.status === "active" || nextSnapshot.status === "paused")) {
      const checkpoint = gameHandleRef.current?.getCheckpoint();
      const now = performance.now();
      if (checkpoint && (lastCheckpointSavedAtRef.current === 0 || now - lastCheckpointSavedAtRef.current >= 250)) {
        store.saveActiveRun(
          nextSnapshot.problemId,
          nextSnapshot.problemVersion,
          activeRun.playerName,
          activeRun.rankingRunToken,
          checkpoint,
        );
        lastCheckpointSavedAtRef.current = now;
      }
    }
    if (mode === "official" && nextSnapshot.status === "retired" && screen !== "result") {
      // リタイアと公式RESETは同じ後始末を通り、通信断でもトークンを
      // 端末内の破棄待ちキューへ残して次回起動時に再送する。
      requestOfficialRunAbandonment(activeRun?.rankingRunToken);
      activeRunContextRef.current = null;
      lastCheckpointSavedAtRef.current = 0;
      store.clearActiveRun();
      setRankingRunToken(null);
      setMode("retired");
      setScreen("result");
    }
  }, [mode, requestOfficialRunAbandonment, screen, store]);

  const onVisibilityPause = useCallback(() => {
    // 開錠演出中は機構がすでに停止している。ここでPAUSEへ遷移すると、
    // 結果画面へ進める900msの演出タイマーをキャンセルしてしまう。
    if (gameHandleRef.current?.getSnapshot().opened) return;
    saveActiveCheckpointNow();
    if (screen === "play" || screen === "training") setScreen("pause");
  }, [saveActiveCheckpointNow, screen]);

  const abandonUnclaimedOfficialRun = (runToken: string | null | undefined) => {
    if (!runToken) return;
    // 開始確認に失敗した実行は、端末内プレイへ移る前にサーバー側でも
    // 競技用トークンを破棄する。通信断時は破棄待ちキューへ残す。
    void requestOfficialRunAbandonment(runToken);
  };

  useEffect(() => {
    if (!snapshot?.opened || (screen !== "play" && screen !== "training")) return;
    const timer = window.setTimeout(() => {
      if (mode === "training") {
        if (tutorialStep >= 4) {
          store.markTrainingComplete();
          setTutorialStep(5);
        } else {
          setTutorialStep((current) => current + 1);
        }
        setScreen("tutorial");
      } else {
        if (mode === "official") {
          store.clearActiveRun();
          activeRunContextRef.current = null;
          lastCheckpointSavedAtRef.current = 0;
        }
        setScreen("result");
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [mode, screen, snapshot?.opened, store, tutorialStep]);

  useEffect(() => {
    const result = snapshot?.runResult;
    if (screen !== "result" || mode !== "official" || !snapshot?.recordable || !result) return;
    const resultKey = result.problemId + "@" + result.problemVersion + ":" + String(result.score) + ":" + String(result.elapsedTime);
    if (!rankingRunToken) {
      const localKey = "local:" + resultKey;
      if (submittedKeyRef.current === localKey) return;
      store.recordBest(result);
      submittedKeyRef.current = localKey;
      setSubmitStatus("ランキング受付を確認できませんでした。結果は端末内へ保存しました。");
      return;
    }
    const key = rankingRunToken + ":" + resultKey;
    if (submittedKeyRef.current === key || submittingKeyRef.current === key) return;

    // 結果確定時に自己ベストを先に保存し、通信状態と切り離す。
    store.recordBest(result);
    setRetryAvailable(false);
    submittedKeyRef.current = key;
    submittingKeyRef.current = key;
    setSubmitStatus("送信中…");
    void rankingClient.submit(playerName, result, rankingRunToken)
      .then(() => {
        setRetryAvailable(false);
        setSubmitStatus("ランキングへ送信しました。");
        store.removePendingForResult(result, rankingRunToken);
      })
      .catch(() => {
        // 失敗時はsubmittedKeyを残し、自動再送ループを防ぐ。
        // 再送ボタンがretryNonceを進め、明示的にもう一度実行する。
        setRetryAvailable(true);
        store.enqueueRanking(playerName, result, rankingRunToken);
        setSubmitStatus("送信に失敗しました。結果画面の再送ボタンを押してください。");
      })
      .finally(() => {
        if (submittingKeyRef.current === key) submittingKeyRef.current = "";
      });
  }, [mode, playerName, rankingClient, rankingRunToken, retryNonce, screen, snapshot, store]);

  const validateName = () => {
    const normalized = normalizePlayerName(playerName);
    if (!normalized) {
      setNameError("プレイヤー名を入力してください。");
      return null;
    }
    setNameError("");
    const saved = store.savePlayerName(normalized);
    setPlayerName(saved);
    return saved;
  };

  const startOfficial = async (requestedProblemId?: string, replayRunToken?: string | null) => {
    if (!store.trainingComplete) {
      setTutorialStep(1);
      setScreen("tutorial");
      return;
    }
    if (startingOfficial || startingOfficialRef.current) return;
    const interruptedRun = requestedProblemId ? null : store.getActiveRun();
    const savedName = interruptedRun?.playerName ? store.savePlayerName(interruptedRun.playerName) : validateName();
    if (!savedName || !handle) return;
    startingOfficialRef.current = true;
    setStartingOfficial(true);
    setSubmitStatus("問題を準備中…");
    try {
      // 前回の通信断で残った破棄要求を先に再送し、同じ名前の
      // active run 上限を不要に消費しない。
      await flushPendingRunAbandonments();
      setPlayerName(savedName);
      let chosen: PuzzleDefinition | null = null;
      let nextRankingRunToken: string | null = null;
      let resumeCheckpoint: RunCheckpoint | undefined;
      let rankingFallbackStatus = "ランキング受付なし。プレイ結果は端末内へ保存します。";

      if (interruptedRun?.checkpoint) {
        try {
          const candidate = createOfficialPuzzle(interruptedRun.problemId);
          const structurallyCompatible = candidate.problemVersion === interruptedRun.problemVersion
            && isCoherentLockMechanismSnapshot(interruptedRun.checkpoint.mechanism, candidate)
            && interruptedRun.checkpoint.mechanism.tumblerValues.length === candidate.vault.wheelCount
            && interruptedRun.checkpoint.mechanism.locked.length === candidate.stages.length;
          // A server-issued run can only resume when its complete trace is
          // present. Old token checkpoints are abandoned instead of being
          // allowed to finish without replay evidence.
          const traceReady = isCompleteRunTrace(interruptedRun.checkpoint.session.operationTrace);
          const compatible = structurallyCompatible
            && (!interruptedRun.rankingRunToken || traceReady);
          if (compatible) {
            if (interruptedRun.rankingRunToken) {
              const begun = await rankingClient.beginOfficialRun(interruptedRun.rankingRunToken);
              if (begun.status === "ok"
                && begun.problemId === interruptedRun.problemId
                && begun.problemVersion === interruptedRun.problemVersion) {
                chosen = candidate;
                nextRankingRunToken = interruptedRun.rankingRunToken;
                resumeCheckpoint = interruptedRun.checkpoint;
              } else {
                // サーバーへ再接続できない復帰は、計測を守るため端末内プレイへ落とす。
                abandonUnclaimedOfficialRun(interruptedRun.rankingRunToken);
                rankingFallbackStatus = "ランキング実行の再開確認に失敗しました。結果は端末内へ保存します。";
                chosen = candidate;
                resumeCheckpoint = interruptedRun.checkpoint;
              }
            } else {
              chosen = candidate;
              resumeCheckpoint = interruptedRun.checkpoint;
            }
          }
        } catch {
          // 復元できない古い問題は、新規の公式問題へ進める。
        }
      }

      // 壊れたチェックポイントや旧形式の保存値で新規問題へ切り替える
      // 場合も、前の既知トークンを競技用の未消費実行として残さない。
      if (!chosen && interruptedRun?.rankingRunToken) {
        abandonUnclaimedOfficialRun(interruptedRun.rankingRunToken);
      }

      if (!chosen) {
        // チェックポイントなしの古い保存データや期限切れトークンは再利用しない。
        resumeCheckpoint = undefined;
        const preparation = await rankingClient.prepareOfficialRun(
          savedName,
          requestedProblemId,
          replayRunToken,
        );
        if (preparation.status === "disabled") {
          rankingFallbackStatus = "ランキングは現在停止中です。結果は端末内へ保存します。";
        } else if (preparation.status === "error") {
          rankingFallbackStatus = "ランキングの開始確認に失敗しました。結果は端末内へ保存します。";
        }
        if (preparation.status === "ok" && preparation.runToken) {
          const begun = await rankingClient.beginOfficialRun(preparation.runToken);
          if (begun.status === "ok" && begun.problemId && begun.problemVersion) {
            try {
              const candidate = createOfficialPuzzle(begun.problemId);
              if (candidate.problemVersion === begun.problemVersion) {
                chosen = candidate;
                nextRankingRunToken = preparation.runToken;
              }
            } catch {
              // 公式カタログにない問題は採用しない。
            }
          }
          if (!chosen) {
            abandonUnclaimedOfficialRun(preparation.runToken);
            rankingFallbackStatus = "ランキング問題の確認に失敗しました。結果は端末内へ保存します。";
          }
        }
      }

      if (!chosen) {
        if (requestedProblemId) {
          try {
            chosen = createOfficialPuzzle(requestedProblemId);
          } catch {
            chosen = null;
          }
        }
        chosen ??= chooseOfficialProblem();
        nextRankingRunToken = null;
        resumeCheckpoint = undefined;
      }

      const problemId = chosen.problemId ?? chosen.id;
      const problemVersion = chosen.problemVersion ?? "V1";
      store.saveActiveRun(problemId, problemVersion, savedName, nextRankingRunToken, resumeCheckpoint);
      activeRunContextRef.current = { playerName: savedName, rankingRunToken: nextRankingRunToken };
      lastCheckpointSavedAtRef.current = 0;
      setRankingRunToken(nextRankingRunToken);
      setProblem(chosen);
      setMode("official");
      setSubmitStatus(nextRankingRunToken ? "未送信" : rankingFallbackStatus);
      setRetryAvailable(false);
      submittedKeyRef.current = "";
      setRetryNonce(0);
      handle.startPuzzle(chosen, resumeCheckpoint ? { resume: resumeCheckpoint } : undefined);
      setSnapshot(handle.getSnapshot());
      setScreen("play");
    } finally {
      startingOfficialRef.current = false;
      setStartingOfficial(false);
    }
  };

  const startTraining = () => {
    if (!handle) return;
    activeRunContextRef.current = null;
    lastCheckpointSavedAtRef.current = 0;
    const step = Math.max(1, Math.min(4, tutorialStep)) as 1 | 2 | 3 | 4;
    const trainingPuzzle = createTrainingPuzzle(step);
    setProblem(trainingPuzzle);
    setRankingRunToken(null);
    setMode("training");
    handle.startPuzzle(trainingPuzzle, { training: true, postDial: step === 3 });
    setSnapshot(handle.getSnapshot());
    setScreen("training");
  };

  const startDemo = () => {
    if (!handle) return;
    activeRunContextRef.current = null;
    lastCheckpointSavedAtRef.current = 0;
    setMode("demo");
    setRankingRunToken(null);
    handle.startDemo();
    setSnapshot(handle.getSnapshot());
    setScreen("play");
  };

  const startSameProblem = () => {
    if (problem) void startOfficial(problem.problemId ?? problem.id, rankingRunToken);
  };

  const startDifferentProblem = () => {
    void startOfficial();
  };

  const pause = () => {
    handle?.setPaused(true);
    setScreen("pause");
  };

  const resume = () => {
    handle?.setPaused(false);
    setScreen(mode === "training" ? "training" : "play");
  };

  const retire = () => {
    if (mode === "official") {
      requestOfficialRunAbandonment(activeRunContextRef.current?.rankingRunToken);
    }
    handle?.retire();
    store.clearActiveRun();
    activeRunContextRef.current = null;
    lastCheckpointSavedAtRef.current = 0;
    setRankingRunToken(null);
    if (handle) setSnapshot(handle.getSnapshot());
    setMode("retired");
    setScreen("result");
  };

  const openOverlay = (next: Screen) => {
    setReturnScreen(screen);
    if (screen === "play" || screen === "training") handle?.setPaused(true);
    setScreen(next);
  };

  const closeOverlay = () => {
    if (returnScreen === "play" || returnScreen === "training") handle?.setPaused(false);
    setScreen(returnScreen);
  };

  const toggleSetting = (key: "contrast" | "motion" | "precision", action: string) => {
    handle?.performAction(action);
    setSettings((current) => ({ ...current, [key]: !current[key] }));
  };

  const previewAudio = (sampleId: AudioSampleId) => {
    handle?.performAction("audio-preview:" + sampleId);
  };

  const shareResult = async () => {
    if (!snapshot) return;
    const text = "Vault Tumbler Lab " + snapshot.problemId
      + " / " + String(snapshot.score) + "点 / " + formatTime(snapshot.elapsedTime)
      + " / " + window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Vault Tumbler Lab", text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setSubmitStatus("共有文をコピーしました。");
    } catch {
      setSubmitStatus("共有をキャンセルしました。");
    }
  };

  const loadRanking = async () => {
    setRankingStatus("読み込み中…");
    try {
      const rows = await rankingClient.getBestScores(10);
      setRankingRows(rows);
      setRankingStatus(rows.length ? "公式ランキング" : "まだ記録がありません。");
    } catch {
      setRankingRows([]);
      setRankingStatus("ランキングを読み込めませんでした。設定と通信を確認してください。");
    }
  };

  const openRanking = () => {
    openOverlay("ranking");
    void loadRanking();
  };

  const retryPending = async () => {
    if (retryingPendingRef.current) return;
    retryingPendingRef.current = true;
    const pending = store.getPendingRankings();
    if (!pending.length) {
      setSubmitStatus("再送する記録はありません。");
      retryingPendingRef.current = false;
      return;
    }
    try {
      setSubmitStatus("未送信記録を送信中…");
      let sent = 0;
      let unavailable = 0;
      for (const item of pending) {
        if (!item.rankingRunToken) {
          unavailable += 1;
          continue;
        }
        try {
          await rankingClient.submit(item.playerName, item.result, item.rankingRunToken);
          store.removePending(item.id);
          store.recordBest(item.result);
          sent += 1;
        } catch {
          // 残った記録は次回の再送対象として維持する。
        }
      }
      setSubmitStatus(unavailable
        ? `${sent}/${pending.length}件を送信しました。旧形式の${unavailable}件は再送契約がなく、同じ問題を再プレイしてください。`
        : sent === pending.length ? "未送信記録をすべて送信しました。" : `${sent}/${pending.length}件を送信しました。`);
    } finally {
      retryingPendingRef.current = false;
    }
  };

  const archiveIds = store.getArchiveIds();
  const pendingCount = store.getPendingRankings().length;
  const activeRun = store.getActiveRun();
  const best = snapshot?.runResult
    ? store.getBest(snapshot.runResult.problemId, snapshot.runResult.problemVersion)
    : null;
  const shellClass = [
    "akerun-shell",
    settings.contrast ? "akerun-high-contrast" : "",
    settings.motion ? "akerun-low-motion" : "",
  ].join(" ");

  const renderTitle = () => (
    <div className="akerun-screen akerun-title-screen">
      <div className="akerun-title-card">
        <p className="akerun-kicker">VAULT TUMBLER LAB / AKERUN</p>
        <h1>金庫を、観察で開ける。</h1>
        <p className="akerun-lead">音や反応を確かめながら、金庫の内部機構を読み解きます。毎回20問から一問が固定され、速さと正確さを競います。</p>
        <label className="akerun-field">
          <span>プレイヤー名（ランキング登録名）</span>
          <input
            value={playerName}
            maxLength={16}
            onChange={(event) => {
              setPlayerName(event.target.value);
              setNameError("");
            }}
            placeholder="名前を入力"
            autoComplete="nickname"
          />
        </label>
        {nameError ? <p className="akerun-error">{nameError}</p> : null}
        {activeRun ? <p className="akerun-small">
          {activeRun.checkpoint
            ? `前回の ${activeRun.problemId} は中断されています。保存済みの状態から再開します。`
            : `前回の ${activeRun.problemId} は旧形式の中断記録です。新しい問題を準備します。`}
        </p> : null}
        <div className="akerun-title-actions">
          <Button tone="primary" onClick={() => void startOfficial()} disabled={!handle || startingOfficial}>{startingOfficial ? "問題を準備中…" : "ゲーム開始"}</Button>
          <Button onClick={() => { setTutorialStep(1); setScreen("tutorial"); }}>初めて遊ぶ</Button>
          <Button onClick={startDemo} disabled={!handle}>お手本を見る</Button>
        </div>
        {pendingCount ? (
          <div className="akerun-pending-box">
            <p>未送信のランキング記録が {pendingCount} 件あります。</p>
            <p className="akerun-submit-status">{submitStatus}</p>
            <Button onClick={() => void retryPending()}>記録を再送する</Button>
          </div>
        ) : null}
        <div className="akerun-link-row">
          <Button onClick={openRanking}>ランキング</Button>
          <Button onClick={() => setScreen("archive")}>収蔵品</Button>
          <Button onClick={() => setScreen("settings")}>設定</Button>
          <Button onClick={() => { setReturnScreen("title"); setScreen("sound-lab"); }}>音の試験室</Button>
          <Button onClick={() => setScreen("help")}>遊び方</Button>
        </div>
        <p className="akerun-footnote">{store.trainingComplete ? "訓練完了済み。いつでも通常ゲームを開始できます。" : "初回は4段階の短い訓練から始めると理解しやすくなります。"}</p>
      </div>
    </div>
  );

  const renderTutorial = () => {
    const card = tutorialCards[Math.min(tutorialStep, 4) - 1];
    const finished = tutorialStep > 4;
    return (
      <div className="akerun-training-layer">
        <div className="akerun-training-card">
          <p className="akerun-kicker">FIRST ACCESS / TRAINING</p>
          {finished ? (
            <>
              <h2>訓練が終わりました。</h2>
              <p>回す、反応を見る、判断を直す。この流れを使って、20問の通常ゲームへ進めます。</p>
              <Button tone="primary" onClick={() => void startOfficial()} disabled={startingOfficial}>{startingOfficial ? "問題を準備中…" : "通常ゲームへ"}</Button>
              <Button onClick={() => setScreen("title")}>タイトルへ戻る</Button>
            </>
          ) : (
            <>
              <p className="akerun-step">STEP {tutorialStep} / 4</p>
              <h2>{card.title}</h2>
              <p>{card.text}</p>
              <Button tone="primary" onClick={startTraining} disabled={!handle}>この訓練を始める</Button>
              <Button onClick={() => setScreen("title")}>あとで遊ぶ</Button>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderTraining = () => {
    const card = tutorialCards[tutorialStep - 1];
    return (
      <div className="akerun-training-layer">
        <div className="akerun-training-card akerun-training-active">
          <p className="akerun-kicker">TRAINING / STEP {tutorialStep}</p>
          <h2>{card.title}</h2>
          <p>{card.text}</p>
          <p className="akerun-small">Canvas上のダイヤルと操作部品を指で操作してください。訓練中の記録はランキングへ送信しません。</p>
          <Button tone="danger" onClick={() => { handle?.retire(); setMode("retired"); setScreen("title"); }}>訓練を中止</Button>
        </div>
      </div>
    );
  };

  const renderPlayHud = () => (
    <div className="akerun-play-layer">
      <div className="akerun-hud">
        <div>
          <p className="akerun-kicker">{mode === "demo" ? "EXAMPLE / お手本" : problem?.problemId ?? "問題準備中"}</p>
          <h2>{snapshot?.vaultTitle ?? "金庫"}</h2>
        </div>
        <div className="akerun-hud-actions">
          <Button onClick={() => openOverlay("settings")}>設定</Button>
          <Button onClick={pause}>一時停止</Button>
        </div>
      </div>
      <div className="akerun-live-panel" aria-live="polite">
        <div className="akerun-live-stats">
          <Stat label="時間" value={formatTime(snapshot?.elapsedTime ?? 0)} />
          <Stat label="失敗" value={snapshot?.faultCount ?? 0} />
          <Stat label="目安スコア" value={snapshot?.score ?? 0} />
          <Stat label="段階" value={String(snapshot?.stage ?? 0) + "/" + String(snapshot?.stageCount ?? 0)} />
        </div>
        <p><strong>次の操作：</strong>{phaseLabel(snapshot?.phase ?? "dial")}</p>
        <p>{snapshot?.message ?? "反応を観察してください。"}</p>
      </div>
      <nav className="akerun-mobile-menu" aria-label="プレイ中メニュー">
        <Button onClick={() => handle?.performAction("notes")}>観察メモ</Button>
        <Button onClick={() => handle?.performAction("note-capture")}>候補に追加</Button>
        <Button onClick={() => handle?.performAction("inspect")}>分解観察</Button>
        <Button onClick={() => handle?.performAction("reset")}>{mode === "official" ? "リセット（リタイア扱い）" : "リセット"}</Button>
        <Button onClick={() => openOverlay("help")}>ヘルプ</Button>
        <Button tone="danger" onClick={retire}>リタイア</Button>
      </nav>
    </div>
  );

  const renderPause = () => (
    <div className="akerun-screen akerun-modal-screen">
      <div className="akerun-modal-card">
        <p className="akerun-kicker">PAUSED / 一時停止</p>
        <h2>同じ問題を保持しています。</h2>
        <p>タイマーと入力は停止しています。再開しても問題は抽選し直しません。</p>
        <div className="akerun-title-actions">
          <Button tone="primary" onClick={resume}>再開</Button>
          <Button onClick={() => openOverlay("settings")}>設定</Button>
          <Button tone="danger" onClick={retire}>リタイア</Button>
        </div>
      </div>
    </div>
  );

  const renderResult = () => {
    const result = snapshot?.runResult;
    const isRetired = mode === "retired" || snapshot?.status === "retired";
    return (
      <div className="akerun-screen akerun-modal-screen">
        <div className="akerun-result-card">
          <p className="akerun-kicker">{isRetired ? "RETIRED / リタイア" : mode === "demo" ? "EXAMPLE RESULT / お手本" : "UNLOCK COMPLETE / 開錠完了"}</p>
          <h2>{isRetired ? "今回は記録しません。" : snapshot?.rewardTitle ?? "開錠しました。"}</h2>
          <p className="akerun-result-subtitle">{snapshot?.problemId} / {snapshot?.problemVersion} / {snapshot?.vaultTitle}</p>
          {mode === "official" && !isRetired ? <p className="akerun-small">獲得収蔵品：{snapshot?.rewardTitle ?? "—"}</p> : null}
          {mode === "official" && !isRetired && snapshot?.newlyUnlockedRewards.length ? (
            <p className="akerun-submit-status">今回解放：{snapshot.newlyUnlockedRewards.join(" / ")}</p>
          ) : null}
          <div className="akerun-result-grid">
            <Stat label="総合スコア" value={isRetired ? 0 : result?.score ?? snapshot?.score ?? 0} />
            <Stat label="開錠時間" value={formatTime(result?.elapsedTime ?? snapshot?.elapsedTime ?? 0)} />
            <Stat label="失敗数" value={result?.faultCount ?? snapshot?.faultCount ?? 0} />
            <Stat label="総回転数" value={result?.totalDialSteps ?? snapshot?.totalDialSteps ?? 0} />
            <Stat label="余分な回転" value={result?.excessDialSteps ?? snapshot?.excessDialSteps ?? 0} />
            <Stat label="偽ゲート接触" value={result?.falseGateContacts ?? snapshot?.falseGateContacts ?? 0} />
            <Stat label="観察精度" value={String(result?.observationAccuracy ?? snapshot?.observationAccuracy ?? 0) + "%"} />
            <Stat label="自己ベスト" value={best?.score ?? "—"} />
          </div>
          {!isRetired && mode === "official" ? <p className="akerun-small">偽ゲート接触は物理的な通過数を表示し、問題ごとの不可避な基準通過はスコアから除外しています。</p> : null}
          <p className="akerun-submit-status">{mode === "official" && !isRetired ? submitStatus : "訓練・お手本・リタイアはランキング対象外です。"}</p>
          <div className="akerun-title-actions">
            {mode === "official" && !isRetired ? <Button
              disabled={!retryAvailable || submitStatus === "送信中…" || submitStatus === "再送中…"}
              onClick={() => {
                if (!retryAvailable) return;
                setRetryAvailable(false);
                submittedKeyRef.current = "";
                setSubmitStatus("再送中…");
                setRetryNonce((current) => current + 1);
              }}
            >記録を再送する</Button> : null}
            <Button tone="primary" onClick={startSameProblem} disabled={!problem || mode !== "official" || startingOfficial}>同じ問題でもう一度</Button>
            <Button onClick={startDifferentProblem} disabled={mode !== "official" || startingOfficial}>別の問題に挑戦</Button>
            <Button onClick={openRanking}>ランキング</Button>
            <Button onClick={() => void shareResult()}>結果を共有</Button>
            <Button onClick={() => setScreen("title")}>タイトルへ戻る</Button>
          </div>
        </div>
      </div>
    );
  };

  const renderRanking = () => (
    <div className="akerun-screen akerun-modal-screen">
      <div className="akerun-modal-card akerun-ranking-card">
        <p className="akerun-kicker">OFFICIAL RANKING / 共通ランキング</p>
        <h2>Vault Tumbler Lab</h2>
        <p>{rankingStatus}</p>
        <div className="akerun-ranking-list">
          {rankingRows.map((row, index) => (
            <div className="akerun-ranking-row" key={String(RankingClient.rank(row, index + 1)) + "-" + RankingClient.displayName(row)}>
              <strong>{RankingClient.rank(row, index + 1)}</strong>
              <span>{RankingClient.displayName(row)}</span>
              <b>{RankingClient.score(row)}</b>
            </div>
          ))}
        </div>
        <div className="akerun-title-actions">
          <Button onClick={() => void loadRanking()}>再読み込み</Button>
          <Button tone="primary" onClick={closeOverlay}>戻る</Button>
        </div>
      </div>
    </div>
  );

  const renderArchive = () => (
    <div className="akerun-screen akerun-modal-screen">
      <div className="akerun-modal-card akerun-archive-card">
        <p className="akerun-kicker">ARCHIVE / 収蔵品</p>
        <h2>鑑定帳</h2>
        <p>開錠条件を満たした収蔵品だけが端末内に保存されます。能力強化はありません。</p>
        <div className="akerun-archive-list">
          {REWARD_DEFINITIONS.map((reward) => {
            const unlocked = archiveIds.includes(reward.id);
            return (
              <div className={"akerun-archive-row " + (unlocked ? "is-unlocked" : "")} key={reward.id}>
                <strong>{rarityLabel[reward.rarity] ?? "収蔵品"} / {unlocked ? reward.catalogNumber : "RESTRICTED COLLECTION"}</strong>
                <span>{unlocked ? reward.title : "未解放の収蔵品"}</span>
                <small>{unlocked ? reward.description : "解放条件：" + reward.conditionLabel}</small>
                {unlocked ? <small>解放条件：{reward.conditionLabel}</small> : null}
              </div>
            );
          })}
        </div>
        <Button tone="primary" onClick={() => setScreen("title")}>戻る</Button>
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="akerun-screen akerun-modal-screen">
      <div className="akerun-modal-card">
        <p className="akerun-kicker">SETTINGS / 設定</p>
        <h2>使いやすさの設定</h2>
        <p>これらの設定はスコアを下げません。音や振動が使えなくても、画面の反応だけで開錠できます。</p>
        <div className="akerun-settings-list">
          <Button onClick={() => toggleSetting("contrast", "contrast")}>高コントラスト：{settings.contrast ? "ON" : "OFF"}</Button>
          <Button onClick={() => toggleSetting("motion", "motion")}>低モーション：{settings.motion ? "ON" : "OFF"}</Button>
          <Button onClick={() => toggleSetting("precision", "precision")}>精密入力：{settings.precision ? "ON" : "OFF"}</Button>
          <Button onClick={() => handle?.performAction("sound")}>音：{snapshot?.soundMuted ? "OFF" : "ON"}</Button>
          <Button onClick={() => handle?.performAction("haptics")}>振動：{snapshot?.hapticsSupported === false ? "N/A" : snapshot?.hapticsEnabled ? "ON" : "OFF"}</Button>
          <Button onClick={() => openOverlay("sound-lab")}>音の試験室を開く</Button>
        </div>
        <Button tone="primary" onClick={closeOverlay}>戻る</Button>
      </div>
    </div>
  );

  const renderSoundLab = () => (
    <div className="akerun-screen akerun-modal-screen">
      <div className="akerun-modal-card akerun-sound-lab-card">
        <p className="akerun-kicker">SOUND LAB / 音の試験室</p>
        <h2>音を聞き比べる。</h2>
        <p>音だけで正解を決めないための確認室です。音を聞いたあと、画面の反応と抵抗も同じ意味を返すか確認してください。</p>
        <div className="akerun-audio-lab-list">
          {AUDIO_SAMPLE_DEFINITIONS.map((sample) => (
            <div className="akerun-audio-lab-row" key={sample.id}>
              <div>
                <strong>{sample.title}</strong>
                <small>{sample.description}</small>
                <small>画面：{sample.visualMeaning}</small>
              </div>
              <Button onClick={() => previewAudio(sample.id)} disabled={!handle}>聞く</Button>
            </div>
          ))}
        </div>
        <p className="akerun-small">音：{snapshot?.soundMuted ? "OFF" : "ON"}。音を使えない場合も、画面の反応と短い文章だけで遊べます。</p>
        <div className="akerun-title-actions">
          <Button onClick={() => handle?.performAction("sound")}>音を{snapshot?.soundMuted ? "ON" : "OFF"}</Button>
          <Button tone="primary" onClick={closeOverlay}>戻る</Button>
        </div>
      </div>
    </div>
  );

  const renderHelp = () => (
    <div className="akerun-screen akerun-modal-screen">
      <div className="akerun-modal-card akerun-help-card">
        <p className="akerun-kicker">HELP / 遊び方</p>
        <h2>観察してから操作する。</h2>
        <p>ダイヤルを回すと、空転、ゲート縁、偽ゲート、フライ接続などの反応が返ります。特定の音だけで正解を決めず、音・見た目・抵抗を比べてください。</p>
        <ol>
          <li>方向と通過回数を読み、ホイールを順に整列する。</li>
          <li>テンションを抵抗帯へ合わせ、フェンスを座らせる。</li>
          <li>ロックボルトを退避させ、扉ハンドルで扉側ボルトを抜く。</li>
        </ol>
        <p className="akerun-small">一時停止中はタイマーと入力が止まります。背景へ移った場合も自動で一時停止します。</p>
        <Button tone="primary" onClick={closeOverlay}>戻る</Button>
      </div>
    </div>
  );

  const renderOverlay = () => {
    if (screen === "title") return renderTitle();
    if (screen === "tutorial") return renderTutorial();
    if (screen === "training") return renderTraining();
    if (screen === "play") return renderPlayHud();
    if (screen === "pause") return renderPause();
    if (screen === "result") return renderResult();
    if (screen === "ranking") return renderRanking();
    if (screen === "archive") return renderArchive();
    if (screen === "settings") return renderSettings();
    if (screen === "sound-lab") return renderSoundLab();
    return renderHelp();
  };

  return (
    <ErrorBoundary>
      <div className={shellClass}>
        <GameCanvas onReady={onReady} onSnapshot={onSnapshot} onVisibilityPause={onVisibilityPause} />
        {renderOverlay()}
      </div>
    </ErrorBoundary>
  );
}
