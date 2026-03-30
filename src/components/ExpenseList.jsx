/**
 * ExpenseList.jsx
 * 支払い一覧コンポーネント。ProjectDetail の「支払い一覧」タブで使用される。
 *
 * カード構造：
 *   .expense-top    … 左：タイトル + 支払者 ／ 右：合計金額 + 1人あたり
 *   .expense-bottom … 左：請求先バッジ ／ 右：編集・削除（自分の支払いのみ）
 */

import { useEffect, useState } from 'react'
import { CATEGORIES, CURRENCIES } from '../pages/ProjectDetail'
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
  const [editTarget,       setEditTarget]       = useState(null)
  const [editForm,         setEditForm]         = useState({})
  const [saving,           setSaving]           = useState(false)
  const [receiptUploading, setReceiptUploading] = useState(false)  // レシートアップロード中

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

  /**
   * レシート画像を S3 にアップロードする（ProjectDetail.jsx と同一ロジック）。
   * @param {File} file
   * @returns {Promise<string>} アップロード済みの fileUrl
   */
  const uploadReceipt = async (file) => {
    setReceiptUploading(true)
    try {
      const res = await apiClient.get('/expenses/receipt/upload-url', {
        params: { fileName: file.name, contentType: file.type },
      })
      const { uploadUrl, fileUrl } = res.data
      const putRes = await fetch(uploadUrl, {
        method:  'PUT',
        headers: { 'Content-Type': file.type },
        body:    file,
      })

      // fetch は 4xx/5xx でも例外を投げないため、ステータスを明示的に確認する
      if (!putRes.ok) {
        throw new Error(`S3へのアップロードに失敗しました (${putRes.status})`)
      }

      return fileUrl
    } finally {
      setReceiptUploading(false)
    }
  }

  const openEdit = (expense) => {
    setError('')
    setEditTarget(expense)
    setEditForm({
      title:          expense.title,
      amountJPY:      expense.amountJPY,
      currency:       expense.currency       || 'JPY',
      originalAmount: expense.originalAmount || '',
      exchangeRate:   expense.exchangeRate   || '',
      category:       expense.category       || '',
      splitType:      expense.splitType,
      splitUserIds:   expense.splitUserIds   || [],
      paymentMethod:  expense.paymentMethod,
      receiptUrl:     expense.receiptUrl     || '',
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
        operation:      'UPDATE',
        expenseId:      editTarget.expenseId,
        projectId,
        title:          editForm.title.trim(),
        amountJPY:      parseInt(editForm.amountJPY),
        currency:       editForm.currency      || 'JPY',
        originalAmount: editForm.currency !== 'JPY' ? parseFloat(editForm.originalAmount) : parseInt(editForm.amountJPY),
        exchangeRate:   editForm.currency !== 'JPY' ? parseFloat(editForm.exchangeRate)   : 1,
        category:       editForm.category,
        splitType:      editForm.splitType,
        splitUserIds,
        paymentMethod:  editForm.paymentMethod,
        receiptUrl:     editForm.receiptUrl    || '',
        paidAt:         editTarget.paidAt,
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

  const total          = expenses.reduce((sum, e) => sum + e.amountJPY, 0)
  const memberCount    = members.length || 1
  // 全支払い合計をメンバー数で均等割りした参考値（端数切り捨て）
  const totalPerPerson = Math.floor(total / memberCount)

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

        // カテゴリ情報（バッジ表示用）
        const categoryInfo = CATEGORIES.find((c) => c.value === expense.category) ?? null

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

              {/* 右：合計金額 + 1人あたり（外貨の場合は現地金額も表示） */}
              <div className="expense-top-right">
                <div className="expense-amount">
                  ¥{expense.amountJPY.toLocaleString()}
                </div>
                {expense.currency && expense.currency !== 'JPY' && expense.originalAmount && (
                  <div className="expense-original-amount">
                    {CURRENCIES.find((c) => c.code === expense.currency)?.symbol}
                    {Number(expense.originalAmount).toLocaleString()}
                  </div>
                )}
                <div className="expense-per">
                  1人 ¥{perPerson.toLocaleString()}
                </div>
              </div>
            </div>

            {/* ── 下段：カテゴリ + 請求先バッジ + アクション */}
            <div className="expense-bottom">
              {/* カテゴリバッジ（保存済みカテゴリがある場合のみ表示） */}
              {categoryInfo && (
                <span className={`expense-category-badge expense-category-badge--${categoryInfo.color}`}>
                  {categoryInfo.label}
                </span>
              )}
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

            {/* レシート写真サムネイル（設定されている場合のみ） */}
            {expense.receiptUrl && (
              <a
                href={expense.receiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="expense-receipt-link"
                aria-label="レシートを拡大表示"
              >
                <img
                  src={expense.receiptUrl}
                  alt="レシート"
                  className="expense-receipt-thumb"
                />
                <span className="expense-receipt-label">レシートを見る</span>
              </a>
            )}

          </div>
        )
      })}

      {/* ── 合計カード */}
      <div className="el-total card">
        {/* 左：件数ラベル + 合計金額 */}
        <div className="el-total-meta">
          <span className="el-total-label">合計（{expenses.length}件）</span>
          <span className="el-total-amount">¥{total.toLocaleString()}</span>
        </div>
        {/* 右：メンバー数 + 1人あたり金額 */}
        <div className="el-total-per">
          <span className="el-total-per-label">{memberCount}人で割ると</span>
          <span className="el-total-per-amount">
            ¥{totalPerPerson.toLocaleString()}
            <span className="el-total-per-unit">/人</span>
          </span>
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

            {/* 通貨 */}
            <div className="form-group">
              <label htmlFor="edit-currency">通貨</label>
              <select
                id="edit-currency"
                value={editForm.currency || 'JPY'}
                onChange={(e) => {
                  const cur = CURRENCIES.find((c) => c.code === e.target.value)
                  setEditForm((prev) => ({
                    ...prev,
                    currency:       cur.code,
                    originalAmount: '',
                    exchangeRate:   cur.code !== 'JPY' ? String(cur.defaultRate) : '',
                    amountJPY:      cur.code === 'JPY' ? prev.amountJPY : '',
                  }))
                }}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
            </div>

            {/* 金額（通貨に応じて切り替え） */}
            {(!editForm.currency || editForm.currency === 'JPY') ? (
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
            ) : (
              <>
                <div className="form-group">
                  <label htmlFor="edit-original-amount">
                    金額（{editForm.currency}）
                  </label>
                  <div className="currency-amount-row">
                    <span className="currency-symbol">
                      {CURRENCIES.find((c) => c.code === editForm.currency)?.symbol}
                    </span>
                    <input
                      id="edit-original-amount"
                      type="number"
                      placeholder="0"
                      value={editForm.originalAmount}
                      min="0"
                      step="any"
                      onChange={(e) => {
                        const orig = parseFloat(e.target.value) || 0
                        const rate = parseFloat(editForm.exchangeRate) || 0
                        setEditForm((prev) => ({
                          ...prev,
                          originalAmount: e.target.value,
                          amountJPY:      rate ? Math.round(orig * rate) : prev.amountJPY,
                        }))
                      }}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="edit-rate">
                    為替レート（1{editForm.currency} = ?円）
                  </label>
                  <input
                    id="edit-rate"
                    type="number"
                    placeholder="例: 150"
                    value={editForm.exchangeRate}
                    min="0"
                    step="any"
                    onChange={(e) => {
                      const rate = parseFloat(e.target.value) || 0
                      const orig = parseFloat(editForm.originalAmount) || 0
                      setEditForm((prev) => ({
                        ...prev,
                        exchangeRate: e.target.value,
                        amountJPY:    rate ? Math.round(orig * rate) : prev.amountJPY,
                      }))
                    }}
                  />
                </div>
                {editForm.amountJPY && (
                  <div className="currency-preview">
                    <span className="currency-preview-label">円換算（概算）</span>
                    <span className="currency-preview-amount">
                      ¥{parseInt(editForm.amountJPY).toLocaleString()}
                    </span>
                  </div>
                )}
              </>
            )}

            <div className="form-group">
              <label>カテゴリ（任意）</label>
              <div className="category-select">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    className={`category-chip category-chip--${cat.color} ${editForm.category === cat.value ? 'category-chip--active' : ''}`}
                    onClick={() => setEditForm((prev) => ({
                      ...prev,
                      category: prev.category === cat.value ? '' : cat.value,
                    }))}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
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
                        {/* SVGチェックアイコン（絵文字を使わない） */}
                        <MemberCheckSvg checked={isChecked} />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* レシート写真（任意） */}
            <div className="form-group">
              <label>レシート写真（任意）</label>
              <label className="receipt-upload-label">
                <input
                  type="file"
                  accept="image/*"
                  className="receipt-upload-input"
                  disabled={receiptUploading}
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    try {
                      const url = await uploadReceipt(file)
                      setEditForm((prev) => ({ ...prev, receiptUrl: url }))
                    } catch {
                      setError('レシートのアップロードに失敗しました')
                    }
                  }}
                />
                <span className={`receipt-upload-btn ${receiptUploading ? 'receipt-upload-btn--loading' : ''}`}>
                  {receiptUploading ? 'アップロード中...' : editForm.receiptUrl ? '写真を変更' : '写真を選択'}
                </span>
              </label>
              {editForm.receiptUrl && (
                <div className="receipt-preview">
                  <img
                    src={editForm.receiptUrl}
                    alt="レシートプレビュー"
                    className="receipt-preview-img"
                  />
                  <button
                    type="button"
                    className="receipt-remove-btn"
                    onClick={() => setEditForm((prev) => ({ ...prev, receiptUrl: '' }))}
                    aria-label="写真を削除"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            <button
              className="primary-button el-modal-save-btn"
              onClick={handleUpdate}
              disabled={saving || receiptUploading || !editForm.title?.trim() || !editForm.amountJPY}
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

// ─────────────────────────────────────────────
// SVG アイコンコンポーネント
// ProjectDetail.jsx の MemberCheckSvg と同一実装。
// 将来的には src/components/icons.jsx に共通化すること。
// ─────────────────────────────────────────────

/**
 * メンバー選択チェックアイコン。
 * checked=true  → 塗りつぶし円 + 白チェックマーク
 * checked=false → グレーの円枠のみ
 * @param {{ checked: boolean }} props
 */
function MemberCheckSvg({ checked }) {
  return (
    <svg
      className="member-check-svg"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      {checked ? (
        <>
          <circle cx="10" cy="10" r="10" fill="var(--color-primary)" />
          <path
            d="M6 10l3 3 5-5"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <circle
          cx="10" cy="10" r="9"
          stroke="var(--color-border)"
          strokeWidth="1.5"
        />
      )}
    </svg>
  )
}