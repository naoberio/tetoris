# テトリス MVP

最低限のテトリス風ゲーム（7種ブロック、スコア表示、ゲームオーバー表示、ユーザー名・トップ5表示）を実装したMVPです。

## 技術スタック

- Vite
- Vanilla JavaScript / HTML / CSS

## 起動手順

```bash
npm install
npm run dev
```

`npm run dev` 実行後に表示されるローカルURL（例: http://localhost:5173）へアクセスしてください。

## 操作方法

- ← / → : 左右移動
- ↓ : ソフトドロップ
- ↑ : 回転
- Space : ハードドロップ

## スコア記録

- ゲーム開始時に入力したユーザー名に紐づけて、スコアをブラウザの `localStorage` に保存します。
- ランキングはトップ5のみ表示します。

## 動作確認コマンド

```bash
npm run build
```
