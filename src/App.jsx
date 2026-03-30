/**
 * App.jsx
 * アプリケーションのルートコンポーネント。
 * - 認証状態の管理（loading / unauth / auth）
 * - Amplify Hub によるサインイン・サインアウトの検知
 * - ニックネーム未設定チェック
 * - 招待リンク（?join=xxx）の検知
 * - 認証状態に応じた画面の出し分け
 */

import { useEffect, useRef, useState } from 'react'
import { Amplify } from 'aws-amplify'
import {
  fetchAuthSession,
  getCurrentUser,
  signOut as amplifySignOut,
} from 'aws-amplify/auth'
import { Hub } from 'aws-amplify/utils'
import axios from 'axios'

import awsConfig from './aws-exports'
import { registerPushToken } from './firebase'

import AuthPage       from './pages/AuthPage'
import NicknamePage   from './pages/NicknamePage'
import JoinPage       from './pages/JoinPage'
import Home           from './pages/Home'
import ProjectDetail  from './pages/ProjectDetail'

import './App.css'

// Amplify を設定（アプリ起動時に1回だけ実行）
Amplify.configure(awsConfig)

// ─────────────────────────────────────────────
// 型定義（JSDoc）
// ─────────────────────────────────────────────
/**
 * @typedef {'loading' | 'unauth' | 'auth'} AuthState
 * - loading : セッション確認中（初回マウント時）
 * - unauth  : 未ログイン
 * - auth    : ログイン済み
 */

/**
 * @typedef {null | '' | string} NicknameState
 * - null    : ニックネームの確認が未完了（初期値）
 * - ''      : ニックネーム未設定 → NicknamePage を表示
 * - string  : ニックネーム設定済み → 通常フローへ
 */

export default function App() {
  // ─── axios インスタンス（state に入れると壊れるため useRef で管理）
  const apiClientRef = useRef(null)

  // ─── 認証状態
  /** @type {[AuthState, Function]} */
  const [authState, setAuthState] = useState('loading')

  // ─── ログインユーザー情報
  const [currentUserId, setCurrentUserId] = useState('')
  const [userEmail, setUserEmail]         = useState('')

  // ─── ニックネーム（@type {NicknameState}）
  const [nickname, setNickname] = useState(null)

  // ─── 表示中のプロジェクト（null のときはホーム画面）
  const [currentProject, setCurrentProject] = useState(null)

  // ─── 招待リンクのプロジェクトID（URL の ?join=xxx から取得）
  const [joinProjectId, setJoinProjectId] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('join') || null
  })

  // ─────────────────────────────────────────────
  // 初回マウント：セッション確認 + 認証イベント購読
  // ─────────────────────────────────────────────
  useEffect(() => {
    checkSession()

    // Amplify Hub でサインイン・サインアウトを監視
    const unsubscribe = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signedIn') {
        checkSession()
      }
      if (payload.event === 'signedOut') {
        handleSignedOut()
      }
    })

    return unsubscribe
  }, [])

  // ─────────────────────────────────────────────
  // セッション確認・axios クライアント初期化
  // ─────────────────────────────────────────────
  const checkSession = async () => {
    try {
      const user    = await getCurrentUser()
      const session = await fetchAuthSession()
      const token   = session.tokens?.idToken?.toString()

      if (!token) throw new Error('IDトークンが取得できませんでした')

      // 認証済み axios クライアントを生成
      apiClientRef.current = axios.create({
        baseURL: import.meta.env.VITE_API_URL,
        headers: { Authorization: `Bearer ${token}` },
      })

      setCurrentUserId(user.userId || '')
      setUserEmail(user.signInDetails?.loginId || '')
      setAuthState('auth')

      // ニックネームを確認（未設定なら '' にセット）
      await fetchNickname()

      // FCM Push トークンを登録（失敗してもログインは続行）
      registerPushToken(apiClientRef.current).catch(() => {})  // Push通知失敗は無視
    } catch {
      setAuthState('unauth')
    }
  }

  /**
   * ニックネームを API から取得してステートにセットする。
   * 取得失敗時は '' をセット（＝NicknamePage を表示する）。
   */
  const fetchNickname = async () => {
    try {
      const res = await apiClientRef.current.get('/users/me')
      setNickname(res.data.nickname || '')
    } catch {
      setNickname('')
    }
  }

  // ─────────────────────────────────────────────
  // サインアウト後のステートリセット
  // ─────────────────────────────────────────────
  const handleSignedOut = () => {
    apiClientRef.current = null
    setAuthState('unauth')
    setCurrentProject(null)
    setCurrentUserId('')
    setUserEmail('')
    setNickname(null)
  }

  // ─────────────────────────────────────────────
  // ログアウトハンドラー（Home に渡す）
  // ─────────────────────────────────────────────
  const handleLogout = async () => {
    try {
      // Cognito のサインアウトURLを設定している場合は global: true を使うと
      // サーバー側セッションも破棄できるが、設定していない場合は hosted UI に
      // リダイレクトされてエラーになるためローカルのみのサインアウトにする。
      await amplifySignOut()
    } catch {
      // サインアウト失敗時もローカルステートをリセットして画面を戻す
      handleSignedOut()
    }
    // signedOut イベントで handleSignedOut() が呼ばれる
  }

  // ─────────────────────────────────────────────
  // 招待リンクを閉じるハンドラー（URLをクリーンアップ）
  // ─────────────────────────────────────────────
  const handleJoinClose = () => {
    setJoinProjectId(null)
    window.history.replaceState({}, '', '/')
  }

  // ─────────────────────────────────────────────
  // 画面の出し分けロジック
  // ─────────────────────────────────────────────

  // 1. セッション確認中
  if (authState === 'loading') {
    return <div className="loading">読み込み中...</div>
  }

  // 2. 未ログイン
  if (authState === 'unauth') {
    return <AuthPage onAuthSuccess={checkSession} />
  }

  // 3. ニックネーム未設定（初回ログイン）
  if (nickname === '') {
    return (
      <NicknamePage
        apiClient={apiClientRef.current}
        onSaved={(name) => setNickname(name)}
      />
    )
  }

  // 4. ニックネーム確認前（null）は何も表示しない（checkSession の非同期待ち）
  if (nickname === null) {
    return <div className="loading">読み込み中...</div>
  }

  // 5. 招待リンク経由（?join=projectId）
  if (joinProjectId) {
    return (
      <JoinPage
        apiClient={apiClientRef.current}
        projectId={joinProjectId}
        onJoined={handleJoinClose}
        onCancel={handleJoinClose}
      />
    )
  }

  // 6. プロジェクト詳細画面
  if (currentProject) {
    return (
      <ProjectDetail
        apiClient={apiClientRef.current}
        project={currentProject}
        currentUserId={currentUserId}
        onBack={() => setCurrentProject(null)}
      />
    )
  }

  // 7. ホーム画面（プロジェクト一覧）
  return (
    <Home
      apiClient={apiClientRef.current}
      user={{ id: currentUserId, email: userEmail }}
      onSelectProject={setCurrentProject}
      onLogout={handleLogout}
    />
  )
}