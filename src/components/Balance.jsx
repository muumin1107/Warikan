import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'  // ← 追加

// userId からニックネームを取得するヘルパー
function getName(members, userId) {
  const m = members.find(m => m.userId === userId)
  return m?.nickname || userId.slice(0, 8)
}

export default function Balance({ balance, members, apiClient, projectId, onSettled, currentUserId }) {
  const [settling, setSettling] = useState(null)

  const handleSettle = async (settlement) => {
    setSettling(settlement)
    try {
      await apiClient.post(`/projects/${projectId}/settlements`, {
        operation:    'CREATE_SETTLEMENT',  // ← 追加
        settlementId: uuidv4(),             // ← 追加
        toUserId:     settlement.toUserId,
        amountJPY:    settlement.amountJPY
      })
      setTimeout(onSettled, 2000)
    } catch (err) {
      console.error('Failed to settle:', err)
    } finally {
      setSettling(null)
    }
  }

  return (
    <div>
      <div className="card">
        <h2 style={{ marginBottom: '12px' }}>メンバー別残高</h2>
        {balance.balances?.map(b => (
          <div key={b.userId} className="list-item">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="avatar">
                {getName(members, b.userId).slice(0, 1).toUpperCase()}
              </div>
              <span style={{ fontSize: '14px' }}>
                {getName(members, b.userId)}
              </span>
            </div>
            <span
              className={b.balance >= 0 ? 'amount-positive' : 'amount-negative'}
              style={{ fontWeight: '700', fontSize: '15px' }}
            >
              {b.balance >= 0 ? '+' : ''}¥{b.balance.toLocaleString()}
            </span>
          </div>
        ))}
      </div>

      <h3 style={{
        margin: '16px 0 8px',
        fontSize: '13px',
        color: '#666',
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: '0.06em'
      }}>
        精算プラン（最少送金数）
      </h3>

      {balance.settlements?.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '24px' }}>
          <p style={{ color: '#0ea87a', fontWeight: '600' }}>✅ 全員精算済みです</p>
        </div>
      ) : (
        balance.settlements?.map((s, i) => (
          <div key={i} className="card settle-card">
            <div className="settle-info">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div className="avatar" style={{ width: '28px', height: '28px', fontSize: '11px' }}>
                  {getName(members, s.fromUserId).slice(0, 1).toUpperCase()}
                </div>
                <span style={{ fontSize: '13px' }}>{getName(members, s.fromUserId)}</span>
              </div>
              <span style={{ color: '#999', fontSize: '18px' }}>→</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div className="avatar" style={{ width: '28px', height: '28px', fontSize: '11px' }}>
                  {getName(members, s.toUserId).slice(0, 1).toUpperCase()}
                </div>
                <span style={{ fontSize: '13px' }}>{getName(members, s.toUserId)}</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
              <span style={{ fontWeight: '700', fontSize: '16px', color: '#ef4444' }}>
                ¥{s.amountJPY.toLocaleString()}
              </span>
              {s.fromUserId === currentUserId && (
                <button
                  className="settle-button"
                  onClick={() => handleSettle(s)}
                  disabled={settling === s}
                >
                  {settling === s ? '処理中...' : '返した'}
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  )
}