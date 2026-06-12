# Operations

## Register One Product

Fill a row in `商品一覧` with at least:

- `購入日`
- `メーカー`
- `商品名`

Then select the row and run:

```text
マニュアル管理 > この行を登録（ID採番＋フォルダ作成）
```

The script writes:

- `商品ID`
- `フォルダリンク`
- `紙ファイル置き場` when `カテゴリ` is present
- warranty formulas for the row

## Batch Import

Paste accumulated purchases into `まとめ登録`.

Required fields:

- `購入日`
- `メーカー`
- `商品名`

Then run:

```text
マニュアル管理 > まとめ登録を取り込む
```

Rows with `登録済` or `スキップ` in `取込状態` are ignored.

## Paper Manual Storage

When category is `キッチン家電` and code is `KI`, generated paper-storage labels look like:

```text
キッチン家電（KI）の001
キッチン家電（KI）の002
```

The value is plain text after generation. You can edit it to match the real physical box, for example:

```text
キッチン用品 ボックスA-5
```

## Official Manual Unavailable

For products whose official manual cannot be found:

- Set `マニュアル状態` to `公式なし` or `後でスキャン`.
- Use `紙ファイル置き場` for the physical manual.
- Keep `スキャン状態` as `未スキャン` until scanned.
- After scanning, upload the file into the product Drive folder and set `スキャン状態` to `スキャン済`.

## Warranty Alerts

`checkWarrantyExpiry` sends an email when warranty deadlines are within `NOTIFY_DAYS`.

The weekly trigger is created by:

```text
createWeeklyWarrantyTrigger
```
