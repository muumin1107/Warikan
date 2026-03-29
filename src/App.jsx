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
import AuthPage from './pages/AuthPage'
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