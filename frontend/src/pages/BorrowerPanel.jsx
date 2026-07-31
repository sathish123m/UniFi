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
  { key: 'borrow', label: 'Borrow Request' },
  { key: 'repay', label: 'Repayment Center' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'help', label: 'Help & Support' },
]

const fmtINR = (n = 0) => `₹${Number(n).toLocaleString('en-IN')}`
const dateLabel = (v) =>
  v ? new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'TBD'
const cap = (s = '') => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()

// Shared card styles
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
    active: { background: 'rgba(224,177,104,.2)', color: 'var(--gold, #c9a84c)' },
    pending: { background: 'rgba(224,177,104,.2)', color: 'var(--gold, #c9a84c)' },
    funded: { background: 'rgba(143,191,163,.22)', color: '#6fa98f' },
    approved: { background: 'rgba(143,191,163,.22)', color: '#6fa98f' },
    rejected: { background: 'rgba(232,169,155,.32)', color: '#ff6b6b' },
    completed: { background: 'rgba(255,255,255,.08)', color: 'var(--card-muted, #94a3b8)' },
    repaid: { background: 'rgba(255,255,255,.08)', color: 'var(--card-muted, #94a3b8)' },
    paid: { background: 'rgba(143,191,163,.22)', color: '#6fa98f' },
    upcoming: { background: 'rgba(255,255,255,.06)', color: 'var(--card-muted, #94a3b8)' },
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
const actRow = (good) => ({ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 0', borderBottom: '1px solid var(--row-border, rgba(255,255,255,0.08))', background: 'transparent' })
const actIc = (good) => ({ width: 34, height: 34, borderRadius: 10, background: good ? 'rgba(143,191,163,.18)' : 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14, color: good ? '#6fa98f' : 'var(--card-muted, #94a3b8)' })
const kycItem = { display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: '1px solid rgba(31,41,55,.08)' }
const kii = (done) => ({ width: 40, height: 40, borderRadius: 12, background: done ? 'rgba(143,191,163,.2)' : 'rgba(31,41,55,.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: done ? '#6fa98f' : '#64748b', fontSize: 16 })

const PURPOSES = [
  { id: 'TUITION', label: '🎓 Tuition & Exam Fees' },
  { id: 'BOOKS', label: '📚 Books & Study Material' },
  { id: 'HOSTEL', label: '🏠 Hostel / Rent' },
  { id: 'MEDICAL', label: '🏥 Medical Emergency' },
  { id: 'GADGET', label: '💻 Gadget / Device' },
  { id: 'TRAVEL', label: '✈️ Travel & Transport' },
  { id: 'OTHER', label: '📋 Other' },
]

const TENURES = [
  { id: 'SEVEN', label: '7 Days', rate: '3%', multiplier: 1.03 },
  { id: 'FOURTEEN', label: '14 Days', rate: '5%', multiplier: 1.05 },
  { id: 'THIRTY', label: '30 Days', rate: '8%', multiplier: 1.08 },
  { id: 'SIXTY', label: '60 Days', rate: '12%', multiplier: 1.12 },
  { id: 'NINETY', label: '90 Days', rate: '16%', multiplier: 1.16 },
]

const FAQS = [
  { q: 'How is my credit limit decided?', a: 'Your limit is set by the campus admin based on your KYC status, verified profile and repayment history. It grows as you repay on time.' },
  { q: 'What happens if I miss a repayment?', a: "You'll get reminders before every due date. Missed payments are flagged to the admin and may reduce your credit limit for future requests." },
  { q: 'Can I repay before the due date?', a: 'Yes — you can make a full or partial repayment any time from the Repayment Center.' },
  { q: 'How fast are funds disbursed?', a: 'Disbursements happen within 1–5 minutes directly to your linked UPI after a provider funds your request.' },
]

export default function BorrowerPanel() {
  const { accessToken, user, logout } = useAuth()
  const { section: activeSection = 'overview' } = useParams()
  const navigate = useNavigate()
  const setActiveSection = (sec) => navigate(`/borrower/${sec}`)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [dashboard, setDashboard] = useState(null)
  const [profile, setProfile] = useState(null)
  const [myLoans, setMyLoans] = useState([])
  const [notifications, setNotifications] = useState([])
  const [notifTab, setNotifTab] = useState('all')

  // Form state
  const [upi, setUpi] = useState('')
  const [currentUpi, setCurrentUpi] = useState(null)
  const [personalForm, setPersonalForm] = useState({ firstName: '', lastName: '', phone: '' })
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [borrowForm, setBorrowForm] = useState({ principalAmount: 5000, tenure: 'SIXTY', purpose: 'TUITION', purposeNote: '', guarantorEmail: '', openToAny: true })
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

  const [loanTab, setLoanTab] = useState('all')
  const [openFaq, setOpenFaq] = useState(null)
  const [ticketForm, setTicketForm] = useState({ category: 'REPAYMENT', subject: '', message: '' })
  const [passwordShowMap, setPasswordShowMap] = useState({ cur: false, new: false, confirm: false })

  const reload = async () => {
    setLoading(true)
    setError('')
    try {
      const [d, p, l, n, u] = await Promise.all([
        api.get('/users/dashboard', accessToken),
        api.get('/users/profile', accessToken),
        api.get('/loans/my', accessToken),
        api.get('/users/notifications', accessToken),
        api.get('/users/upi', accessToken).catch(() => ({ data: {} })),
      ])
      setDashboard(d.data)
      setProfile(p.data)
      setMyLoans(l.data || [])
      setNotifications(n.data || [])
      setCurrentUpi(u.data?.upiId || null)

      if (p.data) {
        setPersonalForm({ firstName: p.data.firstName || '', lastName: p.data.lastName || '', phone: p.data.phone || '' })
      }
    } catch (err) {
      setError(err.message || 'Failed to load borrower dashboard')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { reload() }, [])

  const activeLoan = useMemo(() => myLoans.find(l => ['PENDING', 'FUNDED', 'ACTIVE'].includes(l.status)) || null, [myLoans])
  const unreadCount = useMemo(() => notifications.filter(n => !n.isRead).length, [notifications])

  const borrowCalc = useMemo(() => {
    const principal = Number(borrowForm.principalAmount || 0)
    const tenure = TENURES.find(t => t.id === borrowForm.tenure) || TENURES[3]
    const repayable = Math.round(principal * tenure.multiplier)
    const interest = repayable - principal
    const daysMap = { SEVEN: 7, FOURTEEN: 14, THIRTY: 30, SIXTY: 60, NINETY: 90 }
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + (daysMap[borrowForm.tenure] || 60))
    return { principal, repayable, interest, dueDate: dateLabel(dueDate), isHighValue: principal > 5000 }
  }, [borrowForm.principalAmount, borrowForm.tenure])

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

  const handleSubmitBorrow = async (e) => {
    e.preventDefault()
    setError(''); setMessage('')
    try {
      await api.post('/loans/request', {
        principalAmount: borrowCalc.principal,
        tenure: borrowForm.tenure,
        purpose: borrowForm.purpose,
        purposeNote: borrowForm.purposeNote || `${borrowForm.purpose} loan request`,
        guarantorEmail: borrowCalc.isHighValue ? borrowForm.guarantorEmail : undefined,
      }, accessToken)
      setMessage('🚀 Request submitted — providers will be notified.')
      setActiveSection('borrow')
      await reload()
    } catch (err) { setError(err.message) }
  }

  const handleRepay = async (loanId) => {
    setError(''); setMessage('')
    try {
      const order = await api.post(`/payments/repay/${loanId}`, {}, accessToken)
      if (order.data?.provider === 'MOCK') {
        await api.post(`/payments/repay/${loanId}/confirm`, {}, accessToken)
      } else if (order.data?.provider === 'RAZORPAY') {
        const payment = await openRazorpayCheckout({ key: order.data.keyId, orderId: order.data.orderId, amount: order.data.amount, description: `Repayment for Loan #${loanId}`, prefill: { email: user?.email } })
        await api.post('/payments/verify', { orderId: payment.razorpay_order_id, paymentId: payment.razorpay_payment_id, signature: payment.razorpay_signature, loanId, type: 'REPAYMENT' }, accessToken)
      }
      setMessage('🎉 Repayment completed successfully!')
      await reload()
    } catch (err) { setError(err.message) }
  }

  const markRead = async (id) => {
    try { await api.patch(`/users/notifications/${id}/read`, {}, accessToken); await reload() } catch {}
  }

  const handleSubmitTicket = async (e) => {
    e.preventDefault()
    setMessage('✓ Ticket submitted — support will reach out by email.')
    setTicketForm({ category: 'REPAYMENT', subject: '', message: '' })
  }

  const filteredLoans = useMemo(() => {
    if (loanTab === 'all') return myLoans
    if (loanTab === 'pending') return myLoans.filter(l => l.status === 'PENDING')
    if (loanTab === 'approved') return myLoans.filter(l => ['FUNDED', 'ACTIVE'].includes(l.status))
    if (loanTab === 'completed') return myLoans.filter(l => ['REPAID', 'CLOSED', 'REJECTED'].includes(l.status))
    return myLoans
  }, [myLoans, loanTab])

  const filteredNotifs = useMemo(() => {
    if (notifTab === 'unread') return notifications.filter(n => !n.isRead)
    return notifications
  }, [notifications, notifTab])

  // Repayment stats
  const totalOutstanding = useMemo(() => myLoans.filter(l => ['FUNDED', 'ACTIVE', 'PENDING'].includes(l.status)).reduce((s, l) => s + (l.repayableAmount || l.principalAmount * 1.08), 0), [myLoans])
  const totalRepaid = useMemo(() => myLoans.filter(l => ['REPAID', 'CLOSED'].includes(l.status)).reduce((s, l) => s + (l.repayableAmount || l.principalAmount * 1.08), 0), [myLoans])
  const nextDue = activeLoan ? (activeLoan.repayableAmount || activeLoan.principalAmount * 1.08) : 0

  // KYC steps
  const kycSteps = [
    { label: 'Email', done: true },
    { label: 'ID Card', done: !!profile?.collegeIdNum },
    { label: 'Camera', done: profile?.kycStatus === 'APPROVED' },
    { label: 'Phone OTP', done: !!profile?.phone },
    { label: 'UPI', done: !!currentUpi },
    { label: 'Agreement', done: profile?.kycStatus === 'APPROVED' },
  ]

  const creditLimit = profile?.borrowLimit || 25000
  const creditUsed = totalOutstanding
  const creditAvailable = Math.max(0, creditLimit - creditUsed)

  const profileCompletion = useMemo(() => {
    let done = 0
    if (profile?.firstName) done++
    if (profile?.phone) done++
    if (profile?.collegeIdNum) done++
    if (currentUpi) done++
    return Math.round((done / 4) * 100)
  }, [profile, currentUpi])

  return (
    <AppShell
      baseRoute="/borrower"
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
          {/* Stat Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginBottom: 20 }}>
            {/* Available credit */}
            <div style={card()}>
              <div style={{ fontSize: 12.5, color: '#64748b', fontWeight: 500 }}>Available credit limit</div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 26, fontWeight: 700, marginTop: 10 }}>{fmtINR(creditAvailable)}</div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 12, padding: '7px 13px', borderRadius: 100, background: 'rgba(143,191,163,.18)', color: '#6fa98f', fontSize: 13, fontWeight: 600 }}>
                ✓ {profile?.kycStatus === 'APPROVED' ? 'Verified borrower' : 'KYC Submitted'}
              </div>
            </div>
            {/* Profile completion ring */}
            <div style={card()}>
              <div style={{ fontSize: 12.5, color: '#64748b', fontWeight: 500 }}>Profile completion</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 6 }}>
                <div style={{ position: 'relative', width: 76, height: 76, flexShrink: 0 }}>
                  <svg width="76" height="76" viewBox="0 0 76 76" style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx="38" cy="38" r="32" fill="none" stroke="rgba(31,41,55,.08)" strokeWidth="7" />
                    <circle cx="38" cy="38" r="32" fill="none" stroke="#8fbfa3" strokeWidth="7" strokeLinecap="round" strokeDasharray="201" strokeDashoffset={201 - (201 * profileCompletion) / 100} style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(.2,.7,.2,1)' }} />
                  </svg>
                </div>
                <div>
                  <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 18, fontWeight: 700 }}>{profileCompletion}%</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Profile setup</div>
                </div>
              </div>
            </div>
            {/* KYC status */}
            <div style={card()}>
              <div style={{ fontSize: 12.5, color: '#64748b', fontWeight: 500 }}>KYC status</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 10, color: profile?.kycStatus === 'APPROVED' ? '#6fa98f' : '#96712c' }}>
                {cap(profile?.kycStatus || 'PENDING')}
              </div>
              <div style={{ fontSize: 12, color: '#94a3ae', marginTop: 8 }}>Valid across all requests</div>
            </div>
          </div>

          {/* Content Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 18, marginBottom: 20 }}>
            {/* Active Loan */}
            <div style={card()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <h4 style={{ fontSize: 15 }}>Active loan · {activeLoan?.purpose || 'No active loan'}</h4>
                  <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 15, color: '#64748b' }}>
                    {activeLoan ? fmtINR(activeLoan.principalAmount) + ' total' : '—'}
                  </div>
                </div>
                {activeLoan && <span style={pill(activeLoan.status?.toLowerCase())}>{cap(activeLoan.status)}</span>}
              </div>
              {activeLoan ? (
                <>
                  <div style={{ height: 8, borderRadius: 100, background: 'rgba(31,41,55,.07)', marginTop: 18, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: '50%', background: 'linear-gradient(90deg,#6fa98f,#8fbfa3)', borderRadius: 100 }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 12, color: '#64748b' }}>
                    <span>Paid: <span style={{ fontFamily: 'IBM Plex Mono, monospace', color: '#1f2937' }}>{fmtINR(activeLoan.principalAmount / 2)}</span></span>
                    <span>Remaining: <span style={{ fontFamily: 'IBM Plex Mono, monospace', color: '#1f2937' }}>{fmtINR(activeLoan.repayableAmount - activeLoan.principalAmount / 2 || activeLoan.principalAmount * 0.58)}</span></span>
                  </div>
                  <div style={{ display: 'flex', gap: 22, marginTop: 18, paddingTop: 16, borderTop: '1px solid rgba(31,41,55,.08)' }}>
                    <div><span style={{ display: 'block', fontSize: 11, color: '#94a3ae', marginBottom: 3 }}>Next due</span><b style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 13.5 }}>{dateLabel(activeLoan.dueDate)}</b></div>
                    <div><span style={{ display: 'block', fontSize: 11, color: '#94a3ae', marginBottom: 3 }}>Next amount</span><b style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 13.5 }}>{fmtINR(activeLoan.repayableAmount || activeLoan.principalAmount * 1.08)}</b></div>
                    <div><span style={{ display: 'block', fontSize: 11, color: '#94a3ae', marginBottom: 3 }}>Lender</span><b style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 13.5 }}>Verified provider</b></div>
                  </div>
                </>
              ) : (
                <div style={{ padding: '24px 0', textAlign: 'center', color: '#64748b' }}>
                  <p>No active loan. Apply for a micro-loan anytime!</p>
                  <button onClick={() => setActiveSection('borrow')} style={{ ...darkBtn, marginTop: 12 }}>Raise a request</button>
                </div>
              )}
            </div>

            {/* Repayment Due Card */}
            <div style={{ ...card({ background: 'linear-gradient(160deg,#fff,#fdf3ef)' }) }}>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: '#d99686', letterSpacing: '.05em', textTransform: 'uppercase' }}>Repayment due</div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 30, fontWeight: 700, marginTop: 10 }}>{fmtINR(nextDue)}</div>
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 6 }}>
                {activeLoan ? `Due on ${dateLabel(activeLoan.dueDate)}` : 'No active loans'}
              </div>
              {activeLoan && (
                <button onClick={() => handleRepay(activeLoan.id)} style={{ marginTop: 20, width: '100%', padding: 13, borderRadius: 12, background: '#1f2937', color: '#fdf3ef', fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  Repay now →
                </button>
              )}
              <p style={{ fontSize: 11.3, color: '#94a3ae', marginTop: 14 }}>Partial payments are accepted — pay any amount up to the total outstanding.</p>
            </div>
          </div>

          {/* Quick Actions */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
            {[
              { icon: '💳', label: 'Raise a request', sub: 'New loan application', sec: 'borrow' },
              { icon: '🔄', label: 'Make a repayment', sub: 'UPI & Razorpay', sec: 'repay' },
              { icon: '🆔', label: 'Upload KYC doc', sub: 'Student verification', sec: 'kyc' },
              { icon: '🎧', label: 'Contact support', sub: 'Help & FAQs', sec: 'help' },
            ].map(qa => (
              <button key={qa.sec} onClick={() => setActiveSection(qa.sec)} style={{ background: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 20px 40px -26px rgba(31,41,55,.22)', display: 'flex', flexDirection: 'column', gap: 10, border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'transform .2s' }}>
                <div style={{ width: 38, height: 38, borderRadius: 11, background: 'rgba(232,169,155,.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{qa.icon}</div>
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>{qa.label}</span>
                <span style={{ fontSize: 11.5, color: '#64748b' }}>{qa.sub}</span>
              </button>
            ))}
          </div>

          {/* Recent Activity */}
          <div style={card()}>
            <h4 style={{ fontSize: 15, marginBottom: 6 }}>Recent activity</h4>
            {myLoans.slice(0, 4).map((loan, i) => (
              <div key={loan.id} style={{ ...actRow(['REPAID', 'CLOSED'].includes(loan.status)), ...(i === Math.min(myLoans.length, 4) - 1 ? { borderBottom: 'none' } : {}) }}>
                <div style={actIc(['REPAID', 'CLOSED'].includes(loan.status))}>{['REPAID', 'CLOSED'].includes(loan.status) ? '✓' : '💳'}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>{loan.purpose || 'Loan'} — {cap(loan.status)}</div>
                  <div style={{ fontSize: 11.5, color: '#94a3ae', marginTop: 2 }}>{dateLabel(loan.createdAt || loan.dueDate)}</div>
                </div>
                <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 13, color: '#64748b' }}>{fmtINR(loan.principalAmount)}</div>
              </div>
            ))}
            {!myLoans.length && <p style={{ color: '#94a3ae', fontSize: 13 }}>No loan activity yet.</p>}
          </div>
        </section>
      )}

      {/* ===== 2. ACCOUNT MANAGEMENT ===== */}
      {!loading && activeSection === 'account' && (
        <section>
          {/* Profile Header */}
          <div style={card()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ width: 74, height: 74, borderRadius: '50%', background: 'linear-gradient(135deg,#e8a99b,#8fbfa3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: 26, color: '#fff', flexShrink: 0, position: 'relative' }}>
                {profile?.firstName?.[0]}{profile?.lastName?.[0]}
                <button style={{ position: 'absolute', bottom: -2, right: -2, width: 26, height: 26, borderRadius: '50%', background: '#1f2937', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12 }}>📷</button>
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: 19, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, margin: 0 }}>
                  {profile?.firstName} {profile?.lastName}
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: '#6fa98f', background: 'rgba(143,191,163,.18)', padding: '3px 9px', borderRadius: 100, fontWeight: 700 }}>✓ Verified borrower</span>
                </h3>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 7, fontSize: 12.6, color: '#64748b' }}>
                  <span>✉️ {profile?.email || user?.email}</span>
                  <span>📱 {profile?.phone || 'Not set'}</span>
                  <span>🆔 {profile?.collegeIdNum || 'N/A'}</span>
                </div>
              </div>
              <button style={outlineBtn} onClick={() => {}}>Change photo</button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 18, marginBottom: 18 }}>
            {/* Personal Details */}
            <form style={card()} onSubmit={handleUpdateProfile}>
              <h4 style={{ fontSize: 15, marginBottom: 4 }}>Personal details</h4>
              <p style={{ fontSize: 12.3, color: '#64748b', marginBottom: 0 }}>Your university email is locked once verified.</p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 18px' }}>
                <div>
                  <label style={fieldLabel}>FULL NAME</label>
                  <input style={inputStyle} value={personalForm.firstName} onChange={e => setPersonalForm(p => ({ ...p, firstName: e.target.value }))} placeholder="First name" />
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

            {/* Credit Limit Card */}
            <div style={card()}>
              <h4 style={{ fontSize: 15 }}>Credit limit</h4>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 26, fontWeight: 700, marginTop: 10 }}>
                {fmtINR(creditAvailable)} <span style={{ color: '#d99686', fontSize: 15 }}>available</span>
              </div>
              <div style={{ height: 8, borderRadius: 100, background: 'rgba(31,41,55,.07)', marginTop: 16, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, (creditUsed / creditLimit) * 100)}%`, background: 'linear-gradient(90deg,#d99686,#e8a99b)', borderRadius: 100 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 12, color: '#64748b' }}>
                <span>Used: <span style={{ fontFamily: 'IBM Plex Mono, monospace', color: '#1f2937' }}>{fmtINR(creditUsed)}</span></span>
                <span>Limit: <span style={{ fontFamily: 'IBM Plex Mono, monospace', color: '#1f2937' }}>{fmtINR(creditLimit)}</span></span>
              </div>
              <p style={{ fontSize: 11.6, color: '#94a3ae', marginTop: 14, lineHeight: 1.6 }}>Set by the campus admin based on your KYC status & repayment history. Repaying on time grows it over time.</p>
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
              <button type="button" style={{ display: 'block', marginTop: 14, fontSize: 12.5, color: '#d99686', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Forgot your current password?</button>
            </form>

            {/* UPI Setup */}
            <form style={card()} onSubmit={handleLinkUpi}>
              <h4 style={{ fontSize: 15, marginBottom: 4 }}>UPI Setup & KYC Verification</h4>
              <p style={{ fontSize: 12.3, color: '#64748b' }}>Current UPI: <strong>{currentUpi || 'Not linked'}</strong></p>

              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderTop: '1px solid rgba(31,41,55,.08)', marginTop: 8 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: currentUpi ? 'rgba(143,191,163,.2)' : 'rgba(31,41,55,.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: currentUpi ? '#6fa98f' : '#64748b', fontSize: 16 }}>{currentUpi ? '✓' : '💳'}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.8 }}>{currentUpi ? 'UPI linked & verified' : 'No UPI linked'}</div>
                  <div style={{ fontSize: 11.8, color: '#64748b', marginTop: 3 }}>Used for disbursal & repayment</div>
                </div>
              </div>

              <label style={fieldLabel}>NEW UPI ID</label>
              <input style={inputStyle} value={upi} onChange={e => setUpi(e.target.value)} placeholder="e.g. name@okaxis" required />

              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderTop: '1px solid rgba(31,41,55,.08)', marginTop: 16 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: profile?.phone ? 'rgba(143,191,163,.2)' : 'rgba(31,41,55,.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: profile?.phone ? '#6fa98f' : '#64748b', fontSize: 16 }}>{profile?.phone ? '✓' : '📱'}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.8 }}>{profile?.phone ? 'OTP verified' : 'Phone not verified'}</div>
                  <div style={{ fontSize: 11.8, color: '#64748b', marginTop: 3 }}>Number bound to this account</div>
                </div>
              </div>

              <button type="submit" style={{ ...darkBtn, marginTop: 20 }}>Link & verify UPI</button>
            </form>
          </div>
        </section>
      )}

      {/* ===== 3. KYC & VERIFICATION ===== */}
      {!loading && activeSection === 'kyc' && (
        <section>
          {/* Verification Status */}
          <div style={card()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
              <div>
                <h4 style={{ fontSize: 15 }}>Verification status</h4>
                <p style={{ fontSize: 12.3, color: '#64748b', marginTop: 4 }}>
                  {profile?.kycStatus === 'APPROVED' ? 'All required checks complete — approved.' : 'Complete all steps to unlock borrowing.'}
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
                  border: `2px dashed var(--accent-border, rgba(201, 168, 76, 0.35))`,
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
                  <div style={{ fontSize: 11.8, color: 'var(--card-muted, #94a3b8)', marginTop: 3 }}>Live webcam face verification</div>
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

              {/* Dropzone */}
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
            {/* UPI & Phone */}
            <div style={card()}>
              <h4 style={{ fontSize: 15 }}>UPI & phone verification</h4>
              <label style={fieldLabel}>UPI ID</label>
              <input style={inputStyle} value={currentUpi || ''} onChange={e => setUpi(e.target.value)} placeholder="name@okaxis" />
              <div style={{ ...kycItem, paddingLeft: 0, paddingRight: 0 }}>
                <div style={kii(!!currentUpi)}>✓</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.8 }}>{currentUpi ? 'UPI linked & verified' : 'UPI not linked'}</div>
                  <div style={{ fontSize: 11.8, color: '#64748b', marginTop: 3 }}>Used for disbursal & repayment</div>
                </div>
              </div>
              <label style={fieldLabel}>PHONE NUMBER</label>
              <input style={{ ...inputStyle, opacity: 0.6 }} value={profile?.phone || ''} disabled />
              <div style={{ ...kycItem, paddingLeft: 0, paddingRight: 0, borderBottom: 'none' }}>
                <div style={kii(!!profile?.phone)}>✓</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.8 }}>{profile?.phone ? 'OTP verified' : 'Phone not verified'}</div>
                  <div style={{ fontSize: 11.8, color: '#64748b', marginTop: 3 }}>Number bound to this account</div>
                </div>
              </div>
            </div>

            {/* Agreement & Guarantor */}
            <div style={card()}>
              <h4 style={{ fontSize: 15 }}>Agreement & guarantor</h4>
              <div style={{ ...kycItem, paddingLeft: 0, paddingRight: 0 }}>
                <div style={kii(profile?.kycStatus === 'APPROVED')}>📄</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.8 }}>Master loan agreement e-signed</div>
                  <div style={{ fontSize: 11.8, color: '#64748b', marginTop: 3 }}>Covers all future requests</div>
                </div>
                <button style={{ ...outlineBtn, padding: '8px 14px', fontSize: 12 }}>View</button>
              </div>
              <div style={{ ...kycItem, paddingLeft: 0, paddingRight: 0, borderBottom: 'none' }}>
                <div style={kii(false)}>👥</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.8 }}>Guarantor <span style={{ fontWeight: 400, color: '#94a3ae' }}>(optional)</span></div>
                  <div style={{ fontSize: 11.8, color: '#64748b', marginTop: 3 }}>Add a co-signer to raise your credit limit</div>
                </div>
                <button style={{ ...outlineBtn, padding: '8px 14px', fontSize: 12 }}>Add</button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ===== 4. BORROW REQUEST ===== */}
      {!loading && activeSection === 'borrow' && (
        <section>
          {/* New Request Form */}
          <div style={card()}>
            <h4 style={{ fontSize: 15 }}>Raise a new request</h4>
            <p style={{ fontSize: 12.3, color: '#64748b', marginTop: 4 }}>
              You have <strong style={{ fontFamily: 'IBM Plex Mono, monospace', color: '#1f2937' }}>{fmtINR(creditAvailable)}</strong> of your credit limit available.
            </p>

            <form onSubmit={handleSubmitBorrow}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 18px', marginTop: 6 }}>
                <div>
                  <label style={fieldLabel}>AMOUNT NEEDED</label>
                  <input
                    style={inputStyle}
                    type="number"
                    value={borrowForm.principalAmount}
                    onChange={e => setBorrowForm(p => ({ ...p, principalAmount: Number(e.target.value) }))}
                    placeholder="₹ 5,000"
                    min={500}
                    max={creditAvailable || 50000}
                  />
                </div>
                <div>
                  <label style={fieldLabel}>PURPOSE</label>
                  <select style={{ ...inputStyle, appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3ae' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center' }} value={borrowForm.purpose} onChange={e => setBorrowForm(p => ({ ...p, purpose: e.target.value }))}>
                    {PURPOSES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={fieldLabel}>REASON / DESCRIPTION</label>
                  <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 88 }} value={borrowForm.purposeNote} onChange={e => setBorrowForm(p => ({ ...p, purposeNote: e.target.value }))} placeholder="Briefly describe what this is for — providers see this before approving." />
                </div>
                <div>
                  <label style={fieldLabel}>REPAYMENT PLAN</label>
                  <select style={{ ...inputStyle, appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3ae' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center' }} value={borrowForm.tenure} onChange={e => setBorrowForm(p => ({ ...p, tenure: e.target.value }))}>
                    {TENURES.map(t => <option key={t.id} value={t.id}>{t.label} · {t.rate}</option>)}
                  </select>
                </div>
                <div>
                  <label style={fieldLabel}>OPEN TO ANY VERIFIED PROVIDER</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
                    <div onClick={() => setBorrowForm(p => ({ ...p, openToAny: !p.openToAny }))} style={{ width: 42, height: 24, borderRadius: 100, background: borrowForm.openToAny ? '#8fbfa3' : 'rgba(31,41,55,.15)', position: 'relative', cursor: 'pointer', transition: 'background .2s' }}>
                      <div style={{ position: 'absolute', top: 3, left: borrowForm.openToAny ? 21 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 2px 6px rgba(0,0,0,.2)' }} />
                    </div>
                    <span style={{ fontSize: 12.3, color: '#64748b' }}>Recommended — gets funded faster</span>
                  </div>
                </div>
              </div>

              {/* EMI Summary */}
              <div style={{ background: 'rgba(31,41,55,.04)', borderRadius: 12, padding: 16, marginTop: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, fontSize: 13 }}>
                  <div><div style={{ color: '#94a3ae', marginBottom: 2 }}>Principal</div><strong style={{ fontFamily: 'IBM Plex Mono, monospace' }}>{fmtINR(borrowCalc.principal)}</strong></div>
                  <div><div style={{ color: '#94a3ae', marginBottom: 2 }}>Total Repayable</div><strong style={{ fontFamily: 'IBM Plex Mono, monospace', color: '#96712c' }}>{fmtINR(borrowCalc.repayable)}</strong></div>
                  <div><div style={{ color: '#94a3ae', marginBottom: 2 }}>Due Date</div><strong>{borrowCalc.dueDate}</strong></div>
                </div>
              </div>

              {borrowCalc.isHighValue && (
                <div style={{ marginTop: 12, background: 'rgba(224,177,104,.1)', padding: 12, borderRadius: 10, border: '1px solid rgba(224,177,104,.3)' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#96712c' }}>⚠ Peer Guarantor Required — Loans above ₹5,000 require 1 verified peer.</span>
                  <input style={{ ...inputStyle, marginTop: 8 }} type="email" placeholder="Guarantor campus email..." value={borrowForm.guarantorEmail} onChange={e => setBorrowForm(p => ({ ...p, guarantorEmail: e.target.value }))} />
                </div>
              )}

              <button type="submit" style={{ ...darkBtn, marginTop: 20 }}>Submit request</button>
            </form>
          </div>

          {/* My Requests */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', margin: '6px 0 16px' }}>
            <h2 style={{ fontSize: 17 }}>My requests</h2>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {[
              { key: 'all', label: 'All' },
              { key: 'pending', label: 'Pending' },
              { key: 'approved', label: 'Approved / Active' },
              { key: 'completed', label: 'Completed' },
            ].map(t => (
              <button key={t.key} style={segTab(loanTab === t.key)} onClick={() => setLoanTab(t.key)}>{t.label}</button>
            ))}
          </div>

          {filteredLoans.length === 0 && (
            <div style={{ ...card(), textAlign: 'center', color: '#94a3ae', padding: 30 }}>No requests found for this filter.</div>
          )}

          {filteredLoans.map(loan => {
            const statusLower = loan.status?.toLowerCase()
            const isFunded = ['FUNDED', 'ACTIVE'].includes(loan.status)
            const isCompleted = ['REPAID', 'CLOSED'].includes(loan.status)
            const isRejected = loan.status === 'REJECTED'
            return (
              <div key={loan.id} style={{ ...card(), marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: isFunded ? 'rgba(143,191,163,.16)' : 'rgba(232,169,155,.16)', color: isFunded ? '#6fa98f' : '#d99686', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18 }}>
                    {isFunded ? '✓' : isCompleted ? '✓' : isRejected ? '⚠' : '⏱'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14.5 }}>{loan.purpose || 'Loan Request'}</div>
                    <div style={{ fontSize: 11.8, color: '#94a3ae', marginTop: 4 }}>
                      Raised {dateLabel(loan.createdAt)} · Due {dateLabel(loan.dueDate)}
                    </div>
                  </div>
                  <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 15, fontWeight: 700 }}>{fmtINR(loan.principalAmount)}</div>
                  <span style={{ ...pill(isCompleted ? 'completed' : isRejected ? 'rejected' : isFunded ? 'approved' : 'pending'), marginLeft: 14 }}>
                    {isCompleted ? 'Completed' : isRejected ? 'Rejected' : isFunded ? 'Active' : 'Pending'}
                  </span>
                  {isFunded && (
                    <button style={{ ...darkBtn, padding: '8px 16px', fontSize: 12 }} onClick={() => handleRepay(loan.id)}>Repay</button>
                  )}
                </div>
              </div>
            )
          })}
        </section>
      )}

      {/* ===== 5. REPAYMENT CENTER ===== */}
      {!loading && activeSection === 'repay' && (
        <section>
          {/* Stat Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginBottom: 20 }}>
            <div style={card()}><div style={{ fontSize: 12.5, color: '#64748b', fontWeight: 500 }}>Total outstanding</div><div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 26, fontWeight: 700, marginTop: 10 }}>{fmtINR(totalOutstanding)}</div></div>
            <div style={card()}>
              <div style={{ fontSize: 12.5, color: '#64748b', fontWeight: 500 }}>Next payment due</div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 20, fontWeight: 700, marginTop: 10 }}>
                {fmtINR(nextDue)} <span style={{ fontSize: 12, color: '#94a3ae', fontFamily: 'Inter, sans-serif' }}>· {activeLoan ? dateLabel(activeLoan.dueDate) : 'No active loan'}</span>
              </div>
            </div>
            <div style={card()}><div style={{ fontSize: 12.5, color: '#64748b', fontWeight: 500 }}>Total repaid to date</div><div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 26, fontWeight: 700, marginTop: 10 }}>{fmtINR(totalRepaid)}</div></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18, marginBottom: 20 }}>
            {/* Repayment Schedule */}
            <div style={card()}>
              <h4 style={{ fontSize: 15 }}>Repayment schedule</h4>
              {activeLoan ? (
                <div style={{ marginTop: 14, width: '100%' }}>
                  {/* Header */}
                  <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 100px 120px 90px', gap: 10, alignItems: 'center', padding: '0 2px 10px', borderBottom: '1.5px solid rgba(31,41,55,.14)', fontSize: 10.5, color: '#94a3ae', fontFamily: 'IBM Plex Mono, monospace', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                    <span>#</span><span>Due date</span><span>Amount</span><span>Status</span><span></span>
                  </div>
                  {[1, 2, 3].map((n, i) => {
                    const dueDate = new Date(activeLoan.dueDate || new Date())
                    dueDate.setDate(dueDate.getDate() - (3 - n) * 30)
                    const amt = Math.round((activeLoan.repayableAmount || activeLoan.principalAmount * 1.08) / 3)
                    const status = i === 0 ? 'paid' : i === 1 ? 'pending' : 'upcoming'
                    return (
                      <div key={n} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 100px 120px 90px', gap: 10, alignItems: 'center', padding: '12px 2px', borderBottom: i < 2 ? '1px solid rgba(31,41,55,.08)' : 'none', fontSize: 13 }}>
                        <span style={{ fontFamily: 'IBM Plex Mono, monospace', color: '#94a3ae' }}>{n}</span>
                        <span>{dateLabel(dueDate)}</span>
                        <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700 }}>{fmtINR(amt)}</span>
                        <span><span style={pill(status)}>{status === 'paid' ? 'Paid' : status === 'pending' ? 'Due soon' : 'Upcoming'}</span></span>
                        <span>{status === 'pending' && (
                          <button onClick={() => handleRepay(activeLoan.id)} style={{ padding: '6px 14px', borderRadius: 100, background: '#1f2937', color: '#fdf3ef', fontSize: 11.2, fontWeight: 700, border: 'none', cursor: 'pointer' }}>Pay</button>
                        )}</span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p style={{ color: '#94a3ae', marginTop: 14, fontSize: 13 }}>No active loan to show schedule for.</p>
              )}
            </div>

            {/* Repay Now Card */}
            <div style={{ ...card({ background: 'linear-gradient(160deg,#fff,#fdf3ef)' }) }}>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: '#d99686', letterSpacing: '.05em', textTransform: 'uppercase' }}>Repayment due</div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 30, fontWeight: 700, marginTop: 10 }}>{fmtINR(nextDue)}</div>
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 6 }}>
                {activeLoan ? `Due on ${dateLabel(activeLoan.dueDate)}` : 'No active loans'}
              </div>
              {activeLoan && (
                <button onClick={() => handleRepay(activeLoan.id)} style={{ marginTop: 20, width: '100%', padding: 13, borderRadius: 12, background: '#1f2937', color: '#fdf3ef', fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  Repay now →
                </button>
              )}
              <p style={{ fontSize: 11.3, color: '#94a3ae', marginTop: 14 }}>Partial payments are accepted — pay any amount up to the total outstanding.</p>
            </div>
          </div>

          {/* Payment History */}
          <div style={card()}>
            <h4 style={{ fontSize: 15, marginBottom: 6 }}>Payment history</h4>
            {myLoans.filter(l => ['REPAID', 'CLOSED'].includes(l.status)).map((loan, i, arr) => (
              <div key={loan.id} style={{ ...actRow(true), ...(i === arr.length - 1 ? { borderBottom: 'none' } : {}) }}>
                <div style={actIc(true)}>✓</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>Loan fully repaid — {loan.purpose}</div>
                  <div style={{ fontSize: 11.5, color: '#94a3ae', marginTop: 2 }}>{dateLabel(loan.dueDate)}</div>
                </div>
                <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 13, color: '#64748b' }}>{fmtINR(loan.repayableAmount || loan.principalAmount * 1.08)}</div>
                <button style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 6, border: 'none', cursor: 'pointer', background: 'transparent', fontSize: 14, color: '#94a3ae' }} title="Download receipt">⬇️</button>
              </div>
            ))}
            {!myLoans.filter(l => ['REPAID', 'CLOSED'].includes(l.status)).length && (
              <p style={{ color: '#94a3ae', fontSize: 13 }}>No completed repayments yet.</p>
            )}
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
                style={{ display: 'flex', gap: 14, padding: '14px 6px', borderBottom: i < filteredNotifs.length - 1 ? '1px solid rgba(31,41,55,.08)' : 'none', alignItems: 'flex-start', borderRadius: 12, background: !n.isRead ? 'rgba(232,169,155,.06)' : 'transparent', cursor: 'pointer' }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 10, background: !n.isRead ? 'rgba(224,177,104,.22)' : 'rgba(143,191,163,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14, color: !n.isRead ? '#96712c' : '#6fa98f' }}>
                  {!n.isRead ? '🔔' : '✓'}
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
          {/* Support Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
            {[
              { icon: '❓', title: 'Browse FAQs', desc: 'Answers to common questions about requests & repayments.' },
              { icon: '✉️', title: 'Email support', desc: 'support@unifi.campus · replies within a day', action: 'Email us' },
              { icon: '⚠️', title: 'Raise a dispute', desc: 'Repayment not reflecting? Get an admin to step in.' },
            ].map(item => (
              <div key={item.title} style={{ ...card({ textAlign: 'center', padding: '24px 18px' }) }}>
                <div style={{ width: 42, height: 42, borderRadius: 13, background: 'rgba(232,169,155,.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 20 }}>{item.icon}</div>
                <h5 style={{ fontSize: 14 }}>{item.title}</h5>
                <p style={{ fontSize: 11.8, color: '#64748b', marginTop: 6, lineHeight: 1.5 }}>{item.desc}</p>
                {item.action && <button style={{ ...outlineBtn, marginTop: 14 }}>{item.action}</button>}
              </div>
            ))}
          </div>

          {/* FAQ Accordion */}
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

          {/* Support Ticket */}
          <form style={card()} onSubmit={handleSubmitTicket}>
            <h4 style={{ fontSize: 15 }}>Raise a support ticket</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 18px', marginTop: 6 }}>
              <div>
                <label style={fieldLabel}>CATEGORY</label>
                <select style={{ ...inputStyle, appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3ae' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center' }} value={ticketForm.category} onChange={e => setTicketForm(p => ({ ...p, category: e.target.value }))}>
                  <option value="REPAYMENT">Repayment issue</option>
                  <option value="KYC">KYC issue</option>
                  <option value="FUNDING">Request not funded</option>
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
