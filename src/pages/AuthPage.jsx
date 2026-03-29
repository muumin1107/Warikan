/**
 * AuthPage.jsx
 * 認証画面コンポーネント。以下のモードを1画面内で切り替えて表示する。
 *
 * モード一覧：
 *   signin  - メール/パスワードでログイン
 *   signup  - 新規アカウント作成
 *   confirm - メールアドレス確認コード入力（signup 後）
 *   forgot  - パスワードリセット申請（メール送信）
 *   reset   - 新しいパスワード設定（forgot 後）
 *
 * Google OAuth は signInWithRedirect() を使い、Amplify の Hub が
 * signedIn イベントを検知して App.jsx 側で onAuthSuccess() を呼ぶ。
 */

import { useState } from 'react'
import {
  signIn,
  signUp,
  confirmSignUp,
  resendSignUpCode,
  resetPassword,
  confirmResetPassword,
  signInWithRedirect,
} from 'aws-amplify/auth'
import './AuthPage.css'

// ─────────────────────────────────────────────
// 型定義（JSDoc）
// ─────────────────────────────────────────────
/**
 * @typedef {'signin' | 'signup' | 'confirm' | 'forgot' | 'reset'} AuthMode
 */

/** @type {Record<AuthMode, { title: string; subtitle: string | ((email: string) => string) }>} */
const MODE_META = {
  signin:  { title: 'ログイン',              subtitle: 'アカウントにサインイン' },
  signup:  { title: 'アカウント作成',         subtitle: 'メールアドレスで登録' },
  confirm: { title: 'メール確認',             subtitle: (email) => `${email} に送信されたコードを入力` },
  forgot:  { title: 'パスワードをリセット',   subtitle: 'メールにリセットコードを送信します' },
  reset:   { title: '新しいパスワード',       subtitle: (email) => `${email} に送信されたコードを入力` },
}

// ─────────────────────────────────────────────
// メインコンポーネント
// ─────────────────────────────────────────────
/**
 * @param {{ onAuthSuccess: () => void }} props
 */
