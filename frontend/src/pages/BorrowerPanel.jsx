import { useEffect, useMemo, useState } from 'react'
import AppShell from '../components/AppShell'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { openRazorpayCheckout } from '../lib/razorpay'

const sections = [
  { key: 'overview', label: 'Dashboard' },
  { key: 'request', label: 'Apply Loan' },
  { key: 'repay', label: 'Repayment' },
  { key: 'credit', label: 'Credit Score' },
  { key: 'history', label: 'Loan History' },
  { key: 'alerts', label: 'Notifications' },
  { key: 'profile', label: 'Profile' },
]

const money = (n = 0) => `INR ${Number(n).toLocaleString('en-IN')}`
const dateLabel = (value) => (value ? new Date(value).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : 'TBD')
const pct = (num = 0, den = 1) => Math.max(0, Math.min(100, Math.round((Number(num) / Math.max(Number(den), 1)) * 100)))

const estimateRepayable = (amount, tenure) => {
  const principal = Number(amount || 0)
  const ratio = tenure === 'THIRTY' ? 1.1 : tenure === 'FOURTEEN' ? 1.075 : 1.05
  return Math.round(principal * ratio)
}

const statusClass = (status = '') => {
  if (status === 'ACTIVE') return 'badge-active'
  if (status === 'REPAID') return 'badge-repaid'
  if (status === 'DEFAULTED') return 'badge-overdue'
  return 'badge-pending'
}

