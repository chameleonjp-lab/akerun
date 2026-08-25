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
  const [tutorialStep, setTutorialStep] = useState(1);
  const [submitStatus, setSubmitStatus] = useState("未送信");
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

  const onReady = useCallback((nextHandle: GameHandle | null) => {
    setHandle(nextHandle);
    if (nextHandle) setSnapshot(nextHandle.getSnapshot());
  }, []);

  const onSnapshot = useCallback((nextSnapshot: GameSnapshot) => {
    setSnapshot(nextSnapshot);
  }, []);

  const onVisibilityPause = useCallback(() => {
    if (screen === "play" || screen === "training") setScreen("pause");
  }, [screen]);

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
        if (mode === "official") store.clearActiveRun();
        setScreen("result");
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [mode, screen, snapshot?.opened, store, tutorialStep]);

  useEffect(() => {
    const result = snapshot?.runResult;
    if (screen !== "result" || mode !== "official" || !snapshot?.recordable || !result) return;
    const key = result.problemId + "@" + result.problemVersion + ":" + String(result.score) + ":" + String(result.elapsedTime);
    if (submittedKeyRef.current === key || submittingKeyRef.current === key) return;

    // 結果確定時に自己ベストを先に保存し、通信状態と切り離す。
    store.recordBest(result);
    submittedKeyRef.current = key;
    submittingKeyRef.current = key;
    setSubmitStatus("送信中…");
    void rankingClient.submit(playerName, result)
      .then(() => {
        setSubmitStatus("ランキングへ送信しました。");
        store.removePendingForResult(result);
      })
      .catch(() => {
        // 失敗時はsubmittedKeyを残し、自動再送ループを防ぐ。
        // 再送ボタンがretryNonceを進め、明示的にもう一度実行する。
        store.enqueueRanking(playerName, result);
        setSubmitStatus("送信に失敗しました。結果画面の再送ボタンを押してください。");
      })
      .finally(() => {
        if (submittingKeyRef.current === key) submittingKeyRef.current = "";
      });
  }, [mode, playerName, rankingClient, retryNonce, screen, snapshot, store]);

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

  const startOfficial = (nextProblem?: PuzzleDefinition) => {
    if (!store.trainingComplete) {
      setTutorialStep(1);
      setScreen("tutorial");
      return;
    }
    const activeRun = nextProblem ? null : store.getActiveRun();
    const savedName = activeRun?.playerName ? store.savePlayerName(activeRun.playerName) : validateName();
    if (!savedName || !handle) return;
    setPlayerName(savedName);
    let resumedProblem: PuzzleDefinition | null = null;
    if (activeRun) {
      try {
        const candidate = createOfficialPuzzle(activeRun.problemId);
        if (candidate.problemVersion === activeRun.problemVersion) resumedProblem = candidate;
      } catch {
        store.clearActiveRun();
      }
    }
    const chosen = nextProblem ?? resumedProblem ?? chooseOfficialProblem();
    store.saveActiveRun(chosen.problemId ?? chosen.id, chosen.problemVersion ?? "V1", savedName);
    setProblem(chosen);
    setMode("official");
    setSubmitStatus("未送信");
    submittedKeyRef.current = "";
    setRetryNonce(0);
    handle.startPuzzle(chosen);
    setSnapshot(handle.getSnapshot());
    setScreen("play");
  };

  const startTraining = () => {
    if (!handle) return;
    const step = Math.max(1, Math.min(4, tutorialStep)) as 1 | 2 | 3 | 4;
    const trainingPuzzle = createTrainingPuzzle(step);
    setProblem(trainingPuzzle);
    setMode("training");
    handle.startPuzzle(trainingPuzzle, { training: true, postDial: step === 3 });
    setSnapshot(handle.getSnapshot());
    setScreen("training");
  };

  const startDemo = () => {
    if (!handle) return;
    setMode("demo");
    handle.startDemo();
    setSnapshot(handle.getSnapshot());
    setScreen("play");
  };

  const startSameProblem = () => {
    if (problem) startOfficial(problem);
  };

  const startDifferentProblem = () => {
    if (!problem) {
      startOfficial();
      return;
    }
    startOfficial(chooseOfficialProblem(problem.problemId));
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
    handle?.retire();
    store.clearActiveRun();
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
    const pending = store.getPendingRankings();
    if (!pending.length) {
      setSubmitStatus("再送する記録はありません。");
      return;
    }
    setSubmitStatus("未送信記録を送信中…");
    let sent = 0;
    for (const item of pending) {
      try {
        await rankingClient.submit(item.playerName, item.result);
        store.removePending(item.id);
        store.recordBest(item.result);
        sent += 1;
      } catch {
        // 残った記録は次回の再送対象として維持する。
      }
    }
    setSubmitStatus(sent === pending.length ? "未送信記録をすべて送信しました。" : `${sent}/${pending.length}件を送信しました。`);
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
        {activeRun ? <p className="akerun-small">進行中の {activeRun.problemId} を保持しています。ゲーム開始で同じ問題を再開します。</p> : null}
        <div className="akerun-title-actions">
          <Button tone="primary" onClick={() => startOfficial()} disabled={!handle}>ゲーム開始</Button>
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
              <Button tone="primary" onClick={() => startOfficial()}>通常ゲームへ</Button>
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
        <Button onClick={() => handle?.performAction("reset")}>リセット</Button>
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
          <p className="akerun-submit-status">{mode === "official" && !isRetired ? submitStatus : "訓練・お手本・リタイアはランキング対象外です。"}</p>
          <div className="akerun-title-actions">
            {mode === "official" && !isRetired ? <Button
              disabled={submitStatus === "送信中…" || submitStatus === "再送中…"}
              onClick={() => {
                submittedKeyRef.current = "";
                setSubmitStatus("再送中…");
                setRetryNonce((current) => current + 1);
              }}
            >記録を再送する</Button> : null}
            <Button tone="primary" onClick={startSameProblem} disabled={!problem || mode !== "official"}>同じ問題でもう一度</Button>
            <Button onClick={startDifferentProblem} disabled={mode !== "official"}>別の問題に挑戦</Button>
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
            <div className="akerun-ranking-row" key={String(row.rank ?? index) + "-" + RankingClient.displayName(row)}>
              <strong>{row.rank ?? index + 1}</strong>
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
