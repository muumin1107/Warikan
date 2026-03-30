# Warikan（割り勘）

<img width="2848" height="1504" alt="og-image (3)" src="https://github.com/user-attachments/assets/d43fc849-207a-4ce9-b580-5c94912e98b1" />

旅行の立て替えをスマートに精算するWebアプリです。

**デモ：** https://main.d23e9yi3475pdz.amplifyapp.com

---

## 概要

複数人での旅行中に発生する立て替えを記録し、最小回数の送金で全員の精算が完了するプランを自動計算します。招待リンクでメンバーを追加でき、各自がスマートフォンから手軽に操作できます。

---

## 機能一覧

### 認証
- メールアドレス / パスワードによるサインアップ・ログイン
- Google OAuth によるソーシャルログイン
- パスワードリセット（メール確認コード方式）
- 初回ログイン時のニックネーム設定

### プロジェクト管理
- プロジェクト作成・一覧表示
- 招待リンクまたはメールアドレスでメンバーを招待
- プロジェクトの終了 / 再開（オーナーのみ）
- プロジェクトの削除（オーナーのみ・物理削除）

### 支払い管理
- 支払いの登録・編集・削除（登録者本人のみ編集・削除可能）
- カテゴリ設定（食事・交通・宿泊・観光・買い物・その他）
- 外貨入力（USD / EUR / KRW / THB / TWD など対応）、為替レートから円換算を自動計算
- レシート写真のアップロード・表示（S3 プリサインドURL）
- 全員割り / メンバー指定割りの選択
- 端数調整（divmod で ∑ = 合計額を保証）

### 残高・精算
- メンバー別の純残高表示（＋受取超過 / －支払超過）
- Greedy 法による最少送金回数の精算プラン自動計算
- 支払いごとの「返した」ボタン（請求対象者が自分の分を個別に精算）

### Push通知
- Firebase FCM による支払い登録通知（メンバー全員に通知）

---

## 技術スタック

### フロントエンド
| 技術 | 用途 |
|------|------|
| React 18 + Vite | UIフレームワーク・ビルドツール |
| AWS Amplify JS v6 | Cognito 認証クライアント |
| Axios | API クライアント |
| Firebase FCM | Push通知トークン登録 |
| CSS Custom Properties | デザイントークン管理 |

### バックエンド
| 技術 | 用途 |
|------|------|
| Amazon Cognito | 認証・認可（Google OAuth 対応） |
| Amazon API Gateway | REST API（VTL マッピングテンプレート） |
| Amazon SQS | 書き込みリクエストの非同期キュー |
| AWS Lambda (Python 3.12) | ビジネスロジック |
| Amazon DynamoDB | データストア |
| Amazon S3 | レシート写真の保存 |
| AWS Amplify Hosting | フロントエンドホスティング・CI/CD |

---

## アーキテクチャ

```
ブラウザ (React)
    │
    ├─ GET  ──────────────────► API Gateway ──► Lambda (Reader)  ──► DynamoDB
    │
    └─ POST/PUT/DELETE ───────► API Gateway ──► SQS ──► Lambda (Writer) ──► DynamoDB
                                                                         └──► NET_BALANCE 更新
```

### 書き込みフロー（非同期）
1. フロントが `POST /projects/{id}/expenses` を送信
2. API Gateway の VTL テンプレートが SQS に `SendMessage`
3. SQS が Lambda Writer をトリガー
4. Lambda Writer が `TransactWriteItems` で DynamoDB に書き込み
5. フロントは 2 秒後に再取得

### 信頼境界
- VTL テンプレートが `$context.authorizer.claims.sub` を注入
- クライアントからの `userId` を信頼せず、Cognito の JWT から取得した値を使用

---

## DynamoDB テーブル構成