export default function AuthPage({ onAuthSuccess }) {
  // ── 現在の認証フローのモード
  /** @type {[AuthMode, Function]} */
  const [mode, setMode] = useState('signin')

  // ── フォーム入力値
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')  // パスワード確認 / パスワードリセット確認
  const [code,     setCode]     = useState('')  // 確認コード
  const [newPass,  setNewPass]  = useState('')  // リセット後の新パスワード

  // ── UI 状態
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [info,    setInfo]    = useState('')

  // ─────────────────────────────────────────────
  // ユーティリティ
  // ─────────────────────────────────────────────

  /** エラー・インフォメッセージをクリア */
  const clearMessages = () => {
    setError('')
    setInfo('')
  }

  /**
   * モードを切り替える（メッセージもクリア）
   * @param {AuthMode} nextMode
   */
  const switchMode = (nextMode) => {
    clearMessages()
    setMode(nextMode)
  }

  // ─────────────────────────────────────────────
  // 認証ハンドラー
  // ─────────────────────────────────────────────

  /** サインイン（メール/パスワード） */
  const handleSignIn = async (e) => {
    e.preventDefault()
    clearMessages()
    setLoading(true)
    try {
      await signIn({ username: email, password })
      onAuthSuccess()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setLoading(false)
    }
  }

  /** 新規アカウント登録 */
  const handleSignUp = async (e) => {
    e.preventDefault()
    clearMessages()

    if (password !== confirm) {
      setError('パスワードが一致しません')
      return
    }

    setLoading(true)
    try {
      await signUp({
        username: email,
        password,
        options: { userAttributes: { email } },
      })
      setInfo('確認コードをメールに送信しました')
      setMode('confirm')
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setLoading(false)
    }
  }

  /** メールアドレスの確認コードを検証 */
  const handleConfirm = async (e) => {
    e.preventDefault()
    clearMessages()
    setLoading(true)
    try {
      await confirmSignUp({ username: email, confirmationCode: code })
      setInfo('登録完了！ログインしてください')
      setMode('signin')
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setLoading(false)
    }
  }

  /** 確認コードを再送信 */
  const handleResend = async () => {
    clearMessages()
    try {
      await resendSignUpCode({ username: email })
      setInfo('確認コードを再送しました')
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  /** パスワードリセット申請（リセットコードをメール送信） */
  const handleForgot = async (e) => {
    e.preventDefault()
    clearMessages()
    setLoading(true)
    try {
      await resetPassword({ username: email })
      setInfo('リセットコードをメールに送信しました')
      setMode('reset')
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setLoading(false)
    }
  }

  /** 新しいパスワードを確定（リセットコードと一緒に送信） */
  const handleReset = async (e) => {
    e.preventDefault()
    clearMessages()

    if (newPass !== confirm) {
      setError('パスワードが一致しません')
      return
    }

    setLoading(true)
    try {
      await confirmResetPassword({
        username: email,
        confirmationCode: code,
        newPassword: newPass,
      })
      setInfo('パスワードを変更しました')
      setMode('signin')
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setLoading(false)
    }
  }

  /** Google OAuth でサインイン（リダイレクト方式） */
  const handleGoogle = async () => {
    clearMessages()
    try {
      await signInWithRedirect({ provider: 'Google' })
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  // ─────────────────────────────────────────────
  // カードヘッダー用のタイトル・サブタイトルを生成
  // ─────────────────────────────────────────────
  const meta     = MODE_META[mode]
  const subtitle = typeof meta.subtitle === 'function'
    ? meta.subtitle(email)
    : meta.subtitle

  // ─────────────────────────────────────────────
  // レンダー
  // ─────────────────────────────────────────────
  return (
    <div className="auth-root">
      {/* 背景装飾（グラデーション円） */}
      <div className="auth-bg" aria-hidden="true">
        <div className="auth-bg-circle c1" />
        <div className="auth-bg-circle c2" />
        <div className="auth-bg-circle c3" />
      </div>

      <div className="auth-container">
        {/* ── ロゴ */}
        <div className="auth-logo">
          <span className="auth-logo-text">Wari<em>kan</em></span>
          <p className="auth-logo-sub">旅行の立て替えを、スマートに精算</p>
        </div>

        {/* ── カード */}
        <div className="auth-card">
          {/* カードヘッダー：モードに応じたタイトル */}
          <div className="auth-card-header">
            <h2>{meta.title}</h2>
            <p>{subtitle}</p>
          </div>

          {/* メッセージ表示（エラー / インフォ） */}
          {error && <div className="auth-msg auth-msg-err" role="alert">{error}</div>}
          {info  && <div className="auth-msg auth-msg-ok"  role="status">{info}</div>}

          {/* ── モード: ログイン */}
          {mode === 'signin' && (
            <form onSubmit={handleSignIn} className="auth-form">
              <div className="auth-field">
                <label htmlFor="signin-email">メールアドレス</label>
                <input
                  id="signin-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
              </div>
              <div className="auth-field">
                <label htmlFor="signin-password">パスワード</label>
                <input
                  id="signin-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
              </div>

              {/* パスワード忘れリンク */}
              <button
                type="button"
                className="auth-link-btn auth-link-forgot"
                onClick={() => switchMode('forgot')}
              >
                パスワードを忘れた場合
              </button>

              <button type="submit" className="auth-btn auth-btn-primary" disabled={loading}>
                {loading ? '処理中...' : 'ログイン'}
              </button>

              <div className="auth-divider"><span>または</span></div>

              <button type="button" className="auth-btn auth-btn-google" onClick={handleGoogle}>
                <GoogleIcon />
                Googleでログイン
              </button>

              <p className="auth-switch">
                アカウントをお持ちでない方は
                <button type="button" className="auth-link-btn" onClick={() => switchMode('signup')}>
                  新規登録
                </button>
              </p>
            </form>
          )}

          {/* ── モード: 新規登録 */}
          {mode === 'signup' && (
            <form onSubmit={handleSignUp} className="auth-form">
              <div className="auth-field">
                <label htmlFor="signup-email">メールアドレス</label>
                <input
                  id="signup-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
              </div>
              <div className="auth-field">
                <label htmlFor="signup-password">パスワード</label>
                <input
                  id="signup-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="8文字以上"
                  required
                  autoComplete="new-password"
                />
              </div>
              <div className="auth-field">
                <label htmlFor="signup-confirm">パスワード（確認）</label>
                <input
                  id="signup-confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="new-password"
                />
              </div>

              <button type="submit" className="auth-btn auth-btn-primary" disabled={loading}>
                {loading ? '処理中...' : '登録する'}
              </button>

              <div className="auth-divider"><span>または</span></div>

              <button type="button" className="auth-btn auth-btn-google" onClick={handleGoogle}>
                <GoogleIcon />
                Googleで登録
              </button>

              <p className="auth-switch">
                すでにアカウントをお持ちの方は
                <button type="button" className="auth-link-btn" onClick={() => switchMode('signin')}>
                  ログイン
                </button>
              </p>
            </form>
          )}

          {/* ── モード: メール確認コード入力 */}
          {mode === 'confirm' && (
            <form onSubmit={handleConfirm} className="auth-form">
              <div className="auth-field">
                <label htmlFor="confirm-code">確認コード</label>
                <input
                  id="confirm-code"
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="6桁のコード"
                  required
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={6}
                  className="auth-code-input"
                />
              </div>

              <button type="submit" className="auth-btn auth-btn-primary" disabled={loading}>
                {loading ? '処理中...' : '確認する'}
              </button>

              <p className="auth-switch">
                コードが届かない場合は
                <button type="button" className="auth-link-btn" onClick={handleResend}>
                  再送する
                </button>
              </p>
            </form>
          )}

          {/* ── モード: パスワードリセット申請 */}
          {mode === 'forgot' && (
            <form onSubmit={handleForgot} className="auth-form">
              <div className="auth-field">
                <label htmlFor="forgot-email">メールアドレス</label>
                <input
                  id="forgot-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
              </div>

              <button type="submit" className="auth-btn auth-btn-primary" disabled={loading}>
                {loading ? '送信中...' : 'リセットコードを送信'}
              </button>

              <p className="auth-switch">
                <button type="button" className="auth-link-btn" onClick={() => switchMode('signin')}>
                  ログインに戻る
                </button>
              </p>
            </form>
          )}

          {/* ── モード: 新しいパスワード設定 */}
          {mode === 'reset' && (
            <form onSubmit={handleReset} className="auth-form">
              <div className="auth-field">
                <label htmlFor="reset-code">確認コード</label>
                <input
                  id="reset-code"
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="6桁のコード"
                  required
                  inputMode="numeric"
                  maxLength={6}
                  className="auth-code-input"
                />
              </div>
              <div className="auth-field">
                <label htmlFor="reset-password">新しいパスワード</label>
                <input
                  id="reset-password"
                  type="password"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  placeholder="8文字以上"
                  required
                  autoComplete="new-password"
                />
              </div>
              <div className="auth-field">
                <label htmlFor="reset-confirm">パスワード（確認）</label>
                <input
                  id="reset-confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="new-password"
                />
              </div>

              <button type="submit" className="auth-btn auth-btn-primary" disabled={loading}>
                {loading ? '処理中...' : 'パスワードを変更'}
              </button>
            </form>
          )}
        </div>
        {/* /.auth-card */}
      </div>
      {/* /.auth-container */}
    </div>
  )
}

// ─────────────────────────────────────────────
// サブコンポーネント
// ─────────────────────────────────────────────

/** Google ブランドアイコン（SVG） */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

// ─────────────────────────────────────────────
// ユーティリティ関数
// ─────────────────────────────────────────────

/**
 * Cognito のエラーを日本語のユーザー向けメッセージに変換する。
 * err.name（Amplify v6）または err.code（旧形式）でマッチング。
 * @param {Error & { name?: string; code?: string }} err
 * @returns {string} 日本語エラーメッセージ
 */
function friendlyError(err) {
  const code = err?.name || err?.code || ''
  const msg  = err?.message || ''

  const messages = {
    UserNotFoundException:    'メールアドレスが見つかりません',
    NotAuthorizedException:   'メールアドレスまたはパスワードが正しくありません',
    UsernameExistsException:  'このメールアドレスはすでに登録されています',
    InvalidPasswordException: 'パスワードは8文字以上で英数字を含めてください',
    CodeMismatchException:    '確認コードが正しくありません',
    ExpiredCodeException:     '確認コードの有効期限が切れています。再送してください',
    LimitExceededException:   'リクエスト回数の上限に達しました。しばらく待ってから再試行してください',
  }

  if (messages[code]) return messages[code]
  if (msg.includes('Password did not conform')) {
    return 'パスワードは8文字以上で英数字・記号を含めてください'
  }
  return msg || 'エラーが発生しました'
}