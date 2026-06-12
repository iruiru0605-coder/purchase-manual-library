# Purchase Manual Library

Google Sheets and Apps Script workflow for managing product manuals, warranty documents, receipts, and physical paper-manual storage.

This project is designed for households and small teams that want the spreadsheet to be the searchable source of truth, while Google Drive acts as the file warehouse.

## What It Does

- Creates stable product IDs such as `P0001`, `P0002`, without formula-based numbering.
- Creates one Google Drive folder per product.
- Supports a `_未整理` inbox folder for quick receipt and warranty uploads.
- Tracks manufacturer warranty and extended warranty.
- Sends weekly warranty-expiration email alerts.
- Supports batch registration for purchases accumulated from Amazon, Rakuten, stores, and other sources.
- Tracks paper-manual storage locations such as `キッチン家電（KI）の001`.
- Allows manual override of generated paper-storage labels.
- Handles products whose official PDF manuals cannot be found.

## Repository Contents

```text
.
├── src/
│   ├── Code.gs
│   └── appsscript.json
├── docs/
│   ├── setup.md
│   ├── sheet-schema.md
│   └── operations.md
├── examples/
│   └── batch-import-template.csv
├── LICENSE
└── README.md
```

## Quick Start

1. Create a Google Spreadsheet.
2. Create tabs named `商品一覧`, `まとめ登録`, `設定`, and `使い方`.
3. Build the columns described in [docs/sheet-schema.md](docs/sheet-schema.md).
4. Open `Extensions > Apps Script`.
5. Paste [src/Code.gs](src/Code.gs) into the script editor.
6. Optional: paste [src/appsscript.json](src/appsscript.json) as the manifest.
7. Run `setupManualLibrary` once to create the Drive root folder and `_未整理`.
8. Reload the spreadsheet and use the `マニュアル管理` menu.

See [docs/setup.md](docs/setup.md) for the full setup flow.

## Typical Workflow

### Quick Capture

When you buy something, upload receipt or warranty photos to the Drive `_未整理` folder. You do not have to complete spreadsheet registration immediately.

### Batch Registration

When several purchases have accumulated, paste them into the `まとめ登録` tab and run:

```text
マニュアル管理 > まとめ登録を取り込む
```

The script moves each entry into `商品一覧`, assigns a product ID, creates a Drive folder, and generates a paper-manual storage label when a category is available.

### Manual Not Found

If an official PDF manual is unavailable, set `マニュアル状態` to `公式なし` or `後でスキャン`. If you keep a physical paper manual, leave `スキャン状態` as `未スキャン` until you scan it.

## License

MIT