| テーブル名 | PK | SK | 概要 |
|-----------|----|----|------|
| `warikan-project-dev` | `projectId` | - | プロジェクト情報 |
| `warikan-project-member-dev` | `projectId` | `userId` | メンバー・招待状態 |
| `warikan-expense-dev` | `expenseId` | - | 支払い情報（GSI: `projectId-index`） |
| `warikan-expense-split-dev` | `expenseId` | `userId` | 分担情報・返済状態 |
| `warikan-netbalance-dev` | `projectId` | `userId` | 純残高（累積） |
| `warikan-settlement-dev` | `settlementId` | - | 精算履歴（GSI: `projectId-index`） |
| `warikan-user-dev` | `userId` | - | ユーザー情報（ニックネーム等） |
| `warikan-device-token-dev` | `userId` | `token` | FCM デバイストークン |

---

## AWS リソース情報

| リソース | 値 |
|---------|-----|
| AWS Region | `ap-northeast-1` |
| Cognito User Pool | `ap-northeast-1_IGFIftzmp` |
| Cognito App Client | `2ka76borur8kkcosiupcnulv27` |
| API Gateway ID | `371y9wvaqh` |
| Amplify App URL | `https://main.d23e9yi3475pdz.amplifyapp.com` |
| S3 バケット（レシート） | `warikan-receipts-dev-777000838350` |

---

## ローカル開発環境のセットアップ

### 前提条件
- Node.js 18 以上
- AWS アカウント（上記リソースが構築済み）

### 手順

```bash
# リポジトリをクローン
git clone https://github.com/muumin1107/Warikan.git
cd Warikan

# 依存パッケージをインストール
npm install

# 環境変数ファイルを作成
cp .env.example .env.local
```

`.env.local` を以下の内容で編集：

```env
VITE_API_ENDPOINT=https://371y9wvaqh.execute-api.ap-northeast-1.amazonaws.com/dev
VITE_COGNITO_USER_POOL_ID=ap-northeast-1_IGFIftzmp
VITE_COGNITO_CLIENT_ID=2ka76borur8kkcosiupcnulv27
VITE_COGNITO_DOMAIN=ap-northeast-1igfiftzmp.auth.ap-northeast-1.amazoncognito.com
VITE_REDIRECT_SIGN_IN=http://localhost:5173
VITE_REDIRECT_SIGN_OUT=http://localhost:5173
```

```bash
# 開発サーバーを起動
npm run dev
```

ブラウザで `http://localhost:5173` を開く。

---

## Lambda 関数一覧

| 関数名 | トリガー | 概要 |
|--------|---------|------|
| `warikan-writer-dev` | SQS | 支払い・精算・プロジェクト作成の書き込み処理 |
| `warikan-reader-projects-dev` | API Gateway | プロジェクト一覧・詳細の取得 |
| `warikan-reader-expenses-dev` | API Gateway | 支払い一覧の取得（分担情報・isPaid 含む） |
| `warikan-reader-balance-dev` | API Gateway | 残高・精算プランの計算と取得 |
| `warikan-reader-upload-url-dev` | API Gateway | S3 プリサインド PUT URL の生成 |
| `warikan-invite-dev` | API Gateway | 招待・参加・ステータス変更処理 |
| `warikan-notifier-dev` | DynamoDB Streams | 支払い登録時の Push 通知送信 |
| `warikan-device-token-dev` | API Gateway | FCM デバイストークンの登録 |
| `warikan-delete-project-dev` | API Gateway | プロジェクトの物理削除 |

---

## デプロイ

Amplify Hosting に GitHub リポジトリを連携済み。`main` ブランチへの push で自動デプロイされます。

```bash
git add .
git commit -m "feat: ..."
git push origin main
```

---

## 今後の予定

- [ ] 支払い者の選択（現在はログインユーザー固定）
- [ ] SAM / IaC によるバックエンドのコード管理
- [ ] CI/CD パイプラインの整備
- [ ] `getName()` ユーティリティの共通化（`src/utils/members.js`）
- [ ] S3 ライフサイクルによる削除済みプロジェクトのレシート自動削除（180日）
- [ ] Windows ブラウザの Push 通知表示の改善

---

## ライセンス

MIT
