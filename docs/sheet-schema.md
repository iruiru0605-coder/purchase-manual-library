# データ構造

このアプリはスプレッドシートを主役にしません。ローカルJSON DBを使い、必要に応じてGoogle DriveへPDFを保存します。

## Candidate

購入履歴CSV、または購入履歴ページの貼り付けテキストから作る登録候補です。

|項目|内容|
|---|---|
| id | 候補ID |
| source | Amazon、楽天、メルカリなど |
| title | CSVから読んだ商品名 |
| purchaseDate | 購入日 |
| price | 価格 |
| sourceUrl | 商品URL |
| status | suggested / accepted / rejected / later / review / registered |
| registrationScore | 登録対象らしさ |
| enrichment | AIまたは簡易推定した商品情報 |
| manualCandidates | PDF候補 |
| selectedManualIds | 登録対象PDF |

## Enrichment

AI補完結果です。

|項目|内容|
|---|---|
| maker | メーカー |
| productName | 商品名 |
| model | 型番 |
| category | カテゴリ |
| shouldRegister | 登録すべきか |
| confidence | 信頼度 |
| needsReview | 人間確認が必要か |
| searchQueries | 公式PDF探索に使う検索語 |

## Product

登録済み商品です。

|項目|内容|
|---|---|
| productId | P0001形式の固定ID |
| maker | メーカー |
| name | 商品名 |
| model | 型番 |
| category | カテゴリ |
| paperStorage | 紙マニュアル保管先 |
| manuals | 保存済みPDF |
| sourceCandidateId | 元候補ID |

## Manual

PDF候補または保存済みPDFです。

|項目|内容|
|---|---|
| title | PDFタイトル |
| url | 元URL |
| type | 取扱説明書、設置説明書、クイックガイドなど |
| sourceHost | 配布元ホスト |
| sourceType | official-likely / unverified |
| score | 候補スコア |
| selected | 登録対象か |
| archive | Google Driveまたはローカル保存先 |

## Settings

`.manual-library/settings.json` に保存します。

|項目|内容|
|---|---|
| llm | OpenAI互換API設定 |
| googleDrive | OAuthとDriveルートフォルダ設定 |
| categories | カテゴリと紙ボックス番号 |
