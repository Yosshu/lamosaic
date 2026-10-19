# lamosaic

写真の顔を、クレヨン風のストロークでおしゃれに隠すWebアプリです。
周りの肌や髪の色を拾って塗るので、写真の雰囲気を壊さずに顔を隠せます。

- PC・iPhone・iPad のブラウザで動きます
- 画像の処理はすべて端末の中で行い、どこにも送信しません
- 保存した画像からは位置情報などのメタデータが取り除かれます

## 開発

```sh
npm install
npm run dev        # 開発サーバー
npm test           # 単体テスト
npm run e2e        # 画面テスト（Playwright）
npm run lint       # ESLint
npm run typecheck  # 型チェック
```

## 公開

`main` へのプッシュで GitHub Actions が GitHub Pages に公開します
（リポジトリの Settings → Pages → Source を「GitHub Actions」にしてください）。
