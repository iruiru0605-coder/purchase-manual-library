# 作業報告：取説ライブラリ（2026-06 / Claude Code 引き継ぎ分）

## 背景
- 本アプリは Codex が設計・実装したローカル版「取説ライブラリ」（React 19 + Express 5 + Vite）。
- 2026-06-17〜18、ユーザー依頼により Claude Code が引き継ぎ、検証と改修を実施。
- 直前の最終コミットは `7b25d83 Improve beginner documentation`（2026-06-15）。本ファイル作成時点で、以降の未コミット変更（Codexのデザイン作業分＋Claude Codeの機能改修分）をまとめてコミット予定。

## 実施した変更（カテゴリ別）

### 1. Google Drive 未認証時のローカル自動退避（重要バグ修正）
- **対象**: `server/index.js`（PDFアップロード保存エンドポイント `/api/products/:id/manuals/upload`）
- **Before**: 保存先がDriveで未認証だと `throw new Error('…Google Driveに未ログインです…')` で**保存ゼロ・エラー停止**。
- **After**: Drive未認証 または アップロード失敗時は **自動でローカル保存へ退避**。`archive.fallbackReason = 'drive-unavailable'` を付与（UI表示用）。
- 設計意図: `local-first`。データを絶対に失わない。Driveは「使えればバックアップ」のオプションに降格。

### 2. 製品画像「URL取得」機能の削除
- **理由**: ネットショップの画像にURLが無いことが多く実用性が低い（ユーザー判断）。
- **削除対象**:
  - `server/services/imageImport.js`（＋同 `.test.js`）
  - `server/index.js` の `GET?` ではなく `POST /api/products/:id/image/url` エンドポイントと `downloadImageFromUrl` import
  - `client/src/api.js` の `apiImportProductImageUrl`
  - `client/src/App.jsx` の `imageUrl` state / `importImageUrl` / `validateProductImageUrl` / URL入力UI / import文
- **結果**: 製品画像は**ファイルアップロードのみ**に統一。

### 3. CSVテンプレート配信 ＋ 販売店名の正規化（表記ゆれ防止）
- **新規**: `server/services/stores.js`
  - `CANONICAL_STORES = ['Amazon','楽天','Yahoo!','メルカリ','ヨドバシ','その他']`
  - `normalizeStore(value)`: バリアント→正規名（例: `AMAZON`/`amazon.co.jp`→`Amazon`、`楽天市場`→`楽天`、`ヨドバシカメラ`→`ヨドバシ`）。未知は入力値を維持（自由記述可）。
  - `buildTemplateCsv()`: テンプレートCSV生成（Papa.unparse）。
- **エンドポイント**: `GET /api/imports/template`（UTF-8 BOM付き、Excel対応、Content-Disposition: attachment）。
- **`server/services/csvImport.js`**: `makeCandidateFromRow` の `seller` を `normalizeStore` で正規化（CSV・貼り付け両経路に効く単一ポイント）。
- **`client/src/App.jsx`**: 取込パネルに「テンプレートをダウンロード」リンク、販売元プルダウンを正規リスト化、候補一覧「購入元」を行ごとの `seller` 表示に（`candidate.seller || candidate.source`）。

### 4. 販売元プルダウンを「貼り付け取込」専用に移動
- CSVは販売元列で完結するため、CSV側からプルダウンを削除。プルダウンは貼り付け取込（行ごとの店舗情報が無い）のみに残存。

### 5. 設定画面のバランス調整
- `client/src/App.jsx`: OAuthガイドを `<details open>` → `<details>` にし**普段は折たたみ**（右カラムの長尺化を解消）。
- `client/src/styles.css`: `.settings-layout` を `align-items: stretch` にし左右パネル高さを揃えた。
- Drive未認証時の説明文を実挙動（ローカル自動保存）に合わせて更新。

### 6. モバイル対応（レスポンシブ）
- **原因**: `styles.css` がCodexの設計履歴で3層以上重複定義されており、後の非レスポンシブ定義がモバイル用 `@media` を上書きして効かなくなっていた（例: `.app-shell` が75/1190/1617行と3回定義）。
- **対策**: `styles.css` 末尾にモバイル定義を再定義し、カスケード順で確実に勝たせた（デスクトップ側は触らない）。app-shellの1カラム化、サイドバーの上部バー化・横スクロール化、各グリッド1段組化、表の横スクロール化。
- **根本の重複CSS整理は未実施（推奨残件）**。

### 7. タブ順序・デフォルト変更
- `client/src/App.jsx`: `TABS` 順を **ライブラリ→Inbox→設定** に変更（ライブラリ先頭）。
- デフォルトタブを `'inbox'` → `'library'` に変更。アプリを開くと最頻利用のライブラリが表示される（モバイル上部バーでもライブラリが常時見える）。

## デプロイ方針（合意済み・重要）
- **インターネット公開は行わない**。保証書PDF等に氏名・住所などの個人情報が含まれ、万が一の流出被害が大きいため。
- 自宅外からの**自分だけのアクセスは Tailscale（プライベートVPN）**を使用（自分の端末のみ）。アプリレベルの認証は未実装・不要（Tailscaleがアクセス制御）。
- 現在は `npm run dev`（開発サーバー）で稼働中。常時アクセスには本番ビルド（`npm run build` → `npm start`）＋PC起動時の自動起動が推奨（未設定）。

## Codex追加対応（2026-06-18）
- `server/services/products.js` の `registerCandidate` にもDrive未認証・Driveアップロード失敗時のローカル自動退避を適用。
- Windowsで `npm start` が動くよう、`scripts/start-production.js` 経由で `NODE_ENV=production` を設定。
- 初心者向けにデスクトップアイコン起動を追加。`scripts/install-windows-shortcut.ps1` で `取説ライブラリ.lnk` を作成し、`scripts/start-windows.ps1` がビルド確認・サーバー起動・ブラウザ表示を行う。
- ユーザー提供画像を `assets/app-icon.jpg` / `assets/app-icon.ico` として追加。

## 動作確認
- `npm test`: 合格（画像URL系テストは機能削除で除去、現在1件）。
- `npm run build`: 成功。
- 実機: スマホ（Tailscale経由 `http://<PCのTailscale IP>:5173`）でライブラリ表示・操作を確認。

## 残件（Codexへの引き継ぎ候補）
1. **`styles.css` の重複定義の本格整理**（モバイル問題の根本原因。現状は末尾追記で凌ぎ中）。
2. **PC起動時自動起動**の設定（常時アクセス化）。デスクトップアイコン起動は追加済み。
3. （必要なら）コミットの粒度整理。

## 起動方法
```bash
npm install
npm run dev      # 開発: http://localhost:5173
# 本番運用:
npm run build
npm start        # node scripts/start-production.js（dist/ を配信）

# Windowsのデスクトップアイコンを作成:
powershell -ExecutionPolicy Bypass -File .\scripts\install-windows-shortcut.ps1
```
