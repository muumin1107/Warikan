import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'

// userId からニックネームを取得するヘルパー
function getName(members, userId) {
  const m = members.find(m => m.userId === userId)
  return m?.nickname || userId.slice(0, 8)
}

export default function ExpenseList({ expenses, members, apiClient, projectId, currentUserId, onRefresh }) {
  const [editTarget, setEditTarget]   = useState(null)  // 編集中のexpense
  const [editForm, setEditForm]       = useState({})
  const [saving, setSaving]           = useState(false)
  const [deletingId, setDeletingId]   = useState(null)

  const openEdit = (expense) => {
    setEditTarget(expense)
    setEditForm({
      title:         expense.title,
      amountJPY:     expense.amountJPY,
      splitType:     expense.splitType,
      splitUserIds:  expense.splitUserIds || [],
      paymentMethod: expense.paymentMethod,
    })
  }

  const closeEdit = () => { setEditTarget(null); setEditForm({}) }

  const toggleMember = (userId) => {
    setEditForm(prev => ({
      ...prev,
      splitUserIds: prev.splitUserIds.includes(userId)
        ? prev.splitUserIds.filter(id => id !== userId)
        : [...prev.splitUserIds, userId]
    }))
  }

  const handleUpdate = async () => {
    if (!editTarget) return
    setSaving(true)
    try {
      const splitUserIds = editForm.splitType === 'ALL'
        ? members.map(m => m.userId)
        : editForm.splitUserIds

      await apiClient.put(`/expenses/${editTarget.expenseId}`, {
        operation:     'UPDATE',
        expenseId:     editTarget.expenseId,
        projectId,
        title:         editForm.title,
        amountJPY:     parseInt(editForm.amountJPY),
        splitType:     editForm.splitType,
        splitUserIds,
        paymentMethod: editForm.paymentMethod,
        paidAt:        editTarget.paidAt,
      })
      closeEdit()
      setTimeout(onRefresh, 2000)
    } catch (err) {
      console.error('Failed to update expense:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (expense) => {
    if (!window.confirm(`「${expense.title}」を削除しますか？`)) return
    setDeletingId(expense.expenseId)
    try {
      await apiClient.delete(`/expenses/${expense.expenseId}`, {
        data: {
          operation:  'DELETE',
          expenseId:  expense.expenseId,
          projectId,
        }
      })
      setTimeout(onRefresh, 2000)
    } catch (err) {
      console.error('Failed to delete expense:', err)
    } finally {
      setDeletingId(null)
    }
  }

  if (expenses.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '32px' }}>
        <p>まだ支払いがありません</p>
        <p style={{ fontSize: '13px', color: '#999', marginTop: '8px' }}>
          ＋ボタンから追加してください
        </p>
      </div>
    )
  }

  const total = expenses.reduce((sum, e) => sum + e.amountJPY, 0)

  return (
    <div>
      {expenses.map(expense => {
        const perPerson  = Math.floor(expense.amountJPY / (expense.splitUserIds?.length || 1))
        const isMyExpense = expense.payerId === currentUserId
        return (
          <div key={expense.expenseId} className="expense-item card">
            <div className="expense-top">
              <span className="expense-title">{expense.title}</span>
              <span className="expense-amount">¥{expense.amountJPY.toLocaleString()}</span>
            </div>
            <div className="expense-bottom">
              <span className="expense-payer">
                {getName(members, expense.payerId)}が払った
              </span>
              <span className={`badge ${expense.splitType === 'ALL' ? 'badge-all' : 'badge-custom'}`}>
                {expense.splitType === 'ALL' ? '全員' : `${expense.splitUserIds?.length}人`}
              </span>
              <span className="expense-per">1人 ¥{perPerson.toLocaleString()}</span>
            </div>

            {/* 自分の支払いのみ編集・削除ボタンを表示 */}
            {isMyExpense && (
              <div className="expense-actions">
                <button className="expense-edit-btn" onClick={() => openEdit(expense)}>
                  編集
                </button>
                <button
                  className="expense-delete-btn"
                  onClick={() => handleDelete(expense)}
                  disabled={deletingId === expense.expenseId}
                >
                  {deletingId === expense.expenseId ? '削除中...' : '削除'}
                </button>
              </div>
            )}
          </div>
        )
      })}

      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', color: '#666' }}>合計（{expenses.length}件）</span>
        <span style={{ fontSize: '20px', fontWeight: '700' }}>¥{total.toLocaleString()}</span>
      </div>

      {/* 編集モーダル */}
      {editTarget && (
        <div className="modal-overlay" onClick={closeEdit}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>支払いを編集</h2>

            <div className="form-group">
              <label>タイトル</label>
              <input
                type="text"
                value={editForm.title}
                onChange={e => setEditForm({ ...editForm, title: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label>金額（円）</label>
              <input
                type="number"
                value={editForm.amountJPY}
                onChange={e => setEditForm({ ...editForm, amountJPY: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label>支払い方法</label>
              <select
                value={editForm.paymentMethod}
                onChange={e => setEditForm({ ...editForm, paymentMethod: e.target.value })}
              >
                <option value="cash">現金</option>
                <option value="card">カード</option>
              </select>
            </div>

            <div className="form-group">
              <label>請求先</label>
              <div className="split-toggle">
                <button
                  className={editForm.splitType === 'ALL' ? 'active' : ''}
                  onClick={() => setEditForm({ ...editForm, splitType: 'ALL' })}
                >全員</button>
                <button
                  className={editForm.splitType === 'CUSTOM' ? 'active' : ''}
                  onClick={() => setEditForm({ ...editForm, splitType: 'CUSTOM' })}
                >選択する</button>
              </div>

              {editForm.splitType === 'CUSTOM' && (
                <div className="member-list" style={{ marginTop: '8px' }}>
                  {members.map(m => (
                    <div
                      key={m.userId}
                      className={`member-check ${editForm.splitUserIds.includes(m.userId) ? 'checked' : ''}`}
                      onClick={() => toggleMember(m.userId)}
                    >
                      <div className="avatar" style={{ width: '24px', height: '24px', fontSize: '11px' }}>
                        {m.userId.slice(0, 1).toUpperCase()}
                      </div>
                      <span>{m.nickname || m.userId.slice(0, 8)}</span>
                      <span>{editForm.splitUserIds.includes(m.userId) ? '✅' : '○'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              className="primary-button"
              style={{ width: '100%', padding: '14px', marginTop: '8px' }}
              onClick={handleUpdate}
              disabled={saving}
            >
              {saving ? '保存中...' : '保存する'}
            </button>
            <button
              className="secondary-button"
              style={{ width: '100%', padding: '12px', marginTop: '8px' }}
              onClick={closeEdit}
            >
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  )
}