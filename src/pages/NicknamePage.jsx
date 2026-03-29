import { useState } from 'react'
import './NicknamePage.css'

export default function NicknamePage({ apiClient, onSaved }) {
  const [nickname, setNickname] = useState('')
  const [loading, setLoading]  = useState(false)
  const [error, setError]      = useState('')

  const handleSave = async () => {
    if (!nickname.trim()) { setError('ニックネームを入力してください'); return }
    if (nickname.length > 20) { setError('20文字以内で入力してください'); return }
    setLoading(true)
    setError('')
    try {
      await apiClient.post('/users/me', { nickname: nickname.trim() })
      onSaved(nickname.trim())
    } catch (err) {
      setError(err?.response?.data?.message || '保存に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="nickname-root">
      <div className="nickname-bg">
        <div className="nickname-bg-circle c1" />
        <div className="nickname-bg-circle c2" />
      </div>
      <div className="nickname-container">
        <div className="nickname-logo">Wari<em>kan</em></div>
        <div className="nickname-card">
          <div className="nickname-icon">👋</div>
          <h2>はじめまして！</h2>
          <p className="nickname-sub">
            グループメンバーに表示される<br />ニックネームを設定してください
          </p>
          <div className="nickname-field">
            <input
              type="text"
              placeholder="例: 田中さん"
              value={nickname}
              maxLength={20}
              onChange={e => { setNickname(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              autoFocus
            />
            <div className="nickname-count">{nickname.length}/20</div>
          </div>
          {error && <div className="nickname-error">{error}</div>}
          <button
            className="nickname-btn"
            onClick={handleSave}
            disabled={loading || !nickname.trim()}
          >
            {loading ? '保存中...' : 'はじめる'}
          </button>
        </div>
      </div>
    </div>
  )
}