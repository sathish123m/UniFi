import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AppShell from '../components/AppShell'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

const sections = [
  { key: 'overview', label: 'Overview' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'kyc', label: 'KYC Queue' },
  { key: 'loans', label: 'Requests & Loans' },
  { key: 'defaults', label: 'Repayments & Defaults' },
  { key: 'disputes', label: 'Disputes' },
  { key: 'universities', label: 'Universities' },
  { key: 'policy', label: 'Policy Settings' },
  { key: 'audit', label: 'Audit Log' },
]

const fmtINR = (n = 0) => `₹${Number(n || 0).toLocaleString('en-IN')}`
const dateLabel = (v) =>
  v ? new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'
const timeLabel = (v) =>
  v ? new Date(v).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''
const cap = (s = '') => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()

const pillClass = (s = '') => {
  const lower = s.toLowerCase()
  if (['active', 'approved', 'funded'].includes(lower)) return 'approved'
  if (['pending'].includes(lower)) return 'pending'
  if (['defaulted', 'rejected', 'cancelled'].includes(lower)) return 'rejected'
  if (['repaid', 'closed'].includes(lower)) return 'completed'
  return 'pending'
}

// Inline styles for the admin theme
const S = {
  card: {
    background: 'var(--card-bg, rgba(18, 22, 32, 0.85))',
    border: '1px solid var(--card-border, rgba(255, 255, 255, 0.09))',
    color: 'var(--card-text, #f3f3fa)',
    borderRadius: 20,
    padding: 24,
    boxShadow: 'var(--card-shadow, 0 20px 40px -26px rgba(0,0,0,.5))',
    marginBottom: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  statGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 16,
    marginBottom: 20,
  },
  statCard: {
    background: 'var(--card-bg, rgba(18, 22, 32, 0.85))',
    border: '1px solid var(--card-border, rgba(255, 255, 255, 0.09))',
    color: 'var(--card-text, #f3f3fa)',
    borderRadius: 20,
    padding: 22,
    boxShadow: 'var(--card-shadow, 0 20px 40px -26px rgba(0,0,0,.5))',
  },
  statLabel: { fontSize: 12, color: 'var(--card-muted, #94a3ae)', fontWeight: 500 },
  statValue: { fontFamily: 'IBM Plex Mono, monospace', fontSize: 26, fontWeight: 700, marginTop: 8, color: 'var(--card-title, #ffffff)' },
  grid2: { display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 18, marginBottom: 20 },
  secHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', margin: '6px 0 16px', flexWrap: 'wrap', gap: 12 },
  acctRow: { display: 'flex', alignItems: 'center', gap: 14, padding: '15px 4px', borderBottom: '1px solid var(--row-border, rgba(255,255,255,0.08))', flexWrap: 'wrap' },
  acctAvatar: { width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg,#8fbfa3,#e8a99b)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, color: '#fff', flexShrink: 0 },
  pill: (type) => ({
    fontFamily: 'IBM Plex Mono, monospace',
    fontSize: 10.5,
    padding: '4px 10px',
    borderRadius: 100,
    textTransform: 'uppercase',
    letterSpacing: '.03em',
    ...(type === 'borrower' ? { background: 'rgba(232,169,155,.18)', color: '#d99686' }
      : type === 'provider' ? { background: 'rgba(143,191,163,.2)', color: '#6fa98f' }
      : type === 'approved' ? { background: 'rgba(143,191,163,.22)', color: '#6fa98f' }
      : type === 'pending' ? { background: 'rgba(224,177,104,.2)', color: '#96712c' }
      : type === 'rejected' ? { background: 'rgba(232,169,155,.32)', color: '#a13f2c' }
      : type === 'completed' ? { background: 'rgba(31,41,55,.08)', color: '#64748b' }
      : type === 'warn' ? { background: 'rgba(224,177,104,.2)', color: '#96712c' }
      : { background: 'rgba(31,41,55,.08)', color: '#64748b' }),
  }),
  approveBtn: { padding: '8px 16px', borderRadius: 100, background: '#8fbfa3', color: '#173829', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' },
  declineBtn: { padding: '8px 16px', borderRadius: 100, background: 'transparent', border: '1.5px solid rgba(31,41,55,.14)', color: '#64748b', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  outlineBtn: { padding: '8px 14px', borderRadius: 12, border: '1.5px solid rgba(31,41,55,.14)', fontWeight: 600, fontSize: 12, color: '#1f2937', background: 'transparent', cursor: 'pointer' },
  darkBtn: { padding: '12px 22px', borderRadius: 12, background: '#1f2937', color: '#fdf3ef', fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 },
  segTabs: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  segTab: (active) => ({ padding: '9px 18px', borderRadius: 100, fontSize: 12.5, fontWeight: 600, color: active ? '#fdf3ef' : '#64748b', background: active ? '#1f2937' : 'rgba(31,41,55,.05)', border: 'none', cursor: 'pointer' }),
  balRow: { display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid rgba(31,41,55,.08)', fontSize: 12.6, gap: 10 },
  actRow: { display: 'flex', alignItems: 'center', gap: 13, padding: '13px 0', borderBottom: '1px solid rgba(31,41,55,.08)' },
  actIc: (good) => ({ width: 34, height: 34, borderRadius: 10, background: good ? 'rgba(143,191,163,.18)' : 'rgba(31,41,55,.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14 }),
  toggleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 0', borderBottom: '1px solid rgba(31,41,55,.08)', gap: 12 },
  fieldLabel: { fontSize: 11.2, color: '#94a3ae', fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '.04em', display: 'block', marginBottom: 6 },
  input: { width: '100%', padding: '12px 15px', borderRadius: 10, background: '#f5f8fa', border: '1.5px solid rgba(31,41,55,.08)', color: '#1f2937', fontSize: 14, fontFamily: 'Inter, sans-serif', boxSizing: 'border-box', marginBottom: 0 },
  drawerOverlay: (open) => ({ position: 'fixed', inset: 0, background: 'rgba(31,41,55,.4)', zIndex: 150, display: open ? 'block' : 'none' }),
  drawer: (open) => ({ position: 'fixed', top: 0, right: 0, bottom: 0, width: 440, maxWidth: '92vw', background: '#eef4f8', zIndex: 151, transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform .3s cubic-bezier(.2,.7,.2,1)', overflowY: 'auto', padding: '28px 26px 50px', boxShadow: '-30px 0 60px -20px rgba(0,0,0,.3)' }),
  drawerCard: { background: '#fff', borderRadius: 16, padding: 18, marginTop: 14, boxShadow: '0 20px 40px -26px rgba(31,41,55,.22)' },
  kycItem: { display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '1px solid rgba(31,41,55,.08)' },
  kii: (done) => ({ width: 34, height: 34, borderRadius: 10, background: done ? 'rgba(143,191,163,.2)' : 'rgba(31,41,55,.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: done ? '#6fa98f' : '#64748b', fontSize: 14 }),
}
const EMPTY_POLICY = {
  minLoanAmount: '', maxLoanAmount: '',
  scoreTier1MinScore: '', scoreTier1Limit: '',
  scoreTier2MinScore: '', scoreTier2Limit: '',
  scoreTier3MinScore: '', scoreTier3Limit: '',
  providerAcceptWindowHours: '', providerFundWindowHours: '',
}

export default function AdminPanel() {
  const { accessToken, user, logout } = useAuth()
  const { section: activeSection = 'overview' } = useParams()
  const navigate = useNavigate()
  const setActiveSection = (sec) => navigate(`/admin/${sec}`)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const [stats, setStats] = useState(null)
  const [kycQueue, setKycQueue] = useState([])
  const [users, setUsers] = useState([])
  const [loans, setLoans] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [collections, setCollections] = useState([])
  const [config, setConfig] = useState(null)

  // Disputes + multi-campus management
  const [disputes, setDisputes] = useState([])
  const [universities, setUniversities] = useState([])
  const [uniForm, setUniForm] = useState({ name: '', shortName: '', emailDomain: '', city: '', state: '' })

  // UI state
  const [loanTab, setLoanTab] = useState('all')
  const [accountTab, setAccountTab] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [drawerUser, setDrawerUser] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  // Government ID numbers are masked by default so they are not shoulder-surfed
  // or captured in screenshots during routine reviews. An admin must explicitly
  // reveal them for a single drawer view.
  const [revealPii, setRevealPii] = useState(false)

  // Policy form — hydrated from the live platform config
  const [policy, setPolicy] = useState(EMPTY_POLICY)

  const canWriteConfig = ['SUPER_ADMIN', 'FINANCE_ADMIN'].includes(user?.role)
  const canReviewKyc = ['SUPER_ADMIN', 'MOD_ADMIN'].includes(user?.role)
  const canViewUniversities = user?.role === 'SUPER_ADMIN'

  // Only show nav items the signed-in admin is authorised to use.
  const navSections = useMemo(
    () => sections.filter((s) => {
      if (s.key === 'universities') return canViewUniversities
      return true
    }),
    [canViewUniversities],
  )

  const hydratePolicy = (cfg) => {
    if (!cfg) return
    setPolicy({
      minLoanAmount: cfg.minLoanAmount,
      maxLoanAmount: cfg.maxLoanAmount,
      scoreTier1MinScore: cfg.scoreTier1MinScore,
      scoreTier1Limit: cfg.scoreTier1Limit,
      scoreTier2MinScore: cfg.scoreTier2MinScore,
      scoreTier2Limit: cfg.scoreTier2Limit,
      scoreTier3MinScore: cfg.scoreTier3MinScore,
      scoreTier3Limit: cfg.scoreTier3Limit,
      providerAcceptWindowHours: cfg.providerAcceptWindowHours,
      providerFundWindowHours: cfg.providerFundWindowHours,
    })
  }

  const reload = async () => {
    setLoading(true)
    setError('')
    try {
      const [s, k, u, l, a, c, col, disp, uni] = await Promise.all([
        api.get('/admin/stats', accessToken),
        api.get('/admin/kyc/queue', accessToken),
        api.get('/admin/users', accessToken),
        api.get('/admin/loans', accessToken),
        api.get('/admin/audit', accessToken).catch(() => ({ data: [] })),
        api.get('/admin/config', accessToken).catch(() => ({ data: null })),
        api.get('/admin/collections/queue', accessToken).catch(() => ({ data: [] })),
        api.get('/admin/disputes', accessToken).catch(() => ({ data: [] })),
        api.get('/admin/universities', accessToken).catch(() => ({ data: [] })),
      ])
      setStats(s.data)
      setKycQueue(k.data || [])
      setUsers(u.data?.users || [])
      setLoans(l.data?.loans || [])
      setAuditLogs(a.data || [])
      setConfig(c.data || null)
      setCollections(col.data || [])
      setDisputes(disp.data || [])
      setUniversities(uni.data || [])
      hydratePolicy(c.data)
    } catch (err) {
      setError(err.message || 'Failed to load admin panel')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { reload() }, [])

  useEffect(() => {
    if (!drawerUser) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') { setDrawerUser(null); setRejectReason('') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerUser])

  // Never keep a revealed ID number on screen after switching users.
  useEffect(() => { setRevealPii(false) }, [drawerUser?.id])

  const maskAadhaar = (value) => {
    const digits = String(value || '').replace(/\D/g, '')
    if (digits.length < 4) return '•••• •••• ••••'
    return `•••• •••• ${digits.slice(-4)}`
  }
  const maskPan = (value) => {
    const pan = String(value || '').toUpperCase()
    if (pan.length < 4) return '••••••••••'
    return `${pan.slice(0, 2)}••••••${pan.slice(-2)}`
  }

  const flash = (msg) => { setMessage(msg); setError('') }

  const handleKyc = async (userId, action) => {
    setBusy(true)
    try {
      await api.patch(`/admin/kyc/${userId}`, {
        action,
        ...(action === 'REJECTED' && { reason: rejectReason || 'Documents unclear or incomplete' }),
      }, accessToken)
      flash(`KYC ${action === 'APPROVED' ? 'approved' : 'rejected'}.`)
      setDrawerUser(null)
      setRejectReason('')
      await reload()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const handleUserStatus = async (userId, action) => {
    setBusy(true)
    try {
      await api.patch(`/admin/users/${userId}/status`, { action }, accessToken)
      const verb = action === 'RESTORE' ? 'restored' : action === 'BAN' ? 'banned' : 'suspended'
      flash(`Account ${verb}.`)
      setDrawerUser(null)
      await reload()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const handleRunSweep = async () => {
    setBusy(true)
    try {
      const res = await api.post('/admin/collections/sweep', {}, accessToken)
      const d = res.data || {}
      flash(`Collections sweep complete — ${d.scanned ?? 0} loan(s) scanned, ${d.updated ?? 0} updated, ${d.defaulted ?? 0} newly defaulted.`)
      await reload()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const handleSaveConfig = async () => {
    setBusy(true)
    try {
      const payload = {}
      Object.entries(policy).forEach(([k, v]) => {
        if (v === '' || v === null || v === undefined) return
        payload[k] = Number(v)
      })
      const res = await api.post('/admin/config', payload, accessToken)
      setConfig(res.data)
      hydratePolicy(res.data)
      flash('Platform configuration saved. New values apply to future loans.')
      await reload()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const handleForceActive = async (loanId) => {
    setBusy(true)
    try {
      await api.post(`/admin/loans/${loanId}/force-active`, {}, accessToken)
      flash('Loan marked active (handover confirmed offline).')
      await reload()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const handleForceRepaid = async (loanId) => {
    setBusy(true)
    try {
      await api.post(`/admin/loans/${loanId}/force-repaid`, {}, accessToken)
      flash('Loan marked repaid (repayment confirmed offline).')
      await reload()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const handleAddUniversity = async () => {
    setBusy(true)
    try {
      await api.post('/admin/universities', uniForm, accessToken)
      flash(`University "${uniForm.name}" added and open for signups.`)
      setUniForm({ name: '', shortName: '', emailDomain: '', city: '', state: '' })
      await reload()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const handleToggleUniversity = async (uni) => {
    setBusy(true)
    try {
      await api.patch(`/admin/universities/${uni.id}`, { isActive: !uni.isActive }, accessToken)
      flash(`${uni.name} ${uni.isActive ? 'disabled' : 'enabled'} for new signups.`)
      await reload()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const roleMatch = accountTab === 'all' || u.role?.toLowerCase() === accountTab
      const searchMatch = !searchQuery || `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(searchQuery.toLowerCase())
      return roleMatch && searchMatch
    })
  }, [users, accountTab, searchQuery])

  const filteredLoans = useMemo(() => {
    if (loanTab === 'all') return loans
    return loans.filter(l => l.status === loanTab)
  }, [loans, loanTab])

  const pendingKycCount = stats?.pendingKyc ?? kycQueue.length
  const pendingKycBadge = pendingKycCount > 0 ? pendingKycCount : null
  const overdueCount = collections.length

  return (
    <>
      {/* Drawer Overlay */}
      <div style={S.drawerOverlay(!!drawerUser)} onClick={() => { setDrawerUser(null); setRejectReason('') }} />

      {/* Account Detail Drawer */}
      <aside
        style={S.drawer(!!drawerUser)}
        role="dialog"
        aria-modal="true"
        aria-label={drawerUser ? `Account details for ${drawerUser.firstName || ''} ${drawerUser.lastName || ''}`.trim() : 'Account details'}
        aria-hidden={!drawerUser}
      >
        {drawerUser && (
          <>
            <button onClick={() => { setDrawerUser(null); setRejectReason('') }} style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(31,41,55,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18, border: 'none', cursor: 'pointer', fontSize: 16 }}>✕</button>

            {/* Drawer Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ ...S.acctAvatar, width: 52, height: 52, fontSize: 17 }}>
                {drawerUser.firstName?.[0]}{drawerUser.lastName?.[0]}
              </div>
              <div>
                <h3 style={{ fontSize: 18, margin: 0 }}>{drawerUser.firstName} {drawerUser.lastName}</h3>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                  {drawerUser.university?.name || drawerUser.university?.shortName || 'University not linked'}
                  {drawerUser.createdAt ? ` · Joined ${dateLabel(drawerUser.createdAt)}` : ''}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              {drawerUser.role && <span style={S.pill(drawerUser.role?.toLowerCase())}>{drawerUser.role}</span>}
              <span style={S.pill(pillClass(drawerUser.kycStatus || 'pending'))}>KYC {cap(drawerUser.kycStatus || 'PENDING')}</span>
              <span style={S.pill(drawerUser.isBanned || drawerUser.isSuspended ? 'rejected' : 'approved')}>
                {drawerUser.isBanned ? 'Banned' : drawerUser.isSuspended ? 'Suspended' : 'Active'}
              </span>
            </div>

            {/* Contact & Profile */}
            <div style={S.drawerCard}>
              <h4 style={{ fontSize: 13.5, marginBottom: 8 }}>Contact & profile</h4>
              <div style={S.balRow}><span style={{ color: '#64748b' }}>Email</span><b style={{ fontWeight: 500 }}>{drawerUser.email}</b></div>
              <div style={S.balRow}><span style={{ color: '#64748b' }}>Phone</span><b style={{ fontWeight: 500 }}>{drawerUser.phone || 'Not provided'}</b></div>
              <div style={S.balRow}><span style={{ color: '#64748b' }}>Student ID</span><b style={{ fontWeight: 500 }}>{drawerUser.studentIdNumber || 'N/A'}</b></div>
              {typeof drawerUser.creditScore === 'number' && (
                <div style={S.balRow}><span style={{ color: '#64748b' }}>Credit score</span><b style={{ fontWeight: 500 }}>{drawerUser.creditScore}</b></div>
              )}
              {typeof drawerUser.borrowLimit === 'number' && (
                <div style={{ ...S.balRow, borderBottom: 'none' }}><span style={{ color: '#64748b' }}>Borrow limit</span><b style={{ fontWeight: 500 }}>{fmtINR(drawerUser.borrowLimit)}</b></div>
              )}
            </div>

            {/* KYC documents — only shown when the record carries document data */}
            {drawerUser.kycDocument && (
              <div style={S.drawerCard}>
                <h4 style={{ fontSize: 13.5, marginBottom: 8 }}>KYC documents</h4>
                {[
                  ['Student ID (front)', !!drawerUser.kycDocument.studentIdFrontKey],
                  ['Student ID (back)', !!drawerUser.kycDocument.studentIdBackKey],
                  ['Live selfie', !!drawerUser.kycDocument.selfieKey],
                  ['Aadhaar (front)', !!drawerUser.kycDocument.aadhaarFrontKey],
                  ['Aadhaar (back)', !!drawerUser.kycDocument.aadhaarBackKey],
                  ['PAN card', !!drawerUser.kycDocument.panDocKey],
                ].map(([label, done]) => (
                  <div key={label} style={S.kycItem}>
                    <div style={S.kii(done)}>{done ? '✓' : '○'}</div>
                    <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div></div>
                    <span style={S.pill(done ? 'approved' : 'pending')}>{done ? 'Uploaded' : 'Missing'}</span>
                  </div>
                ))}
                {(drawerUser.kycDocument.aadhaarNumber || drawerUser.kycDocument.panNumber) && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(31,41,55,.08)' }}>
                    {drawerUser.kycDocument.aadhaarNumber && (
                      <div style={S.balRow}>
                        <span style={{ color: '#64748b' }}>Aadhaar no.</span>
                        <b style={{ fontWeight: 500, fontFamily: 'IBM Plex Mono, monospace' }}>
                          {revealPii ? drawerUser.kycDocument.aadhaarNumber : maskAadhaar(drawerUser.kycDocument.aadhaarNumber)}
                        </b>
                      </div>
                    )}
                    {drawerUser.kycDocument.panNumber && (
                      <div style={{ ...S.balRow, borderBottom: 'none' }}>
                        <span style={{ color: '#64748b' }}>PAN</span>
                        <b style={{ fontWeight: 500, fontFamily: 'IBM Plex Mono, monospace' }}>
                          {revealPii ? drawerUser.kycDocument.panNumber : maskPan(drawerUser.kycDocument.panNumber)}
                        </b>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setRevealPii((v) => !v)}
                      style={{ marginTop: 8, background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 12, padding: 0 }}
                    >
                      {revealPii ? 'Hide full ID numbers' : 'Reveal full ID numbers'}
                    </button>
                  </div>
                )}
                <div style={{ fontSize: 11.3, color: '#94a3ae', marginTop: 8 }}>
                  Submitted {dateLabel(drawerUser.kycDocument.submittedAt)} · format-validated on submission
                </div>
              </div>
            )}

            {/* KYC review actions */}
            {canReviewKyc && drawerUser.kycStatus === 'PENDING' && (
              <div style={S.drawerCard}>
                <h4 style={{ fontSize: 13.5, marginBottom: 8 }}>Review KYC</h4>
                <label style={S.fieldLabel}>REJECTION REASON (optional)</label>
                <input style={S.input} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Shown to the applicant if rejected" />
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button style={S.approveBtn} disabled={busy} onClick={() => handleKyc(drawerUser.id, 'APPROVED')}>Approve KYC</button>
                  <button style={S.declineBtn} disabled={busy} onClick={() => handleKyc(drawerUser.id, 'REJECTED')}>Reject KYC</button>
                </div>
              </div>
            )}

            {/* Account status actions */}
            {canReviewKyc && drawerUser.role && (
              <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                {drawerUser.isBanned || drawerUser.isSuspended ? (
                  <button style={S.outlineBtn} disabled={busy} onClick={() => handleUserStatus(drawerUser.id, 'RESTORE')}>Reinstate account</button>
                ) : (
                  <>
                    <button style={S.outlineBtn} disabled={busy} onClick={() => handleUserStatus(drawerUser.id, 'SUSPEND')}>Suspend account</button>
                    <button style={S.declineBtn} disabled={busy} onClick={() => handleUserStatus(drawerUser.id, 'BAN')}>Ban account</button>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </aside>

      <AppShell
        baseRoute="/admin"
        sections={navSections}
        onLogout={logout}
        user={user}
        badgeCounts={{ kyc: pendingKycBadge }}
      >
        {error && <div className="portal-alert error" style={{ marginBottom: 20 }}>{error}</div>}
        {message && <div className="portal-alert success" style={{ marginBottom: 20, cursor: 'pointer' }} onClick={() => setMessage('')}>{message}</div>}

        {loading && (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading admin data…</div>
        )}

        {/* ===== 1. OVERVIEW ===== */}
        {!loading && activeSection === 'overview' && (
          <section>
            <div style={S.statGrid}>
              <div style={S.statCard}>
                <div style={S.statLabel}>Total accounts</div>
                <div style={S.statValue}>{stats?.users ?? 0}</div>
                <div style={{ fontSize: 11.5, color: '#94a3ae', marginTop: 6 }}>Borrowers &amp; providers</div>
              </div>
              <div style={S.statCard}>
                <div style={S.statLabel}>Loan requests (all time)</div>
                <div style={S.statValue}>{stats?.loans ?? 0}</div>
                <div style={{ fontSize: 11.5, color: '#94a3ae', marginTop: 6 }}>{stats?.activeLoan ?? 0} currently active</div>
              </div>
              <div style={S.statCard}>
                <div style={S.statLabel}>Open disputes</div>
                <div style={{ ...S.statValue, color: (stats?.disputes ?? 0) > 0 ? '#a13f2c' : undefined }}>{stats?.disputes ?? 0}</div>
                <div style={{ fontSize: 11.5, color: '#94a3ae', marginTop: 6 }}>Flagged by a borrower or lender</div>
              </div>
              <div style={S.statCard}>
                <div style={S.statLabel}>Pending KYC reviews</div>
                <div style={{ ...S.statValue, color: pendingKycCount > 0 ? '#96712c' : undefined }}>{pendingKycCount}</div>
                <div style={{ fontSize: 11.5, color: '#94a3ae', marginTop: 6 }}>{overdueCount} loan(s) overdue</div>
              </div>
            </div>

            <div style={S.grid2}>
              {/* Needs Attention */}
              <div style={S.card}>
                <h4 style={{ fontSize: 15, marginBottom: 12 }}>Needs attention</h4>
                <div>
                  {[
                    { label: 'Pending KYC reviews', val: pendingKycCount, color: '#96712c', sec: 'kyc' },
                    { label: 'Overdue / defaulted loans', val: overdueCount, color: '#a13f2c', sec: 'defaults' },
                    { label: 'Open disputes', val: stats?.disputes ?? 0, color: '#a13f2c', sec: 'disputes' },
                    { label: 'Active loans', val: stats?.activeLoan ?? 0, color: '#96712c', sec: 'loans' },
                    { label: 'Total accounts', val: stats?.users ?? 0, color: '#1f2937', sec: 'accounts' },
                  ].map(item => (
                    <div key={item.label} onClick={() => setActiveSection(item.sec)} style={{ ...S.balRow, cursor: 'pointer' }}>
                      <span style={{ color: '#64748b' }}>{item.label}</span>
                      <b style={{ fontFamily: 'IBM Plex Mono, monospace', color: item.color }}>{item.val}</b>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent admin activity — real audit log */}
              <div style={S.card}>
                <h4 style={{ fontSize: 15, marginBottom: 6 }}>Recent admin activity</h4>
                {auditLogs.length === 0 && <p style={{ color: '#94a3ae', fontSize: 13 }}>No audit entries yet.</p>}
                {auditLogs.slice(0, 5).map((log, i) => (
                  <div key={log.id || i} style={{ ...S.actRow, ...(i === Math.min(auditLogs.length, 5) - 1 ? { borderBottom: 'none' } : {}) }}>
                    <div style={S.actIc(true)}>✓</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13.3, fontWeight: 500 }}>{log.description || log.action}</div>
                      <div style={{ fontSize: 11.3, color: '#94a3ae', marginTop: 2 }}>
                        {log.admin?.firstName || log.admin?.email || 'Admin'} · {timeLabel(log.createdAt)}
                      </div>
                    </div>
                  </div>
                ))}
                <button style={{ ...S.outlineBtn, marginTop: 14 }} onClick={() => setActiveSection('audit')}>View full audit log</button>
              </div>
            </div>

            {/* Quick Actions */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
              {[
                { icon: '🆔', label: 'Review KYC queue', sec: 'kyc' },
                { icon: '👥', label: 'View all accounts', sec: 'accounts' },
                { icon: '📄', label: 'Requests & loans', sec: 'loans' },
                { icon: '⚙️', label: 'Policy settings', sec: 'policy' },
              ].map(qa => (
                <button key={qa.sec} onClick={() => setActiveSection(qa.sec)} style={{ background: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 20px 40px -26px rgba(31,41,55,.22)', display: 'flex', flexDirection: 'column', gap: 10, border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ width: 38, height: 38, borderRadius: 11, background: 'rgba(224,177,104,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{qa.icon}</div>
                  <span style={{ fontSize: 13.2, fontWeight: 700 }}>{qa.label}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ===== 2. ACCOUNTS ===== */}
        {!loading && activeSection === 'accounts' && (
          <section>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3ae' }}>🔍</span>
                <input
                  type="text"
                  placeholder="Search by name or email…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ width: '100%', padding: '11px 16px 11px 40px', borderRadius: 100, background: '#fff', border: '1.5px solid rgba(31,41,55,.08)', fontSize: 13.5, fontFamily: 'Inter', color: '#1f2937', boxSizing: 'border-box' }}
                />
              </div>
              <div style={S.segTabs}>
                {['all', 'borrower', 'provider'].map(t => (
                  <button key={t} style={S.segTab(accountTab === t)} onClick={() => setAccountTab(t)}>{cap(t)}{t === 'all' ? '' : 's'}</button>
                ))}
              </div>
            </div>

            <div style={S.card}>
              {filteredUsers.length === 0 && <p style={{ color: '#94a3ae', fontSize: 13 }}>No accounts found.</p>}
              {filteredUsers.map((u, i) => (
                <div key={u.id} style={{ ...S.acctRow, ...(i === filteredUsers.length - 1 ? { borderBottom: 'none' } : {}) }}>
                  <div style={S.acctAvatar}>{u.firstName?.[0]}{u.lastName?.[0]}</div>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {u.firstName} {u.lastName}
                      <span style={S.pill(u.role?.toLowerCase())}>{u.role}</span>
                      {u.isBanned && <span style={S.pill('rejected')}>Banned</span>}
                      {!u.isBanned && u.isSuspended && <span style={S.pill('rejected')}>Suspended</span>}
                    </div>
                    <div style={{ fontSize: 11.3, color: '#94a3ae', marginTop: 4 }}>
                      {u.email} · Score {u.creditScore ?? '—'}
                    </div>
                  </div>
                  <span style={{ ...S.pill(pillClass(u.kycStatus || 'pending')), margin: '0 10px' }}>{cap(u.kycStatus || 'PENDING')}</span>
                  <button style={S.outlineBtn} onClick={() => setDrawerUser(u)}>Review</button>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11.5, color: '#94a3ae' }}>Showing the most recent {users.length} accounts.</p>
          </section>
        )}

        {/* ===== 3. KYC QUEUE ===== */}
        {!loading && activeSection === 'kyc' && (
          <section>
            <div style={S.secHead}>
              <h2 style={{ fontSize: 17 }}>Pending verification</h2>
              <span style={{ fontSize: 12.5, color: '#94a3ae' }}>Sorted by oldest submission first</span>
            </div>
            <div style={S.card}>
              {kycQueue.length === 0 && (
                <p style={{ fontSize: 13, color: '#94a3ae', padding: '20px 4px' }}>No pending KYC submissions — all caught up.</p>
              )}
              {kycQueue.map((item, i) => (
                <div key={item.id} style={{ ...S.acctRow, ...(i === kycQueue.length - 1 ? { borderBottom: 'none' } : {}) }}>
                  <div style={S.acctAvatar}>{item.firstName?.[0]}{item.lastName?.[0]}</div>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {item.firstName} {item.lastName}
                      <span style={S.pill(item.role?.toLowerCase())}>{item.role}</span>
                    </div>
                    <div style={{ fontSize: 11.3, color: '#94a3ae', marginTop: 4 }}>
                      {item.email} · ID {item.kycDocument?.studentIdFrontKey ? '✓' : '—'} · Selfie {item.kycDocument?.selfieKey ? '✓' : '—'} · Aadhaar {item.kycDocument?.aadhaarFrontKey ? '✓' : '—'} · PAN {item.kycDocument?.panDocKey ? '✓' : '—'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {canReviewKyc && (
                      <>
                        <button style={S.declineBtn} disabled={busy} onClick={() => handleKyc(item.id, 'REJECTED')}>Reject</button>
                        <button style={S.approveBtn} disabled={busy} onClick={() => handleKyc(item.id, 'APPROVED')}>Approve</button>
                      </>
                    )}
                    <button style={S.outlineBtn} onClick={() => setDrawerUser(item)}>Details</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ===== 4. REQUESTS & LOANS ===== */}
        {!loading && activeSection === 'loans' && (
          <section>
            <div style={S.segTabs}>
              {[
                { key: 'all', label: 'All' },
                { key: 'PENDING', label: 'Pending match' },
                { key: 'FUNDED', label: 'Funded' },
                { key: 'ACTIVE', label: 'Active' },
                { key: 'REPAID', label: 'Repaid' },
                { key: 'DEFAULTED', label: 'Defaulted' },
                { key: 'CANCELLED', label: 'Cancelled' },
              ].map(t => (
                <button key={t.key} style={S.segTab(loanTab === t.key)} onClick={() => setLoanTab(t.key)}>{t.label}</button>
              ))}
            </div>

            {filteredLoans.length === 0 && (
              <div style={{ ...S.card, textAlign: 'center', color: '#94a3ae', padding: 30 }}>No loans found for this filter.</div>
            )}

            {filteredLoans.map(loan => (
              <div key={loan.id} style={{ ...S.card, marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.6 }}>
                      {cap(loan.purpose || 'Loan request')} · <span style={{ fontFamily: 'IBM Plex Mono, monospace', color: '#94a3ae' }}>{loan.publicId || loan.id.slice(0, 8)}</span>
                    </div>
                    <div style={{ fontSize: 11.3, color: '#94a3ae', marginTop: 4 }}>
                      {loan.borrower?.firstName || 'Borrower'} → {loan.provider?.firstName ? loan.provider.firstName : 'awaiting a provider'}
                      {loan.dueAt ? ` · Due ${dateLabel(loan.dueAt)}` : ''}
                    </div>
                  </div>
                  <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 13, color: '#64748b', flexShrink: 0 }}>{fmtINR(loan.principalAmount)}</div>
                  <span style={{ ...S.pill(pillClass(loan.status)), margin: '0 10px' }}>{cap(loan.status || 'PENDING')}</span>
                </div>
              </div>
            ))}
            <p style={{ fontSize: 11.5, color: '#94a3ae' }}>Showing the most recent {loans.length} requests.</p>
          </section>
        )}

        {/* ===== 5. REPAYMENTS & DEFAULTS ===== */}
        {!loading && activeSection === 'defaults' && (
          <section>
            <div style={S.secHead}>
              <h2 style={{ fontSize: 17 }}>Collections & delinquency</h2>
              {canWriteConfig && (
                <button style={S.darkBtn} disabled={busy} onClick={handleRunSweep}>Run collections sweep</button>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 20 }}>
              <div style={S.statCard}>
                <div style={S.statLabel}>Overdue / defaulted loans</div>
                <div style={{ ...S.statValue, color: overdueCount > 0 ? '#a13f2c' : undefined }}>{overdueCount}</div>
              </div>
              <div style={S.statCard}>
                <div style={S.statLabel}>Marked defaulted</div>
                <div style={{ ...S.statValue, color: '#96712c' }}>{collections.filter(l => l.status === 'DEFAULTED').length}</div>
              </div>
              <div style={S.statCard}>
                <div style={S.statLabel}>Default rate (of all loans)</div>
                <div style={{ ...S.statValue, color: '#96712c' }}>
                  {stats?.loans > 0 ? ((collections.filter(l => l.status === 'DEFAULTED').length / stats.loans) * 100).toFixed(1) : '0.0'}%
                </div>
              </div>
            </div>

            <div style={S.card}>
              {collections.length === 0 && (
                <p style={{ fontSize: 13, color: '#94a3ae', padding: '12px 4px' }}>No overdue or defaulted loans. 🎉</p>
              )}
              {collections.map((loan, i) => (
                <div key={loan.id} style={{ ...S.acctRow, ...(i === collections.length - 1 ? { borderBottom: 'none' } : {}) }}>
                  <div style={S.acctAvatar}>{loan.borrower?.firstName?.[0]}{loan.borrower?.lastName?.[0]}</div>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {loan.borrower?.firstName} {loan.borrower?.lastName}
                      <span style={S.pill(pillClass(loan.status))}>{cap(loan.status)}</span>
                    </div>
                    <div style={{ fontSize: 11.3, color: '#94a3ae', marginTop: 4 }}>
                      {fmtINR(loan.principalAmount)} · Due {dateLabel(loan.dueAt)} · {loan.overdueDays || 0} day(s) overdue
                    </div>
                  </div>
                  {loan.borrower?.id && (
                    <button style={S.outlineBtn} onClick={() => setDrawerUser(loan.borrower)}>View borrower</button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ===== 6. DISPUTES ===== */}
        {!loading && activeSection === 'disputes' && (
          <section>
            <div style={S.card}>
              <h4 style={{ fontSize: 15, marginBottom: 4 }}>Disputed loans</h4>
              <p style={{ fontSize: 12.4, color: '#94a3ae', marginBottom: 12 }}>
                A borrower or lender flagged these. UniFi moves no money, so resolution is mediation and recording:
                confirm the handover or the repayment offline, then set the loan to the correct state below.
              </p>
              {disputes.length === 0 && <p style={{ color: '#94a3ae', fontSize: 13 }}>No disputes.</p>}
              {disputes.map((loan, i) => (
                <div key={loan.id} style={{ ...S.acctRow, alignItems: 'flex-start', ...(i === disputes.length - 1 ? { borderBottom: 'none' } : {}) }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{loan.publicId} · {fmtINR(loan.principalAmount)} · {cap(loan.status || '')}</div>
                    <div style={{ fontSize: 11.6, color: '#94a3ae', marginTop: 2 }}>
                      {loan.borrower?.email || 'borrower'} ⇄ {loan.provider?.email || 'lender'}
                    </div>
                    {loan.disputeReason && <div style={{ fontSize: 12, color: '#a13f2c', marginTop: 6 }}>“{loan.disputeReason}”</div>}
                    <div style={{ fontSize: 11, color: '#94a3ae', marginTop: 4 }}>Raised {timeLabel(loan.disputedAt)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {loan.status === 'FUNDED' && (
                      <button style={S.outlineBtn} disabled={busy} onClick={() => handleForceActive(loan.id)}>Force active</button>
                    )}
                    {['ACTIVE', 'DEFAULTED'].includes(loan.status) && (
                      <button style={S.approveBtn} disabled={busy} onClick={() => handleForceRepaid(loan.id)}>Mark repaid</button>
                    )}
                    {loan.borrower?.id && (
                      <button style={S.outlineBtn} onClick={() => setDrawerUser(loan.borrower)}>View borrower</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ===== 7. UNIVERSITIES ===== */}
        {!loading && activeSection === 'universities' && (
          <section>
            <div style={S.card}>
              <h4 style={{ fontSize: 15, marginBottom: 4 }}>Add a campus</h4>
              <p style={{ fontSize: 12.2, color: '#94a3ae', marginBottom: 14 }}>
                The database is the source of truth for allowed signup domains. Adding a university here opens it
                immediately — no redeploy needed. See <code>docs/MULTI_UNIVERSITY.md</code>.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14 }}>
                <div>
                  <label style={S.fieldLabel}>NAME</label>
                  <input style={S.input} value={uniForm.name} onChange={e => setUniForm(f => ({ ...f, name: e.target.value }))} placeholder="Lovely Professional University" />
                </div>
                <div>
                  <label style={S.fieldLabel}>SHORT NAME</label>
                  <input style={S.input} value={uniForm.shortName} onChange={e => setUniForm(f => ({ ...f, shortName: e.target.value }))} placeholder="LPU" />
                </div>
                <div>
                  <label style={S.fieldLabel}>EMAIL DOMAIN</label>
                  <input style={S.input} value={uniForm.emailDomain} onChange={e => setUniForm(f => ({ ...f, emailDomain: e.target.value }))} placeholder="lpu.in" />
                </div>
                <div>
                  <label style={S.fieldLabel}>CITY</label>
                  <input style={S.input} value={uniForm.city} onChange={e => setUniForm(f => ({ ...f, city: e.target.value }))} placeholder="Phagwara" />
                </div>
                <div>
                  <label style={S.fieldLabel}>STATE</label>
                  <input style={S.input} value={uniForm.state} onChange={e => setUniForm(f => ({ ...f, state: e.target.value }))} placeholder="Punjab" />
                </div>
              </div>
              <button style={{ ...S.darkBtn, marginTop: 16 }} disabled={busy} onClick={handleAddUniversity}>Add university</button>
            </div>

            <div style={S.card}>
              <h4 style={{ fontSize: 15, marginBottom: 12 }}>Campuses ({universities.length})</h4>
              {universities.length === 0 && <p style={{ color: '#94a3ae', fontSize: 13 }}>No universities configured.</p>}
              {universities.map((uni, i) => (
                <div key={uni.id} style={{ ...S.acctRow, ...(i === universities.length - 1 ? { borderBottom: 'none' } : {}) }}>
                  <div style={S.acctAvatar}>{(uni.shortName || uni.name || 'U')[0].toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{uni.name}</div>
                    <div style={{ fontSize: 11.6, color: '#94a3ae', marginTop: 2 }}>
                      @{uni.emailDomain} · {uni.city}, {uni.state} · {uni._count?.users ?? 0} user(s)
                    </div>
                  </div>
                  <span style={S.pill(uni.isActive ? 'approved' : 'rejected')}>{uni.isActive ? 'Active' : 'Disabled'}</span>
                  <button style={S.outlineBtn} disabled={busy} onClick={() => handleToggleUniversity(uni)}>
                    {uni.isActive ? 'Disable signups' : 'Enable signups'}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ===== 8. POLICY SETTINGS ===== */}
        {!loading && activeSection === 'policy' && (
          <section>
            {!config && (
              <div style={{ ...S.card, color: '#94a3ae' }}>No platform configuration found yet. Saving will create the first config record.</div>
            )}
            {!canWriteConfig && (
              <div className="portal-alert" style={{ marginBottom: 16, fontSize: 13 }}>
                You have read-only access to platform policy. Only Super Admin and Finance Admin can change these values.
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
              <div style={S.card}>
                <h4 style={{ fontSize: 15, marginBottom: 4 }}>Economics</h4>
                <p style={{ fontSize: 12.2, color: '#64748b', marginBottom: 12 }}>Fixed by design.</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={S.fieldLabel}>INTEREST</label>
                    <input style={{ ...S.input, opacity: 0.6 }} value="None (interest-free)" disabled />
                  </div>
                  <div>
                    <label style={S.fieldLabel}>PLATFORM FEE</label>
                    <input style={{ ...S.input, opacity: 0.6 }} value="None" disabled />
                  </div>
                </div>
                <p style={{ fontSize: 11.4, color: '#94a3ae', marginTop: 10 }}>UniFi is non-custodial and charges no interest or fees; peers settle directly.</p>
              </div>

              <div style={S.card}>
                <h4 style={{ fontSize: 15, marginBottom: 4 }}>Loan amount limits</h4>
                <p style={{ fontSize: 12.2, color: '#64748b', marginBottom: 12 }}>Platform-wide caps on a single request (₹).</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={S.fieldLabel}>MIN LOAN AMOUNT (₹)</label>
                    <input style={S.input} type="number" disabled={!canWriteConfig} value={policy.minLoanAmount} onChange={e => setPolicy(p => ({ ...p, minLoanAmount: e.target.value }))} />
                  </div>
                  <div>
                    <label style={S.fieldLabel}>MAX LOAN AMOUNT (₹)</label>
                    <input style={S.input} type="number" disabled={!canWriteConfig} value={policy.maxLoanAmount} onChange={e => setPolicy(p => ({ ...p, maxLoanAmount: e.target.value }))} />
                  </div>
                </div>
              </div>
            </div>

            <div style={S.card}>
              <h4 style={{ fontSize: 15, marginBottom: 4 }}>Credit-score borrow limits</h4>
              <p style={{ fontSize: 12.2, color: '#64748b', marginBottom: 12 }}>A borrower's limit is the tier their credit score qualifies for.</p>
              {[
                ['scoreTier1MinScore', 'scoreTier1Limit', 'Tier 1'],
                ['scoreTier2MinScore', 'scoreTier2Limit', 'Tier 2'],
                ['scoreTier3MinScore', 'scoreTier3Limit', 'Tier 3'],
              ].map(([scoreKey, limitKey, label]) => (
                <div key={label} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr', gap: 16, alignItems: 'end', marginBottom: 12 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#64748b' }}>{label}</div>
                  <div>
                    <label style={S.fieldLabel}>MIN CREDIT SCORE</label>
                    <input style={S.input} type="number" disabled={!canWriteConfig} value={policy[scoreKey]} onChange={e => setPolicy(p => ({ ...p, [scoreKey]: e.target.value }))} />
                  </div>
                  <div>
                    <label style={S.fieldLabel}>BORROW LIMIT (₹)</label>
                    <input style={S.input} type="number" disabled={!canWriteConfig} value={policy[limitKey]} onChange={e => setPolicy(p => ({ ...p, [limitKey]: e.target.value }))} />
                  </div>
                </div>
              ))}
            </div>

            <div style={S.card}>
              <h4 style={{ fontSize: 15, marginBottom: 4 }}>Provider timing windows</h4>
              <p style={{ fontSize: 12.2, color: '#64748b', marginBottom: 12 }}>How long providers have to act before a request is released or cancelled.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={S.fieldLabel}>ACCEPT WINDOW (HOURS)</label>
                  <input style={S.input} type="number" disabled={!canWriteConfig} value={policy.providerAcceptWindowHours} onChange={e => setPolicy(p => ({ ...p, providerAcceptWindowHours: e.target.value }))} />
                </div>
                <div>
                  <label style={S.fieldLabel}>FUND WINDOW (HOURS)</label>
                  <input style={S.input} type="number" disabled={!canWriteConfig} value={policy.providerFundWindowHours} onChange={e => setPolicy(p => ({ ...p, providerFundWindowHours: e.target.value }))} />
                </div>
              </div>
              {canWriteConfig && (
                <button style={{ ...S.darkBtn, marginTop: 18 }} disabled={busy} onClick={handleSaveConfig}>Save policy changes</button>
              )}
            </div>
          </section>
        )}

        {/* ===== 7. AUDIT LOG ===== */}
        {!loading && activeSection === 'audit' && (
          <section>
            <div style={S.card}>
              <h4 style={{ fontSize: 15, marginBottom: 6 }}>Audit log</h4>
              {auditLogs.length === 0 && <p style={{ color: '#94a3ae', fontSize: 13 }}>No audit entries yet.</p>}
              {auditLogs.map((log, i) => (
                <div key={log.id || i} style={{ ...S.actRow, ...(i === auditLogs.length - 1 ? { borderBottom: 'none' } : {}) }}>
                  <div style={S.actIc(true)}>✓</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.3, fontWeight: 500 }}>{log.description || log.action}</div>
                    <div style={{ fontSize: 11.3, color: '#94a3ae', marginTop: 2 }}>
                      {log.action}{log.targetType ? ` · ${log.targetType}` : ''} · {log.admin?.firstName || log.admin?.email || 'Admin'} · {timeLabel(log.createdAt)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </AppShell>
    </>
  )
}
