/**
 * ProjectDetail.jsx
 * プロジェクト詳細画面。タブ切り替えで以下を表示する。
 *   - 支払い一覧タブ（ExpenseList コンポーネント）
 *   - 残高・精算タブ（Balance コンポーネント）
 *
 * 機能：
 *   - 支払い追加モーダル（FAB）
 *   - メンバー招待モーダル（招待 FAB）
 *   - プロジェクト終了 / 再開（オーナーのみ）
 *   - プロジェクト終了中は閲覧専用（FAB 非表示）
 */

import { useEffect, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import ExpenseList from '../components/ExpenseList'
import Balance     from '../components/Balance'
import './ProjectDetail.css'

// ─────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────

/**
 * 支払いカテゴリ一覧。
 * value は DynamoDB に保存される文字列。label は表示名。color は CSS クラス名に使われる。
 * フロントのみの変更で追加可能（DBスキーマ変更不要）。
 */
export const CATEGORIES = [
  { value: 'food',          label: '食事',   color: 'green'  },
  { value: 'transport',     label: '交通',   color: 'blue'   },
  { value: 'accommodation', label: '宿泊',   color: 'purple' },
  { value: 'sightseeing',   label: '観光',   color: 'amber'  },
  { value: 'shopping',      label: '買い物', color: 'pink'   },
  { value: 'other',         label: 'その他', color: 'gray'   },
]

/**
 * 対応通貨一覧。
 * symbol: 通貨記号（フォーム表示用）
 * defaultRate: デフォルト為替レートの目安（初期値として表示するだけ、実際は手入力）
 */
export const CURRENCIES = [
  { code: 'JPY', symbol: '¥',  label: '日本円（JPY）',      defaultRate: 1     },
  { code: 'USD', symbol: '$',  label: '米ドル（USD）',       defaultRate: 150   },
  { code: 'EUR', symbol: '€',  label: 'ユーロ（EUR）',       defaultRate: 160   },
  { code: 'KRW', symbol: '₩',  label: '韓国ウォン（KRW）',   defaultRate: 0.11  },
  { code: 'THB', symbol: '฿',  label: 'タイバーツ（THB）',   defaultRate: 4.2   },
  { code: 'TWD', symbol: 'NT$', label: '台湾ドル（TWD）',    defaultRate: 4.6   },
  { code: 'CNY', symbol: '¥',  label: '中国元（CNY）',       defaultRate: 21    },
  { code: 'GBP', symbol: '£',  label: 'ポンド（GBP）',       defaultRate: 188   },
  { code: 'AUD', symbol: 'A$', label: 'オーストラリアドル（AUD）', defaultRate: 97 },
]

/**
 * 支払い追加フォームの初期値。
 * モーダルを閉じるたびにこの値でリセットする。
 */
const INITIAL_NEW_EXPENSE = {
  title:          '',
  amountJPY:      '',
  currency:       'JPY',  // 通貨コード（デフォルトは日本円）
  originalAmount: '',     // 現地通貨の金額（JPY 以外のとき使用）
  exchangeRate:   '',     // 為替レート（JPY 以外のとき使用）
  category:       '',     // カテゴリ（任意）
  splitType:      'ALL',  // 'ALL' | 'CUSTOM'
  splitUserIds:   [],
  paymentMethod:  'cash', // 'cash' | 'card'
  receiptUrl:     '',
}

/**
 * 支払い・招待作成後に一覧を再取得するまでの待機時間（ms）。
 * POST /expenses は SQS 経由の非同期処理（202 Accepted）のため、
 * DynamoDB への書き込みが完了するまで少し待つ必要がある。
 */
const REFETCH_DELAY_MS = 2000

// ─────────────────────────────────────────────
// メインコンポーネント
// ─────────────────────────────────────────────

/**
 * @param {{
 *   apiClient:     import('axios').AxiosInstance,
 *   project:       { projectId: string, name: string },
 *   currentUserId: string,
 *   onBack:        () => void,
 * }} props
 */
export default function ProjectDetail({ apiClient, project, currentUserId, onBack }) {
  // ── タブ
  const [tab, setTab] = useState('expenses')  // 'expenses' | 'balance'

  // ── データ
  const [members,  setMembers]  = useState([])
  const [expenses, setExpenses] = useState([])
  const [balance,  setBalance]  = useState({ balances: [], settlements: [] })
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')

  // ── プロジェクト状態
  const [projectStatus,   setProjectStatus]   = useState('active')
  const [projectOwnerId,  setProjectOwnerId]  = useState('')
  const [statusChanging,  setStatusChanging]  = useState(false)

  // ── 支払い追加モーダル
  const [showModal,        setShowModal]        = useState(false)
  const [newExpense,       setNewExpense]       = useState(INITIAL_NEW_EXPENSE)
  const [receiptUploading, setReceiptUploading] = useState(false)  // レシートアップロード中

  // ── メンバー招待モーダル
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteEmail,     setInviteEmail]     = useState('')
  const [inviteLink,      setInviteLink]      = useState('')
  /** @type {'idle' | 'loading' | 'success' | 'error'} */
  const [inviteStatus,    setInviteStatus]    = useState('idle')
  const [inviteMessage,   setInviteMessage]   = useState('')

  // ─────────────────────────────────────────────
  // 計算値
  // ─────────────────────────────────────────────

  /** 割り勘の対象人数（プレビュー表示用） */
  const splitCount = newExpense.splitType === 'ALL'
    ? members.length
    : newExpense.splitUserIds.length || 1

  /** 1人あたりの金額（プレビュー表示用） */
  const perPersonAmount = newExpense.amountJPY
    ? Math.floor(parseInt(newExpense.amountJPY) / splitCount)
    : 0

  /** 現在のユーザーがオーナーかどうか */
  const isOwner = currentUserId === projectOwnerId

  /** プロジェクトが終了しているかどうか */
  const isClosed = projectStatus === 'closed'

  // ─────────────────────────────────────────────
  // 初回マウント：全データ取得
  // ─────────────────────────────────────────────
  useEffect(() => {
    fetchAll()
  }, [])

  // ─────────────────────────────────────────────
  // モーダル：Escape キーで閉じる
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (!showModal && !showInviteModal) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showModal)       closeExpenseModal()
        if (showInviteModal) closeInviteModal()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showModal, showInviteModal])

  // ─────────────────────────────────────────────
  // データ取得
  // ─────────────────────────────────────────────

  /**
   * プロジェクト情報・支払い一覧・残高を並列取得する。
   * fetchAll は作成・削除・編集後のリフレッシュにも使われる。
   */
  const fetchAll = async () => {
    setError('')
    try {
      const [projRes, expRes, balRes] = await Promise.all([
        apiClient.get(`/projects/${project.projectId}`),
        apiClient.get(`/projects/${project.projectId}/expenses`),
        apiClient.get(`/projects/${project.projectId}/balance`),
      ])
      setMembers(projRes.data.members   || [])
      setExpenses(expRes.data.expenses  || [])
      setBalance(balRes.data)
      setProjectStatus(projRes.data.status   || 'active')
      setProjectOwnerId(projRes.data.ownerId || '')
    } catch (err) {
      console.error('データ取得に失敗しました:', err)
      setError('データの読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }

  // ─────────────────────────────────────────────
  // プロジェクト終了 / 再開
  // ─────────────────────────────────────────────

  /** オーナーのみ操作可。確認ダイアログ後に status を切り替える。 */
  const toggleStatus = async () => {
    const nextStatus = isClosed ? 'active' : 'closed'
    const label      = nextStatus === 'closed' ? '終了' : '再開'
    if (!window.confirm(`プロジェクトを${label}しますか？`)) return

    setStatusChanging(true)
    try {
      await apiClient.put(`/projects/${project.projectId}/status`, { status: nextStatus })
      setProjectStatus(nextStatus)
    } catch (err) {
      console.error('ステータス変更に失敗しました:', err)
      setError('ステータスの変更に失敗しました')
    } finally {
      setStatusChanging(false)
    }
  }

  // ─────────────────────────────────────────────
  // 支払い追加
  // ─────────────────────────────────────────────

  const openExpenseModal = () => {
    setNewExpense(INITIAL_NEW_EXPENSE)
    setShowModal(true)
  }

  const closeExpenseModal = () => {
    setShowModal(false)
    setNewExpense(INITIAL_NEW_EXPENSE)
  }

  /** フォーム入力の更新ヘルパー */
  const updateNewExpense = (field) => (e) => {
    setNewExpense((prev) => ({ ...prev, [field]: e.target.value }))
  }

  /**
   * splitType === 'CUSTOM' のときのメンバー選択トグル。
   * 既に選択済みなら除外、未選択なら追加する。
   * @param {string} userId
   */
  const toggleMember = (userId) => {
    setNewExpense((prev) => ({
      ...prev,
      splitUserIds: prev.splitUserIds.includes(userId)
        ? prev.splitUserIds.filter((id) => id !== userId)
        : [...prev.splitUserIds, userId],
    }))
  }

  /**
   * レシート画像を S3 にアップロードする。
   * GET /expenses/receipt/upload-url でプリサインドURL を取得し、
   * そのURLに直接 PUT することでフロントから S3 に保存する。
   * @param {File} file
   * @returns {Promise<string>} アップロード済みの S3 公開URL（receiptUrl として保存）
   */
  const uploadReceipt = async (file) => {
    setReceiptUploading(true)
    try {
      // ① プリサインドURL を取得
      const res = await apiClient.get('/expenses/receipt/upload-url', {
        params: {
          fileName:    file.name,
          contentType: file.type,
        },
      })
      const { uploadUrl, fileUrl } = res.data

      // ② S3 に直接 PUT（axios を使うと Authorization ヘッダーが付いてしまうため fetch を使う）
      const putRes = await fetch(uploadUrl, {
        method:  'PUT',
        headers: { 'Content-Type': file.type },
        body:    file,
      })

      // fetch は 4xx/5xx でも例外を投げないため、ステータスを明示的に確認する
      if (!putRes.ok) {
        throw new Error(`S3へのアップロードに失敗しました (${putRes.status})`)
      }

      return fileUrl
    } finally {
      setReceiptUploading(false)
    }
  }

  const createExpense = async () => {
    if (!newExpense.title.trim() || !newExpense.amountJPY) return

    const splitUserIds = newExpense.splitType === 'ALL'
      ? members.map((m) => m.userId)
      : newExpense.splitUserIds

    try {
      await apiClient.post(`/projects/${project.projectId}/expenses`, {
        operation:      'CREATE',
        expenseId:      uuidv4(),
        title:          newExpense.title.trim(),
        amountJPY:      parseInt(newExpense.amountJPY),
        currency:       newExpense.currency,
        originalAmount: newExpense.currency !== 'JPY' ? parseFloat(newExpense.originalAmount) : parseInt(newExpense.amountJPY),
        exchangeRate:   newExpense.currency !== 'JPY' ? parseFloat(newExpense.exchangeRate)   : 1,
        category:       newExpense.category,
        splitType:      newExpense.splitType,
        splitUserIds,
        paymentMethod:  newExpense.paymentMethod,
        receiptUrl:     newExpense.receiptUrl,
        paidAt:         new Date().toISOString(),
      })
      closeExpenseModal()
      // SQS 非同期のため書き込み完了を待ってから再取得
      setTimeout(fetchAll, REFETCH_DELAY_MS)
    } catch (err) {
      console.error('支払い追加に失敗しました:', err)
      setError('支払いの追加に失敗しました')
    }
  }

  // ─────────────────────────────────────────────
  // メンバー招待
  // ─────────────────────────────────────────────

  const openInviteModal = () => {
    setInviteEmail('')
    setInviteLink('')
    setInviteStatus('idle')
    setInviteMessage('')
    setShowInviteModal(true)
  }

  const closeInviteModal = () => {
    setShowInviteModal(false)
  }

  /**
   * メールアドレスで招待する。
   * POST /projects/{id}/members → Cognito でユーザー検索 → PROJECT_MEMBER に invited で登録。
   */
  const inviteMember = async () => {
    if (!inviteEmail.trim()) return
    setInviteStatus('loading')
    setInviteMessage('')
    try {
      await apiClient.post(`/projects/${project.projectId}/members`, {
        email: inviteEmail.trim(),
      })
      setInviteStatus('success')
      setInviteMessage(
        `${inviteEmail} に招待しました。相手が招待リンクから参加するとメンバーに追加されます。`
      )
      setInviteEmail('')
    } catch (err) {
      setInviteStatus('error')
      setInviteMessage(err?.response?.data?.message || '招待に失敗しました')
    }
  }

  /**
   * 招待リンクを生成してクリップボードにコピーする。
   * URL は ?join=projectId 形式。JoinPage.jsx で処理される。
   */
  const generateInviteLink = () => {
    const link = `${window.location.origin}?join=${project.projectId}`
    setInviteLink(link)
    navigator.clipboard.writeText(link).then(() => {
      setInviteMessage('招待リンクをクリップボードにコピーしました！')
      setInviteStatus('success')
    })
  }

  // ─────────────────────────────────────────────
  // レンダー
  // ─────────────────────────────────────────────

  if (loading) return <div className="loading">読み込み中...</div>

  return (
    <div>
      {/* ── ヘッダー */}
      <header className="header">
        {/* 戻るボタン */}
        <button className="pd-back-btn" onClick={onBack} aria-label="ホームに戻る">
          ←
        </button>

        {/* プロジェクト名 */}
        <h1 className="pd-header-title">{project.name}</h1>

        {/* 終了 / 再開ボタン（オーナーのみ） */}
        {isOwner && (
          <button
            className={`pd-status-btn ${isClosed ? 'pd-status-btn--reopen' : 'pd-status-btn--close'}`}
            onClick={toggleStatus}
            disabled={statusChanging}
          >
            {statusChanging ? '...' : isClosed ? '再開' : '終了'}
          </button>
        )}
      </header>

      <div className="main-content">
        {/* エラーバナー */}
        {error && <div className="error" role="alert">{error}</div>}

        {/* 終了済みバナー */}
        {isClosed && (
          <div className="pd-closed-banner">
            🔒 このプロジェクトは終了しています（閲覧のみ）
          </div>
        )}

        {/* タブ切り替え */}
        <div className="tabs">
          <button
            className={`tab ${tab === 'expenses' ? 'active' : ''}`}
            onClick={() => setTab('expenses')}
          >
            支払い一覧
          </button>
          <button
            className={`tab ${tab === 'balance' ? 'active' : ''}`}
            onClick={() => setTab('balance')}
          >
            残高・精算
          </button>
        </div>

        {/* タブコンテンツ */}
        {tab === 'expenses' ? (
          <ExpenseList
            expenses={expenses}
            members={members}
            apiClient={apiClient}
            projectId={project.projectId}
            currentUserId={currentUserId}
            onRefresh={fetchAll}
            isProjectClosed={isClosed}
          />
        ) : (
          <Balance
            balance={balance}
            members={members}
            apiClient={apiClient}
            projectId={project.projectId}
            currentUserId={currentUserId}
            onSettled={fetchAll}
          />
        )}
      </div>

      {/* ── FAB：支払い追加（支払い一覧タブ + 進行中のみ） */}
      {tab === 'expenses' && !isClosed && (
        <button className="fab" onClick={openExpenseModal} aria-label="支払いを追加">
          ＋
        </button>
      )}

      {/* ── 招待 FAB（進行中のみ） */}
      {!isClosed && (
        <button
          className="invite-fab"
          onClick={openInviteModal}
          aria-label="メンバーを招待"
          title="メンバーを招待"
        >
          👥
        </button>
      )}

      {/* ── 支払い追加モーダル */}
      {showModal && (
        <div
          className="modal-overlay"
          onClick={closeExpenseModal}
          role="dialog"
          aria-modal="true"
          aria-label="支払いを追加"
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" aria-hidden="true" />
            <h2>支払いを追加</h2>

            {/* タイトル */}
            <div className="form-group">
              <label htmlFor="expense-title">タイトル</label>
              <input
                id="expense-title"
                type="text"
                placeholder="例: ランチ代"
                value={newExpense.title}
                onChange={updateNewExpense('title')}
                autoFocus
              />
            </div>

            {/* 通貨 + 金額 */}
            <div className="form-group">
              <label htmlFor="expense-currency">通貨</label>
              <select
                id="expense-currency"
                value={newExpense.currency}
                onChange={(e) => {
                  const cur = CURRENCIES.find((c) => c.code === e.target.value)
                  setNewExpense((prev) => ({
                    ...prev,
                    currency:       cur.code,
                    originalAmount: '',
                    exchangeRate:   cur.code !== 'JPY' ? String(cur.defaultRate) : '',
                    amountJPY:      cur.code === 'JPY' ? prev.amountJPY : '',
                  }))
                }}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
            </div>

            {/* 日本円の場合：直接入力 */}
            {newExpense.currency === 'JPY' ? (
              <div className="form-group">
                <label htmlFor="expense-amount">金額（円）</label>
                <input
                  id="expense-amount"
                  type="number"
                  placeholder="0"
                  value={newExpense.amountJPY}
                  onChange={updateNewExpense('amountJPY')}
                  min="1"
                />
              </div>
            ) : (
              /* 外貨の場合：現地金額 + 為替レート → 円換算プレビュー */
              <>
                <div className="form-group">
                  <label htmlFor="expense-original-amount">
                    金額（{newExpense.currency}）
                  </label>
                  <div className="currency-amount-row">
                    <span className="currency-symbol">
                      {CURRENCIES.find((c) => c.code === newExpense.currency)?.symbol}
                    </span>
                    <input
                      id="expense-original-amount"
                      type="number"
                      placeholder="0"
                      value={newExpense.originalAmount}
                      min="0"
                      step="any"
                      onChange={(e) => {
                        const orig = parseFloat(e.target.value) || 0
                        const rate = parseFloat(newExpense.exchangeRate) || 0
                        setNewExpense((prev) => ({
                          ...prev,
                          originalAmount: e.target.value,
                          amountJPY:      rate ? String(Math.round(orig * rate)) : '',
                        }))
                      }}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="expense-rate">
                    為替レート（1{newExpense.currency} = ?円）
                  </label>
                  <input
                    id="expense-rate"
                    type="number"
                    placeholder="例: 150"
                    value={newExpense.exchangeRate}
                    min="0"
                    step="any"
                    onChange={(e) => {
                      const rate = parseFloat(e.target.value) || 0
                      const orig = parseFloat(newExpense.originalAmount) || 0
                      setNewExpense((prev) => ({
                        ...prev,
                        exchangeRate: e.target.value,
                        amountJPY:    rate ? String(Math.round(orig * rate)) : '',
                      }))
                    }}
                  />
                </div>
                {/* 円換算プレビュー */}
                {newExpense.amountJPY && (
                  <div className="currency-preview">
                    <span className="currency-preview-label">円換算（概算）</span>
                    <span className="currency-preview-amount">
                      ¥{parseInt(newExpense.amountJPY).toLocaleString()}
                    </span>
                  </div>
                )}
              </>
            )}

            {/* カテゴリ（任意） */}
            <div className="form-group">
              <label htmlFor="expense-category">カテゴリ（任意）</label>
              <div className="category-select">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    className={`category-chip category-chip--${cat.color} ${newExpense.category === cat.value ? 'category-chip--active' : ''}`}
                    onClick={() => setNewExpense((prev) => ({
                      ...prev,
                      category: prev.category === cat.value ? '' : cat.value,
                    }))}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 支払い方法 */}
            <div className="form-group">
              <label htmlFor="expense-method">支払い方法</label>
              <select
                id="expense-method"
                value={newExpense.paymentMethod}
                onChange={updateNewExpense('paymentMethod')}
              >
                <option value="cash">現金</option>
                <option value="card">カード</option>
              </select>
            </div>

            {/* 請求先（全員 / 選択） */}
            <div className="form-group">
              <label>請求先</label>
              <div className="split-toggle">
                <button
                  type="button"
                  className={newExpense.splitType === 'ALL' ? 'active' : ''}
                  onClick={() => setNewExpense((prev) => ({ ...prev, splitType: 'ALL' }))}
                >
                  全員
                </button>
                <button
                  type="button"
                  className={newExpense.splitType === 'CUSTOM' ? 'active' : ''}
                  onClick={() => setNewExpense((prev) => ({ ...prev, splitType: 'CUSTOM' }))}
                >
                  選択する
                </button>
              </div>

              {/* カスタム選択時：メンバー一覧チェックボックス */}
              {newExpense.splitType === 'CUSTOM' && (
                <div className="member-checklist">
                  {members.map((m) => {
                    const isChecked = newExpense.splitUserIds.includes(m.userId)
                    return (
                      <div
                        key={m.userId}
                        className={`member-check-item ${isChecked ? 'member-check-item--checked' : ''}`}
                        onClick={() => toggleMember(m.userId)}
                        role="checkbox"
                        aria-checked={isChecked}
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && toggleMember(m.userId)}
                      >
                        <div className="member-check-avatar">
                          {(m.nickname || m.userId).slice(0, 1).toUpperCase()}
                        </div>
                        <span className="member-check-name">
                          {m.nickname || m.userId.slice(0, 8)}
                        </span>
                        {/* SVGチェックアイコン（絵文字を使わない） */}
                        <MemberCheckSvg checked={isChecked} />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* 1人あたり金額プレビュー */}
            {newExpense.amountJPY && (
              <div className="split-preview">
                <span className="split-preview-label">
                  {splitCount}人で割ると
                </span>
                <span className="split-preview-amount">
                  ¥{perPersonAmount.toLocaleString()}<span className="split-preview-unit">/人</span>
                </span>
              </div>
            )}

            {/* レシート写真（任意） */}
            <div className="form-group">
              <label>レシート写真（任意）</label>
              <label className="receipt-upload-label">
                <input
                  type="file"
                  accept="image/*"
                  className="receipt-upload-input"
                  disabled={receiptUploading}
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    try {
                      const url = await uploadReceipt(file)
                      setNewExpense((prev) => ({ ...prev, receiptUrl: url }))
                    } catch {
                      setError('レシートのアップロードに失敗しました')
                    }
                  }}
                />
                <span className={`receipt-upload-btn ${receiptUploading ? 'receipt-upload-btn--loading' : ''}`}>
                  {receiptUploading ? 'アップロード中...' : newExpense.receiptUrl ? '写真を変更' : '写真を選択'}
                </span>
              </label>
              {/* アップロード済みサムネイル */}
              {newExpense.receiptUrl && (
                <div className="receipt-preview">
                  <img
                    src={newExpense.receiptUrl}
                    alt="レシートプレビュー"
                    className="receipt-preview-img"
                  />
                  <button
                    type="button"
                    className="receipt-remove-btn"
                    onClick={() => setNewExpense((prev) => ({ ...prev, receiptUrl: '' }))}
                    aria-label="写真を削除"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            <button
              className="primary-button pd-modal-submit-btn"
              onClick={createExpense}
              disabled={!newExpense.title.trim() || !newExpense.amountJPY || receiptUploading}
            >
              追加する
            </button>
          </div>
        </div>
      )}

      {/* ── メンバー招待モーダル */}
      {showInviteModal && (
        <div
          className="modal-overlay"
          onClick={closeInviteModal}
          role="dialog"
          aria-modal="true"
          aria-label="メンバーを招待"
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" aria-hidden="true" />
            <h2>メンバーを招待</h2>

            {/* ── 招待リンクブロック */}
            <div className="invite-block">
              <div className="invite-block-label">招待リンク</div>
              <p className="invite-block-desc">
                リンクを共有するだけでメンバーを招待できます
              </p>
              <button
                className={`invite-copy-btn ${inviteLink ? 'invite-copy-btn--copied' : ''}`}
                onClick={generateInviteLink}
              >
                {inviteLink ? (
                  <>
                    <CheckSvg />
                    コピーしました
                  </>
                ) : (
                  <>
                    <LinkSvg />
                    リンクをコピー
                  </>
                )}
              </button>
              {/* コピー済みのURLをプレビュー表示 */}
              {inviteLink && (
                <div className="invite-link-preview">{inviteLink}</div>
              )}
            </div>

            <div className="invite-divider"><span>または</span></div>

            {/* ── メールアドレスで招待ブロック */}
            <div className="invite-block">
              <div className="invite-block-label">メールアドレスで招待</div>
              <p className="invite-block-desc">
                登録済みのメールアドレスを入力してください
              </p>
              <div className="form-group invite-form-group">
                <input
                  type="email"
                  placeholder="example@email.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && inviteMember()}
                />
              </div>
              <button
                className="primary-button pd-modal-invite-btn"
                onClick={inviteMember}
                disabled={inviteStatus === 'loading' || !inviteEmail.trim()}
              >
                {inviteStatus === 'loading' ? '送信中...' : '招待する'}
              </button>
            </div>

            {/* 招待結果メッセージ */}
            {inviteMessage && inviteStatus !== 'success' && (
              <div
                className={`invite-message invite-message--${inviteStatus}`}
                role="alert"
              >
                {inviteMessage}
              </div>
            )}
            {inviteMessage && inviteStatus === 'success' && inviteEmail === '' && (
              <div className="invite-message invite-message--success" role="status">
                {inviteMessage}
              </div>
            )}

            <button
              className="invite-close-btn"
              onClick={closeInviteModal}
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// SVG アイコンコンポーネント
// 絵文字を使わず、スタイルに一貫性を持たせる
// ─────────────────────────────────────────────

/**
 * メンバー選択チェックアイコン。
 * checked=true  → 塗りつぶし円 + 白チェックマーク
 * checked=false → グレーの円枠のみ
 * @param {{ checked: boolean }} props
 */
function MemberCheckSvg({ checked }) {
  return (
    <svg
      className="member-check-svg"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      {checked ? (
        <>
          <circle cx="10" cy="10" r="10" fill="var(--color-primary)" />
          <path
            d="M6 10l3 3 5-5"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <circle
          cx="10" cy="10" r="9"
          stroke="var(--color-border)"
          strokeWidth="1.5"
        />
      )}
    </svg>
  )
}

/** リンクコピーボタン用：リンクアイコン */
function LinkSvg() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

/** リンクコピー完了ボタン用：チェックアイコン */
function CheckSvg() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}