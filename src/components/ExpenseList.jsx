/**
 * ExpenseList.jsx
 * 支払い一覧コンポーネント。ProjectDetail の「支払い一覧」タブで使用される。
 *
 * カード構造：
 *   .expense-top    … 左：タイトル + 支払者 ／ 右：合計金額 + 1人あたり
 *   .expense-bottom … 左：請求先バッジ ／ 右：編集・削除（自分の支払いのみ）
 */

import { useEffect, useState } from 'react'
import './ExpenseList.css'

// ─────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────

/**
 * 更新・削除後に一覧を再取得するまでの待機時間（ms）。
 * PUT / DELETE /expenses は SQS 経由の非同期処理（202 Accepted）のため、
 * DynamoDB への書き込みが完了するまで少し待つ必要がある。
 */
const REFETCH_DELAY_MS = 2000

// ─────────────────────────────────────────────
// ユーティリティ
// ─────────────────────────────────────────────

/**
 * userId からニックネームを取得する。
 * ニックネームが未設定の場合は userId の先頭 8 文字を返す。
 * NOTE: Balance.jsx でも同一の実装がある。
 *       将来的には src/utils/members.js に共通化すること。
 * @param {Array<{ userId: string, nickname?: string }>} members
 * @param {string} userId
 * @returns {string}
 */
function getName(members, userId) {
  const member = members.find((m) => m.userId === userId)
  return member?.nickname || userId.slice(0, 8)
}

// ─────────────────────────────────────────────
// メインコンポーネント
// ─────────────────────────────────────────────

/**
 * @param {{
 *   expenses:      Array<object>,
 *   members:       Array<{ userId: string, nickname?: string }>,
 *   apiClient:       import('axios').AxiosInstance,
 *   projectId:       string,
 *   currentUserId:   string,
 *   onRefresh:       () => void,
 *   isProjectClosed: boolean,  プロジェクト終了中は編集・削除を非表示にする
 * }} props
 */
