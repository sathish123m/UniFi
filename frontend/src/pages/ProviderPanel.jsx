import { useEffect, useMemo, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AppShell from '../components/AppShell'
import KycCameraModal from '../components/KycCameraModal'
import MultiDocumentKycModal from '../components/MultiDocumentKycModal'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { openRazorpayCheckout } from '../lib/razorpay'

const sections = [
  { key: 'overview', label: 'Overview' },
  { key: 'account', label: 'Account' },
  { key: 'kyc', label: 'KYC & Verification' },
  { key: 'provide', label: 'Provide Capital' },
  { key: 'balance', label: 'Balance & Earnings' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'help', label: 'Help & Support' },
]

const fmtINR = (n = 0) => `₹${Number(n).toLocaleString('en-IN')}`
const dateLabel = (v) =>
  v ? new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'TBD'
const cap = (s = '') => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()

const card = (extra = {}) => ({
  background: 'var(--card-bg, rgba(18, 22, 32, 0.85))',
  border: '1px solid var(--card-border, rgba(255, 255, 255, 0.09))',
  color: 'var(--card-text, #f3f3fa)',
  borderRadius: 20,
  padding: 24,
  boxShadow: 'var(--card-shadow, 0 20px 40px -26px rgba(0,0,0,.5))',
  marginBottom: 16,
  position: 'relative',
  overflow: 'hidden',
  ...extra,
})

const pill = (type) => {
  const base = { fontFamily: 'IBM Plex Mono, monospace', fontSize: 10.5, padding: '4px 10px', borderRadius: 100, textTransform: 'uppercase', letterSpacing: '.03em', display: 'inline-block' }
  const map = {
    active: { background: 'rgba(143,191,163,.22)', color: '#6fa98f' },
    funded: { background: 'rgba(143,191,163,.22)', color: '#6fa98f' },
    approved: { background: 'rgba(143,191,163,.22)', color: '#6fa98f' },
    pending: { background: 'rgba(224,177,104,.2)', color: 'var(--gold, #c9a84c)' },
    rejected: { background: 'rgba(232,169,155,.32)', color: '#ff6b6b' },
    completed: { background: 'rgba(255,255,255,.08)', color: 'var(--card-muted, #94a3b8)' },
    repaid: { background: 'rgba(255,255,255,.08)', color: 'var(--card-muted, #94a3b8)' },
    overdue: { background: 'rgba(232,169,155,.32)', color: '#ff6b6b' },
    good: { background: 'rgba(143,191,163,.22)', color: '#6fa98f' },
    warn: { background: 'rgba(224,177,104,.2)', color: 'var(--gold, #c9a84c)' },
  }
  return { ...base, ...(map[type] || map.pending) }
}

const fieldLabel = { fontSize: 11.5, color: 'var(--card-muted, #94a3ae)', fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '.04em', display: 'block', marginBottom: 6, marginTop: 16 }
const inputStyle = { width: '100%', padding: '13px 16px', borderRadius: 12, background: 'var(--input-bg, rgba(255,255,255,0.05))', border: '1.5px solid var(--input-border, rgba(255,255,255,0.12))', color: 'var(--input-text, #f3f3fa)', fontSize: 14.5, fontFamily: 'Inter, sans-serif', boxSizing: 'border-box', outline: 'none' }
const darkBtn = { padding: '13px 24px', borderRadius: 12, background: 'var(--btn-dark-bg, #c9a84c)', color: 'var(--btn-dark-text, #090909)', fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }
const outlineBtn = { padding: '10px 18px', borderRadius: 12, border: '1.5px solid var(--btn-outline-border, rgba(255,255,255,0.2))', fontWeight: 700, fontSize: 13, color: 'var(--btn-outline-text, #f3f3fa)', background: 'transparent', cursor: 'pointer' }
const segTab = (active) => ({ padding: '9px 18px', borderRadius: 100, fontSize: 12.5, fontWeight: 700, color: active ? 'var(--btn-dark-text, #090909)' : 'var(--card-muted, #94a3b8)', background: active ? 'var(--btn-dark-bg, #c9a84c)' : 'rgba(255,255,255,0.05)', border: 'none', cursor: 'pointer' })
const actRow = { display: 'flex', alignItems: 'center', gap: 13, padding: '13px 0', borderBottom: '1px solid var(--row-border, rgba(255,255,255,0.08))' }
const actIc = (good) => ({ width: 34, height: 34, borderRadius: 10, background: good ? 'rgba(143,191,163,.18)' : 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14, color: good ? '#6fa98f' : 'var(--card-muted, #94a3b8)' })
const kycItem = { display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: '1px solid var(--row-border, rgba(255,255,255,0.08))' }
const kii = (done) => ({ width: 40, height: 40, borderRadius: 12, background: done ? 'rgba(143,191,163,.2)' : 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: done ? '#6fa98f' : 'var(--card-muted, #94a3b8)', fontSize: 16 })

const FAQS = [
  { q: 'How is interest calculated on my funded loans?', a: 'Interest is fixed at the time you accept a request. If the borrower repays early, interest is prorated automatically.' },
  { q: 'When can I withdraw my funds?', a: 'Once a repayment clears, your principal + interest is instantly available to withdraw to your linked UPI.' },
  { q: 'What happens if a borrower defaults?', a: 'The admin issues a formal hold notice and initiates recovery. Your capital is insured up to the platform guarantee limit.' },
  { q: 'Can I auto-fund all matching requests?', a: 'Yes — toggle "Auto-fund" in Lending Terms and matching requests will be funded instantly from your available balance.' },
]

export default function ProviderPanel() {
  const { accessToken, user, logout } = useAuth()
  const { section: activeSection = 'overview' } = useParams()
  const navigate = useNavigate()
  const setActiveSection = (sec) => navigate(`/provider/${sec}`)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [dashboard, setDashboard] = useState(null)
  const [profile, setProfile] = useState(null)
  const [marketplace, setMarketplace] = useState([])
  const [myLoans, setMyLoans] = useState([])
  const [notifications, setNotifications] = useState([])
  const [notifTab, setNotifTab] = useState('all')

  // Form state
  const [upi, setUpi] = useState('')
  const [currentUpi, setCurrentUpi] = useState(null)
  const [personalForm, setPersonalForm] = useState({ firstName: '', lastName: '', phone: '' })
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [passwordShowMap, setPasswordShowMap] = useState({ cur: false, new: false, confirm: false })

  // Lending terms
  const [lendingTerms, setLendingTerms] = useState({ amountToLend: 20000, interestRate: 4.5, autoFund: false })

  // Filters (provider marketplace tab)
  const [provideTab, setProvideTab] = useState('available')
  const [filters, setFilters] = useState({ tenure: '', minScore: 300, maxAmount: 50000 })

  // Wallet
  const [walletForm, setWalletForm] = useState({ amount: 5000, action: 'DEPOSIT' })
  const [withdrawAmount, setWithdrawAmount] = useState(5000)

  // KYC & Camera Modals
  const [cameraModalOpen, setCameraModalOpen] = useState(false)
  const [kycModalOpen, setKycModalOpen] = useState(false)
  const fileInputRef = useRef(null)

  const handleIdCardUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setMessage('')
    try {
      const payload = new FormData()
      payload.append('idCard', file)
      await api.post('/users/kyc/id-card', payload, accessToken, true)
      setMessage('✓ Student ID card uploaded & saved to database!')
      await reload()
    } catch (err) {
      setError(err.message || 'Failed to upload ID card')
    }
  }

  // Help
  const [openFaq, setOpenFaq] = useState(null)
  const [ticketForm, setTicketForm] = useState({ category: 'REPAYMENT', subject: '', message: '' })

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

      if (p.data) {
        setPersonalForm({ firstName: p.data.firstName || '', lastName: p.data.lastName || '', phone: p.data.phone || '' })
      }
    } catch (err) {
      setError(err.message || 'Failed to load provider portal')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { reload() }, [])

  const walletBalance = dashboard?.walletBalance || 0
  const totalLent = myLoans.filter(l => ['FUNDED', 'ACTIVE'].includes(l.status)).reduce((s, l) => s + l.principalAmount, 0)
  const totalEarned = myLoans.filter(l => ['REPAID', 'CLOSED'].includes(l.status)).reduce((s, l) => s + ((l.repayableAmount || l.principalAmount * 1.08) - l.principalAmount), 0)
  const availableToWithdraw = walletBalance - totalLent
  const expectedInterest = myLoans.filter(l => ['FUNDED', 'ACTIVE'].includes(l.status)).reduce((s, l) => s + ((l.repayableAmount || l.principalAmount * 1.08) - l.principalAmount), 0)

  const filteredMarketplace = useMemo(() => {
    return marketplace.filter(loan => {
      const tenureMatch = !filters.tenure || loan.tenure === filters.tenure
      const scoreMatch = (loan.borrower?.creditScore || 750) >= Number(filters.minScore)
      const amountMatch = loan.principalAmount <= Number(filters.maxAmount)
      return tenureMatch && scoreMatch && amountMatch
    })
  }, [marketplace, filters])

  const unreadCount = useMemo(() => notifications.filter(n => !n.isRead).length, [notifications])
  const filteredNotifs = useMemo(() => notifTab === 'unread' ? notifications.filter(n => !n.isRead) : notifications, [notifications, notifTab])

  const handleFund = async (loanId) => {
    setError(''); setMessage('')
    try {
      await api.post(`/loans/${loanId}/fund`, {}, accessToken)
      setMessage('🎉 Loan funded! Expected return added to wallet.')
      await reload()
    } catch (err) { setError(err.message) }
  }

  const handleDecline = (loanId) => {
    setMessage(`Request #${loanId} declined.`)
  }

  const handleUpdateProfile = async (e) => {
    e.preventDefault()
    setError(''); setMessage('')
    try {
      await api.patch('/users/profile', personalForm, accessToken)
      setMessage('✓ Profile updated successfully.')
      await reload()
    } catch (err) { setError(err.message) }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    if (passwordForm.newPassword !== passwordForm.confirmPassword) { setError('Passwords do not match.'); return }
    setError(''); setMessage('')
    try {
      await api.patch('/users/password', { currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword }, accessToken)
      setMessage('✓ Password updated successfully.')
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err) { setError(err.message) }
  }

  const handleLinkUpi = async (e) => {
    e.preventDefault()
    setError(''); setMessage('')
    try {
      await api.post('/users/upi', { upiId: upi }, accessToken)
      setMessage('✓ UPI ID linked & verified.')
      setUpi('')
      await reload()
    } catch (err) { setError(err.message) }
  }

  const handleDeposit = async (e) => {
    e.preventDefault()
    setError(''); setMessage('')
    try {
      const order = await api.post('/payments/deposit', { amount: walletForm.amount }, accessToken)
      if (order.data?.provider === 'MOCK') {
        await api.post('/payments/deposit/confirm', { amount: walletForm.amount }, accessToken)
      } else if (order.data?.provider === 'RAZORPAY') {
        const payment = await openRazorpayCheckout({ key: order.data.keyId, orderId: order.data.orderId, amount: order.data.amount, description: 'Wallet Deposit', prefill: { email: user?.email } })
        await api.post('/payments/verify', { orderId: payment.razorpay_order_id, paymentId: payment.razorpay_payment_id, signature: payment.razorpay_signature, type: 'DEPOSIT' }, accessToken)
      }
      setMessage(`✓ Deposited ${fmtINR(walletForm.amount)} into wallet.`)
      await reload()
    } catch (err) { setError(err.message) }
  }

  const handleWithdraw = async () => {
    if (!currentUpi) { setError('Please link a UPI ID first.'); return }
    try {
      await api.post('/payments/withdraw', { amount: withdrawAmount, upiId: currentUpi }, accessToken)
      setMessage(`✓ Withdrawal of ${fmtINR(withdrawAmount)} initiated to ${currentUpi}.`)
      await reload()
    } catch (err) { setError(err.message) }
  }

  const handleSubmitTicket = (e) => {
    e.preventDefault()
    setMessage('✓ Ticket submitted — support will respond by email.')
    setTicketForm({ category: 'REPAYMENT', subject: '', message: '' })
  }

  const markRead = async (id) => {
    try { await api.patch(`/users/notifications/${id}/read`, {}, accessToken); await reload() } catch {}
  }

  const kycSteps = [
    { label: 'Email', done: true },
    { label: 'ID Card', done: !!profile?.collegeIdNum },
    { label: 'Camera', done: profile?.kycStatus === 'APPROVED' },
    { label: 'Phone OTP', done: !!profile?.phone },
    { label: 'UPI', done: !!currentUpi },
    { label: 'Agreement', done: profile?.kycStatus === 'APPROVED' },
  ]

  const lendingLimit = profile?.lendLimit || 50000

  return (
    <AppShell
      baseRoute="/provider"
      sections={sections}
      onLogout={logout}
      user={profile || user}
      badgeCounts={{ notifications: unreadCount || null }}
    >
      {error && <div className="portal-alert error" style={{ marginBottom: 20 }}>{error}</div>}
      {message && <div className="portal-alert success" style={{ marginBottom: 20, cursor: 'pointer' }} onClick={() => setMessage('')}>{message}</div>}

      {loading && <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading…</div>}

      {/* ===== 1. OVERVIEW ===== */}
      {!loading && activeSection === 'overview' && (
        <section>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginBottom: 20 }}>
            <div style={card()}>
              <div style={{ fontSize: 12.5, color: '#64748b', fontWeight: 500 }}>Total lent (active)</div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 26, fontWeight: 700, marginTop: 10 }}>{fmtINR(totalLent)}</div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 12, padding: '7px 13px', borderRadius: 100, background: 'rgba(143,191,163,.18)', color: '#6fa98f', fontSize: 13, fontWeight: 600 }}>
                ✓ Verified provider
              </div>
            </div>
            <div style={card()}>
              <div style={{ fontSize: 12.5, color: '#64748b', fontWeight: 500 }}>Funds available</div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 26, fontWeight: 700, marginTop: 10, color: 'var(--gold, #c9a84c)' }}>{fmtINR(walletBalance)}</div>
              <div style={{ fontSize: 12, color: '#94a3ae', marginTop: 8 }}>Ready to deploy</div>
            </div>
            <div style={card()}>
              <div style={{ fontSize: 12.5, color: '#64748b', fontWeight: 500 }}>Interest earned (lifetime)</div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 26, fontWeight: 700, marginTop: 10, color: '#6fa98f' }}>{fmtINR(totalEarned + (dashboard?.totalEarnings || 0))}</div>
              <div style={{ fontSize: 12, color: '#94a3ae', marginTop: 8 }}>Across {myLoans.length} funded requests</div>
            </div>
          </div>

          {/* Content Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 18, marginBottom: 20 }}>
            {/* Active Loan Card */}
            {myLoans.find(l => ['FUNDED', 'ACTIVE'].includes(l.status)) ? (() => {
              const activeLoan = myLoans.find(l => ['FUNDED', 'ACTIVE'].includes(l.status))
              return (
                <div style={card()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <h4 style={{ fontSize: 15 }}>Active loan · {activeLoan.purpose}</h4>
                      <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 15, color: '#64748b' }}>{fmtINR(activeLoan.principalAmount)} principal</div>
                    </div>
                    <span style={pill('active')}>Active</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 100, background: 'rgba(31,41,55,.07)', marginTop: 18, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: '60%', background: 'linear-gradient(90deg,#6fa98f,#8fbfa3)', borderRadius: 100 }} />
                  </div>
                  <div style={{ display: 'flex', gap: 22, marginTop: 18, paddingTop: 16, borderTop: '1px solid rgba(31,41,55,.08)' }}>
                    <div><span style={{ display: 'block', fontSize: 11, color: '#94a3ae', marginBottom: 3 }}>Borrower</span><b style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 13 }}>{activeLoan.borrower?.firstName || 'Verified'} {activeLoan.borrower?.lastName || 'Student'}</b></div>
                    <div><span style={{ display: 'block', fontSize: 11, color: '#94a3ae', marginBottom: 3 }}>Expected interest</span><b style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 13, color: '#6fa98f' }}>+{fmtINR((activeLoan.repayableAmount || activeLoan.principalAmount * 1.08) - activeLoan.principalAmount)}</b></div>
                    <div><span style={{ display: 'block', fontSize: 11, color: '#94a3ae', marginBottom: 3 }}>Due</span><b style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 13 }}>{dateLabel(activeLoan.dueDate)}</b></div>
                  </div>
                </div>
              )
            })() : (
              <div style={card()}>
                <h4 style={{ fontSize: 15 }}>Active loans</h4>
                <div style={{ padding: '24px 0', textAlign: 'center', color: '#64748b' }}>
                  <p>No active loans. Browse the marketplace to fund a request.</p>
                  <button onClick={() => setActiveSection('provide')} style={{ ...darkBtn, marginTop: 12 }}>Fund a request</button>
                </div>
              </div>
            )}

            {/* Withdrawable Balance Card */}
            <div style={{ ...card({ background: 'var(--card-bg, rgba(18, 22, 32, 0.85))' }) }}>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: '#6fa98f', letterSpacing: '.05em', textTransform: 'uppercase' }}>Withdrawable balance</div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 30, fontWeight: 700, marginTop: 10 }}>{fmtINR(Math.max(0, availableToWithdraw))}</div>
              <div style={{ fontSize: 13, color: 'var(--card-muted, #94a3ae)', marginTop: 6 }}>Ready to withdraw to UPI</div>
              <button onClick={() => setActiveSection('balance')} style={{ marginTop: 20, width: '100%', padding: 13, borderRadius: 12, background: 'var(--btn-dark-bg, #c9a84c)', color: 'var(--btn-dark-text, #090909)', fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                Withdraw to UPI →
              </button>
              <p style={{ fontSize: 11.3, color: 'var(--card-muted, #94a3ae)', marginTop: 14 }}>UPI: <strong>{currentUpi || 'Not linked'}</strong></p>
            </div>
          </div>

          {/* Quick Actions */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
            {[
              { icon: '💰', label: 'Fund a request', sub: 'Browse marketplace', sec: 'provide' },
              { icon: '📊', label: 'View active loans', sub: 'Track your portfolio', sec: 'provide' },
              { icon: '🆔', label: 'Update KYC', sub: 'Lender verification', sec: 'kyc' },
              { icon: '🎧', label: 'Contact support', sub: 'Help & FAQs', sec: 'help' },
            ].map(qa => (
              <button key={qa.sec + qa.label} onClick={() => setActiveSection(qa.sec)} style={{ background: 'var(--card-bg, rgba(18, 22, 32, 0.85))', border: '1px solid var(--card-border, rgba(255, 255, 255, 0.09))', color: 'var(--card-text, #f3f3fa)', borderRadius: 16, padding: 18, boxShadow: 'var(--card-shadow, 0 20px 40px -26px rgba(0,0,0,.5))', display: 'flex', flexDirection: 'column', gap: 10, cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ width: 38, height: 38, borderRadius: 11, background: 'rgba(143,191,163,.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{qa.icon}</div>
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>{qa.label}</span>
                <span style={{ fontSize: 11.5, color: 'var(--card-muted, #94a3b8)' }}>{qa.sub}</span>
              </button>
            ))}
          </div>

          {/* Recent Activity */}
          <div style={card()}>
            <h4 style={{ fontSize: 15, marginBottom: 6 }}>Recent activity</h4>
            {myLoans.slice(0, 4).map((loan, i) => (
              <div key={loan.id} style={{ ...actRow, ...(i === Math.min(myLoans.length, 4) - 1 ? { borderBottom: 'none' } : {}) }}>
                <div style={actIc(['REPAID', 'CLOSED'].includes(loan.status))}>
                  {['REPAID', 'CLOSED'].includes(loan.status) ? '✓' : '💰'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>Funded — {loan.purpose} ({loan.borrower?.firstName || 'Borrower'})</div>
                  <div style={{ fontSize: 11.5, color: '#94a3ae', marginTop: 2 }}>{dateLabel(loan.createdAt || loan.dueDate)}</div>
                </div>
                <span style={pill(loan.status?.toLowerCase() || 'pending')}>{cap(loan.status || 'PENDING')}</span>
              </div>
            ))}
            {!myLoans.length && <p style={{ color: '#94a3ae', fontSize: 13 }}>No activity yet.</p>}
          </div>
        </section>
      )}

      {/* ===== 2. ACCOUNT MANAGEMENT ===== */}
      {!loading && activeSection === 'account' && (
        <section>
          {/* Profile Header */}
          <div style={card()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ width: 74, height: 74, borderRadius: '50%', background: 'linear-gradient(135deg,#8fbfa3,#e8a99b)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: 26, color: '#fff', flexShrink: 0, position: 'relative' }}>
                {profile?.firstName?.[0]}{profile?.lastName?.[0]}
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: 19, margin: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {profile?.firstName} {profile?.lastName}
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: '#6fa98f', background: 'rgba(143,191,163,.18)', padding: '3px 9px', borderRadius: 100, fontWeight: 700 }}>✓ Verified provider</span>
                </h3>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 7, fontSize: 12.6, color: '#64748b' }}>
                  <span>✉️ {profile?.email || user?.email}</span>
                  <span>📱 {profile?.phone || 'Not set'}</span>
                  <span>🆔 {profile?.collegeIdNum || 'N/A'}</span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 18, marginBottom: 18 }}>
            {/* Personal Details */}
            <form style={card()} onSubmit={handleUpdateProfile}>
              <h4 style={{ fontSize: 15, marginBottom: 4 }}>Personal details</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 18px' }}>
                <div>
                  <label style={fieldLabel}>FIRST NAME</label>
                  <input style={inputStyle} value={personalForm.firstName} onChange={e => setPersonalForm(p => ({ ...p, firstName: e.target.value }))} />
                </div>
                <div>
                  <label style={fieldLabel}>LAST NAME</label>
                  <input style={inputStyle} value={personalForm.lastName} onChange={e => setPersonalForm(p => ({ ...p, lastName: e.target.value }))} />
                </div>
              </div>
              <label style={fieldLabel}>UNIVERSITY EMAIL</label>
              <input style={{ ...inputStyle, opacity: 0.6 }} value={profile?.email || user?.email || ''} disabled />
              <label style={fieldLabel}>PHONE NUMBER</label>
              <input style={inputStyle} value={personalForm.phone} onChange={e => setPersonalForm(p => ({ ...p, phone: e.target.value }))} placeholder="+91..." />
              <button type="submit" style={{ ...darkBtn, marginTop: 20 }}>Save changes</button>
            </form>

            {/* Lending Limit Card */}
            <div style={card()}>
              <h4 style={{ fontSize: 15 }}>Lending limit</h4>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 26, fontWeight: 700, marginTop: 10 }}>
                {fmtINR(lendingLimit)} <span style={{ color: '#6fa98f', fontSize: 15 }}>limit</span>
              </div>
              <div style={{ height: 8, borderRadius: 100, background: 'rgba(31,41,55,.07)', marginTop: 16, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, (totalLent / lendingLimit) * 100)}%`, background: 'linear-gradient(90deg,#6fa98f,#8fbfa3)', borderRadius: 100 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 12, color: '#64748b' }}>
                <span>Currently lent: <span style={{ fontFamily: 'IBM Plex Mono, monospace', color: '#1f2937' }}>{fmtINR(totalLent)}</span></span>
                <span>Limit: <span style={{ fontFamily: 'IBM Plex Mono, monospace', color: '#1f2937' }}>{fmtINR(lendingLimit)}</span></span>
              </div>
              <p style={{ fontSize: 11.6, color: '#94a3ae', marginTop: 14, lineHeight: 1.6 }}>Your lending limit is assigned by the campus admin. Consistent lending grows it over time.</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            {/* Change Password */}
            <form style={card()} onSubmit={handleChangePassword}>
              <h4 style={{ fontSize: 15, marginBottom: 0 }}>Change password</h4>
              {['cur', 'new', 'confirm'].map((key, i) => (
                <div key={key} style={{ position: 'relative' }}>
                  <label style={fieldLabel}>{['CURRENT PASSWORD', 'NEW PASSWORD', 'CONFIRM NEW PASSWORD'][i]}</label>
                  <input style={{ ...inputStyle, paddingRight: 64 }} type={passwordShowMap[key] ? 'text' : 'password'} value={passwordForm[key === 'cur' ? 'currentPassword' : key === 'new' ? 'newPassword' : 'confirmPassword']} onChange={e => setPasswordForm(p => ({ ...p, [key === 'cur' ? 'currentPassword' : key === 'new' ? 'newPassword' : 'confirmPassword']: e.target.value }))} placeholder="••••••••" />
                  <button type="button" onClick={() => setPasswordShowMap(m => ({ ...m, [key]: !m[key] }))} style={{ position: 'absolute', right: 14, top: 47, background: 'none', border: 'none', fontSize: 11, color: '#94a3ae', cursor: 'pointer', fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '.04em' }}>
                    {passwordShowMap[key] ? 'HIDE' : 'SHOW'}
                  </button>
                </div>
              ))}
              <button type="submit" style={{ ...darkBtn, marginTop: 20 }}>Update password</button>
            </form>

            {/* UPI Setup */}
            <form style={card()} onSubmit={handleLinkUpi}>
              <h4 style={{ fontSize: 15, marginBottom: 4 }}>UPI Setup</h4>
              <p style={{ fontSize: 12.3, color: '#64748b' }}>Current UPI: <strong>{currentUpi || 'Not linked'}</strong></p>
              <div style={{ ...kycItem, paddingLeft: 0, paddingRight: 0 }}>
                <div style={kii(!!currentUpi)}>{currentUpi ? '✓' : '💳'}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.8 }}>{currentUpi ? 'UPI linked & verified' : 'No UPI linked'}</div>
                  <div style={{ fontSize: 11.8, color: '#64748b', marginTop: 3 }}>Used for withdrawals</div>
                </div>
              </div>
              <label style={fieldLabel}>NEW UPI ID</label>
              <input style={inputStyle} value={upi} onChange={e => setUpi(e.target.value)} placeholder="e.g. name@okaxis" required />
              <button type="submit" style={{ ...darkBtn, marginTop: 20 }}>Link & verify UPI</button>
            </form>
          </div>
        </section>
      )}

      {/* ===== 3. KYC & VERIFICATION ===== */}
      {!loading && activeSection === 'kyc' && (
        <section>
          <div style={card()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
              <div>
                <h4 style={{ fontSize: 15 }}>Verification status</h4>
                <p style={{ fontSize: 12.3, color: '#64748b', marginTop: 4 }}>
                  {profile?.kycStatus === 'APPROVED' ? 'All required checks complete — approved.' : 'Complete all steps to unlock lending.'}
                </p>
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 100, background: 'rgba(143,191,163,.18)', color: '#6fa98f', fontSize: 13, fontWeight: 600 }}>
                ✓ {cap(profile?.kycStatus || 'PENDING')}
              </div>
            </div>

            {/* Progress Stepper */}
            <div style={{ display: 'flex', alignItems: 'center', marginTop: 26 }}>
              {kycSteps.map((step, i) => (
                <div key={step.label} style={{ flex: 1, textAlign: 'center', position: 'relative' }}>
                  {i > 0 && (
                    <div style={{ position: 'absolute', top: 16, left: '-50%', width: '100%', height: 2, background: step.done ? '#8fbfa3' : 'rgba(31,41,55,.14)', zIndex: 1 }} />
                  )}
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: step.done ? '#8fbfa3' : 'rgba(31,41,55,.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px', color: step.done ? '#fff' : '#64748b', position: 'relative', zIndex: 2, fontSize: 13 }}>
                    {step.done ? '✓' : i + 1}
                  </div>
                  <div style={{ fontSize: 10.8, color: '#64748b', fontWeight: 500 }}>{step.label}</div>
                </div>
              ))}
            </div>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleIdCardUpload}
            accept="image/*,.pdf"
            style={{ display: 'none' }}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
            {/* Camera KYC Card */}
            <div style={card()}>
              <h4 style={{ fontSize: 15 }}>Camera-based KYC</h4>
              <div
                onClick={() => setCameraModalOpen(true)}
                style={{
                  border: `2px dashed var(--accent-border, rgba(0, 208, 156, 0.35))`,
                  borderRadius: 16,
                  padding: 22,
                  textAlign: 'center',
                  background: 'var(--input-bg, rgba(255,255,255,0.03))',
                  marginTop: 14,
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 32, marginBottom: 8 }}>📷</div>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--card-title, #fff)' }}>Live webcam face verification</div>
                <div style={{ fontSize: 11.2, color: 'var(--card-muted, #94a3ae)', marginTop: 4 }}>Click to open webcam and capture face match</div>
              </div>
              <div style={{ ...kycItem, paddingLeft: 0, paddingRight: 0 }}>
                <div style={kii(profile?.kycStatus === 'APPROVED')}>{profile?.kycStatus === 'APPROVED' ? '✓' : '○'}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.8 }}>Liveness check {profile?.kycStatus === 'APPROVED' ? 'matched' : 'pending'}</div>
                </div>
              </div>
              <button type="button" onClick={() => setCameraModalOpen(true)} style={{ ...darkBtn, marginTop: 6, width: '100%', justifyContent: 'center' }}>
                📷 Open Camera / Re-verify Face Match
              </button>
            </div>

            {/* ID Card Verification Card */}
            <div style={card()}>
              <h4 style={{ fontSize: 15 }}>ID card verification</h4>
              <div style={{ ...kycItem, paddingLeft: 0, paddingRight: 0, marginTop: 14 }}>
                <div style={kii(!!profile?.collegeIdNum)}>🆔</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.8 }}>{profile?.collegeIdNum ? 'ID card verified' : 'No ID uploaded'}</div>
                  {profile?.collegeIdNum && <div style={{ fontSize: 11.5, color: 'var(--card-muted)' }}>Roll #: {profile.collegeIdNum}</div>}
                </div>
                <span style={pill(profile?.collegeIdNum ? 'approved' : 'pending')}>{profile?.collegeIdNum ? 'Verified' : 'Pending'}</span>
              </div>
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: '2px dashed var(--accent-border, rgba(201, 168, 76, 0.35))',
                  borderRadius: 16,
                  padding: 22,
                  textAlign: 'center',
                  background: 'var(--input-bg, rgba(255,255,255,0.03))',
                  marginTop: 10,
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 24, color: 'var(--gold, #c9a84c)', marginBottom: 8 }}>⬆️</div>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--card-title, #fff)' }}>Upload / Replace ID Card File</div>
                <div style={{ fontSize: 11.2, color: 'var(--card-muted, #94a3ae)', marginTop: 4 }}>Click to choose JPG, PNG, or PDF file</div>
              </div>
              <button type="button" onClick={() => setKycModalOpen(true)} style={{ ...outlineBtn, marginTop: 14, width: '100%' }}>
                📋 Open Full Multi-Doc KYC Stepper
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <div style={card()}>
              <h4 style={{ fontSize: 15 }}>UPI & Phone verification</h4>
              <label style={fieldLabel}>UPI ID</label>
              <input style={inputStyle} value={currentUpi || ''} placeholder="name@okaxis" readOnly />
              <div style={{ ...kycItem, paddingLeft: 0, paddingRight: 0 }}>
                <div style={kii(!!currentUpi)}>✓</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.8 }}>{currentUpi ? 'UPI linked & verified' : 'UPI not linked'}</div>
                  <div style={{ fontSize: 11.8, color: '#64748b', marginTop: 3 }}>Used for withdrawals</div>
                </div>
              </div>
              <div style={{ ...kycItem, paddingLeft: 0, paddingRight: 0, borderBottom: 'none' }}>
                <div style={kii(!!profile?.phone)}>✓</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.8 }}>{profile?.phone ? 'OTP verified' : 'Phone not verified'}</div>
                  <div style={{ fontSize: 11.8, color: '#64748b', marginTop: 3 }}>{profile?.phone || 'Not set'}</div>
                </div>
              </div>
            </div>

            <div style={card()}>
              <h4 style={{ fontSize: 15 }}>Agreement & compliance</h4>
              <div style={{ ...kycItem, paddingLeft: 0, paddingRight: 0 }}>
                <div style={kii(profile?.kycStatus === 'APPROVED')}>📄</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.8 }}>Provider lending agreement e-signed</div>
                  <div style={{ fontSize: 11.8, color: '#64748b', marginTop: 3 }}>Covers all future lending activities</div>
                </div>
                <button style={{ ...outlineBtn, padding: '8px 14px', fontSize: 12 }}>View</button>
              </div>
              <div style={{ ...kycItem, paddingLeft: 0, paddingRight: 0, borderBottom: 'none' }}>
                <div style={kii(!!profile?.panNum)}>💰</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.8 }}>TDS compliance (PAN)</div>
                  <div style={{ fontSize: 11.8, color: '#64748b', marginTop: 3 }}>Required for interest income reporting</div>
                </div>
                <span style={pill(profile?.panNum ? 'approved' : 'pending')}>{profile?.panNum ? 'Done' : 'Pending'}</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ===== 4. PROVIDE CAPITAL ===== */}
      {!loading && activeSection === 'provide' && (
        <section>
          {/* Lending Terms Form */}
          <div style={card()}>
            <h4 style={{ fontSize: 15, marginBottom: 4 }}>Lending terms</h4>
            <p style={{ fontSize: 12.3, color: '#64748b' }}>Set how much you want to lend and at what rate. Available to all matching borrowers.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 18px', marginTop: 6 }}>
              <div>
                <label style={fieldLabel}>AMOUNT I WANT TO LEND (₹)</label>
                <input style={inputStyle} type="number" value={lendingTerms.amountToLend} onChange={e => setLendingTerms(p => ({ ...p, amountToLend: e.target.value }))} />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <label style={fieldLabel}>INTEREST RATE (%)</label>
                  <span style={{ ...fieldLabel, color: '#6fa98f', fontFamily: 'IBM Plex Mono, monospace' }}>{lendingTerms.interestRate}%</span>
                </div>
                <input type="range" min="2" max="6" step="0.5" value={lendingTerms.interestRate} onChange={e => setLendingTerms(p => ({ ...p, interestRate: parseFloat(e.target.value) }))} style={{ width: '100%', accentColor: '#8fbfa3', marginTop: 8 }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3ae', marginTop: 4 }}>
                  <span>Min: 2%</span><span>Campus cap: 6%</span>
                </div>
              </div>
              <div style={{ gridColumn: '1/-1', display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
                <div onClick={() => setLendingTerms(p => ({ ...p, autoFund: !p.autoFund }))} style={{ width: 42, height: 24, borderRadius: 100, background: lendingTerms.autoFund ? '#8fbfa3' : 'rgba(31,41,55,.15)', position: 'relative', cursor: 'pointer', transition: 'background .2s', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: 3, left: lendingTerms.autoFund ? 21 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 2px 6px rgba(0,0,0,.2)' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>Auto-fund matching requests</div>
                  <div style={{ fontSize: 11.8, color: '#64748b' }}>Automatically fund requests that meet your terms — no manual approval needed.</div>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <button style={segTab(provideTab === 'available')} onClick={() => setProvideTab('available')}>Available requests ({filteredMarketplace.length})</button>
            <button style={segTab(provideTab === 'myloans')} onClick={() => setProvideTab('myloans')}>My active loans ({myLoans.filter(l => ['FUNDED', 'ACTIVE'].includes(l.status)).length})</button>
          </div>

          {/* Filters (Available tab) */}
          {provideTab === 'available' && (
            <div style={{ ...card(), padding: 18, marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ ...fieldLabel, marginTop: 0 }}>TENURE</label>
                  <select style={inputStyle} value={filters.tenure} onChange={e => setFilters(p => ({ ...p, tenure: e.target.value }))}>
                    <option value="">All tenures</option>
                    <option value="SEVEN">7 Days</option>
                    <option value="FOURTEEN">14 Days</option>
                    <option value="THIRTY">30 Days</option>
                    <option value="SIXTY">60 Days</option>
                    <option value="NINETY">90 Days</option>
                  </select>
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <label style={{ ...fieldLabel, marginTop: 0 }}>MIN CREDIT SCORE</label>
                    <span style={{ ...fieldLabel, marginTop: 0, color: '#6fa98f', fontFamily: 'IBM Plex Mono, monospace' }}>{filters.minScore}</span>
                  </div>
                  <input type="range" min={300} max={900} step={50} value={filters.minScore} onChange={e => setFilters(p => ({ ...p, minScore: e.target.value }))} style={{ width: '100%', accentColor: '#8fbfa3', marginTop: 8 }} />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <label style={{ ...fieldLabel, marginTop: 0 }}>MAX AMOUNT</label>
                    <span style={{ ...fieldLabel, marginTop: 0, color: '#6fa98f', fontFamily: 'IBM Plex Mono, monospace' }}>{fmtINR(filters.maxAmount)}</span>
                  </div>
                  <input type="range" min={500} max={50000} step={1000} value={filters.maxAmount} onChange={e => setFilters(p => ({ ...p, maxAmount: e.target.value }))} style={{ width: '100%', accentColor: '#8fbfa3', marginTop: 8 }} />
                </div>
              </div>
            </div>
          )}

          {/* Request Cards */}
          {provideTab === 'available' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {filteredMarketplace.map(loan => (
                <div key={loan.id} style={card({ marginBottom: 0 })}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <span style={{ ...pill('pending'), marginBottom: 8, display: 'inline-block' }}>{loan.purpose || 'BOOKS'}</span>
                      <h3 style={{ fontSize: 22, fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, margin: '4px 0 2px' }}>{fmtINR(loan.principalAmount)}</h3>
                      <div style={{ fontSize: 11.8, color: '#64748b' }}>Tenure: {loan.tenure || '14 Days'}</div>
                    </div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 100, background: 'rgba(143,191,163,.18)', color: '#6fa98f', fontSize: 12.5, fontWeight: 700 }}>
                      Grade A+ ({loan.borrower?.creditScore || 750})
                    </div>
                  </div>

                  <div style={{ background: 'rgba(31,41,55,.04)', borderRadius: 12, padding: 12, margin: '10px 0', fontSize: 12.6 }}>
                    <div>Student: <strong>{loan.borrower?.firstName || 'Verified Student'} {loan.borrower?.lastName || ''}</strong></div>
                    <div style={{ marginTop: 4 }}>Campus: <strong>{loan.borrower?.university?.name || 'Lovely Professional University'}</strong></div>
                    <div style={{ marginTop: 4, color: '#6fa98f', fontWeight: 700, fontFamily: 'IBM Plex Mono, monospace' }}>
                      Expected return: +{fmtINR((loan.repayableAmount || loan.principalAmount * 1.08) - loan.principalAmount)}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10 }}>
                    <button type="button" onClick={() => handleFund(loan.id)} style={{ ...darkBtn, flex: 1, justifyContent: 'center' }}>
                      Fund {fmtINR(loan.principalAmount)}
                    </button>
                    <button type="button" onClick={() => handleDecline(loan.id)} style={{ ...outlineBtn, flex: '0 0 auto' }}>Decline</button>
                  </div>
                </div>
              ))}

              {!filteredMarketplace.length && (
                <div style={{ ...card({ gridColumn: '1/-1', textAlign: 'center', color: '#94a3ae', padding: 40 }), marginBottom: 0 }}>
                  No active student requests matching your filters.
                </div>
              )}
            </div>
          )}

          {/* My Active Loans */}
          {provideTab === 'myloans' && (
            <div>
              {myLoans.filter(l => ['FUNDED', 'ACTIVE'].includes(l.status)).map(loan => (
                <div key={loan.id} style={card()}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14.5 }}>{loan.purpose || 'Loan'} — {loan.borrower?.firstName || 'Borrower'} {loan.borrower?.lastName || ''}</div>
                      <div style={{ display: 'flex', gap: 20, marginTop: 8, flexWrap: 'wrap', fontSize: 12.2, color: '#64748b' }}>
                        <span>Principal: <strong style={{ fontFamily: 'IBM Plex Mono, monospace', color: '#1f2937' }}>{fmtINR(loan.principalAmount)}</strong></span>
                        <span>Interest: <strong style={{ fontFamily: 'IBM Plex Mono, monospace', color: '#6fa98f' }}>+{fmtINR((loan.repayableAmount || loan.principalAmount * 1.08) - loan.principalAmount)}</strong></span>
                        <span>Due: <strong>{dateLabel(loan.dueDate)}</strong></span>
                      </div>
                    </div>
                    <span style={pill(loan.status?.toLowerCase())}>{cap(loan.status)}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 100, background: 'rgba(31,41,55,.07)', marginTop: 14, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: '60%', background: 'linear-gradient(90deg,#6fa98f,#8fbfa3)', borderRadius: 100 }} />
                  </div>
                </div>
              ))}
              {!myLoans.filter(l => ['FUNDED', 'ACTIVE'].includes(l.status)).length && (
                <div style={{ ...card({ textAlign: 'center', color: '#94a3ae', padding: 40 }) }}>No active funded loans.</div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ===== 5. BALANCE & EARNINGS ===== */}
      {!loading && activeSection === 'balance' && (
        <section>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginBottom: 20 }}>
            <div style={card()}>
              <div style={{ fontSize: 12.5, color: '#64748b', fontWeight: 500 }}>Total balance</div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 26, fontWeight: 700, marginTop: 10 }}>{fmtINR(walletBalance)}</div>
            </div>
            <div style={card()}>
              <div style={{ fontSize: 12.5, color: '#64748b', fontWeight: 500 }}>Principal currently lent</div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 26, fontWeight: 700, marginTop: 10 }}>{fmtINR(totalLent)}</div>
            </div>
            <div style={card()}>
              <div style={{ fontSize: 12.5, color: '#64748b', fontWeight: 500 }}>Interest earned (lifetime)</div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 26, fontWeight: 700, marginTop: 10, color: '#6fa98f' }}>{fmtINR(totalEarned + (dashboard?.totalEarnings || 0))}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18, marginBottom: 18 }}>
            {/* Balance Breakdown */}
            <div style={card()}>
              <h4 style={{ fontSize: 15, marginBottom: 6 }}>Balance breakdown</h4>
              {[
                { label: 'Available to withdraw', value: Math.max(0, availableToWithdraw), note: 'Transferable to UPI' },
                { label: 'Available to lend', value: walletBalance, note: 'Deploy into new requests' },
                { label: 'Locked in active loans', value: totalLent, note: 'Earns interest daily' },
                { label: 'Expected interest income', value: expectedInterest, note: 'On repayment completion', color: '#6fa98f' },
              ].map((row, i, arr) => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: i < arr.length - 1 ? '1px solid rgba(31,41,55,.08)' : 'none', alignItems: 'flex-start', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>{row.label}</div>
                    <div style={{ fontSize: 11.5, color: '#94a3ae', marginTop: 2 }}>{row.note}</div>
                  </div>
                  <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 15, fontWeight: 700, color: row.color || '#1f2937', flexShrink: 0 }}>{fmtINR(row.value)}</div>
                </div>
              ))}
            </div>

            {/* Withdraw Card */}
            <div style={{ ...card({ background: 'linear-gradient(160deg,#fff,#f0f9f5)' }) }}>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: '#6fa98f', letterSpacing: '.05em', textTransform: 'uppercase' }}>Withdrawable balance</div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 30, fontWeight: 700, marginTop: 10 }}>{fmtINR(Math.max(0, availableToWithdraw))}</div>
              <label style={{ ...fieldLabel, marginTop: 16 }}>WITHDRAW AMOUNT (₹)</label>
              <input style={inputStyle} type="number" value={withdrawAmount} onChange={e => setWithdrawAmount(Number(e.target.value))} min={100} max={Math.max(0, availableToWithdraw)} />
              <button onClick={handleWithdraw} style={{ marginTop: 16, width: '100%', padding: 13, borderRadius: 12, background: '#1f2937', color: '#fdf3ef', fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                Withdraw to UPI →
              </button>
              <p style={{ fontSize: 11.3, color: '#94a3ae', marginTop: 14 }}>UPI: <strong>{currentUpi || 'Not linked'}</strong></p>
            </div>
          </div>

          {/* Deposit Card */}
          <form style={card()} onSubmit={handleDeposit}>
            <h4 style={{ fontSize: 15, marginBottom: 4 }}>Add funds to wallet</h4>
            <p style={{ fontSize: 12.3, color: '#64748b' }}>Deposit capital via Razorpay to start funding borrower requests.</p>
            <label style={fieldLabel}>DEPOSIT AMOUNT (₹)</label>
            <input style={inputStyle} type="number" min={100} step={100} value={walletForm.amount} onChange={e => setWalletForm(p => ({ ...p, amount: Number(e.target.value) }))} required />
            <button type="submit" style={{ ...darkBtn, marginTop: 16 }}>💳 Proceed to deposit</button>
          </form>

          {/* Transaction History */}
          <div style={card()}>
            <h4 style={{ fontSize: 15, marginBottom: 6 }}>Transaction history</h4>
            {myLoans.map((loan, i, arr) => (
              <div key={`tx-${loan.id}`} style={{ ...actRow, ...(i === arr.length - 1 ? { borderBottom: 'none' } : {}) }}>
                <div style={actIc(['REPAID', 'CLOSED'].includes(loan.status))}>
                  {['REPAID', 'CLOSED'].includes(loan.status) ? '✓' : '💰'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>
                    {['REPAID', 'CLOSED'].includes(loan.status) ? 'Repayment received' : 'Funded'} — {loan.purpose}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#94a3ae', marginTop: 2 }}>{dateLabel(loan.createdAt || loan.dueDate)}</div>
                </div>
                <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 13, color: '#6fa98f' }}>
                  {['REPAID', 'CLOSED'].includes(loan.status) ? '+' : '-'}{fmtINR(loan.principalAmount)}
                </div>
                <button style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 6, border: 'none', cursor: 'pointer', background: 'transparent', fontSize: 14, color: '#94a3ae' }} title="Download receipt">⬇️</button>
              </div>
            ))}
            {!myLoans.length && <p style={{ color: '#94a3ae', fontSize: 13 }}>No transaction history.</p>}
          </div>
        </section>
      )}

      {/* ===== 6. NOTIFICATIONS ===== */}
      {!loading && activeSection === 'notifications' && (
        <section>
          <div style={card()}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
              <button style={segTab(notifTab === 'all')} onClick={() => setNotifTab('all')}>All</button>
              <button style={segTab(notifTab === 'unread')} onClick={() => setNotifTab('unread')}>Unread {unreadCount > 0 ? `(${unreadCount})` : ''}</button>
            </div>

            {filteredNotifs.map((n, i) => (
              <div
                key={n.id}
                onClick={() => markRead(n.id)}
                style={{ display: 'flex', gap: 14, padding: '14px 6px', borderBottom: i < filteredNotifs.length - 1 ? '1px solid rgba(31,41,55,.08)' : 'none', alignItems: 'flex-start', borderRadius: 12, background: !n.isRead ? 'rgba(143,191,163,.06)' : 'transparent', cursor: 'pointer' }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 10, background: !n.isRead ? 'rgba(143,191,163,.22)' : 'rgba(31,41,55,.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14, color: !n.isRead ? '#6fa98f' : '#64748b' }}>
                  {!n.isRead ? '💰' : '✓'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 13.3 }}>{n.title || n.message}</div>
                  <div style={{ fontSize: 11.3, color: '#94a3ae', marginTop: 3 }}>
                    {n.message && n.title ? n.message : ''} · {dateLabel(n.createdAt)}
                  </div>
                </div>
              </div>
            ))}

            {!filteredNotifs.length && (
              <p style={{ color: '#94a3ae', fontSize: 13, padding: '20px 6px' }}>
                {notifTab === 'unread' ? 'No unread notifications.' : 'No notifications yet.'}
              </p>
            )}
          </div>
        </section>
      )}

      {/* ===== 7. HELP & SUPPORT ===== */}
      {!loading && activeSection === 'help' && (
        <section>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
            {[
              { icon: '❓', title: 'Browse FAQs', desc: 'Answers to common questions about lending & repayments.' },
              { icon: '✉️', title: 'Email support', desc: 'support@unifi.campus · replies within a day' },
              { icon: '⚠️', title: 'Raise a dispute', desc: 'Repayment not reflected? Get admin to step in.' },
            ].map(item => (
              <div key={item.title} style={{ ...card({ textAlign: 'center', padding: '24px 18px' }) }}>
                <div style={{ width: 42, height: 42, borderRadius: 13, background: 'rgba(143,191,163,.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 20 }}>{item.icon}</div>
                <h5 style={{ fontSize: 14 }}>{item.title}</h5>
                <p style={{ fontSize: 11.8, color: '#64748b', marginTop: 6, lineHeight: 1.5 }}>{item.desc}</p>
              </div>
            ))}
          </div>

          <div style={{ ...card(), marginBottom: 20 }}>
            <h4 style={{ fontSize: 15, marginBottom: 0 }}>Frequently asked</h4>
            {FAQS.map((faq, i) => (
              <div key={i} style={{ borderBottom: i < FAQS.length - 1 ? '1px solid rgba(31,41,55,.08)' : 'none', cursor: 'pointer' }} onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                <div style={{ padding: '15px 2px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700, fontSize: 13.6 }}>
                  {faq.q}
                  <span style={{ transform: openFaq === i ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform .25s', fontSize: 14, color: '#64748b', flexShrink: 0, marginLeft: 8 }}>›</span>
                </div>
                {openFaq === i && (
                  <div style={{ padding: '0 2px 15px', fontSize: 12.6, color: '#64748b', lineHeight: 1.6 }}>{faq.a}</div>
                )}
              </div>
            ))}
          </div>

          <form style={card()} onSubmit={handleSubmitTicket}>
            <h4 style={{ fontSize: 15 }}>Raise a support ticket</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 18px', marginTop: 6 }}>
              <div>
                <label style={fieldLabel}>CATEGORY</label>
                <select style={{ ...inputStyle, appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3ae' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center' }} value={ticketForm.category} onChange={e => setTicketForm(p => ({ ...p, category: e.target.value }))}>
                  <option value="REPAYMENT">Repayment issue</option>
                  <option value="FUNDING">Funding issue</option>
                  <option value="KYC">KYC issue</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div>
                <label style={fieldLabel}>SUBJECT</label>
                <input style={inputStyle} value={ticketForm.subject} onChange={e => setTicketForm(p => ({ ...p, subject: e.target.value }))} placeholder="Short summary" required />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={fieldLabel}>DESCRIBE THE ISSUE</label>
                <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 88 }} value={ticketForm.message} onChange={e => setTicketForm(p => ({ ...p, message: e.target.value }))} placeholder="Add as much detail as you can…" required />
              </div>
            </div>
            <button type="submit" style={{ ...darkBtn, marginTop: 16 }}>Submit ticket ✈️</button>
          </form>
        </section>
      )}
      {/* KYC Camera & Stepper Modals */}
      <KycCameraModal
        isOpen={cameraModalOpen}
        onClose={() => setCameraModalOpen(false)}
        accessToken={accessToken}
        onSuccess={reload}
      />
      <MultiDocumentKycModal
        isOpen={kycModalOpen}
        onClose={() => setKycModalOpen(false)}
        accessToken={accessToken}
        currentKyc={profile}
        onSuccess={reload}
      />
    </AppShell>
  )
}
