# Obi-Tool API

Obi-Tool デスクトップアプリのバックエンド API（Vercel Serverless Functions）

## 構成

```
obi-tool-api/
  api/
    auth/
      register.js   - ユーザー登録（30日トライアル付与）
      login.js       - ログイン（デバイス制限チェック）
    license/
      verify.js      - ライセンス検証
      deactivate.js  - デバイス解除（ログアウト時）
    stripe/
      create-checkout.js - Stripe Checkout Session 作成
      portal.js          - Stripe Customer Portal
      webhook.js         - Stripe Webhook 受信
  lib/
    db.js    - Vercel Postgres 接続・テーブル初期化
    auth.js  - JWT 認証ヘルパー
  scripts/
    setup-db.js - DB テーブル手動セットアップ
```

## デプロイ手順

### 1. Vercel プロジェクト作成

```bash
npm i -g vercel
cd obi-tool-api
vercel
```

プロジェクト名を入力し、デフォルト設定で進める。

### 2. Vercel Postgres セットアップ

1. [Vercel Dashboard](https://vercel.com/dashboard) → プロジェクト → Storage タブ
2. 「Create Database」→ 「Postgres」を選択
3. データベース名を入力して作成
4. 自動的に `POSTGRES_URL` 等の環境変数がプロジェクトに紐付く

### 3. テーブル作成

Vercel Postgres が接続されたら、ローカルから実行：

```bash
# .env に POSTGRES_URL をセット（Vercel Dashboard の Storage から取得）
POSTGRES_URL=postgres://... node scripts/setup-db.js
```

または Vercel Dashboard の SQL エディタから直接実行も可。

### 4. Stripe 設定

#### ダッシュボードでの操作

1. [Stripe Dashboard](https://dashboard.stripe.com/) にログイン
2. **商品を作成**:
   - 商品名: 「Obi-Tool スタンダードプラン」
   - 価格: ¥500/月（recurring）
   - 作成後、Price ID（`price_xxxxx`）をメモ
3. **キャンペーンクーポン作成**:
   - クーポン → 新規作成
   - 割引: ¥400 OFF（固定額）→ 月額 ¥100 になる
   - 期間: 「永久」または任意の月数
   - プロモーションコード: クーポンに紐付けて作成（例: `CAMPAIGN100`）
4. **Webhook 設定**:
   - 開発者 → Webhook → エンドポイント追加
   - URL: `https://your-project.vercel.app/api/stripe/webhook`
   - イベント:
     - `checkout.session.completed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_failed`
   - 作成後、Webhook Secret（`whsec_xxxxx`）をメモ

### 5. 環境変数設定

Vercel Dashboard → プロジェクト → Settings → Environment Variables に以下を設定：

| 変数名 | 値 | 説明 |
|--------|-----|------|
| `JWT_SECRET` | ランダムな文字列（32文字以上推奨） | JWT 署名鍵 |
| `STRIPE_SECRET_KEY` | `sk_live_xxxxx` または `sk_test_xxxxx` | Stripe シークレットキー |
| `STRIPE_WEBHOOK_SECRET` | `whsec_xxxxx` | Webhook 署名検証用 |
| `STRIPE_PRICE_ID` | `price_xxxxx` | ¥500/月の Price ID |
| `STRIPE_SUCCESS_URL` | `https://obi-tool.com/success` | チェックアウト成功後 URL |
| `STRIPE_CANCEL_URL` | `https://obi-tool.com/cancel` | チェックアウトキャンセル URL |

※ `POSTGRES_URL` は Storage 連携で自動設定済み

### 6. デプロイ

```bash
vercel --prod
```

### 7. デスクトップアプリ側の設定

`obi-tool-app/license-manager.js` の `API_BASE_URL` をデプロイ後の URL に変更：

```javascript
const API_BASE_URL = 'https://your-project.vercel.app';
```

## API エンドポイント一覧

| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/api/auth/register` | ユーザー登録 |
| POST | `/api/auth/login` | ログイン |
| POST | `/api/license/verify` | ライセンス検証 |
| POST | `/api/license/deactivate` | デバイス解除 |
| POST | `/api/stripe/create-checkout` | Checkout Session 作成 |
| POST | `/api/stripe/portal` | Customer Portal URL 取得 |
| POST | `/api/stripe/webhook` | Stripe Webhook |

## サブスクリプションフロー

1. ユーザー登録 → 30日間無料トライアル開始
2. トライアル中にチェックアウト → Stripe で決済登録
3. トライアル終了後、月額 ¥500 課金開始
4. キャンペーンコード入力で月額 ¥100 に割引
5. Customer Portal からプラン変更・キャンセル可

## デバイス制限

- 1アカウント = 1デバイスのみ同時利用可
- 別デバイスで使う場合、先にログアウト（デバイス解除）が必要
- デバイス ID は OS 情報のハッシュで生成

## オフライン対応

- ライセンス情報はデスクトップアプリ側で AES-256-CBC 暗号化キャッシュ
- 最終検証から 30日間はオフラインで利用可能
- 30日を超えるとオンライン検証が必要

## ローカル開発

```bash
npm install
cp .env.example .env
# .env を編集して各値を設定
vercel dev
```
