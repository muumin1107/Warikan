import { useEffect, useState } from 'react'
import './JoinPage.css'

export default function JoinPage({ apiClient, projectId, onJoined, onCancel }) {
  const [status, setStatus]   = useState('confirm')
  const [project, setProject] = useState(null)
  const [message, setMessage] = useState('')

  const handleJoin = async () => {
    setStatus('joining')
    try {
      const res = await apiClient.put(`/projects/${projectId}/join`, {})
      setProject(res.data)
      setStatus('done')
      setTimeout(() => onJoined(projectId), 2000)
    } catch (err) {
      const msg = err?.response?.data?.message || '参加に失敗しました'
      setMessage(msg)
      setStatus('error')
    }
  }

  return (
    <div className="join-root">
      <div className="join-bg">
        <div className="join-bg-circle c1" />
        <div className="join-bg-circle c2" />
      </div>
      <div className="join-container">
        <div className="join-logo">Wari<em>kan</em></div>
        <div className="join-card">
          {status === 'confirm' && (
            <>
              <div className="join-icon">🎉</div>
              <h2>プロジェクトに招待されています</h2>
              <p className="join-sub">参加しますか？</p>
              <div className="join-project-id">ID: {projectId?.slice(0, 8)}...</div>
              <button className="join-btn join-btn-primary" onClick={handleJoin}>参加する</button>
              <button className="join-btn join-btn-secondary" onClick={onCancel}>キャンセル</button>
            </>
          )}
          {status === 'joining' && <div className="join-loading">参加処理中...</div>}
          {status === 'done' && (
            <>
              <div className="join-icon">✅</div>
              <h2>参加しました！</h2>
              <p className="join-sub">「{project?.name}」に参加しました。<br />ホーム画面に移動します...</p>
            </>
          )}
          {status === 'error' && (
            <>
              <div className="join-icon">❌</div>
              <h2>参加できませんでした</h2>
              <p className="join-sub join-error">{message}</p>
              <button className="join-btn join-btn-secondary" onClick={onCancel}>ホームに戻る</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}