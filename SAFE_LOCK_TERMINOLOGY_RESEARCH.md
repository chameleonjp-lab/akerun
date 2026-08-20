# 機械式金庫錠・用語調査ノート

## 収集した出典

| ID | 出典 | 収集できた要点 | URL |
|---|---|---|---|
| R1 | Sargent and Greenleaf, *Mechanical Safe Lock Guide* | 機械式錠の部品、設置、操作、保守、トラブルシューティングを扱う公式ガイドの存在を確認した。 | https://sargentandgreenleaf.com/knowledgebase/knowledgebase-2018-01-25-mechanical-safe-lock-guide/ |
| R2 | Sargent and Greenleaf, 6700 Series | 3輪／4輪、左‐右‐左の回転、key-changeable wheel、internal relock trigger、four-way drive cam、wheel pack tension、dial / ring の製品用語を確認した。 | https://sargentandgreenleaf.com/product/6700-series/ |
| R3 | Kcolefas, *Safe Locks: The Definitive Guide* | dial & ring、spindle、wheel / disk、gate、lever、fence、drive cam、lock bolt、boltwork、relocker、dialing tolerance、mounting position の因果説明を確認した。 | https://www.kcolefas.com/en/insights/safe-lock |
| R4 | dormakaba, LA GARD Mechanical Knowledge Base | LA GARD機械式錠の設置手順、操作手順、保守情報を公式に提供していることを確認した。 | https://kb.dormakaba.com/hc/en-us/articles/39153165346587-LA-GARD-1947-Mechanical-Lock-Instructions-and-Operational-Manuals |
| R5 | Safelock Systems Knowledgebase Glossary | boltworks、relocker 等の業界用語を照合するための用語集を確認した。 | https://safelocksystems.co.uk/knowledgebase/general-info/glossary/ |

## 現時点の設計上の整理

- **入力列**は dial・dial ring・reading mark・spindle の組として扱う。
- **論理列**は wheel pack・wheel / disk・gate・fly・drive cam・lever・fence の因果として扱う。
- **扉側の拘束列**は lock bolt・boltwork・door bolts・handle・relocker の因果として扱う。
- 用語集では、正規の操作手順や突破法ではなく、部品の役割、表示ラベル、ゲーム内の安全な抽象化へ限定して記述する。

## ブラウザ照合メモ

- R2の公式製品資料では **left-right-left dialing**、**key-changeable wheel design**、**internal relock trigger**、**four-way drive cam**、**wheel pack tension** を製品特性として確認した。
- R3の技術解説では、ダイヤルとリングの入力がスピンドルを介してホイール群に伝わり、すべての **gate** がレバーの **fence** の下へ整列して初めてボルト側の拘束が解除されるという部品間の説明を確認した。
- R3では、錠の **lock bolt** は通常、扉の **boltwork** を直接の拘束対象とし、扉のロッキングボルト自体を直接動かす部品ではないこと、さらに **relocker** がボルトワークへの二次拘束として使われることを確認した。
