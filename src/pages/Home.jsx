import { useEffect, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import './Home.css'

export default function Home({ apiClient, user, onSelectProject }) {
  const [projects, setProjects]         = useState([])
  const [invitations, setInvitations]   = useState([])
  const [loading, setLoading]           = useState(true)
  const [showModal, setShowModal]       = useState(false)
  const [newProject, setNewProject]     = useState({ name: '', description: '' })
  const [joiningId, setJoiningId]       = useState(null)

  useEffect(() => {
    fetchProjects()
  }, [])

  const fetchProjects = async () => {
    try {
      const res = await apiClient.get('/projects')
      setProjects(res.data.projects || [])  // active + closed 両方含む
      setInvitations(res.data.invitations || [])
    } catch (err) {
      console.error('Failed to fetch projects:', err)
    } finally {
      setLoading(false)
    }
  }

  const createProject = async () => {
    if (!newProject.name.trim()) return
    try {
      await apiClient.post('/projects', {
        operation:   'CREATE_PROJECT',
        projectId:   uuidv4(),
        name:        newProject.name,
        description: newProject.description,
      })
      setShowModal(false)
      setNewProject({ name: '', description: '' })
      setTimeout(fetchProjects, 2000)
    } catch (err) {
      console.error('Failed to create project:', err)
    }
  }

  const joinProject = async (projectId) => {
    setJoiningId(projectId)
    try {
      await apiClient.put(`/projects/${projectId}/join`, {})
      await fetchProjects()
    } catch (err) {
      console.error('Failed to join project:', err)
    } finally {
      setJoiningId(null)
    }
  }

  if (loading) return <div className="loading">読み込み中...</div>

  return (
    <div>
      {/* ヘッダー */}
      <div className="home-header">
        <h1>Warikan</h1>
        <span className="user-email">{user?.email}</span>
      </div>

      <div className="main-content">

        {/* 招待通知バナー */}
        {invitations.length > 0 && (
          <div className="invitations-section">
            <div className="section-label" style={{ marginBottom: '10px' }}>
              📩 招待が届いています
            </div>
            {invitations.map(inv => (
              <div key={inv.projectId} className="invitation-card">
                <div className="invitation-info">
                  <div className="invitation-name">{inv.name}</div>
                  <div className="invitation-sub">プロジェクトに招待されています</div>
                </div>
                <button
                  className="join-button"
                  onClick={() => joinProject(inv.projectId)}
                  disabled={joiningId === inv.projectId}
                >
                  {joiningId === inv.projectId ? '参加中...' : '参加する'}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="section-label" style={{ marginBottom: '12px' }}>
          進行中
        </div>

        {projects.filter(p => p.status !== 'closed').length === 0 ? (
          <div className="empty-state">
            <p>進行中のプロジェクトがありません</p>
            <p className="empty-hint">＋ボタンから作成してください</p>
          </div>
        ) : (
          projects.filter(p => p.status !== 'closed').map(project => (
            <div
              key={project.projectId}
              className="project-card"
              onClick={() => onSelectProject(project)}
            >
              <div className="project-card-top">
                <div>
                  <div className="project-name">{project.name}</div>
                  {project.description && (
                    <div className="project-description">{project.description}</div>
                  )}
                </div>
                <span className="badge badge-active">進行中</span>
              </div>
              <div className="project-card-bottom">
                <span className="project-date">{project.createdAt?.slice(0, 10)}</span>
              </div>
            </div>
          ))
        )}

        {projects.filter(p => p.status === 'closed').length > 0 && (
          <>
            <div className="section-label" style={{ marginBottom: '12px', marginTop: '20px' }}>
              完了
            </div>
            {projects.filter(p => p.status === 'closed').map(project => (
              <div
                key={project.projectId}
                className="project-card project-card-closed"
                onClick={() => onSelectProject(project)}
              >
                <div className="project-card-top">
                  <div>
                    <div className="project-name">{project.name}</div>
                    {project.description && (
                      <div className="project-description">{project.description}</div>
                    )}
                  </div>
                  <span className="badge badge-closed">完了</span>
                </div>
                <div className="project-card-bottom">
                  <span className="project-date">{project.createdAt?.slice(0, 10)}</span>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* FAB ボタン */}
      <button className="fab" onClick={() => setShowModal(true)}>＋</button>

      {/* プロジェクト作成モーダル */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="create-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <h2>新しいトリップ</h2>
            <p className="modal-subtitle">旅行やイベントを作成</p>

            <div className="form-group">
              <label>トリップ名</label>
              <input
                type="text"
                placeholder="例: タイ旅行2024"
                value={newProject.name}
                onChange={e => setNewProject({ ...newProject, name: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label>説明（任意）</label>
              <input
                type="text"
                placeholder="例: 3泊4日のバンコク旅行"
                value={newProject.description}
                onChange={e => setNewProject({ ...newProject, description: e.target.value })}
              />
            </div>

            <button
              className="primary-button"
              style={{ width: '100%', padding: '14px' }}
              onClick={createProject}
            >
              作成する
            </button>
          </div>
        </div>
      )}
    </div>
  )
}