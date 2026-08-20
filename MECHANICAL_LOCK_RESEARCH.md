# Mechanical Lock Research Notes

## Verified design facts

| 観点 | 実機資料から得た要点 | ゲームへの反映 |
|---|---|---|
| 回転方向 | Sargent and Greenleafの6700系は、一般的な三輪機構として**左・右・左**のダイヤリングを製品特性に掲げている。 | 問題ごとに固定の方向だけを見せず、方向反転で次ホイールを拾う手順を明示的な因果として扱う。 |
| ホイールパック | 三輪・四輪モデルがあり、金属ホイール、適正なホイールパック張力、四方向ドライブカムを備える。 | `WheelPack` は複数ホイール、駆動中のホイール、方向転換時の接続状態、各ホイールのゲート角を保持する。 |
| フェンスとボルトワーク | 機械式錠のロックボルトは扉の大型ボルトを直接動かすのでなく、ボルトワークの移動を遮断／解放する。 | フェンス座りは「扉を開ける」のでなく、ロックボルトを退避させてハンドル用ボルトワークを解放する中間状態にする。 |
| 破壊検知 | 高セキュリティ金庫では、干渉や破壊に対するリロッカーがボルトワークを追加で拘束する場合がある。 | 失敗時は単純な即時ゲームオーバーではなく、フェンス反発・ホイール再調整・安全リンク拘束という回復可能な状態で表現する。 |

## Sources

1. Sargent and Greenleaf, [Model 6730, 6731, 6741 Group 2 Mechanical Safe Lock](https://sargentandgreenleaf.com/product/6700-series/), accessed 2026-08-19. The product page identifies left-right-left dialing, metal three- and four-wheel variants, torque adjustment, and a drive cam.
2. Kcolefas, [Safe Locks: The Definitive Guide](https://www.kcolefas.com/en/insights/safe-lock), accessed 2026-08-19. The guide explains that the lock bolt releases the boltwork, after which the handle retracts the door locking bolts, and describes relocker behavior at a conceptual level.

## Safety boundary

The game models mechanical causality for learning and play. It intentionally uses seeded fictional vaults, abstracted contact information, and a non-transferable on-screen protocol; it is not an operating guide for any real lock or safe.
