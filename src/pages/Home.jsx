/**
 * Home.jsx
 * ホーム画面：プロジェクト一覧 + 招待通知バナー + プロジェクト作成モーダル。
 *
 * 表示内容：
 *   - 招待が届いているプロジェクトのバナー
 *   - 進行中のプロジェクト一覧（status !== 'closed'）
 *   - 完了済みプロジェクト一覧（status === 'closed'）
 *   - FAB ボタン → プロジェクト作成モーダル
 */

import { useEffect, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import './Home.css'

// ─────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────

/**
 * プロジェクト作成後に一覧を再取得するまでの待機時間（ms）。
 * POST /projects は SQS 経由の非同期処理（202 Accepted）のため、
 * DynamoDB への書き込みが完了するまで少し待つ必要がある。
 */
const REFETCH_DELAY_MS = 2000

/** 新規プロジェクトフォームの初期値 */
const INITIAL_NEW_PROJECT = { name: '', description: '' }

// ─────────────────────────────────────────────
// メインコンポーネント
// ─────────────────────────────────────────────

/**
 * @param {{
 *   apiClient:       import('axios').AxiosInstance,
 *   user:            { id: string, email: string },
 *   onSelectProject: (project: object) => void,
 *   onLogout:        () => void,
 * }} props
 */
export default function Home({ apiClient, user, onSelectProject, onLogout }) {
  const [projects,    setProjects]    = useState([])
  const [invitations, setInvitations] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')

  // モーダル表示状態
  const [showModal,   setShowModal]   = useState(false)
  // 新規プロジェクトのフォーム入力値
  const [newProject,  setNewProject]  = useState(INITIAL_NEW_PROJECT)
  // 招待参加処理中のプロジェクト ID（複数同時押しを防止）
  const [joiningId,        setJoiningId]        = useState(null)
  // 削除処理中のプロジェクト ID（連打防止）
  const [deletingProjectId, setDeletingProjectId] = useState(null)

  // ─────────────────────────────────────────────
  // プロジェクト一覧をステータスで分類（計算値）
  // ─────────────────────────────────────────────
  // 物理削除のためDBから消えた時点で一覧に出なくなる
  const activeProjects = projects.filter((p) => p.status !== 'closed')
  const closedProjects = projects.filter((p) => p.status === 'closed')

  // ─────────────────────────────────────────────
  // 初回マウント時にプロジェクト一覧を取得
  // ─────────────────────────────────────────────
  useEffect(() => {
    fetchProjects()
  }, [])

  // ─────────────────────────────────────────────
  // モーダル：Escape キーで閉じる
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (!showModal) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') closeModal()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showModal])

  // ─────────────────────────────────────────────
  // データ取得
  // ─────────────────────────────────────────────

  /**
   * プロジェクト一覧（active + closed）と招待一覧を取得する。
   * GET /projects はレスポンスに { projects, invitations } を含む。
   */
  const fetchProjects = async () => {
    setError('')
    try {
      const res = await apiClient.get('/projects')
      setProjects(res.data.projects     || [])
      setInvitations(res.data.invitations || [])
    } catch (err) {
      setError('プロジェクトの読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }

  // ─────────────────────────────────────────────
  // プロジェクト作成
  // ─────────────────────────────────────────────

  const createProject = async () => {
    if (!newProject.name.trim()) return
    try {
      await apiClient.post('/projects', {
        operation:   'CREATE_PROJECT',
        projectId:   uuidv4(),
        name:        newProject.name.trim(),
        description: newProject.description.trim(),
      })
      closeModal()
      // SQS 非同期のため書き込み完了を待ってから再取得（→ REFETCH_DELAY_MS 参照）
      setTimeout(fetchProjects, REFETCH_DELAY_MS)
    } catch (err) {
      setError('プロジェクトの作成に失敗しました')
    }
  }

  // ─────────────────────────────────────────────
  // 招待への参加
  // ─────────────────────────────────────────────

  /**
   * 招待バナーの「参加する」ボタン押下時の処理。
   * PUT /projects/{id}/join で status を active に変更し、一覧を再取得する。
   * @param {string} projectId
   */
  const joinProject = async (projectId) => {
    setJoiningId(projectId)
    try {
      await apiClient.put(`/projects/${projectId}/join`, {})
      await fetchProjects()
    } catch (err) {
      setError('プロジェクトへの参加に失敗しました')
    } finally {
      setJoiningId(null)
    }
  }

  // ─────────────────────────────────────────────
  // プロジェクト削除（物理削除）
  // ─────────────────────────────────────────────

  /**
   * オーナーのみ操作可。
   * DELETE /projects/{projectId} を呼び出し、全関連データを削除する。
   * @param {string} projectId
   * @param {string} projectName 確認ダイアログ表示用
   */
  const deleteProject = async (projectId, projectName) => {
    if (!window.confirm(
      `「${projectName}」を削除しますか？\n\nすべての支払いデータが削除されます。この操作は取り消せません。`
    )) return

    setDeletingProjectId(projectId)
    setError('')
    try {
      await apiClient.delete(`/projects/${projectId}`)
      // 削除成功したら一覧を再取得
      await fetchProjects()
    } catch (err) {
      setError(err?.response?.data?.message || 'プロジェクトの削除に失敗しました')
    } finally {
      setDeletingProjectId(null)
    }
  }

  // ─────────────────────────────────────────────
  // モーダル操作
  // ─────────────────────────────────────────────

  const openModal = () => {
    setNewProject(INITIAL_NEW_PROJECT)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setNewProject(INITIAL_NEW_PROJECT)
  }

  // フォーム入力の更新ヘルパー
  const updateNewProject = (field) => (e) => {
    setNewProject((prev) => ({ ...prev, [field]: e.target.value }))
  }

  // ─────────────────────────────────────────────
  // レンダー
  // ─────────────────────────────────────────────

  if (loading) return <div className="loading">読み込み中...</div>

  return (
    <div>
      {/* ── ヘッダー */}
      <header className="home-header">
        <h1 className="home-header-title">Wari<em className="home-header-title-em">kan</em></h1>
        <div className="home-header-right">
          <span className="home-user-email">{user?.email}</span>
          <button className="home-logout-btn" onClick={onLogout}>
            ログアウト
          </button>
        </div>
      </header>

      <div className="main-content">
        {/* エラーバナー */}
        {error && (
          <div className="error" role="alert">{error}</div>
        )}

        {/* ── 招待通知バナー */}
        {invitations.length > 0 && (
          <section className="invitations-section">
            <div className="section-label">📩 招待が届いています</div>
            {invitations.map((inv) => (
              <div key={inv.projectId} className="invitation-card">
                <div className="invitation-info">
                  <div className="invitation-name">{inv.name}</div>
                  <div className="invitation-sub">プロジェクトに招待されています</div>
                </div>
                <button
                  className="invitation-join-btn"
                  onClick={() => joinProject(inv.projectId)}
                  disabled={joiningId === inv.projectId}
                >
                  {joiningId === inv.projectId ? '参加中...' : '参加する'}
                </button>
              </div>
            ))}
          </section>
        )}

        {/* ── 進行中プロジェクト */}
        <section>
          {/* プロジェクトがある場合のみ「進行中」ラベルを表示 */}
          {activeProjects.length > 0 && (
            <div className="section-label">進行中</div>
          )}

          {activeProjects.length === 0 ? (
            <div className="empty-state">
              <p>進行中のプロジェクトがありません</p>
              <p className="empty-hint">
                右下の
                <span className="empty-fab-icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="8" fill="var(--color-primary)" />
                    <path d="M8 4v8M4 8h8" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </span>
                ボタンからトリップを作成してください
              </p>
            </div>
          ) : (
            activeProjects.map((project) => (
              <ProjectCard
                key={project.projectId}
                project={project}
                onClick={() => onSelectProject(project)}
                isOwner={project.ownerId === user?.id}
                isDeleting={deletingProjectId === project.projectId}
                onDelete={(e) => {
                  e.stopPropagation()
                  deleteProject(project.projectId, project.name)
                }}
              />
            ))
          )}
        </section>

        {/* ── 完了済みプロジェクト（存在する場合のみ表示） */}
        {closedProjects.length > 0 && (
          <section className="closed-section">
            <div className="section-label">完了</div>
            {closedProjects.map((project) => (
              <ProjectCard
                key={project.projectId}
                project={project}
                onClick={() => onSelectProject(project)}
                isOwner={project.ownerId === user?.id}
                isDeleting={deletingProjectId === project.projectId}
                onDelete={(e) => {
                  e.stopPropagation()
                  deleteProject(project.projectId, project.name)
                }}
              />
            ))}
          </section>
        )}
      </div>

      {/* ── FAB：プロジェクト作成ボタン */}
      <button
        className="fab"
        onClick={openModal}
        aria-label="プロジェクトを作成"
      >
        ＋
      </button>

      {/* ── プロジェクト作成モーダル */}
      {showModal && (
        <div
          className="modal-overlay"
          onClick={closeModal}
          role="dialog"
          aria-modal="true"
          aria-label="新しいトリップを作成"
        >
          <div className="create-modal" onClick={(e) => e.stopPropagation()}>
            {/* モーダルハンドル（スワイプUIのアフォーダンス） */}
            <div className="modal-handle" aria-hidden="true" />

            <h2>新しいトリップ</h2>
            <p className="modal-subtitle">旅行やイベントを作成</p>

            <div className="form-group">
              <label htmlFor="project-name">トリップ名</label>
              <input
                id="project-name"
                type="text"
                placeholder="例: タイ旅行2024"
                value={newProject.name}
                onChange={updateNewProject('name')}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="project-description">説明（任意）</label>
              <input
                id="project-description"
                type="text"
                placeholder="例: 3泊4日のバンコク旅行"
                value={newProject.description}
                onChange={updateNewProject('description')}
              />
            </div>

            <button
              className="primary-button home-create-btn"
              onClick={createProject}
              disabled={!newProject.name.trim()}
            >
              作成する
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// サブコンポーネント
// ─────────────────────────────────────────────

/**
 * プロジェクトカード（active / closed 共通）。
 * closed の場合は `.project-card--closed` クラスが付与される。
 *
 * @param {{
 *   project: {
 *     projectId:   string,
 *     name:        string,
 *     description: string,
 *     status:      string,
 *     createdAt:   string,
 *   },
 *   onClick: () => void,
 * }} props
 */
function ProjectCard({ project, onClick, isOwner, isDeleting, onDelete }) {
  const isClosed = project.status === 'closed'
  const dateStr  = project.createdAt?.slice(0, 10) ?? ''

  return (
    <div
      className={`project-card${isClosed ? ' project-card--closed' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      aria-label={`${project.name} プロジェクト`}
    >
      <div className="project-card-top">
        <div className="project-card-info">
          <div className="project-name">{project.name}</div>
          {project.description && (
            <div className="project-description">{project.description}</div>
          )}
        </div>
        <span className={`project-badge ${isClosed ? 'project-badge--closed' : 'project-badge--active'}`}>
          {isClosed ? '完了' : '進行中'}
        </span>
      </div>

      <div className="project-card-bottom">
        <span className="project-date">{dateStr}</span>
        {/* 削除ボタン（オーナーのみ表示） */}
        {isOwner && (
          <button
            className="project-delete-btn"
            onClick={onDelete}
            disabled={isDeleting}
            aria-label={`${project.name}を削除`}
          >
            {isDeleting ? '削除中...' : '削除'}
          </button>
        )}
      </div>
    </div>
  )
}