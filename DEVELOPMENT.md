# 袋づめ名人

レシートの写真から買った物のサイズ・重さを推定し、袋や段ボールへの詰め方を3Dで見せるアプリ。

## ファイル構成

```
src/
  index.html        画面の骨組み（HTML）
  styles.css        見た目（色・レイアウト）
  js/
    util.js         共通の小さな道具（$, el, fmt, num）
    config.js       設定値（袋・箱のサイズと耐荷重、色、手順の文言）
    sample-data.js  開いたときに表示する例
    image-prep.js   写真を軽くする（切り抜き・白黒化・縮小）
    bag-store.js    マイバッグ（登録した袋・箱）の保存。claude.ai ではアカウント、ほかではブラウザに保存
    ai.js           Claudeへの問い合わせ（指示文と返答の読み取り）。claude.ai外ではサーバー経由
    packing.js      袋詰めの計算（画面には触らない）
    models.js       商品の種類ごとの3Dモデル（紙パック・ペットボトル・卵パックなど）
    scene3d.js      3D表示（Three.js）。袋・箱を描き、商品を置いた向きに回して並べる
    voice.js        音声での案内（ブラウザ標準の読み上げ機能）
    ui.js           画面の操作と表示
    main.js         起動
server/server.js    Nodeサーバー（src/ の配信と、Claude Agent SDK によるレシート解析 /api/analyze）
build.ps1           src/ を1つのHTMLにまとめる
dist/               ビルド結果（公開用）
```

JSファイルは `index.html` に書いた順に読み込まれ、それぞれ `window.App` に機能を登録します（`App.packing.pack()` など）。
後のファイルは前のファイルの機能を使うので、順番を入れ替えないでください。

## claude.ai の外で動かす（Node.js サーバー）

トークンはサーバーの環境変数にだけ置き、ブラウザには渡しません。

```
claude setup-token          # CLAUDE_CODE_OAUTH_TOKEN を発行
cp .env.example .env        # 発行したトークンと、任意の合言葉(APP_PASSCODE)を書く
npm install
npm start                   # http://localhost:3000
```

- 解析1回ごとに Claude Code が起動するため、API直叩きより数秒遅く、同時実行は2件までです。
- 利用量は、トークンを発行したアカウントのサブスクリプション枠から引かれます。自分とチームのデモ用に限り、不特定多数への公開には使わないでください（その場合は `ANTHROPIC_API_KEY` で Messages API を呼ぶ形にします）。
- `.env` は `.gitignore` 済みです。トークンをコミットしないでください。

## 開発

- `src/index.html` をブラウザで直接開くと動きます（3Dと詰め直しは動作。AI解析は claude.ai 上、または上のサーバー経由でだけ動きます）。
- 公開用のファイルを作る：

  ```
  pwsh ./build.ps1
  ```

  `dist/fukurozume.html` ができます。これを Artifact として公開します。

## API版にするとき

`js/ai.js` の `init()` と `analyze()` の中身を、自前のサーバー経由で Claude API を呼ぶ形に差し替えます。
ほかのファイルは変更不要です。
