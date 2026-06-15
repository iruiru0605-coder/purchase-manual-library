# セットアップ詳細

このページは、取説ライブラリを初めて動かす人向けの詳しい手順です。

## 1. 必要なもの

* Mac または Windows
* Node.js 22以降
* npm
* Google Drive保存を使う場合: Googleアカウント
* AI補完を使う場合: OpenAI互換APIキー

Google Drive保存とAI補完は後から設定できます。最初は未設定のまま起動して大丈夫です。

## 2. Node.jsを確認する

ターミナルまたはPowerShellで確認します。

```bash
node -v
npm -v
```

`node` が見つからない場合は、Node.js公式サイトからLTS版をインストールしてください。

## 3. GitHubから取得する

### ZIPで取得する場合

1. GitHubページの緑色の `Code` ボタンを押す
2. `Download ZIP` を押す
3. ZIPを展開する
4. 展開した `purchase-manual-library` フォルダを開く

### Gitで取得する場合

```bash
git clone https://github.com/iruiru0605-coder/purchase-manual-library.git
cd purchase-manual-library
```

## 4. インストール

アプリのフォルダで実行します。

```bash
npm install
```

## 5. 起動

```bash
npm run dev
```

ブラウザで開きます。

```text
http://localhost:5173/
```

終了するときは、起動中のターミナルで `Ctrl + C` を押します。

## 6. スマホから見る

PCとスマホを同じWi-Fiにつなぎます。`npm run dev` の表示にある `Network:` のURLをスマホで開きます。

例:

```text
http://192.168.1.85:5173/
```

停電などでPCが使えない場合、このローカルアプリにはアクセスできません。Google Drive連携を使っていれば、保存済みPDFはGoogle Drive側から探せます。

## 7. AI設定

AI補完を使う場合は、アプリの `設定 > LLM設定` に入力します。

DeepSeekの例:

```text
Provider名: DeepSeek
API Base URL: https://api.deepseek.com
Model Name: deepseek-v4-flash
API Key: DeepSeek Platformで発行したAPIキー
```

設定画面の `DeepSeek v4 推奨値を入力` を押すと、APIキー以外を自動入力できます。

## 8. Google Drive設定

Google DriveへPDFを保存したい場合だけ設定します。

アプリの `設定 > Google Drive` に、OAuthクライアントIDとシークレットの取得方法を表示しています。画面内の手順に沿ってGoogle Cloud Consoleで作成してください。

登録するRedirect URI:

```text
http://localhost:5174/api/google/oauth/callback
```

設定後の流れ:

1. `OAuth Client ID` を貼る
2. `OAuth Client Secret` を貼る
3. `設定を保存` を押す
4. `Google Driveにログイン` を押す
5. Googleの許可画面でアクセスを許可する

未設定の場合、PDFはローカルの `.manual-library/archive/` に保存されます。

## 9. 更新する

Gitで取得している場合:

```bash
git pull
npm install
npm run dev
```

ZIPで取得している場合は、新しいZIPをダウンロードして展開し直します。既存の `.manual-library/` がある場合は、必要に応じて新しいフォルダへ移してください。

## 10. 注意

このアプリは家庭内LANで使う前提です。インターネットへ公開しないでください。

秘密情報は `.manual-library/settings.json` と `.manual-library/google-tokens.json` に保存されます。このフォルダはGitHubには入りませんが、PC上には平文で保存されます。
