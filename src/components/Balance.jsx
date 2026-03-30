/**
 * Balance.jsx
 * 残高・精算コンポーネント。ProjectDetail の「残高・精算」タブで使用される。
 *
 * 表示内容：
 *   - メンバー別の純残高（NET_BALANCE テーブルから取得した値）
 *       正の値 = 受取超過（立て替え多め）
 *       負の値 = 支払超過（立て替えが少ない）
 *   - 精算プラン（最小送金回数 Greedy 法で算出）
 *       送金者のみ「返した」ボタンを表示
 *
 * NOTE: getName() は ExpenseList.jsx でも同一の実装を持つ。
 *       将来的には src/utils/members.js などの共有ユーティリティに切り出すこと。
 */

import { useState } from 'react'
import './Balance.css'

// ─────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────

/**
 * 精算処理後に一覧を再取得するまでの待機時間（ms）。
 * POST /settlements は SQS 経由の非同期処理（202 Accepted）のため、
 * DynamoDB への書き込みが完了するまで少し待つ必要がある。
 */

// ─────────────────────────────────────────────
// ユーティリティ
// ─────────────────────────────────────────────

/**
 * userId からニックネームを取得する。
 * ニックネームが未設定の場合は userId の先頭 8 文字を返す。
 * @param {Array<{ userId: string, nickname?: string }>} members
 * @param {string} userId
 * @returns {string}
 */
function getName(members, userId) {
  const member = members.find((m) => m.userId === userId)
  return member?.nickname || userId.slice(0, 8)
}

/**
 * 名前の先頭1文字を大文字で返す（アバター表示用）。
 * @param {string} name
 * @returns {string}
 */
function getInitial(name) {
  return name.slice(0, 1).toUpperCase()
}

// ─────────────────────────────────────────────
// メインコンポーネント
// ─────────────────────────────────────────────

/**
 * @param {{
 *   balance: {
 *     balances:    Array<{ userId: string, balance: number }>,
 *     settlements: Array<{ fromUserId: string, toUserId: string, amountJPY: number }>,
 *   },
 *   members:       Array<{ userId: string, nickname?: string }>,
 *   apiClient:     import('axios').AxiosInstance,
 *   projectId:     string,
 *   currentUserId: string,
 *   onSettled:     () => void,
 * }} props
 */
export default function Balance({
  balance,
  members,
  apiClient,
  projectId,
  currentUserId,
  onSettled,
}) {
  // 精算処理中の planId（連打防止）
  const [error,      setError]      = useState('')

  // ─────────────────────────────────────────────
  // 精算処理（「返した」ボタン）
  // ─────────────────────────────────────────────



  // ─────────────────────────────────────────────
  // レンダー
  // ─────────────────────────────────────────────

  const balances    = balance.balances    || []
  const settlements = balance.settlements || []

  return (
    <div>
      {/* エラーバナー */}
      {error && <div className="error" role="alert">{error}</div>}

      {/* ── メンバー別残高カード */}
      <div className="card">
        <h2 className="balance-section-title">メンバー別残高</h2>
        <p className="balance-section-desc">
          ＋は受け取り超過（立て替え多め）、－は支払い超過（立て替え少なめ）を表します
        </p>

        {balances.map((b) => {
          const name      = getName(members, b.userId)
          const isPositive = b.balance >= 0
          return (
            <div key={b.userId} className="list-item">
              {/* アバター + 名前 */}
              <div className="balance-member">
                <div className="avatar">{getInitial(name)}</div>
                <span className="balance-member-name">{name}</span>
              </div>

              {/* 残高（正: 受取超過 / 負: 支払超過） */}
              <span className={`balance-amount ${isPositive ? 'amount-positive' : 'amount-negative'}`}>
                {isPositive ? '+' : ''}¥{b.balance.toLocaleString()}
              </span>
            </div>
          )
        })}
      </div>

      {/* ── 精算プランセクションラベル */}
      <div className="balance-plan-label">精算プラン（最少送金数）</div>
      <p className="balance-plan-desc">
        最も少ない回数で精算できる送金プランです。送金したら「返した」ボタンを押してください
      </p>

      {/* 精算不要（全員精算済み） */}
      {settlements.length === 0 ? (
        <div className="card balance-settled-card">
          <p className="balance-settled-text">✅ 全員精算済みです</p>
        </div>
      ) : (
        // 精算プラン一覧
        settlements.map((s, i) => {
          /**
           * この精算プランのクライアント側 ID。
           * settlements は配列インデックスで管理（サーバー生成 ID がないため）。
           * 同一インデックスで複数精算が発生しないよう i を使う。
           */
          const planId   = `plan-${i}`

          const fromName = getName(members, s.fromUserId)
          const toName   = getName(members, s.toUserId)

          return (
            <div key={planId} className="card settle-card">
              {/* 送金者 → 受取者 */}
              <div className="settle-info">
                {/* 送金者 */}
                <div className="settle-person">
                  <div className="avatar settle-avatar">{getInitial(fromName)}</div>
                  <span className="settle-name">{fromName}</span>
                </div>

                {/* 矢印 */}
                <span className="settle-arrow" aria-hidden="true">→</span>

                {/* 受取者 */}
                <div className="settle-person">
                  <div className="avatar settle-avatar">{getInitial(toName)}</div>
                  <span className="settle-name">{toName}</span>
                </div>
              </div>

              {/* 金額 */}
              <div className="settle-right">
                <span className="settle-amount">
                  ¥{s.amountJPY.toLocaleString()}
                </span>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}