export default function ExpenseList({
  expenses,
  members,
  apiClient,
  projectId,
  currentUserId,
  onRefresh,
  isProjectClosed = false,
}) {
  // ── 編集モーダル
  const [editTarget, setEditTarget] = useState(null)
  const [editForm,   setEditForm]   = useState({})
  const [saving,     setSaving]     = useState(false)

  // ── 削除処理中の expenseId（連打防止）
  const [deletingId, setDeletingId] = useState(null)

  // ── エラー表示
  const [error, setError] = useState('')

  // ─────────────────────────────────────────────
  // Escape キーで編集モーダルを閉じる
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (!editTarget) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') closeEdit()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editTarget])

  // ─────────────────────────────────────────────
  // 編集モーダル操作
  // ─────────────────────────────────────────────

  const openEdit = (expense) => {
    setError('')
    setEditTarget(expense)
    setEditForm({
      title:         expense.title,
      amountJPY:     expense.amountJPY,
      splitType:     expense.splitType,
      splitUserIds:  expense.splitUserIds || [],
      paymentMethod: expense.paymentMethod,
    })
  }

  const closeEdit = () => {
    setEditTarget(null)
    setEditForm({})
    setError('')
  }

  const updateEditForm = (field) => (e) => {
    setEditForm((prev) => ({ ...prev, [field]: e.target.value }))
  }

  const toggleMember = (userId) => {
    setEditForm((prev) => ({
      ...prev,
      splitUserIds: prev.splitUserIds.includes(userId)
        ? prev.splitUserIds.filter((id) => id !== userId)
        : [...prev.splitUserIds, userId],
    }))
  }

  // ─────────────────────────────────────────────
  // 支払い更新
  // ─────────────────────────────────────────────
  const handleUpdate = async () => {
    if (!editTarget) return
    setError('')
    setSaving(true)

    const splitUserIds = editForm.splitType === 'ALL'
      ? members.map((m) => m.userId)
      : editForm.splitUserIds

    try {
      await apiClient.put(`/expenses/${editTarget.expenseId}`, {
        operation:     'UPDATE',
        expenseId:     editTarget.expenseId,
        projectId,
        title:         editForm.title.trim(),
        amountJPY:     parseInt(editForm.amountJPY),
        splitType:     editForm.splitType,
        splitUserIds,
        paymentMethod: editForm.paymentMethod,
        paidAt:        editTarget.paidAt,
      })
      closeEdit()
      setTimeout(onRefresh, REFETCH_DELAY_MS)
    } catch (err) {
      console.error('支払いの更新に失敗しました:', err)
      setError(err?.response?.data?.message || '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  // ─────────────────────────────────────────────
  // 支払い削除（論理削除）
  // ─────────────────────────────────────────────
  const handleDelete = async (expense) => {
    if (!window.confirm(`「${expense.title}」を削除しますか？`)) return
    setDeletingId(expense.expenseId)
    setError('')
    try {
      await apiClient.delete(`/expenses/${expense.expenseId}`, {
        data: {
          operation: 'DELETE',
          expenseId: expense.expenseId,
          projectId,
        },
      })
      setTimeout(onRefresh, REFETCH_DELAY_MS)
    } catch (err) {
      console.error('支払いの削除に失敗しました:', err)
      setError(err?.response?.data?.message || '削除に失敗しました')
    } finally {
      setDeletingId(null)
    }
  }

  // ─────────────────────────────────────────────
  // レンダー
  // ─────────────────────────────────────────────

  if (expenses.length === 0) {
    return (
      <div className="el-empty card">
        <p>まだ支払いがありません</p>
        <p className="el-empty-hint">＋ボタンから追加してください</p>
      </div>
    )
  }

  const total = expenses.reduce((sum, e) => sum + e.amountJPY, 0)

  return (
    <div>
      {/* エラーバナー */}
      {error && <div className="error" role="alert">{error}</div>}

      {/* ── 支払いカード一覧 */}
      {expenses.map((expense) => {
        const splitCount  = expense.splitUserIds?.length || 1
        const perPerson   = Math.floor(expense.amountJPY / splitCount)
        const isMyExpense = expense.payerId === currentUserId
        const isDeleting  = deletingId === expense.expenseId
        const payerName   = getName(members, expense.payerId)
        const payerInitial = payerName.slice(0, 1).toUpperCase()

        return (
          <div key={expense.expenseId} className="expense-item card">

            {/* ── 上段：タイトル + 支払者 ／ 合計金額 + 1人あたり */}
            <div className="expense-top">
              {/* 左：タイトル + 支払者行 */}
              <div className="expense-top-left">
                <div className="expense-title">{expense.title}</div>
                <div className="expense-payer-row">
                  <div className="expense-payer-avatar" aria-hidden="true">
                    {payerInitial}
                  </div>
                  <span className="expense-payer">{payerName}が払った</span>
                </div>
              </div>

              {/* 右：合計金額 + 1人あたり */}
              <div className="expense-top-right">
                <div className="expense-amount">
                  ¥{expense.amountJPY.toLocaleString()}
                </div>
                <div className="expense-per">
                  1人 ¥{perPerson.toLocaleString()}
                </div>
              </div>
            </div>

            {/* ── 下段：請求先バッジ + アクション */}
            <div className="expense-bottom">
              {/* 請求先バッジ */}
              <span className={`expense-split-badge ${expense.splitType === 'ALL' ? 'expense-split-badge--all' : 'expense-split-badge--custom'}`}>
                {expense.splitType === 'ALL' ? '全員' : `${splitCount}人`}
              </span>

              {/* 自分の支払い かつ プロジェクト進行中のみ編集・削除を表示
                  isProjectClosed === true のときはボタン自体を非表示にする
                  （disabled ではなく非表示にすることで終了状態を明確にする） */}
              {isMyExpense && !isProjectClosed && (
                <div className="expense-actions">
                  <button
                    className="expense-edit-btn"
                    onClick={() => openEdit(expense)}
                    disabled={isDeleting}
                  >
                    編集
                  </button>
                  <button
                    className="expense-delete-btn"
                    onClick={() => handleDelete(expense)}
                    disabled={isDeleting}
                  >
                    {isDeleting ? '削除中...' : '削除'}
                  </button>
                </div>
              )}
            </div>

          </div>
        )
      })}

      {/* ── 合計カード */}
      <div className="el-total card">
        <div className="el-total-meta">
          <span className="el-total-label">合計（{expenses.length}件）</span>
          <span className="el-total-amount">¥{total.toLocaleString()}</span>
        </div>
      </div>

      {/* ── 編集モーダル */}
      {editTarget && (
        <div
          className="modal-overlay"
          onClick={closeEdit}
          role="dialog"
          aria-modal="true"
          aria-label="支払いを編集"
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" aria-hidden="true" />
            <h2>支払いを編集</h2>

            {error && <div className="error" role="alert">{error}</div>}

            <div className="form-group">
              <label htmlFor="edit-title">タイトル</label>
              <input
                id="edit-title"
                type="text"
                value={editForm.title}
                onChange={updateEditForm('title')}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="edit-amount">金額（円）</label>
              <input
                id="edit-amount"
                type="number"
                value={editForm.amountJPY}
                onChange={updateEditForm('amountJPY')}
                min="1"
              />
            </div>

            <div className="form-group">
              <label htmlFor="edit-method">支払い方法</label>
              <select
                id="edit-method"
                value={editForm.paymentMethod}
                onChange={updateEditForm('paymentMethod')}
              >
                <option value="cash">現金</option>
                <option value="card">カード</option>
              </select>
            </div>

            <div className="form-group">
              <label>請求先</label>
              <div className="split-toggle">
                <button
                  type="button"
                  className={editForm.splitType === 'ALL' ? 'active' : ''}
                  onClick={() => setEditForm((prev) => ({ ...prev, splitType: 'ALL' }))}
                >
                  全員
                </button>
                <button
                  type="button"
                  className={editForm.splitType === 'CUSTOM' ? 'active' : ''}
                  onClick={() => setEditForm((prev) => ({ ...prev, splitType: 'CUSTOM' }))}
                >
                  選択する
                </button>
              </div>

              {editForm.splitType === 'CUSTOM' && (
                <div className="member-checklist">
                  {members.map((m) => {
                    const isChecked = editForm.splitUserIds.includes(m.userId)
                    return (
                      <div
                        key={m.userId}
                        className={`member-check-item ${isChecked ? 'member-check-item--checked' : ''}`}
                        onClick={() => toggleMember(m.userId)}
                        role="checkbox"
                        aria-checked={isChecked}
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && toggleMember(m.userId)}
                      >
                        <div className="member-check-avatar">
                          {(m.nickname || m.userId).slice(0, 1).toUpperCase()}
                        </div>
                        <span className="member-check-name">
                          {m.nickname || m.userId.slice(0, 8)}
                        </span>
                        <span className="member-check-icon" aria-hidden="true">
                          {isChecked ? '✅' : '○'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <button
              className="primary-button el-modal-save-btn"
              onClick={handleUpdate}
              disabled={saving || !editForm.title?.trim() || !editForm.amountJPY}
            >
              {saving ? '保存中...' : '保存する'}
            </button>
            <button
              className="secondary-button el-modal-cancel-btn"
              onClick={closeEdit}
              disabled={saving}
            >
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  )
}