import { useEffect, useRef, useState } from 'react'
import { Amplify } from 'aws-amplify'
import {
  fetchAuthSession,
  getCurrentUser,
  signOut as amplifySignOut,
} from 'aws-amplify/auth'
import { Hub } from 'aws-amplify/utils'
import awsConfig from './aws-exports'
import axios from 'axios'
import { registerPushToken } from './firebase'
import AuthPage from './pages/AuthPage'
import NicknamePage from './pages/NicknamePage'
import JoinPage from './pages/JoinPage'
import Home from './pages/Home'
import ProjectDetail from './pages/ProjectDetail'
import './App.css'
import './pages/ProjectDetail.css'
import './components/ExpenseList.css'
import './components/Balance.css'

Amplify.configure(awsConfig)

export default function App() {
  const apiClientRef                        = useRef(null)
  const [authState, setAuthState]           = useState('loading') // 'loading' | 'unauth' | 'auth'
  const [currentUserId, setCurrentUserId]   = useState('')
  const [userEmail, setUserEmail]           = useState('')
  const [currentProject, setCurrentProject] = useState(null)
  const [nickname, setNickname]             = useState(null)  // null=未確認, ''=未設定, 'xxx'=設定済み
  const [joinProjectId, setJoinProjectId]   = useState(() => {
    // URLの ?join=xxx を検出
    const params = new URLSearchParams(window.location.search)
    return params.get('join') || null
  })

  useEffect(() => {
    checkSession()
    const unsubscribe = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signedIn')  checkSession()
      if (payload.event === 'signedOut') {
        setAuthState('unauth')
        apiClientRef.current = null
        setCurrentProject(null)
        setCurrentUserId('')
        setUserEmail('')
        setNickname(null)
      }
    })
    return unsubscribe
  }, [])

  const checkSession = async () => {
    try {
      const user    = await getCurrentUser()
      const session = await fetchAuthSession()
      const token   = session.tokens?.idToken?.toString()
      if (!token) throw new Error('No token')

      apiClientRef.current = axios.create({
        baseURL: import.meta.env.VITE_API_URL,
        headers: { Authorization: `Bearer ${token}` }
      })

      setCurrentUserId(user.userId || '')
      setUserEmail(user.signInDetails?.loginId || '')
      setAuthState('auth')
      // ニックネーム確認
      try {
        const res = await apiClientRef.current.get('/users/me')
        setNickname(res.data.nickname || '')
      } catch {
        setNickname('')
      }
      // ログイン後にPushトークンを登録（失敗してもログインは続行）
      registerPushToken(apiClientRef.current).catch(console.error)
    } catch {
      setAuthState('unauth')
    }
  }

  const handleLogout = async () => {
    await amplifySignOut()
  }

  if (authState === 'loading') {
    return <div className="loading">読み込み中...</div>
  }

  if (authState === 'unauth') {
    return <AuthPage onAuthSuccess={checkSession} />
  }

  // ニックネーム未設定の場合は入力画面を表示
  if (authState === 'auth' && nickname === '') {
    return (
      <NicknamePage
        apiClient={apiClientRef.current}
        onSaved={(name) => setNickname(name)}
      />
    )
  }

  // 招待リンク経由（?join=projectId）
  if (joinProjectId && authState === 'auth') {
    return (
      <JoinPage
        apiClient={apiClientRef.current}
        projectId={joinProjectId}
        onJoined={() => {
          setJoinProjectId(null)
          window.history.replaceState({}, '', '/')
        }}
        onCancel={() => {
          setJoinProjectId(null)
          window.history.replaceState({}, '', '/')
        }}
      />
    )
  }

  if (currentProject) {
    return (
      <ProjectDetail
        apiClient={apiClientRef.current}
        project={currentProject}
        onBack={() => setCurrentProject(null)}
        currentUserId={currentUserId}
      />
    )
  }

  return (
    <Home
      apiClient={apiClientRef.current}
      user={{ email: userEmail }}
      onSelectProject={setCurrentProject}
      onLogout={handleLogout}
    />
  )
}