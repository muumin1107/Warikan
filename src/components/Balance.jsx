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
import { v4 as uuidv4 } from 'uuid'
import './Balance.css'

// ─────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────

/**
 * 精算処理後に一覧を再取得するまでの待機時間（ms）。
 * POST /settlements は SQS 経由の非同期処理（202 Accepted）のため、
 * DynamoDB への書き込みが完了するまで少し待つ必要がある。
 */
const REFETCH_DELAY_MS = 2000

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
  /**
   * 精算処理中の settlementId を保持する。
   * ※ オブジェクト全体での比較（settling === s）は参照比較になり不安定なため、
   *    一意な ID 文字列で管理する。
   * @type {[string | null, Function]}
   */
  const [settlingId, setSettlingId] = useState(null)

  // エラー表示
  const [error, setError] = useState('')

  // ─────────────────────────────────────────────
  // 精算処理（「返した」ボタン）
  // ─────────────────────────────────────────────

  /**
   * POST /projects/{id}/settlements で精算記録を作成する。
   * verifiedUserId = fromUserId（送金者）として VTL で注入される。
   * @param {{ fromUserId: string, toUserId: string, amountJPY: number }} settlement
   * @param {string} settlementId  画面内での一意 ID（クリック時に生成）
   */
  const handleSettle = async (settlement, settlementId) => {
    setSettlingId(settlementId)
    setError('')
    try {
      await apiClient.post(`/projects/${projectId}/settlements`, {
        operation:    'CREATE_SETTLEMENT',
        settlementId: uuidv4(),           // DynamoDB の主キー
        toUserId:     settlement.toUserId,
        amountJPY:    settlement.amountJPY,
      })
      // SQS 非同期のため書き込み完了を待ってから再取得
      setTimeout(onSettled, REFETCH_DELAY_MS)
    } catch (err) {
      console.error('精算処理に失敗しました:', err)
      setError(err?.response?.data?.message || '精算の処理に失敗しました')
    } finally {
      setSettlingId(null)
    }
  }

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
      <div className="balance-plan-label">
        精算プラン（最少送金数）
      </div>

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
          const planId      = `plan-${i}`
          const isSettling  = settlingId === planId
          const isMySend    = s.fromUserId === currentUserId

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

              {/* 金額 + 「返した」ボタン */}
              <div className="settle-right">
                <span className="settle-amount">
                  ¥{s.amountJPY.toLocaleString()}
                </span>

                {/* 送金者のみ「返した」ボタンを表示 */}
                {isMySend && (
                  <button
                    className="settle-button"
                    onClick={() => handleSettle(s, planId)}
                    disabled={isSettling}
                  >
                    {isSettling ? '処理中...' : '返した'}
                  </button>
                )}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}