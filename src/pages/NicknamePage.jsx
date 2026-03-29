/**
 * NicknamePage.jsx
 * 初回ログイン時のニックネーム設定画面。
 *
 * 表示条件：App.jsx で nickname === '' と判定されたとき（未設定ユーザー）。
 * 保存後は onSaved(nickname) を呼び、App.jsx 側でニックネームをセットして
 * 通常フローに遷移する。
 */

import { useState } from 'react'
import './NicknamePage.css'

/** ニックネームの最大文字数 */
const MAX_LENGTH = 20

/**
 * @param {{
 *   apiClient: import('axios').AxiosInstance,
 *   onSaved: (nickname: string) => void
 * }} props
 */
export default function NicknamePage({ apiClient, onSaved }) {
  const [nickname, setNickname] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  // ─────────────────────────────────────────────
  // バリデーション
  // ─────────────────────────────────────────────
  const validate = (value) => {
    if (!value.trim())            return 'ニックネームを入力してください'
    if (value.length > MAX_LENGTH) return `${MAX_LENGTH}文字以内で入力してください`
    return null
  }

  // ─────────────────────────────────────────────
  // 保存処理
  // ─────────────────────────────────────────────
  const handleSave = async () => {
    const trimmed = nickname.trim()
    const validationError = validate(trimmed)
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    setError('')
    try {
      await apiClient.post('/users/me', { nickname: trimmed })
      onSaved(trimmed)
    } catch (err) {
      setError(err?.response?.data?.message || '保存に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  // ─────────────────────────────────────────────
  // 入力変更ハンドラー（入力と同時にエラーをクリア）
  // ─────────────────────────────────────────────
  const handleChange = (e) => {
    setNickname(e.target.value)
    if (error) setError('')
  }

  // Enter キーで保存
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSave()
  }

  // ─────────────────────────────────────────────
  // レンダー
  // ─────────────────────────────────────────────
  return (
    <div className="nickname-root">
      {/* 背景装飾（AuthPage と統一デザイン） */}
      <div className="nickname-bg" aria-hidden="true">
        <div className="nickname-bg-circle c1" />
        <div className="nickname-bg-circle c2" />
      </div>

      <div className="nickname-container">
        {/* ロゴ */}
        <div className="nickname-logo">
          Wari<em>kan</em>
        </div>

        {/* カード */}
        <div className="nickname-card">
          <div className="nickname-icon" aria-hidden="true">👋</div>

          <h2>はじめまして！</h2>
          <p className="nickname-sub">
            グループメンバーに表示される<br />
            ニックネームを設定してください
          </p>

          {/* 入力フィールド */}
          <div className="nickname-field">
            <input
              type="text"
              placeholder="例: 田中さん"
              value={nickname}
              maxLength={MAX_LENGTH}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              autoFocus
              aria-label="ニックネーム"
              aria-describedby={error ? 'nickname-error' : undefined}
            />
            {/* 文字数カウンター */}
            <span className="nickname-count" aria-live="polite">
              {nickname.length}/{MAX_LENGTH}
            </span>
          </div>

          {/* エラーメッセージ */}
          {error && (
            <div id="nickname-error" className="nickname-error" role="alert">
              {error}
            </div>
          )}

          {/* 保存ボタン */}
          <button
            className="nickname-btn"
            onClick={handleSave}
            disabled={loading || !nickname.trim()}
          >
            {loading ? '保存中...' : 'はじめる'}
          </button>
        </div>
      </div>
    </div>
  )
}