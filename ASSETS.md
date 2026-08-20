# Assets

**Art direction:** 深い墨紺の製図台に真鍮・鈍い鉄・青緑の整列光を配置する「真鍮の機械製図室」。左に正面の操作ダイヤル、右に縦長の鍵内部カットアウェイを置き、細い青緑ラインで因果を結ぶ。生成アセットは素材感とブランドの基準をつくり、回転・目盛り・ホイール・フェンスの状態はプログラムで正確に描画する。

## Backgrounds

| Name | Description | Size | Image | Runtime use |
|---|---|---:|---|---|
| visual_target | 完成画面の構図・素材・色の視覚基準 | 1920×1080 px | `/manus-storage/vault-tumbler-reference_35720048.png` | タイトル前の短い導入背景と視覚QAの基準 |
| vault_door_plate | 中央にダイヤルを載せる正面金庫パネル | 900×900 px | `/manus-storage/vault-door-plate_87b42963.png` | 左側の正面金庫領域の下地 |

## Textures

| Name | Description | Size | Image | Runtime use |
|---|---|---:|---|---|
| brushed_brass_patina | 水平の研磨筋を持つ古色真鍮 | 1m タイル | `/manus-storage/brushed-brass-patina_3c5701a7.png` | ダイヤル、ホイール、縁取りに低不透明度で重ねる |

## Sprites

| Name | Description | Size | Image | Runtime use |
|---|---|---:|---|---|
| tumbler_mark | 3枚の同心ホイールと開いたゲートを示す透明ロゴ | 96×96 px（ヘッダー）、48×48 px（ファビコン） | `/manus-storage/vault-tumbler-mark_c74fcb29.png` | 画面左上のゲーム識別子と favicon |

## Realism Upgrade Assets

| Name | Description | Size | Image | Runtime use |
|---|---|---:|---|---|
| real_vault_door_panel | 厚い塗装鋼板・鋳鉄フレーム・リベットを持つ実機風の正面扉 | 1200×1200 px | `/manus-storage/real-vault-door-panel_37ea387f.png` | 左側ダイヤルの扉・フレーム基材 |
| real_brass_combination_dial | 切削目・黒エナメル・古色を持つ真鍮ダイヤル | 1200×1200 px | `/manus-storage/real-brass-combination-dial_b7977ff0.png` | 数字・目盛りを重ねる動的ダイヤルの金属基材 |
| real_safe_lock_cutaway | ホイールパック、スピンドル、フェンス、レバー、ボルトを含む実機風断面 | 1600×1200 px | `/manus-storage/real-safe-lock-cutaway_398ad6d7.png` | 右側カットアウェイの高精細な背景層 |
| real_blue_steel_surface | ブルードスチールの微細なブラッシュ／塗装面 | 1m タイル | `/manus-storage/real-blue-steel-surface_5e6d63c0.png` | 製図台と固定機構の低不透明度テクスチャ |
| vault_treasure_cache | 金貨、宝石、刻印入りの懐中時計を金庫内トレイへ納めた実機風の保管物 | 16:9 | `/manus-storage/vault-treasure-cache_f4471eb7.png` | 開扉の進行に合わせて左側の金庫内部に表示し、金色・青緑の反射光を生む達成演出 |
| obsidian_reliquary_cache | 青緑の宝石、航海儀器、封印函を収めた黒鉄の保管トレイ | 16:9 | `/manus-storage/obsidian-reliquary-cache_a6a04417.png` | NOCTURNE RELIQUARYの開扉後、暗い内部に表示する |
| sapphire_chronometer_cache | サファイアの航海時計、銀鍵、封緘文書を収めた真鍮の保管トレイ | 16:9 | `/manus-storage/sapphire-chronometer-cache_94d72841.png` | PELAGIC CHRONOMETERの開扉後、青い反射光とともに表示する |

## Procedural Mechanism Objects

| Name | Description | Size | Implementation |
|---|---|---:|---|
| combination_dial | 0〜99の目盛りを持つ正面ダイヤル | 420 px 直径 | Babylon DynamicTexture による精密描画。ドラッグ・ホイール・キーボードに対応。 |
| three_tumblers | ノッチ位置の異なる3枚の組合せホイール | 各 235×74 px | 回転値に連動する円形ホイールの側面図。ゲートは青緑で強調。 |
| fence_and_bolt | ホイール上のフェンスと右向きボルト | 312×120 px | 全ゲート整列時にフェンスが落ち、ボルトが退避するアニメーション。 |
| tracer_lines | 正面・内部を結ぶ連動線 | 可変 | 選択中ホイールと揃ったゲートを青緑で接続する線分群。 |
