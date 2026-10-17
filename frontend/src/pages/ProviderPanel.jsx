import { useEffect, useMemo, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AppShell from '../components/AppShell'
import KycCameraModal from '../components/KycCameraModal'
import MultiDocumentKycModal from '../components/MultiDocumentKycModal'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

const sections = [
  { key: 'overview', label: 'Overview' },
  { key: 'account', label: 'Account' },
  { key: 'kyc', label: 'KYC & Verification' },
  { key: 'provide', label: 'Lend to a Peer' },
  { key: 'balance', label: 'Portfolio' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'help', label: 'Help & Support' },
]

const fmtINR = (n = 0) => `₹${Number(n).toLocaleString('en-IN')}`
const TENURE_LABEL = { SEVEN: '7 days', FOURTEEN: '14 days', THIRTY: '30 days' }
const tenureLabel = (t) => TENURE_LABEL[t] || t || '—'
const dateLabel = (v) =>
  v ? new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'TBD'
const cap = (s = '') => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()

// Loans are single lump-sum repayments, so there is no partial-repayment
// percentage to show. This reflects how far through the loan term we are
// (start → due date), clamped to 0–100, purely as a time indicator.
const loanTermProgress = (loan) => {
  if (loan?.status === 'REPAID') return 100
  const start = loan?.disbursedAt || loan?.createdAt
  if (!start || !loan?.dueAt) return 0
  const startMs = new Date(start).getTime()
  const dueMs = new Date(loan.dueAt).getTime()
  if (!(dueMs > startMs)) return 0
  const pct = ((Date.now() - startMs) / (dueMs - startMs)) * 100
  return Math.max(0, Math.min(100, Math.round(pct)))
}

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
    cancelled: { background: 'rgba(255,255,255,.08)', color: 'var(--card-muted, #94a3b8)' },
    defaulted: { background: 'rgba(232,169,155,.32)', color: '#ff6b6b' },
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
  { q: 'Do I earn interest?', a: 'No. UniFi is interest-free by design — it is a campus trust network, not an investment product. You lend to a peer and are repaid exactly the principal. Your reward is the trust score and standing you build, not a return.' },
  { q: 'How do I hand over the money?', a: 'Once you commit to a request, settle directly with the borrower (UPI or cash) and mark it as sent. The borrower confirms receipt, which starts their repayment clock. UniFi never holds or moves the money.' },
  { q: 'How do I receive repayments?', a: 'The borrower repays you directly, then marks it as repaid. Confirm you received it and the loan is closed and recorded in your portfolio history.' },
  { q: 'What happens if a borrower defaults?', a: 'If a repayment is not made, the loan is automatically marked overdue and eventually defaulted, which lowers the borrower\u2019s campus trust score and limits their future borrowing. UniFi does not guarantee repayment — you should only lend what you can afford to lose.' },
  { q: 'Can I only fund students from my own campus?', a: 'Yes. For campus isolation, you only ever see and can fund loan requests from borrowers at your own university.' },
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

  // Filters (provider marketplace tab)
  const [provideTab, setProvideTab] = useState('available')
  const [filters, setFilters] = useState({ tenure: '', minScore: 300, maxAmount: 50000 })

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

  useEffect(() => { reload() }, [])

  // Derived portfolio figures — sourced from real backend fields only.
  // The provider dashboard returns { principalDeployed, principalReturned,
  // awaitingConfirmation, activeFundings, totalFundings }. UniFi is interest-free,
  // so there is no "earnings" concept — only principal out and principal returned.
  const activeLoans = myLoans.filter((l) => ['FUNDED', 'ACTIVE'].includes(l.status))
  const totalLent = activeLoans.reduce((s, l) => s + l.principalAmount, 0)
  const lifetimeReturned = dashboard?.principalReturned || 0
  const awaitingHandover = myLoans.filter((l) => l.status === 'FUNDED' && (!l.fundingSentAt || !l.fundingReceivedAt)).length

  const filteredMarketplace = useMemo(() => {
    return marketplace.filter((loan) => {
      const tenureMatch = !filters.tenure || loan.tenure === filters.tenure
      const scoreMatch = (loan.creditScore ?? 0) >= Number(filters.minScore)
      const amountMatch = loan.principalAmount <= Number(filters.maxAmount)
      return tenureMatch && scoreMatch && amountMatch
    })
  }, [marketplace, filters])

  const unreadCount = useMemo(() => notifications.filter(n => !n.isRead).length, [notifications])
  const filteredNotifs = useMemo(() => notifTab === 'unread' ? notifications.filter(n => !n.isRead) : notifications, [notifications, notifTab])

  const handleFund = async (loanId) => {
    setError(''); setMessage('')
    try {
      // Commit to lending (PENDING → FUNDED). No money moves through UniFi: the
      // two peers settle directly and each confirms their side.
      await api.post(`/loans/${loanId}/fund`, {}, accessToken)
      setMessage('🤝 Committed. Hand the money over to the borrower, then mark it as sent.')
      await reload()
    } catch (err) { setError(err.message) }
  }

  // Lender attests they handed the money over.
  const handleMarkSent = async (loanId) => {
    setError(''); setMessage('')
    try {
      await api.post(`/loans/${loanId}/handover`, {}, accessToken)
      setMessage('✅ Marked as sent. The borrower will confirm receipt to start the clock.')
      await reload()
    } catch (err) { setError(err.message) }
  }

  // Lender confirms the borrower repaid them, closing the loan.
  const handleConfirmRepayment = async (loanId) => {
    setError(''); setMessage('')
    try {
      await api.post(`/loans/${loanId}/confirm-repayment`, {}, accessToken)
      setMessage('✅ Repayment confirmed — the loan is closed.')
      await reload()
    } catch (err) { setError(err.message) }
  }

  const handleDispute = async (loanId) => {
    const reason = window.prompt('Briefly describe the problem (optional):') || ''
    setError(''); setMessage('')
    try {
      await api.post(`/loans/${loanId}/dispute`, { reason }, accessToken)
      setMessage('⚠️ Dispute raised — a campus admin will review it.')
      await reload()
    } catch (err) { setError(err.message) }
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
      setMessage('✓ UPI ID linked.')
      setUpi('')
      await reload()
    } catch (err) { setError(err.message) }
  }

  const markRead = async (id) => {
    try {
      await api.patch(`/users/notifications/${id}/read`, {}, accessToken)
      await reload()
    } catch (err) {
      setError(err.message || 'Failed to mark notification as read')
    }
  }

  const kycSteps = [
    { label: 'Email', done: true },
    { label: 'ID Card', done: !!profile?.studentIdNumber },
    { label: 'Camera', done: profile?.kycStatus === 'APPROVED' },
    { label: 'Phone OTP', done: !!profile?.phone },
    { label: 'UPI', done: !!currentUpi },
    { label: 'Agreement', done: profile?.kycStatus === 'APPROVED' },
  ]

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
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 12, padding: '7px 13px', borderRadius: 100, background: profile?.kycStatus === 'APPROVED' ? 'rgba(143,191,163,.18)' : 'rgba(224,177,104,.18)', color: profile?.kycStatus === 'APPROVED' ? '#6fa98f' : '#c9a84c', fontSize: 13, fontWeight: 600 }}>
                {profile?.kycStatus === 'APPROVED' ? '✓ Verified provider' : profile?.kycStatus === 'REJECTED' ? '⚠ KYC Rejected' : '⏱ KYC Pending'}
              </div>
            </div>
            <div style={card()}>
              <div style={{ fontSize: 12.5, color: '#64748b', fontWeight: 500 }}>Principal deployed</div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 26, fontWeight: 700, marginTop: 10, color: 'var(--gold, #c9a84c)' }}>{fmtINR(dashboard?.principalDeployed || 0)}</div>
              <div style={{ fontSize: 12, color: '#94a3ae', marginTop: 8 }}>Across {dashboard?.totalFundings || 0} funded requests</div>
            </div>
            <div style={card()}>
              <div style={{ fontSize: 12.5, color: '#64748b', fontWeight: 500 }}>Principal returned (lifetime)</div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 26, fontWeight: 700, marginTop: 10, color: '#6fa98f' }}>{fmtINR(lifetimeReturned)}</div>
              <div style={{ fontSize: 12, color: '#94a3ae', marginTop: 8 }}>From confirmed repayments</div>
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
                    <div style={{ height: '100%', width: `${loanTermProgress(activeLoan)}%`, background: 'linear-gradient(90deg,#6fa98f,#8fbfa3)', borderRadius: 100 }} />
                  </div>
                  <div style={{ display: 'flex', gap: 22, marginTop: 18, paddingTop: 16, borderTop: '1px solid rgba(31,41,55,.08)' }}>
                    <div><span style={{ display: 'block', fontSize: 11, color: '#94a3ae', marginBottom: 3 }}>Reference</span><b style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 13 }}>{activeLoan.publicId || '—'}</b></div>
                    <div><span style={{ display: 'block', fontSize: 11, color: '#94a3ae', marginBottom: 3 }}>To be returned</span><b style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 13, color: '#6fa98f' }}>{fmtINR(activeLoan.totalRepayAmount || activeLoan.principalAmount)}</b></div>
                    <div><span style={{ display: 'block', fontSize: 11, color: '#94a3ae', marginBottom: 3 }}>Due</span><b style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 13 }}>{dateLabel(activeLoan.dueAt)}</b></div>
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

            {/* Awaiting handover Card */}
            <div style={{ ...card({ background: 'var(--card-bg, rgba(18, 22, 32, 0.85))' }) }}>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: '#6fa98f', letterSpacing: '.05em', textTransform: 'uppercase' }}>Awaiting handover</div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 30, fontWeight: 700, marginTop: 10 }}>{awaitingHandover}</div>
              <div style={{ fontSize: 13, color: 'var(--card-muted, #94a3ae)', marginTop: 6 }}>Committed loans not yet confirmed by both sides</div>
              <button onClick={() => setActiveSection('provide')} style={{ marginTop: 20, width: '100%', padding: 13, borderRadius: 12, background: 'var(--btn-dark-bg, #c9a84c)', color: 'var(--btn-dark-text, #090909)', fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                Fund more requests →
              </button>
              <p style={{ fontSize: 11.3, color: 'var(--card-muted, #94a3ae)', marginTop: 14 }}>Settle directly with the borrower — UniFi never holds the money.</p>
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
                <div style={actIc(loan.status === 'REPAID')}>
                  {loan.status === 'REPAID' ? '✓' : '💰'}
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
                  {profile?.kycStatus === 'APPROVED'
                    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: '#6fa98f', background: 'rgba(143,191,163,.18)', padding: '3px 9px', borderRadius: 100, fontWeight: 700 }}>✓ Verified provider</span>
                    : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: '#c9a84c', background: 'rgba(224,177,104,.18)', padding: '3px 9px', borderRadius: 100, fontWeight: 700 }}>{profile?.kycStatus === 'REJECTED' ? '⚠ KYC Rejected' : '⏱ KYC Pending'}</span>}
                </h3>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 7, fontSize: 12.6, color: '#64748b' }}>
                  <span>✉️ {profile?.email || user?.email}</span>
                  <span>📱 {profile?.phone || 'Not set'}</span>
                  <span>🆔 {profile?.studentIdNumber || 'N/A'}</span>
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

            {/* Portfolio Summary Card — real backend figures only */}
            <div style={card()}>
              <h4 style={{ fontSize: 15 }}>Lending portfolio</h4>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 26, fontWeight: 700, marginTop: 10 }}>
                {fmtINR(totalLent)} <span style={{ color: '#6fa98f', fontSize: 15 }}>active</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, fontSize: 12, color: '#64748b' }}>
                <span>Principal deployed: <span style={{ fontFamily: 'IBM Plex Mono, monospace', color: '#1f2937' }}>{fmtINR(dashboard?.principalDeployed || 0)}</span></span>
                <span>Funded: <span style={{ fontFamily: 'IBM Plex Mono, monospace', color: '#1f2937' }}>{dashboard?.totalFundings || 0}</span></span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 12, color: '#64748b' }}>
                <span>Principal returned: <span style={{ fontFamily: 'IBM Plex Mono, monospace', color: '#6fa98f' }}>{fmtINR(lifetimeReturned)}</span></span>
                <span>Active loans: <span style={{ fontFamily: 'IBM Plex Mono, monospace', color: '#1f2937' }}>{activeLoans.length}</span></span>
              </div>
              <p style={{ fontSize: 11.6, color: '#94a3ae', marginTop: 14, lineHeight: 1.6 }}>You settle each loan with the borrower directly — UniFi holds no deposit or wallet balance.</p>
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
                  <div style={{ fontWeight: 700, fontSize: 13.8 }}>{currentUpi ? 'UPI linked' : 'No UPI linked'}</div>
                  <div style={{ fontSize: 11.8, color: '#64748b', marginTop: 3 }}>Where peers repay you directly</div>
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
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 100, background: profile?.kycStatus === 'APPROVED' ? 'rgba(143,191,163,.18)' : profile?.kycStatus === 'REJECTED' ? 'rgba(232,169,155,.18)' : 'rgba(224,177,104,.18)', color: profile?.kycStatus === 'APPROVED' ? '#6fa98f' : profile?.kycStatus === 'REJECTED' ? '#d99686' : '#c9a84c', fontSize: 13, fontWeight: 600 }}>
                {profile?.kycStatus === 'APPROVED' ? '✓' : profile?.kycStatus === 'REJECTED' ? '⚠' : '⏱'} {cap(profile?.kycStatus || 'PENDING')}
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
                <div style={kii(!!profile?.studentIdNumber)}>🆔</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.8 }}>{profile?.studentIdNumber ? 'ID number on file' : 'No ID uploaded'}</div>
                  {profile?.studentIdNumber && <div style={{ fontSize: 11.5, color: 'var(--card-muted)' }}>Roll #: {profile.studentIdNumber}</div>}
                </div>
                <span style={pill(profile?.studentIdNumber ? 'approved' : 'pending')}>{profile?.studentIdNumber ? 'On file' : 'Pending'}</span>
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
                  <div style={{ fontWeight: 700, fontSize: 13.8 }}>{currentUpi ? 'UPI linked' : 'UPI not linked'}</div>
                  <div style={{ fontSize: 11.8, color: '#64748b', marginTop: 3 }}>Where peers repay you directly</div>
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
              <div style={{ ...kycItem, paddingLeft: 0, paddingRight: 0, borderBottom: 'none' }}>
                <div style={kii(profile?.kycStatus === 'APPROVED')}>📄</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.8 }}>Provider lending agreement</div>
                  <div style={{ fontSize: 11.8, color: '#64748b', marginTop: 3 }}>Covers all future lending activities</div>
                </div>
                <span style={pill(profile?.kycStatus === 'APPROVED' ? 'approved' : 'pending')}>{profile?.kycStatus === 'APPROVED' ? 'Accepted' : 'Pending'}</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ===== 4. PROVIDE CAPITAL ===== */}
      {!loading && activeSection === 'provide' && (
        <section>
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
                      <span style={{ ...pill('pending'), marginBottom: 8, display: 'inline-block' }}>{loan.purpose || 'OTHER'}</span>
                      <h3 style={{ fontSize: 22, fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, margin: '4px 0 2px' }}>{fmtINR(loan.principalAmount)}</h3>
                      <div style={{ fontSize: 11.8, color: '#64748b' }}>Tenure: {tenureLabel(loan.tenure)} · {loan.publicId}</div>
                    </div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 100, background: 'rgba(143,191,163,.18)', color: '#6fa98f', fontSize: 12.5, fontWeight: 700 }}>
                      Score {loan.creditScore ?? '—'}
                    </div>
                  </div>

                  <div style={{ background: 'rgba(31,41,55,.04)', borderRadius: 12, padding: 12, margin: '10px 0', fontSize: 12.6 }}>
                    <div>Campus: <strong>{loan.university || 'Your campus'}</strong></div>
                    {loan.purposeNote && <div style={{ marginTop: 4, color: '#64748b' }}>“{loan.purposeNote}”</div>}
                    <div style={{ marginTop: 4, color: '#6fa98f', fontWeight: 700, fontFamily: 'IBM Plex Mono, monospace' }}>
                      Interest-free · peer repaid {fmtINR(loan.totalRepayAmount || loan.principalAmount)}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10 }}>
                    <button type="button" onClick={() => handleFund(loan.id)} style={{ ...darkBtn, flex: 1, justifyContent: 'center' }}>
                      Fund {fmtINR(loan.principalAmount)}
                    </button>
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
                      <div style={{ fontWeight: 700, fontSize: 14.5 }}>{loan.purpose || 'Loan'} · {loan.publicId}</div>
                      <div style={{ display: 'flex', gap: 20, marginTop: 8, flexWrap: 'wrap', fontSize: 12.2, color: '#64748b' }}>
                        <span>Principal: <strong style={{ fontFamily: 'IBM Plex Mono, monospace', color: '#1f2937' }}>{fmtINR(loan.principalAmount)}</strong></span>
                        <span>To be returned: <strong style={{ fontFamily: 'IBM Plex Mono, monospace', color: '#6fa98f' }}>{fmtINR(loan.totalRepayAmount || loan.principalAmount)}</strong></span>
                        <span>Due: <strong>{dateLabel(loan.dueAt)}</strong></span>
                      </div>
                    </div>
                    <span style={pill(loan.status?.toLowerCase())}>{cap(loan.status)}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 100, background: 'rgba(31,41,55,.07)', marginTop: 14, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${loanTermProgress(loan)}%`, background: 'linear-gradient(90deg,#6fa98f,#8fbfa3)', borderRadius: 100 }} />
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                    {loan.status === 'FUNDED' && !loan.fundingSentAt && (
                      <button onClick={() => handleMarkSent(loan.id)} style={{ ...darkBtn, padding: '9px 16px', fontSize: 12.5 }}>Mark money as handed over</button>
                    )}
                    {loan.status === 'FUNDED' && loan.fundingSentAt && !loan.fundingReceivedAt && (
                      <span style={{ fontSize: 12, color: '#94a3ae' }}>Waiting for the borrower to confirm receipt…</span>
                    )}
                    {loan.status === 'ACTIVE' && loan.repayClaimedAt && (
                      <button onClick={() => handleConfirmRepayment(loan.id)} style={{ ...darkBtn, padding: '9px 16px', fontSize: 12.5 }}>Confirm repayment received</button>
                    )}
                    {loan.status === 'ACTIVE' && !loan.repayClaimedAt && (
                      <span style={{ fontSize: 12, color: '#94a3ae' }}>Repaid directly by the borrower — the loan closes once they mark it repaid.</span>
                    )}
                    {['FUNDED', 'ACTIVE', 'DEFAULTED'].includes(loan.status) && (
                      <button onClick={() => handleDispute(loan.id)} style={{ padding: '9px 16px', borderRadius: 12, border: '1.5px solid rgba(255,255,255,.2)', background: 'transparent', color: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Raise a dispute</button>
                    )}
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

      {/* ===== 5. LENDING RECORD ===== */}
      {!loading && activeSection === 'balance' && (
        <section>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginBottom: 20 }}>
            <div style={card()}>
              <div style={{ fontSize: 12.5, color: '#64748b', fontWeight: 500 }}>Principal deployed</div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 26, fontWeight: 700, marginTop: 10 }}>{fmtINR(dashboard?.principalDeployed || 0)}</div>
              <div style={{ fontSize: 11.5, color: '#94a3ae', marginTop: 8 }}>Across {dashboard?.totalFundings || 0} funded requests</div>
            </div>
            <div style={card()}>
              <div style={{ fontSize: 12.5, color: '#64748b', fontWeight: 500 }}>Principal currently lent</div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 26, fontWeight: 700, marginTop: 10 }}>{fmtINR(totalLent)}</div>
              <div style={{ fontSize: 11.5, color: '#94a3ae', marginTop: 8 }}>In {activeLoans.length} active loan(s)</div>
            </div>
            <div style={card()}>
              <div style={{ fontSize: 12.5, color: '#64748b', fontWeight: 500 }}>Principal returned (lifetime)</div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 26, fontWeight: 700, marginTop: 10, color: '#6fa98f' }}>{fmtINR(lifetimeReturned)}</div>
              <div style={{ fontSize: 11.5, color: '#94a3ae', marginTop: 8 }}>From confirmed repayments</div>
            </div>
          </div>

          {/* Portfolio Breakdown */}
          <div style={card()}>
            <h4 style={{ fontSize: 15, marginBottom: 6 }}>Portfolio breakdown</h4>
            {[
              { label: 'Principal currently lent', value: totalLent, note: 'Out with borrowers until they repay' },
              { label: 'Awaiting handover', value: awaitingHandover, note: 'Committed loans not yet confirmed by both sides', raw: true },
              { label: 'Principal returned to date', value: lifetimeReturned, note: 'Confirmed repaid loans', color: '#6fa98f' },
            ].map((row, i, arr) => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: i < arr.length - 1 ? '1px solid rgba(31,41,55,.08)' : 'none', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>{row.label}</div>
                  <div style={{ fontSize: 11.5, color: '#94a3ae', marginTop: 2 }}>{row.note}</div>
                </div>
                <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 15, fontWeight: 700, color: row.color || '#1f2937', flexShrink: 0 }}>{row.raw ? row.value : fmtINR(row.value)}</div>
              </div>
            ))}
            <p style={{ fontSize: 11.3, color: '#94a3ae', marginTop: 14, lineHeight: 1.6 }}>
              UniFi never holds your money. Borrowers repay you directly{currentUpi ? <> (your UPI: <strong>{currentUpi}</strong>)</> : ''}, and you confirm each repayment here.
            </p>
          </div>

          {/* Funded Loans */}
          <div style={card()}>
            <h4 style={{ fontSize: 15, marginBottom: 6 }}>Funded loans</h4>
            {myLoans.map((loan, i, arr) => (
              <div key={`tx-${loan.id}`} style={{ ...actRow, ...(i === arr.length - 1 ? { borderBottom: 'none' } : {}) }}>
                <div style={actIc(loan.status === 'REPAID')}>
                  {loan.status === 'REPAID' ? '✓' : '💰'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>
                    {loan.purpose} · {loan.publicId}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#94a3ae', marginTop: 2 }}>{cap(loan.status || '')} · {dateLabel(loan.createdAt)}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 13 }}>{fmtINR(loan.principalAmount)}</div>
                  <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11.5, color: loan.status === 'REPAID' ? '#6fa98f' : '#94a3ae' }}>{loan.status === 'REPAID' ? 'Returned' : 'Interest-free'}</div>
                </div>
              </div>
            ))}
            {!myLoans.length && <p style={{ color: '#94a3ae', fontSize: 13 }}>No funded loans yet.</p>}
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
                  <div style={{ fontWeight: 500, fontSize: 13.3 }}>{n.title || n.body}</div>
                  <div style={{ fontSize: 11.3, color: '#94a3ae', marginTop: 3 }}>
                    {n.body && n.title ? n.body : ''} · {dateLabel(n.createdAt)}
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 20 }}>
            <div style={{ ...card({ padding: '24px 18px' }) }}>
              <div style={{ width: 42, height: 42, borderRadius: 13, background: 'rgba(143,191,163,.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, fontSize: 20 }}>❓</div>
              <h5 style={{ fontSize: 14 }}>Browse FAQs</h5>
              <p style={{ fontSize: 11.8, color: '#64748b', marginTop: 6, lineHeight: 1.5 }}>Answers to common questions about lending, handovers, and repayments.</p>
            </div>
            <div style={{ ...card({ padding: '24px 18px' }) }}>
              <div style={{ width: 42, height: 42, borderRadius: 13, background: 'rgba(143,191,163,.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, fontSize: 20 }}>✉️</div>
              <h5 style={{ fontSize: 14 }}>Email support</h5>
              <p style={{ fontSize: 11.8, color: '#64748b', marginTop: 6, lineHeight: 1.5 }}>
                Reach the team at <a href="mailto:support@unifi.campus" style={{ color: '#6fa98f', fontWeight: 600 }}>support@unifi.campus</a> — include your loan reference (e.g. LN-XXXX) so we can look into it quickly.
              </p>
            </div>
          </div>

          <div style={card()}>
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
