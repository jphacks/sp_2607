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
    ai.js           Claudeへの問い合わせ（指示文と返答の読み取り）
    packing.js      袋詰めの計算（画面には触らない）
    scene3d.js      3D表示（Three.js）
    ui.js           画面の操作と表示
    main.js         起動
build.ps1           src/ を1つのHTMLにまとめる
dist/               ビルド結果（公開用）
```

JSファイルは `index.html` に書いた順に読み込まれ、それぞれ `window.App` に機能を登録します（`App.packing.pack()` など）。
後のファイルは前のファイルの機能を使うので、順番を入れ替えないでください。

## 開発

- `src/index.html` をブラウザで直接開くと動きます（3Dと詰め直しは動作。AI解析は claude.ai 上でだけ動きます）。
- 公開用のファイルを作る：

  ```
  pwsh ./build.ps1
  ```

  `dist/fukurozume.html` ができます。これを Artifact として公開します。

## API版にするとき

`js/ai.js` の `init()` と `analyze()` の中身を、自前のサーバー経由で Claude API を呼ぶ形に差し替えます。
ほかのファイルは変更不要です。