export default function BorrowerPanel() {
  const { accessToken, user, logout } = useAuth()
  const [activeSection, setActiveSection] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [dashboard, setDashboard] = useState(null)
  const [profile, setProfile] = useState(null)
  const [myLoans, setMyLoans] = useState([])
  const [notifications, setNotifications] = useState([])
  const [creditHistory, setCreditHistory] = useState([])
  const [upi, setUpi] = useState('')
  const [currentUpi, setCurrentUpi] = useState(null)

  const [loanForm, setLoanForm] = useState({
    principalAmount: 1000,
    tenure: 'SEVEN',
    purpose: 'FOOD',
    purposeNote: '',
  })

  const reload = async () => {
    setLoading(true)
    setError('')
    try {
      const [d, p, l, n, c, u] = await Promise.all([
        api.get('/users/dashboard', accessToken),
        api.get('/users/profile', accessToken),
        api.get('/loans/my', accessToken),
        api.get('/users/notifications', accessToken),
        api.get('/users/credit-history', accessToken).catch(() => ({ data: [] })),
        api.get('/users/upi', accessToken),
      ])
      setDashboard(d.data)
      setProfile(p.data)
      setMyLoans(l.data || [])
      setNotifications(n.data || [])
      setCreditHistory(c.data || [])
      setCurrentUpi(u.data?.upiId || null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
  }, [])

  const activeLoan = useMemo(
    () => myLoans.find((loan) => ['PENDING', 'FUNDED', 'ACTIVE'].includes(loan.status)) || null,
    [myLoans]
  )

  const loanHistory = useMemo(
    () => [...myLoans].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()),
    [myLoans]
  )

  const unreadCount = useMemo(() => notifications.filter((n) => !n.isRead).length, [notifications])

  const requestEstimate = useMemo(() => {
    const principal = Number(loanForm.principalAmount || 0)
    const repayable = estimateRepayable(principal, loanForm.tenure)
    return {
      principal,
      repayable,
      platformFee: Math.max(20, Math.round(principal * 0.01)),
    }
  }, [loanForm.principalAmount, loanForm.tenure])

  const scoreSeries = useMemo(() => {
    const points = creditHistory
      .slice(0, 6)
      .reverse()
      .map((item) => Number(item.newScore || item.previousScore || 0))
      .filter(Boolean)

    if (!points.length) points.push(Number(profile?.creditScore || 0) || 650)
    while (points.length < 6) points.unshift(points[0])
    return points.slice(-6)
  }, [creditHistory, profile?.creditScore])

  const scoreMin = Math.min(...scoreSeries)
  const scoreMax = Math.max(...scoreSeries)
  const scoreBars = scoreSeries.map((score) => {
    if (scoreMax === scoreMin) return 70
    return Math.max(24, Math.round(((score - scoreMin) / Math.max(scoreMax - scoreMin, 1)) * 100))
  })

  const borrowerStats = [
    { label: 'Credit Score', value: profile?.creditScore || 0, tone: 'gold' },
    { label: 'Borrow Limit', value: money(profile?.borrowLimit || 0), tone: 'green' },
    { label: 'Total Borrowed', value: money(dashboard?.totalBorrowed || 0), tone: 'gold' },
    { label: 'Unread Alerts', value: unreadCount, tone: 'blue' },
  ]

  const submitLoan = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    try {
      await api.post('/loans', { ...loanForm, principalAmount: Number(loanForm.principalAmount) }, accessToken)
      setMessage('Loan request created successfully.')
      setActiveSection('overview')
      await reload()
    } catch (err) {
      setError(err.message)
    }
  }

  const linkUpi = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    try {
      await api.post('/users/upi', { upiId: upi }, accessToken)
      setMessage('UPI linked successfully.')
      setUpi('')
      await reload()
    } catch (err) {
      setError(err.message)
    }
  }

  const repayLoan = async (loanId) => {
    setError('')
    setMessage('')
    try {
      const order = await api.post(`/payments/repay/${loanId}`, {}, accessToken)
      if (order.data.provider === 'MOCK') {
        await api.post(`/payments/repay/${loanId}/confirm`, {}, accessToken)
      } else if (order.data.provider === 'RAZORPAY') {
        const payment = await openRazorpayCheckout({
          key: order.data.keyId,
          orderId: order.data.orderId,
          amount: order.data.amount,
          description: `Repayment for ${order.data.publicId}`,
          prefill: { email: user?.email },
        })

        await api.post(
          '/payments/verify',
          {
            orderId: payment.razorpay_order_id,
            paymentId: payment.razorpay_payment_id,
            signature: payment.razorpay_signature,
            loanId,
            type: 'REPAYMENT',
          },
          accessToken
        )
      }
      setMessage('Repayment completed and recorded.')
      await reload()
    } catch (err) {
      setError(err.message)
    }
  }

  const markRead = async (id) => {
    try {
      await api.patch(`/users/notifications/${id}/read`, {}, accessToken)
      await reload()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <AppShell
      user={user}
      onLogout={logout}
      title="Borrower Workspace"
      subtitle="Every borrower screen from application to repayment and credit tracking."
      sections={sections}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      stats={borrowerStats}
    >
      {loading ? <p>Loading...</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
      {message ? <p className="success-text">{message}</p> : null}

      {!loading && activeSection === 'overview' && (
        <section className="portal-section">
          <div className="portal-section-head">
            <div className="portal-label pl-b">⚡ Borrower Dashboard</div>
            <h2>Active Loans, Progress, and Alerts</h2>
          </div>

          <div className="portal-motion borrower-motion">
            <div className="portal-motion-track">
              <span>Borrow Request</span>
              <span>Provider Match</span>
              <span>UPI Disbursal</span>
              <span>Repay & Score Up</span>
            </div>
          </div>

          <div className="portal-grid portal-grid-two">
            <article className="portal-panel-card">
              <h3>Current Loan Snapshot</h3>
              {activeLoan ? (
                <div className="stack-sm">
                  <div className="portal-kv-row">
                    <span>Loan ID</span>
                    <strong>{activeLoan.publicId}</strong>
                  </div>
                  <div className="portal-kv-row">
                    <span>Status</span>
                    <span className={`badge ${statusClass(activeLoan.status)}`}>{activeLoan.status}</span>
                  </div>
                  <div className="portal-kv-row">
                    <span>Principal</span>
                    <strong>{money(activeLoan.principalAmount)}</strong>
                  </div>
                  <div className="portal-kv-row">
                    <span>Repayable</span>
                    <strong>{money(activeLoan.totalRepayAmount)}</strong>
                  </div>
                  <div className="portal-kv-row">
                    <span>Due Date</span>
                    <strong>{dateLabel(activeLoan.dueAt)}</strong>
                  </div>
                  <div className="portal-progress">
                    <div
                      className="portal-progress-fill tone-green"
                      style={{ width: `${pct(activeLoan.repaidAmount || activeLoan.repaid || 0, activeLoan.totalRepayAmount)}%` }}
                    ></div>
                  </div>
                </div>
              ) : (
                <p>No active loan currently. Apply from the next tab.</p>
              )}
            </article>

            <article className="portal-panel-card">
              <h3>Quick Actions</h3>
              <div className="portal-chip-list">
                <button type="button" className="portal-chip" onClick={() => setActiveSection('request')}>
                  📋 Apply Loan
                </button>
                <button type="button" className="portal-chip" onClick={() => setActiveSection('repay')}>
                  💳 Repay Now
                </button>
                <button type="button" className="portal-chip" onClick={() => setActiveSection('credit')}>
                  📊 Credit Score
                </button>
                <button type="button" className="portal-chip" onClick={() => setActiveSection('alerts')}>
                  🔔 Alerts ({unreadCount})
                </button>
              </div>
            </article>
          </div>
        </section>
      )}

      {!loading && activeSection === 'request' && (
        <section className="portal-section">
          <div className="portal-section-head">
            <div className="portal-label pl-b">📋 Apply For Loan</div>
            <h2>Create a New Loan Request</h2>
          </div>

          <div className="portal-grid portal-grid-two">
            <form className="portal-panel-card form" onSubmit={submitLoan}>
              <h3>Loan Request Form</h3>
              <label>
                Amount (INR)
                <input
                  type="number"
                  min={500}
                  max={10000}
                  value={loanForm.principalAmount}
                  onChange={(e) => setLoanForm((p) => ({ ...p, principalAmount: e.target.value }))}
                  required
                />
              </label>
              <label>
                Tenure
                <select value={loanForm.tenure} onChange={(e) => setLoanForm((p) => ({ ...p, tenure: e.target.value }))}>
                  <option value="SEVEN">7 days</option>
                  <option value="FOURTEEN">14 days</option>
                  <option value="THIRTY">30 days</option>
                </select>
              </label>
              <label>
                Purpose
                <select value={loanForm.purpose} onChange={(e) => setLoanForm((p) => ({ ...p, purpose: e.target.value }))}>
                  <option value="FOOD">Food</option>
                  <option value="BOOKS">Books</option>
                  <option value="TRANSPORT">Transport</option>
                  <option value="MEDICAL">Medical</option>
                  <option value="ACCOMMODATION">Accommodation</option>
                  <option value="EMERGENCY">Emergency</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
              <label>
                Short Note
                <textarea
                  maxLength={120}
                  value={loanForm.purposeNote}
                  onChange={(e) => setLoanForm((p) => ({ ...p, purposeNote: e.target.value }))}
                  placeholder="Optional short purpose note"
                />
              </label>
              <button className="btn btn-primary" type="submit">
                Submit Request
              </button>
            </form>

            <article className="portal-panel-card">
              <h3>Terms Preview</h3>
              <div className="stack-sm">
                <div className="portal-kv-row">
                  <span>Requested Principal</span>
                  <strong>{money(requestEstimate.principal)}</strong>
                </div>
                <div className="portal-kv-row">
                  <span>Estimated Platform Fee</span>
                  <strong>{money(requestEstimate.platformFee)}</strong>
                </div>
                <div className="portal-kv-row">
                  <span>Estimated Repayable</span>
                  <strong>{money(requestEstimate.repayable)}</strong>
                </div>
                <div className="portal-kv-row">
                  <span>Selected Tenure</span>
                  <strong>{loanForm.tenure}</strong>
                </div>
                <p className="portal-note">Final numbers are computed by live backend platform config and lender matching.</p>
              </div>
            </article>
          </div>
        </section>
      )}

      {!loading && activeSection === 'repay' && (
        <section className="portal-section">
          <div className="portal-section-head">
            <div className="portal-label pl-b">💳 Repayment Center</div>
            <h2>Settle Active Loans</h2>
          </div>

          <div className="portal-panel-card stack-sm">
            {myLoans
              .filter((loan) => loan.status === 'ACTIVE')
              .map((loan) => (
                <div className="portal-row" key={loan.id}>
                  <div className="portal-row-main">
                    <strong>{loan.publicId}</strong>
                    <small>
                      Due {dateLabel(loan.dueAt)} · {money(loan.totalRepayAmount)}
                    </small>
                    <div className="portal-progress">
                      <div
                        className="portal-progress-fill tone-green"
                        style={{ width: `${pct(loan.repaidAmount || loan.repaid || 0, loan.totalRepayAmount)}%` }}
                      ></div>
                    </div>
                  </div>
                  <button className="btn btn-primary" type="button" onClick={() => repayLoan(loan.id)}>
                    Pay Now
                  </button>
                </div>
              ))}
            {!myLoans.some((loan) => loan.status === 'ACTIVE') ? <p>No active repayment due.</p> : null}
          </div>
        </section>
      )}

      {!loading && activeSection === 'credit' && (
        <section className="portal-section">
          <div className="portal-section-head">
            <div className="portal-label pl-b">📊 Credit Score</div>
            <h2>Score Ring, Factors, and Trend</h2>
          </div>

          <div className="portal-grid portal-grid-two">
            <article className="portal-panel-card">
              <h3>Current Score</h3>
              <div className="portal-gauge-wrap">
                <div
                  className="portal-gauge"
                  style={{ '--p': `${Math.max(0, Math.min(100, Math.round(((profile?.creditScore || 0) / 850) * 100)))}%` }}
                >
                  <div className="portal-gauge-inner">{profile?.creditScore || 0}</div>
                </div>
                <p className="portal-note">Range: 300 - 850 · Higher score improves approval and rates.</p>
              </div>

              <div className="stack-sm">
                <div className="portal-kv-row">
                  <span>Payment Discipline</span>
                  <strong>{myLoans.filter((l) => l.status === 'REPAID').length} repaid</strong>
                </div>
                <div className="portal-kv-row">
                  <span>Active Borrowings</span>
                  <strong>{myLoans.filter((l) => l.status === 'ACTIVE').length}</strong>
                </div>
                <div className="portal-kv-row">
                  <span>Borrow Limit</span>
                  <strong>{money(profile?.borrowLimit || 0)}</strong>
                </div>
              </div>
            </article>

            <article className="portal-panel-card">
              <h3>Score Trend</h3>
              <div className="portal-bars">
                {scoreBars.map((bar, idx) => (
                  <div key={`${bar}-${idx}`} className="portal-bar" style={{ height: `${bar}%` }}></div>
                ))}
              </div>
              <div className="portal-row compact" style={{ marginTop: 10 }}>
                <div className="portal-row-main">
                  <strong>Latest Delta</strong>
                  <small>{creditHistory[0]?.reason || 'No recent score events'}</small>
                </div>
                <span className={Number(creditHistory[0]?.delta || 0) >= 0 ? 'tone-green' : 'tone-red'}>
                  {Number(creditHistory[0]?.delta || 0) > 0 ? `+${creditHistory[0]?.delta}` : creditHistory[0]?.delta || 0}
                </span>
              </div>
            </article>
          </div>
        </section>
      )}

      {!loading && activeSection === 'history' && (
        <section className="portal-section">
          <div className="portal-section-head">
            <div className="portal-label pl-b">🗂 Loan History</div>
            <h2>All Past and Current Loans</h2>
          </div>

          <div className="portal-panel-card stack-sm">
            {loanHistory.map((loan) => (
              <div className="portal-row" key={loan.id}>
                <div className="portal-row-main">
                  <strong>{loan.publicId}</strong>
                  <small>
                    {dateLabel(loan.createdAt)} · Due {dateLabel(loan.dueAt)}
                  </small>
                </div>
                <div className="portal-row-end">
                  <span className={`badge ${statusClass(loan.status)}`}>{loan.status}</span>
                  <strong>{money(loan.principalAmount)}</strong>
                </div>
              </div>
            ))}
            {!loanHistory.length ? <p>No loans found.</p> : null}
          </div>
        </section>
      )}

      {!loading && activeSection === 'alerts' && (
        <section className="portal-section">
          <div className="portal-section-head">
            <div className="portal-label pl-b">🔔 Notifications</div>
            <h2>Funding Alerts, Reminders, and Updates</h2>
          </div>

          <div className="portal-panel-card stack-sm">
            {notifications.map((n) => (
              <button key={n.id} className={`portal-row ${n.isRead ? '' : 'unread unread-b'}`} onClick={() => markRead(n.id)}>
                <div className="portal-row-main">
                  <strong>{n.title}</strong>
                  <small>{n.message || 'Tap to mark this alert as read.'}</small>
                </div>
                <span>{n.isRead ? 'Read' : 'Mark'}</span>
              </button>
            ))}
            {!notifications.length ? <p>No notifications yet.</p> : null}
          </div>
        </section>
      )}

      {!loading && activeSection === 'profile' && (
        <section className="portal-section">
          <div className="portal-section-head">
            <div className="portal-label pl-b">👤 My Profile</div>
            <h2>Identity, KYC, and UPI</h2>
          </div>

          <div className="portal-grid portal-grid-two">
            <article className="portal-panel-card">
              <h3>Profile Summary</h3>
              <div className="portal-info-grid">
                <div>
                  <span>Name</span>
                  <strong>{`${profile?.firstName || ''} ${profile?.lastName || ''}`.trim() || user?.firstName || 'User'}</strong>
                </div>
                <div>
                  <span>Email</span>
                  <strong>{profile?.email || user?.email}</strong>
                </div>
                <div>
                  <span>KYC Status</span>
                  <strong>{profile?.kycStatus || 'PENDING'}</strong>
                </div>
                <div>
                  <span>Borrow Limit</span>
                  <strong>{money(profile?.borrowLimit || 0)}</strong>
                </div>
              </div>
            </article>

            <form className="portal-panel-card form" onSubmit={linkUpi}>
              <h3>UPI Setup</h3>
              <p>Current UPI: {currentUpi || 'Not linked'}</p>
              <label>
                New UPI ID
                <input value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="name@upi" required />
              </label>
              <button className="btn btn-primary" type="submit">
                Save UPI
              </button>
            </form>
          </div>
        </section>
      )}
    </AppShell>
  )
}
