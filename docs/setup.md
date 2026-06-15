# セットアップ

## 必要なもの

* Node.js 22以降
* npm
* Google Driveへ保存する場合はGoogle CloudのOAuthクライアント
* AI補完を使う場合はOpenAI互換APIキー

## 起動

```bash
npm install
npm run dev
```

ブラウザで開きます。

```text
http://localhost:5173
```

## LLM設定

アプリの `設定` で次を入力します。

```text
API Base URL
API Key
Model Name
```

DeepSeekの例:

```text
https://api.deepseek.com/v1
deepseek-chat
```

## Google Drive設定

Google CloudでOAuthクライアントを作り、リダイレクトURIに次を登録します。

```text
http://localhost:5174/api/google/oauth/callback
```

アプリの `設定` にClient IDとClient Secretを入力し、`Google Driveにログイン` を押します。

## LAN内スマホ閲覧

PCとスマホを同じWi-Fiに接続し、PCのIPアドレスを調べます。

```text
http://PCのIPアドレス:5173
```

停電などでPCが使えない場合は、Google Driveに保存されたPDFを直接探します。
