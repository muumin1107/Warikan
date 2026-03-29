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
  const [loading, setLoading]         = useState(true)
  const [projectStatus, setProjectStatus] = useState('active')
  const [projectOwnerId, setProjectOwnerId] = useState('')
  const [statusChanging, setStatusChanging] = useState(false)
  const [showModal, setShowModal]       = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteEmail, setInviteEmail]   = useState('')
  const [inviteStatus, setInviteStatus] = useState('') // '' | 'loading' | 'success' | 'error'
  const [inviteMessage, setInviteMessage] = useState('')
  const [inviteLink, setInviteLink]     = useState('')
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
      setProjectStatus(projRes.data.status || 'active')
      setProjectOwnerId(projRes.data.ownerId || '')
    } catch (err) {
      console.error('Failed to fetch:', err)
    } finally {
      setLoading(false)
    }
  }

  const toggleStatus = async () => {
    const newStatus = projectStatus === 'active' ? 'closed' : 'active'
    const label = newStatus === 'closed' ? '終了' : '再開'
    if (!window.confirm(`プロジェクトを${label}しますか？`)) return
    setStatusChanging(true)
    try {
      await apiClient.put(`/projects/${project.projectId}/status`, { status: newStatus })
      setProjectStatus(newStatus)
    } catch (err) {
      console.error('Failed to change status:', err)
    } finally {
      setStatusChanging(false)
    }
  }

  const inviteMember = async () => {
    if (!inviteEmail.trim()) return
    setInviteStatus('loading')
    setInviteMessage('')
    try {
      await apiClient.post(`/projects/${project.projectId}/members`, { email: inviteEmail })
      setInviteStatus('success')
      setInviteMessage(`${inviteEmail} に招待しました。相手が招待リンクから参加するとメンバーに追加されます。`)
      setInviteEmail('')
    } catch (err) {
      setInviteStatus('error')
      setInviteMessage(err?.response?.data?.message || '招待に失敗しました')
    }
  }

  const generateInviteLink = () => {
    const baseUrl = window.location.origin
    const link = `${baseUrl}?join=${project.projectId}`
    setInviteLink(link)
    navigator.clipboard.writeText(link).then(() => {
      setInviteMessage('招待リンクをクリップボードにコピーしました！')
    })
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
        {currentUserId === projectOwnerId && (
          <button
            onClick={toggleStatus}
            disabled={statusChanging}
            style={{
              fontSize: '12px', fontWeight: '600', padding: '5px 10px',
              borderRadius: '12px', border: 'none', cursor: 'pointer',
              background: projectStatus === 'active' ? 'rgba(239,68,68,.1)' : 'rgba(14,168,122,.1)',
              color: projectStatus === 'active' ? '#DC2626' : '#0EA87A',
              fontFamily: 'inherit',
            }}
          >
            {statusChanging ? '...' : projectStatus === 'active' ? '終了' : '再開'}
          </button>
        )}
      </div>

      <div className="main-content">
        {projectStatus === 'closed' && (
          <div style={{
            background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)',
            borderRadius: '12px', padding: '10px 14px', marginBottom: '12px',
            fontSize: '13px', color: '#DC2626', fontWeight: '500', textAlign: 'center'
          }}>
            🔒 このプロジェクトは終了しています（閲覧のみ）
          </div>
        )}
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
            apiClient={apiClient}
            projectId={project.projectId}
            currentUserId={currentUserId}
            onRefresh={fetchAll}
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

      {tab === 'expenses' && projectStatus === 'active' && (
        <button className="fab" onClick={() => setShowModal(true)}>＋</button>
      )}
      {projectStatus === 'active' && <button
        className="invite-fab"
        onClick={() => { setShowInviteModal(true); setInviteStatus(''); setInviteMessage(''); setInviteLink('') }}
        title="メンバーを招待"
      >
        👥
      </button>}

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
      {/* メンバー招待モーダル */}
      {showInviteModal && (
        <div className="modal-overlay" onClick={() => setShowInviteModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>メンバーを招待</h2>

            {/* 招待リンク */}
            <div className="invite-section">
              <div className="invite-section-title">📎 招待リンクで招待</div>
              <button
                className="primary-button"
                style={{ width: '100%', padding: '12px', marginTop: '8px' }}
                onClick={generateInviteLink}
              >
                招待リンクをコピー
              </button>
              {inviteLink && (
                <div className="invite-link-box">{inviteLink}</div>
              )}
            </div>

            <div className="invite-divider"><span>または</span></div>

            {/* メールアドレスで招待 */}
            <div className="invite-section">
              <div className="invite-section-title">✉️ メールアドレスで招待</div>
              <div className="form-group" style={{ marginTop: '8px' }}>
                <input
                  type="email"
                  placeholder="招待する人のメールアドレス"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                />
              </div>
              <button
                className="primary-button"
                style={{ width: '100%', padding: '12px' }}
                onClick={inviteMember}
                disabled={inviteStatus === 'loading'}
              >
                {inviteStatus === 'loading' ? '送信中...' : '招待する'}
              </button>
            </div>

            {inviteMessage && (
              <div className={`invite-message ${inviteStatus}`}>
                {inviteMessage}
              </div>
            )}

            <button
              className="secondary-button"
              style={{ width: '100%', padding: '12px', marginTop: '12px' }}
              onClick={() => setShowInviteModal(false)}
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  )
}