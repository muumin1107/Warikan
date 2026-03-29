export default function ExpenseList({ expenses, members }) {
  if (expenses.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '32px' }}>
        <p>まだ支払いがありません</p>
        <p style={{ fontSize: '13px', color: '#999', marginTop: '8px' }}>
          ＋ボタンから追加してください
        </p>
      </div>
    )
  }

  const total = expenses.reduce((sum, e) => sum + e.amountJPY, 0)

  return (
    <div>
      {expenses.map(expense => {
        const perPerson = Math.floor(expense.amountJPY / (expense.splitUserIds?.length || 1))
        return (
          <div key={expense.expenseId} className="expense-item card">
            <div className="expense-top">
              <span className="expense-title">{expense.title}</span>
              <span className="expense-amount">
                ¥{expense.amountJPY.toLocaleString()}
              </span>
            </div>
            <div className="expense-bottom">
              <span className="expense-payer">
                {expense.payerId.slice(0, 8)}が払った
              </span>
              <span className={`badge ${expense.splitType === 'ALL' ? 'badge-all' : 'badge-custom'}`}>
                {expense.splitType === 'ALL' ? '全員' : `${expense.splitUserIds?.length}人`}
              </span>
              <span className="expense-per">
                1人 ¥{perPerson.toLocaleString()}
              </span>
            </div>
          </div>
        )
      })}

      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', color: '#666' }}>
          合計（{expenses.length}件）
        </span>
        <span style={{ fontSize: '20px', fontWeight: '700' }}>
          ¥{total.toLocaleString()}
        </span>
      </div>
    </div>
  )
}