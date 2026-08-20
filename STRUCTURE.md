# Runtime Structure

## Ownership

| Module | Responsibility |
|---|---|
| `components/GameCanvas.tsx` | React のライフサイクル内で Babylon `Engine` を一度だけ作り、リサイズと破棄を管理する。 |
| `game/scene.ts` | Scene、正射影カメラ、全画面 DynamicTexture 平面を作り、`VaultWorld` に更新を委譲する。 |
| `game/GameDefinitions.ts` | 金庫型、難易度、可変シード、ホイール手順、偽ゲート、金庫固有のホイールパック予圧、報酬、方向反転・通過回数、テンション帯・フェンス帯・保持時間・内部遮蔽・ブラインド遮蔽を定義するデータ層。 |
| `game/LockMechanism.ts` | `PuzzleDefinition` を受け取り、ドライブカム、フライによる順次接続、方向反転、通過回数、正規／偽ゲート接触、テンション、フェンス座り、ロックボルト、扉ボルトワーク、回復可能な噛み込みを保持する純粋なゲームルール。 |
| `game/AudioFeedback.ts` | 初回のユーザー操作でWeb Audioを有効化し、ダイヤル刻み、抵抗、フェンス座り、ボルト後退、開錠を短い合成金属音へ変換する。 |
| `game/HapticFeedback.ts` | 対応端末のVibration APIだけを安全に呼び出し、音響イベントと対応する短い振動、振動間隔の抑制、低モーション・ユーザー無効化・非対応時の停止を担当する。 |
| `game/VaultWorld.ts` | DynamicTexture の製図風描画、アセット読込、排他的な物理入力、ヒット領域、自動デモ、状態と見た目の同期を担当する。 |

## State Contract

`LockMechanism` は `PuzzleDefinition` を受け、`rotate(steps)`、`setTension(value)`、`setFenceTravel(value)`、`setBoltTravel(value)`、`setHandleTurn(value)`、`tick(delta)`、`reset()` だけで状態を変更する。ダイヤル操作では、ドライブカムが外側のフライを拾い、通過ごとに内側のホイールへ接続が広がる。方向を反転すると前の輪はその位置に残り、次の輪だけを調整できる。正規ゲートと浅い偽ゲートは `contactProfile` と `contactDepth` で区別され、偽ゲートは整列段階を進めない。全ゲートが揃うと `dial → tension-ready → tension-test → fence-ready → fence-seated → bolt-test → boltwork-ready → handle-test → open` へ進み、ロックボルトの退避と扉側ボルトの後退を別の達成として扱う。描画側は `dial`、`locked`、`stage`、`currentPass`、`coupledWheels`、`driveCamAngle`、`phase`、各操作値、`packResistance`、`doorBoltTravel`、`opened`、`gateOffset()` を読むだけにし、Babylon ノードの詳細をゲームルールへ漏らさない。`scene.ts` はフレーム例外を隔離し、描画系の一時障害が発生してもゲーム全体のループを停止させず、安全な復旧案内を表示する。

## Input Contract

`VaultWorld` は生の Pointer／Wheel／Keyboard イベントを受けるが、意味的な操作へ変換して `LockMechanism.rotate()`、`setTension()`、`setFenceTravel()`、`setBoltTravel()`、`reset()`、`startDemo()` を呼ぶ。部品のポインター捕捉中は他の物理部品を受け付けず、画面外離脱、`pointercancel`、`lostpointercapture`、`Escape` では力を安全に抜く。`F` は現在有効な物理部品へ焦点を移し、`Shift + ←→`、`↑↓`、`Space`、`Escape` でマウスなしでも完結する。回転量と直近の経過時間から平滑化した速度値を作り、`AudioFeedback` と `HapticFeedback` へ渡して音と振動を同期させる。振動は最初のユーザー操作後だけを対象とし、`K`、作業台の `HAPTIC`、低モーション設定、非対応端末のいずれでも安全に停止できる。高コントラスト、低モーション、精密入力はゲーム内で切り替え、Canvas外のライブ状態説明と匿名のローカル集計を提供する。ブラインドモードでは画面全体を遮蔽し、ポインターの水平ドラッグとキー操作をダイヤルへ直結する。音なし・高コントラスト時は、`V` で最小状態記号を有効にし、同じ因果をライブ状態でも伝える。全ての DOM リスナーは `dispose()` で解除する。

## Presentation Contract

`?demo` は、現在の `PuzzleDefinition` の方向反転、通過回数、フライの順次接続、ホイール整列、テンション帯の保持、フェンス座り、ロックボルト後退、ハンドルによる扉側ボルト後退を順に実行する。画面は通常、左の正面盤と右の断面機構を同時に描き、ドライブカム、フライ、正規／偽ゲート、フェンス、抵抗針、ロックボルト、キャリーバー、扉側ボルトをゲート・ヴァーディグリスで示す。観察モードは正規ゲートに加えて橙色の浅い偽ゲート、接触深さ、パック予圧を表示し、標準・専門では推測を答えに変えないため遮蔽する。ブラインドモードは全機構を暗転させ、音響だけを解答手掛かりにし、開錠後だけ `DOOR BOLTS / RETRACTED` を表示する。分解観察と鑑定帳はケースカバー、ブリッジ、ホイールポスト、変更式ホイール、リロッカー、アンチパンチを安全な観察対象として扱う。新規契約はseedから金庫型・報酬・開始方向を選び、開錠後に対応する収蔵品を表示する。
