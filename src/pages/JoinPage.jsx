/**
 * JoinPage.jsx
 * 招待リンク（?join=projectId）経由でプロジェクトに参加する画面。
 *
 * ステータス遷移：
 *   confirm → joining → done（2秒後に onJoined）
 *                     → error（参加失敗時）
 */

import { useState } from 'react'
import './JoinPage.css'

// ─────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────

/** @typedef {'confirm' | 'joining' | 'done' | 'error'} JoinStatus */
const STATUS = /** @type {const} */ ({
  CONFIRM: 'confirm',
  JOINING: 'joining',
  DONE:    'done',
  ERROR:   'error',
})

const REDIRECT_DELAY_MS = 2000

// ─────────────────────────────────────────────
// メインコンポーネント
// ─────────────────────────────────────────────

/**
 * @param {{
 *   apiClient: import('axios').AxiosInstance,
 *   projectId: string,
 *   onJoined:  (projectId: string) => void,
 *   onCancel:  () => void,
 * }} props
 */
export default function JoinPage({ apiClient, projectId, onJoined, onCancel }) {
  /** @type {[JoinStatus, Function]} */
  const [status,   setStatus]   = useState(STATUS.CONFIRM)
  const [project,  setProject]  = useState(null)
  const [errorMsg, setErrorMsg] = useState('')

  const handleJoin = async () => {
    setStatus(STATUS.JOINING)
    try {
      const res = await apiClient.put(`/projects/${projectId}/join`, {})
      setProject(res.data)
      setStatus(STATUS.DONE)
      setTimeout(() => onJoined(projectId), REDIRECT_DELAY_MS)
    } catch (err) {
      setErrorMsg(err?.response?.data?.message || '参加に失敗しました')
      setStatus(STATUS.ERROR)
    }
  }

  return (
    <div className="join-root">
      <div className="join-bg" aria-hidden="true">
        <div className="join-bg-circle c1" />
        <div className="join-bg-circle c2" />
      </div>

      <div className="join-container">
        <div className="join-logo">
          Wari<em>kan</em>
        </div>

        <div className="join-card">
          {status === STATUS.CONFIRM && (
            <ConfirmView projectId={projectId} onJoin={handleJoin} onCancel={onCancel} />
          )}
          {status === STATUS.JOINING && <LoadingView />}
          {status === STATUS.DONE    && <DoneView projectName={project?.name} />}
          {status === STATUS.ERROR   && <ErrorView message={errorMsg} onCancel={onCancel} />}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// ステータス別サブビュー
// ─────────────────────────────────────────────

function ConfirmView({ projectId, onJoin, onCancel }) {
  const shortId = projectId?.slice(0, 8)
  return (
    <>
      <div className="join-icon-wrap join-icon-wrap--invite">
        <InviteIcon />
      </div>
      <h2>プロジェクトへの招待</h2>
      <p className="join-sub">このプロジェクトに参加しますか？</p>
      <div className="join-project-id">ID: {shortId}...</div>
      <button className="join-btn join-btn-primary" onClick={onJoin}>
        参加する
      </button>
      <button className="join-btn join-btn-secondary" onClick={onCancel}>
        キャンセル
      </button>
    </>
  )
}

function LoadingView() {
  return (
    <div className="join-loading-wrap">
      <div className="join-spinner" aria-hidden="true" />
      <p className="join-loading" role="status" aria-live="polite">
        参加処理中...
      </p>
    </div>
  )
}

function DoneView({ projectName }) {
  return (
    <>
      <div className="join-icon-wrap join-icon-wrap--done">
        <CheckIcon />
      </div>
      <h2>参加しました</h2>
      <p className="join-sub">
        {projectName ? `「${projectName}」に参加しました。` : '参加しました。'}
        <br />
        ホーム画面に移動します
      </p>
    </>
  )
}

function ErrorView({ message, onCancel }) {
  return (
    <>
      <div className="join-icon-wrap join-icon-wrap--error">
        <AlertIcon />
      </div>
      <h2>参加できませんでした</h2>
      <p className="join-sub join-error" role="alert">{message}</p>
      <button className="join-btn join-btn-secondary" onClick={onCancel}>
        ホームに戻る
      </button>
    </>
  )
}

// ─────────────────────────────────────────────
// SVG アイコン（絵文字を使わない）
// ─────────────────────────────────────────────

/** 招待アイコン（人 + プラス） */
function InviteIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  )
}

/** 完了アイコン（円 + チェック） */
function CheckIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12l3 3 5-5" />
    </svg>
  )
}

/** エラーアイコン（三角 + ！） */
function AlertIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}