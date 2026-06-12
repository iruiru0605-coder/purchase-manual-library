# Setup

## 1. Create the Spreadsheet

Create a new Google Spreadsheet and add these tabs:

- `商品一覧`
- `まとめ登録`
- `設定`
- `使い方`

The spreadsheet schema is documented in [sheet-schema.md](sheet-schema.md).

## 2. Add Apps Script

Open the spreadsheet and go to:

```text
Extensions > Apps Script
```

Paste `src/Code.gs` into the default script file.

If you want to define scopes explicitly, open the Apps Script project settings, enable manifest editing, and paste `src/appsscript.json` into the manifest.

## 3. Initial Drive Setup

Run this function once from the Apps Script editor:

```text
setupManualLibrary
```

The first run will ask for permissions. After approval, it creates:

```text
購入品マニュアル/
└── _未整理/
```

The root folder URL and inbox URL are written into the `設定` tab.

## 4. Create Warranty Notification Trigger

Run this function once:

```text
createWeeklyWarrantyTrigger
```

It creates a weekly Monday morning trigger for warranty-expiration checks.

## 5. Reload the Spreadsheet

Reload the spreadsheet. A custom menu named `マニュアル管理` appears.

## Notification Email

By default, `NOTIFY_EMAIL` in `src/Code.gs` is empty:

```javascript
const NOTIFY_EMAIL = '';
```

When empty, the script uses `Session.getActiveUser().getEmail()`. If that does not work in your Google Workspace environment, set `NOTIFY_EMAIL` explicitly.
