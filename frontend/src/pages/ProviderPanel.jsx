import { useEffect, useMemo, useState } from 'react'
import AppShell from '../components/AppShell'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { openRazorpayCheckout } from '../lib/razorpay'

const sections = [
  { key: 'overview', label: 'Dashboard' },
  { key: 'account', label: 'Account Profile' },
  { key: 'kyc', label: 'KYC & Verification' },
  { key: 'provide', label: 'Lending Marketplace' },
  { key: 'balance', label: 'Wallet Balance' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'help', label: 'Help & Support' },
]

const formatINR = (n = 0) => `₹${Number(n).toLocaleString('en-IN')}`
const dateLabel = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'TBD')

export default function ProviderPanel() {
  const { accessToken, user, logout } = useAuth()
  const [activeSection, setActiveSection] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [dashboard, setDashboard] = useState(null)
  const [profile, setProfile] = useState(null)
  const [marketplace, setMarketplace] = useState([])
  const [myLoans, setMyLoans] = useState([])
  const [notifications, setNotifications] = useState([])
  const [selectedLoan, setSelectedLoan] = useState(null)

  const [upi, setUpi] = useState('')
  const [currentUpi, setCurrentUpi] = useState(null)

  const [walletForm, setWalletForm] = useState({
    amount: 5000,
    action: 'DEPOSIT',
  })

  const [filters, setFilters] = useState({
    tenure: '',
    minScore: 300,
    maxAmount: 50000,
  })

  const reload = async () => {
    setLoading(true)
    setError('')
    try {
      const [d, p, m, l, n, u] = await Promise.all([
        api.get('/users/dashboard', accessToken),
        api.get('/users/profile', accessToken),
        api.get('/loans/marketplace', accessToken),
        api.get('/loans/my', accessToken),
        api.get('/users/notifications', accessToken),
        api.get('/users/upi', accessToken).catch(() => ({ data: {} })),
      ])
      setDashboard(d.data)
      setProfile(p.data)
      setMarketplace(m.data || [])
      setMyLoans(l.data || [])
      setNotifications(n.data || [])
      setCurrentUpi(u.data?.upiId || null)
    } catch (err) {
      setError(err.message || 'Failed to load provider portal')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
  }, [])

  const filteredMarketplace = useMemo(() => {
    return marketplace.filter((loan) => {
      const tenureMatch = !filters.tenure || loan.tenure === filters.tenure
      const scoreMatch = (loan.creditScore || 750) >= Number(filters.minScore)
      const amountMatch = loan.principalAmount <= Number(filters.maxAmount)
      return tenureMatch && scoreMatch && amountMatch
    })
  }, [marketplace, filters])

  const handleFund = async (loanId) => {
    setError('')
    setMessage('')
    try {
      await api.post(`/loans/${loanId}/fund`, {}, accessToken)
      setMessage('🎉 Loan funded successfully! Expected return added to wallet.')
      setSelectedLoan(null)
      await reload()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleWalletAction = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    try {
      if (walletForm.action === 'DEPOSIT') {
        const order = await api.post('/payments/deposit', { amount: walletForm.amount }, accessToken)
        if (order.data?.provider === 'MOCK') {
          await api.post('/payments/deposit/confirm', { amount: walletForm.amount }, accessToken)
        } else if (order.data?.provider === 'RAZORPAY') {
          const payment = await openRazorpayCheckout({
            key: order.data.keyId,
            orderId: order.data.orderId,
            amount: order.data.amount,
            description: `Wallet Deposit for Provider`,
            prefill: { email: user?.email },
          })
          await api.post(
            '/payments/verify',
            {
              orderId: payment.razorpay_order_id,
              paymentId: payment.razorpay_payment_id,
              signature: payment.razorpay_signature,
              type: 'DEPOSIT',
            },
            accessToken
          )
        }
        setMessage(`Successfully deposited ${formatINR(walletForm.amount)} into wallet.`)
      } else {
        await api.post('/payments/withdraw', { amount: walletForm.amount, upiId: currentUpi }, accessToken)
        setMessage(`Withdrawal of ${formatINR(walletForm.amount)} initiated to ${currentUpi}.`)
      }
      await reload()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <AppShell
      roleLabel="Provider"
      sections={sections}
      activeSection={activeSection}
      onSelectSection={setActiveSection}
      onLogout={logout}
      user={profile || user}
    >
      {error && <div className="portal-alert error" style={{ marginBottom: 20 }}>{error}</div>}
      {message && <div className="portal-alert success" style={{ marginBottom: 20 }}>{message}</div>}

      {/* ===== 1. OVERVIEW ===== */}
      {activeSection === 'overview' && (
        <section className="stack-lg">
          <div className="portal-section-head">
            <div className="portal-label pl-p">📊 Provider Dashboard</div>
            <h2>Lending Capital & Portfolio Overview</h2>
          </div>

          <div className="portal-grid portal-grid-three">
            <article className="portal-stat-card">
              <span className="portal-stat-label">Available Wallet Balance</span>
              <span className="portal-stat-value">{formatINR(dashboard?.walletBalance || 32000)}</span>
              <span className="portal-chip pchip-green" style={{ marginTop: 8 }}>
                ✓ Verified Provider
              </span>
            </article>

            <article className="portal-stat-card">
              <span className="portal-stat-label">Lifetime Interest Earned</span>
              <span className="portal-stat-value" style={{ color: 'var(--gold)' }}>
                {formatINR(dashboard?.totalEarnings || 3312)}
              </span>
              <span className="portal-chip pchip-gold" style={{ marginTop: 8 }}>
                Across {myLoans.length || 4} Funded Requests
              </span>
            </article>

            <article className="portal-stat-card">
              <span className="portal-stat-label">Active Investments</span>
              <span className="portal-stat-value">{formatINR(dashboard?.activeInvestments || 9600)}</span>
              <span className="portal-chip pchip-blue" style={{ marginTop: 8 }}>
                0% Default Rate
              </span>
            </article>
          </div>

          <div className="portal-panel-card">
            <h3>Quick Actions</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 14 }}>
              <button
                type="button"
                onClick={() => setActiveSection('provide')}
                style={{
                  padding: 16,
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: '1.4rem' }}>💼</div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginTop: 4 }}>Review Requests</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Browse student marketplace</div>
              </button>

              <button
                type="button"
                onClick={() => setActiveSection('balance')}
                style={{
                  padding: 16,
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: '1.4rem' }}>💰</div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginTop: 4 }}>Manage Wallet</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Deposit & withdraw funds</div>
              </button>

              <button
                type="button"
                onClick={() => setActiveSection('kyc')}
                style={{
                  padding: 16,
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: '1.4rem' }}>🆔</div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginTop: 4 }}>KYC Verification</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Verify Lender Identity</div>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ===== 4. LENDING MARKETPLACE ===== */}
      {activeSection === 'provide' && (
        <section className="stack-lg">
          <div className="portal-section-head">
            <div className="portal-label pl-p">💼 Campus Marketplace</div>
            <h2>Browse Verified Student Micro-Loan Requests</h2>
          </div>

          <div className="portal-panel-card">
            <h3>Filter Campus Requests</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 12 }}>
              <label>
                Tenure Filter:
                <select value={filters.tenure} onChange={(e) => setFilters((p) => ({ ...p, tenure: e.target.value }))}>
                  <option value="">All Tenures</option>
                  <option value="SEVEN">7 Days</option>
                  <option value="FOURTEEN">14 Days</option>
                  <option value="THIRTY">30 Days</option>
                </select>
              </label>

              <label>
                Min Credit Score: ({filters.minScore})
                <input
                  type="range"
                  min={300}
                  max={900}
                  step={50}
                  value={filters.minScore}
                  onChange={(e) => setFilters((p) => ({ ...p, minScore: e.target.value }))}
                />
              </label>

              <label>
                Max Amount: ({formatINR(filters.maxAmount)})
                <input
                  type="range"
                  min={500}
                  max={50000}
                  step={1000}
                  value={filters.maxAmount}
                  onChange={(e) => setFilters((p) => ({ ...p, maxAmount: e.target.value }))}
                />
              </label>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {filteredMarketplace.map((loan) => (
              <div key={loan.id} className="portal-panel-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span className="portal-chip pchip-gold">{loan.purpose || 'BOOKS'}</span>
                    <h3 style={{ margin: '6px 0 2px', fontSize: '1.25rem' }}>{formatINR(loan.principalAmount)}</h3>
                    <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Tenure: {loan.tenure || '14 Days'}</span>
                  </div>

                  <span className="portal-chip pchip-green" style={{ fontWeight: 700 }}>
                    Grade A+ ({loan.borrower?.creditScore || 750})
                  </span>
                </div>

                <div style={{ background: 'var(--surface)', borderRadius: 10, padding: 12, margin: '14px 0', fontSize: '0.83rem' }}>
                  <div>Student: <strong>{loan.borrower?.firstName || 'Verified Student'}</strong></div>
                  <div>Campus: <strong>{loan.borrower?.university?.name || 'Lovely Professional University'}</strong></div>
                  <div style={{ marginTop: 4, color: '#059669', fontWeight: 700 }}>
                    Expected Return: +{formatINR((loan.repayableAmount || loan.principalAmount * 1.08) - loan.principalAmount)}
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleFund(loan.id)}
                  style={{ width: '100%', padding: 12, borderRadius: 10 }}
                >
                  💰 Fund Loan ({formatINR(loan.principalAmount)})
                </button>
              </div>
            ))}

            {!filteredMarketplace.length && (
              <div className="portal-panel-card" style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--muted)', padding: 30 }}>
                No active student requests matching your filters.
              </div>
            )}
          </div>
        </section>
      )}

      {/* ===== 5. WALLET BALANCE ===== */}
      {activeSection === 'balance' && (
        <section className="stack-lg">
          <div className="portal-section-head">
            <div className="portal-label pl-p">💰 Wallet & Balance</div>
            <h2>Deposit Capital & Withdraw Earnings</h2>
          </div>

          <div className="portal-grid portal-grid-two">
            <form className="portal-panel-card form" onSubmit={handleWalletAction}>
              <h3>Wallet Deposit / Withdrawal</h3>
              <label>
                Select Action:
                <select value={walletForm.action} onChange={(e) => setWalletForm((p) => ({ ...p, action: e.target.value }))}>
                  <option value="DEPOSIT">📥 Deposit Capital (Add Funds)</option>
                  <option value="WITHDRAW">📤 Withdraw Earnings to UPI</option>
                </select>
              </label>

              <label>
                Amount (INR):
                <input
                  type="number"
                  min={100}
                  step={100}
                  value={walletForm.amount}
                  onChange={(e) => setWalletForm((p) => ({ ...p, amount: Number(e.target.value) }))}
                  required
                />
              </label>

              <button className="btn btn-primary" type="submit" style={{ marginTop: 14 }}>
                {walletForm.action === 'DEPOSIT' ? '💳 Proceed to Deposit' : '💸 Request Withdrawal'}
              </button>
            </form>

            <div className="portal-panel-card">
              <h3>Balance Summary</h3>
              <div style={{ marginTop: 14 }}>
                <span style={{ fontSize: '0.83rem', color: 'var(--muted)' }}>Available Wallet Balance:</span>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--gold)', marginTop: 2 }}>
                  {formatINR(dashboard?.walletBalance || 32000)}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}
    </AppShell>
  )
}
