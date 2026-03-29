/**
 * JoinPage.jsx
 * 招待リンク（?join=projectId）経由でプロジェクトに参加する画面。
 *
 * 表示条件：App.jsx で joinProjectId が存在するとき。
 * 参加成功後は 2 秒後に onJoined() を呼び、ホーム画面に遷移する。
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

/**
 * 参加フローのステータス
 * @typedef {'confirm' | 'joining' | 'done' | 'error'} JoinStatus
 */
const STATUS = /** @type {const} */ ({
  CONFIRM: 'confirm',  // 参加確認画面
  JOINING: 'joining',  // API 呼び出し中
  DONE:    'done',     // 参加成功
  ERROR:   'error',    // 参加失敗
})

/** 参加成功後にホームへ遷移するまでの待機時間（ms） */
const REDIRECT_DELAY_MS = 2000

// ─────────────────────────────────────────────
// メインコンポーネント
// ─────────────────────────────────────────────

/**
 * @param {{
 *   apiClient:  import('axios').AxiosInstance,
 *   projectId:  string,
 *   onJoined:  (projectId: string) => void,
 *   onCancel:  () => void,
 * }} props
 */
export default function JoinPage({ apiClient, projectId, onJoined, onCancel }) {
  /** @type {[JoinStatus, Function]} */
  const [status,  setStatus]  = useState(STATUS.CONFIRM)
  const [project, setProject] = useState(null)   // 参加成功時のプロジェクト情報
  const [errorMsg, setErrorMsg] = useState('')

  // ─────────────────────────────────────────────
  // 参加処理
  // ─────────────────────────────────────────────
  const handleJoin = async () => {
    setStatus(STATUS.JOINING)
    try {
      const res = await apiClient.put(`/projects/${projectId}/join`, {})
      setProject(res.data)
      setStatus(STATUS.DONE)
      // 2 秒後にホーム画面へ遷移
      setTimeout(() => onJoined(projectId), REDIRECT_DELAY_MS)
    } catch (err) {
      setErrorMsg(err?.response?.data?.message || '参加に失敗しました')
      setStatus(STATUS.ERROR)
    }
  }

  // ─────────────────────────────────────────────
  // レンダー
  // ─────────────────────────────────────────────
  return (
    <div className="join-root">
      {/* 背景装飾（Auth / NicknamePage と統一デザイン） */}
      <div className="join-bg" aria-hidden="true">
        <div className="join-bg-circle c1" />
        <div className="join-bg-circle c2" />
      </div>

      <div className="join-container">
        {/* ロゴ */}
        <div className="join-logo">
          Wari<em>kan</em>
        </div>

        {/* カード：ステータスに応じたコンテンツを表示 */}
        <div className="join-card">
          {status === STATUS.CONFIRM && (
            <ConfirmView
              projectId={projectId}
              onJoin={handleJoin}
              onCancel={onCancel}
            />
          )}

          {status === STATUS.JOINING && (
            <LoadingView />
          )}

          {status === STATUS.DONE && (
            <DoneView projectName={project?.name} />
          )}

          {status === STATUS.ERROR && (
            <ErrorView message={errorMsg} onCancel={onCancel} />
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// ステータス別サブビュー
// ─────────────────────────────────────────────

/**
 * 参加確認ビュー
 * @param {{ projectId: string, onJoin: () => void, onCancel: () => void }} props
 */
function ConfirmView({ projectId, onJoin, onCancel }) {
  // プロジェクト ID は長いため先頭 8 文字だけ表示
  const shortId = projectId?.slice(0, 8)

  return (
    <>
      <div className="join-icon" aria-hidden="true">🎉</div>
      <h2>プロジェクトに招待されています</h2>
      <p className="join-sub">参加しますか？</p>
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

/** 処理中ビュー */
function LoadingView() {
  return (
    <p className="join-loading" role="status" aria-live="polite">
      参加処理中...
    </p>
  )
}

/**
 * 参加成功ビュー
 * @param {{ projectName: string | undefined }} props
 */
function DoneView({ projectName }) {
  return (
    <>
      <div className="join-icon" aria-hidden="true">✅</div>
      <h2>参加しました！</h2>
      <p className="join-sub">
        {projectName ? `「${projectName}」に参加しました。` : '参加しました。'}
        <br />
        ホーム画面に移動します...
      </p>
    </>
  )
}

/**
 * エラービュー
 * @param {{ message: string, onCancel: () => void }} props
 */
function ErrorView({ message, onCancel }) {
  return (
    <>
      <div className="join-icon" aria-hidden="true">❌</div>
      <h2>参加できませんでした</h2>
      <p className="join-sub join-error" role="alert">{message}</p>
      <button className="join-btn join-btn-secondary" onClick={onCancel}>
        ホームに戻る
      </button>
    </>
  )
}