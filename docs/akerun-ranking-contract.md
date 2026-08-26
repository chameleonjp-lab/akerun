# Akerun verified ranking contract (v2)

## 目的

Akerunの通常プレイだけを、カメレオンJP実験場の共通ランキングへ登録する。公開のランキング表は既存の共通テーブルを使い、Akerun固有の公開テーブルは追加しない。

## プレイ開始

ブラウザは `akerun-competition` Edge Functionへ `prepare` を送り、サーバー発行の `runToken` と公式問題ID・バージョンを受け取る。続けて `begin` を呼ぶ。

- 問題IDを省略した開始は、サーバーが20問から抽選する
- 通常の新規開始で問題IDを指定しても受理しない
- 「同じ問題でもう一度」だけ、完了済み同一問題の `replayRunToken` と問題IDを提示できる
- 問題ID、問題バージョン、クライアント版、契約版はサーバー台帳と照合する
- 開始後の再読込・バックグラウンド復帰は、端末に保存した同じ `runToken` を再開する

## 結果送信

開錠した通常プレイだけが `finish` を呼ぶ。サーバーは以下を検証する。

- `runToken` が本人の active run である
- プレイヤー名、問題ID、問題バージョンが開始時の台帳と一致する
- 経過時間、失敗数、総回転数、偽ゲート接触数の範囲が妥当である
- 偽ゲート接触数は、問題固有の不可避な基準通過を差し引いた「余分な接触数」として送る
- 余分な回転数と観察精度を公式式から再計算する
- 基準時間、基準回転数、基準失敗数、難度補正からスコアを再計算する
- 一つの `runToken` は一度だけ共通ランキングへ書き込める

送信失敗時は `runToken` を含む結果を端末内へ保存し、明示的な再送で同じ `finish` を再実行する。完了済みトークンを同じ payload で送る場合は、サーバーが既存結果を返し、二重の `score_runs` を作らない。

新しいv2結果は共通 `score_runs.metadata` に `source=akerun_verified_v2` と `verification=server-contract-v2` を付けて保存する。既存のv1結果は読み取り用に残し、ランキング取得ではv1/v2を同じ履歴として扱う。

## 順位

`get_akerun_ranking_v1` は共通 `game_scores` の最高スコアを基準に、同点時は失敗数、経過時間、余分な回転数、正規化名の順で並べる。各指標は最高スコアと同じ `score_runs` のメタデータから取得する。

## 攻撃面と限界

ブラウザにはPublishable keyしか置かない。サービスキー専用の台帳・内部RPCは直接実行できない。古い共通 `submit_score` から `akerun` へ書き込む経路も拒否する。

v2では、正しい最短経路でも発生する偽ゲート通過を問題ごとの基準値へ含め、不可避な通過がスコアへ二重計上されないようにした。この契約は、問題の再抽選、問題IDの差し替え、スコア式の改ざん、派生値の不一致、二重送信を防ぐ。ただし、悪意あるブラウザがプレイ結果の各メトリクスを自作することまでは証明しない。完全な入力トレース検証は、LockMechanismの決定的ルールをサーバー検証器へ移植する別フェーズで実装する。

## 現在の本番状態（2026-08-26）

v2 migrationの適用と `akerun-competition` Edge Function v2の配置は完了しています。確認できた状態は次のとおりです。

- `private.akerun_competition_config.client_version = akerun-web-verified-v2`
- `private.akerun_competition_config.contract_version = akerun-play-v2`
- 公式問題カタログは20件
- Akerunの実行台帳は0件
- `public.games.is_active = false`
- `private.akerun_competition_config.accepting_runs = false`
- 受付停止中の準備処理が新しい実行記録を作らず拒否することを確認済み

## 有効化手順

公開前は安全のため次の2つを無効にする。

- `public.games.is_active = false`
- `private.akerun_competition_config.accepting_runs = false`

次の確認がすべて終わった後、管理者権限で同じ作業として両方を有効化する。

1. iPhone Safariの縦画面で、名前入力から開錠・結果表示まで確認する
2. 新規問題抽選と同じ問題の再挑戦が、問題固定を壊さず動くことを確認する
3. 正常送信、送信失敗からの再送、期限切れ、二重送信、ランキング取得を確認する
4. 訓練、お手本、リタイア、未クリアがランキングへ入らないことを確認する

有効化後に問題形状や基準値を変更する場合は、ランキング記録への影響を避けるため問題バージョンを上げる。
