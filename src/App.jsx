import { useEffect, useRef, useState } from 'react'
import { Amplify } from 'aws-amplify'
import { fetchAuthSession } from 'aws-amplify/auth'
import { Authenticator, useAuthenticator } from '@aws-amplify/ui-react'
import '@aws-amplify/ui-react/styles.css'
import awsConfig from './aws-exports'
import axios from 'axios'
import Home from './pages/Home'
import ProjectDetail from './pages/ProjectDetail'
import './App.css'
import './pages/ProjectDetail.css'
import './components/ExpenseList.css'
import './components/Balance.css'

Amplify.configure(awsConfig)

function AppContent() {
  const { user, signOut: amplifySignOut } = useAuthenticator()
  const apiClientRef                        = useRef(null)
  const [ready, setReady]                   = useState(false)
  const [currentProject, setCurrentProject] = useState(null)
  const setupDone                           = useRef(false)

  useEffect(() => {
    if (user && !setupDone.current) {
      setupDone.current = true
      setupApiClient()
    }
  }, [user])

  const setupApiClient = async () => {
    try {
      const session = await fetchAuthSession()
      const token   = session.tokens?.idToken?.toString()
      console.log('token:', token ? token.slice(0, 20) + '...' : 'undefined')
      apiClientRef.current = axios.create({
        baseURL: import.meta.env.VITE_API_URL,
        headers: { Authorization: `Bearer ${token}` }
      })
      console.log('apiClient ready:', typeof apiClientRef.current.get)
    } catch (err) {
      console.error('Failed to setup api client:', err)
    } finally {
      setReady(true)
    }
  }

  const handleLogout = async () => {
    await amplifySignOut()
    apiClientRef.current = null
    setCurrentProject(null)
    setReady(false)
    setupDone.current = false
  }

  if (!ready) {
    return <div className="loading">読み込み中...</div>
  }

  if (!apiClientRef.current) {
    return <div className="loading">認証エラー。再ログインしてください。</div>
  }

  // Amplify v6: user.userId が Cognito の sub（ユーザーID）
  const currentUserId = user?.userId || ''

  if (currentProject) {
    return (
      <ProjectDetail
        apiClient={apiClientRef.current}
        project={currentProject}
        onBack={() => setCurrentProject(null)}
        currentUserId={currentUserId}  // ← 追加
      />
    )
  }

  return (
    <Home
      apiClient={apiClientRef.current}
      user={{ email: user?.signInDetails?.loginId || '' }}
      onSelectProject={setCurrentProject}
      onLogout={handleLogout}
    />
  )
}

export default function App() {
  return (
    <Authenticator>
      <AppContent />
    </Authenticator>
  )
}