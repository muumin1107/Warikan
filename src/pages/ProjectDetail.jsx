import { useEffect, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'  // ← 追加
import ExpenseList from '../components/ExpenseList'
import Balance from '../components/Balance'
import './ProjectDetail.css'

export default function ProjectDetail({ apiClient, project, onBack, currentUserId }) {
  const [tab, setTab]             = useState('expenses')
  const [members, setMembers]     = useState([])
  const [expenses, setExpenses]   = useState([])
  const [balance, setBalance]     = useState({ balances: [], settlements: [] })
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [newExpense, setNewExpense] = useState({
    title: '',
    amountJPY: '',
    splitType: 'ALL',
    splitUserIds: [],
    paymentMethod: 'cash',
    receiptUrl: '',
    paidAt: new Date().toISOString()
  })

  useEffect(() => {
    fetchAll()
  }, [])

  const fetchAll = async () => {
    try {
      const [projRes, expRes, balRes] = await Promise.all([
        apiClient.get(`/projects/${project.projectId}`),
        apiClient.get(`/projects/${project.projectId}/expenses`),
        apiClient.get(`/projects/${project.projectId}/balance`)
      ])
      setMembers(projRes.data.members || [])
      setExpenses(expRes.data.expenses || [])
      setBalance(balRes.data)
    } catch (err) {
      console.error('Failed to fetch:', err)
    } finally {
      setLoading(false)
    }
  }

  const createExpense = async () => {
    if (!newExpense.title.trim() || !newExpense.amountJPY) return
    try {
      const splitUserIds = newExpense.splitType === 'ALL'
        ? members.map(m => m.userId)
        : newExpense.splitUserIds

      const payload = {
        operation:     'CREATE',        // ← 追加
        expenseId:     uuidv4(),        // ← 追加
        title:         newExpense.title,
        amountJPY:     parseInt(newExpense.amountJPY),
        splitType:     newExpense.splitType,
        splitUserIds:  splitUserIds,
        paymentMethod: newExpense.paymentMethod,
        receiptUrl:    newExpense.receiptUrl,
        paidAt:        new Date().toISOString(),
      }
      await apiClient.post(`/projects/${project.projectId}/expenses`, payload)
      setShowModal(false)
      setNewExpense({
        title: '',
        amountJPY: '',
        splitType: 'ALL',
        splitUserIds: [],
        paymentMethod: 'cash',
        receiptUrl: '',
        paidAt: new Date().toISOString()
      })
      setTimeout(fetchAll, 2000)
    } catch (err) {
      console.error('Failed to create expense:', err)
    }
  }

  const toggleMember = (userId) => {
    setNewExpense(prev => ({
      ...prev,
      splitUserIds: prev.splitUserIds.includes(userId)
        ? prev.splitUserIds.filter(id => id !== userId)
        : [...prev.splitUserIds, userId]
    }))
  }

  if (loading) return <div className="loading">読み込み中...</div>

  return (
    <div>
      <div className="header">
        <button
          onClick={onBack}
          style={{
            background: 'none',
            padding: '4px 8px',
            fontSize: '20px',
            color: '#333'
          }}
        >
          ←
        </button>
        <h1 style={{ fontSize: '16px' }}>{project.name}</h1>
        <div style={{ width: '40px' }} />
      </div>

      <div className="main-content">
        <div className="tabs">
          <button
            className={`tab ${tab === 'expenses' ? 'active' : ''}`}
            onClick={() => setTab('expenses')}
          >
            支払い一覧
          </button>
          <button
            className={`tab ${tab === 'balance' ? 'active' : ''}`}
            onClick={() => setTab('balance')}
          >
            残高・精算
          </button>
        </div>

        {tab === 'expenses' ? (
          <ExpenseList
            expenses={expenses}
            members={members}
          />
        ) : (
          <Balance
            balance={balance}
            members={members}
            apiClient={apiClient}
            projectId={project.projectId}
            onSettled={fetchAll}
            currentUserId={currentUserId}
          />
        )}
      </div>

      {tab === 'expenses' && (
        <button className="fab" onClick={() => setShowModal(true)}>＋</button>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>支払いを追加</h2>

            <div className="form-group">
              <label>タイトル</label>
              <input
                type="text"
                placeholder="例: ランチ代"
                value={newExpense.title}
                onChange={e => setNewExpense({ ...newExpense, title: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label>金額（円）</label>
              <input
                type="number"
                placeholder="0"
                value={newExpense.amountJPY}
                onChange={e => setNewExpense({ ...newExpense, amountJPY: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label>支払い方法</label>
              <select
                value={newExpense.paymentMethod}
                onChange={e => setNewExpense({ ...newExpense, paymentMethod: e.target.value })}
              >
                <option value="cash">現金</option>
                <option value="card">カード</option>
              </select>
            </div>

            <div className="form-group">
              <label>請求先</label>
              <div className="split-toggle">
                <button
                  className={newExpense.splitType === 'ALL' ? 'active' : ''}
                  onClick={() => setNewExpense({ ...newExpense, splitType: 'ALL' })}
                >
                  全員
                </button>
                <button
                  className={newExpense.splitType === 'CUSTOM' ? 'active' : ''}
                  onClick={() => setNewExpense({ ...newExpense, splitType: 'CUSTOM' })}
                >
                  選択する
                </button>
              </div>

              {newExpense.splitType === 'CUSTOM' && (
                <div className="member-list" style={{ marginTop: '8px' }}>
                  {members.map(m => (
                    <div
                      key={m.userId}
                      className={`member-check ${newExpense.splitUserIds.includes(m.userId) ? 'checked' : ''}`}
                      onClick={() => toggleMember(m.userId)}
                    >
                      <div className="avatar" style={{ width: '24px', height: '24px', fontSize: '11px' }}>
                        {m.userId.slice(0, 1).toUpperCase()}
                      </div>
                      <span>{m.userId.slice(0, 8)}</span>
                      <span className="check-icon">
                        {newExpense.splitUserIds.includes(m.userId) ? '✅' : '○'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {newExpense.amountJPY && (
              <div className="split-preview">
                <span>
                  {newExpense.splitType === 'ALL'
                    ? members.length
                    : newExpense.splitUserIds.length}人で割ると
                </span>
                <span className="split-amount">
                  ¥{Math.floor(
                    parseInt(newExpense.amountJPY) /
                    (newExpense.splitType === 'ALL'
                      ? members.length
                      : newExpense.splitUserIds.length || 1)
                  ).toLocaleString()}
                  /人
                </span>
              </div>
            )}

            <button
              className="primary-button"
              style={{ width: '100%', padding: '14px', marginTop: '8px' }}
              onClick={createExpense}
            >
              追加する
            </button>
          </div>
        </div>
      )}
    </div>
  )
}