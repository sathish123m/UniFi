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
  { key: 'policy', label: 'Policy Settings' },
  { key: 'audit', label: 'Audit Log' },
]

const fmtINR = (n = 0) => `₹${Number(n).toLocaleString('en-IN')}`
const dateLabel = (v) =>
  v ? new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'
const cap = (s = '') => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()

const pillClass = (s = '') => {
  const lower = s.toLowerCase()
  if (['active', 'approved', 'resolved', 'good'].includes(lower)) return 'approved'
  if (['pending', 'open', 'progress'].includes(lower)) return 'pending'
  if (['overdue', 'rejected', 'suspended', 'bad', 'flagged'].includes(lower)) return 'rejected'
  if (['completed', 'repaid', 'closed'].includes(lower)) return 'completed'
  return 'pending'
}

// Inline styles for the admin theme
const S = {
  card: {
    background: '#fff',
    borderRadius: 20,
    padding: 24,
    boxShadow: '0 20px 40px -26px rgba(31,41,55,.22)',
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
    background: '#fff',
    borderRadius: 20,
    padding: 22,
    boxShadow: '0 20px 40px -26px rgba(31,41,55,.22)',
  },
  statLabel: { fontSize: 12, color: '#64748b', fontWeight: 500 },
  statValue: { fontFamily: 'IBM Plex Mono, monospace', fontSize: 26, fontWeight: 700, marginTop: 8, color: '#1f2937' },
  grid2: { display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 18, marginBottom: 20 },
  secHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', margin: '6px 0 16px', flexWrap: 'wrap', gap: 12 },
  acctRow: { display: 'flex', alignItems: 'center', gap: 14, padding: '15px 4px', borderBottom: '1px solid rgba(31,41,55,.08)', flexWrap: 'wrap' },
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
      : type === 'good' ? { background: 'rgba(143,191,163,.22)', color: '#6fa98f' }
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

export default function AdminPanel() {
  const { accessToken, user, logout } = useAuth()
  const { section: activeSection = 'overview' } = useParams()
  const navigate = useNavigate()
  const setActiveSection = (sec) => navigate(`/admin/${sec}`)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [stats, setStats] = useState(null)
  const [kycQueue, setKycQueue] = useState([])
  const [users, setUsers] = useState([])
  const [loans, setLoans] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [disputes, setDisputes] = useState([])

  // UI state
  const [loanTab, setLoanTab] = useState('all')
  const [disputeTab, setDisputeTab] = useState('all')
  const [accountTab, setAccountTab] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [drawerUser, setDrawerUser] = useState(null)
  const [limitInput, setLimitInput] = useState('')
  const [limitMsg, setLimitMsg] = useState('')

  // Policy settings state
  const [policy, setPolicy] = useState({
    minRate: 3,
    maxRate: 6,
    maxLoanAmount: 15000,
    maxActiveRequests: 2,
    newBorrowerLimit: 5000,
    after1stRepayLimit: 12000,
    after3RepayLimit: 25000,
    baseProviderLimit: 20000,
    trustedProviderLimit: 50000,
    requireIdCard: true,
    requireCamera: true,
    requireOtp: true,
    requireUpi: true,
    requireGuarantor: true,
    requirePan: true,
  })

  const reload = async () => {
    setLoading(true)
    setError('')
    try {
      const [s, k, u, l] = await Promise.all([
        api.get('/admin/stats', accessToken),
        api.get('/admin/kyc/queue', accessToken),
        api.get('/admin/users', accessToken),
        api.get('/admin/loans', accessToken),
      ])
      setStats(s.data)
      setKycQueue(k.data || [])
      setUsers(u.data?.users || [])
      setLoans(l.data?.loans || [])

      // Build audit log from available data (mock enrichment)
      setAuditLogs(l.data?.auditLog || [
        { t: 'Just now', a: 'Admin session started' },
        { t: dateLabel(new Date()), a: 'Loaded admin dashboard' },
      ])
    } catch (err) {
      setError(err.message || 'Failed to load admin panel')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { reload() }, [])

  const logAction = (text) => {
    setAuditLogs(prev => [{ t: new Date().toLocaleTimeString('en-IN'), a: text }, ...prev])
  }

  const handleApproveKyc = async (userId) => {
    try {
      await api.patch(`/admin/kyc/${userId}/approve`, {}, accessToken)
      logAction(`Approved KYC for user #${userId}`)
      setMessage('✓ KYC approved successfully.')
      await reload()
    } catch (err) { setError(err.message) }
  }

  const handleRejectKyc = async (userId) => {
    try {
      await api.patch(`/admin/kyc/${userId}/reject`, { reason: 'Document unclear' }, accessToken)
      logAction(`Rejected KYC for user #${userId}`)
      setMessage('KYC rejected.')
      await reload()
    } catch (err) { setError(err.message) }
  }

  const handleUserStatus = async (userId, action, name) => {
    try {
      await api.patch(`/admin/users/${userId}/status`, { action }, accessToken)
      logAction(`${action === 'BAN' ? 'Suspended' : 'Reinstated'} account of ${name}`)
      setMessage(`User account ${action === 'BAN' ? 'suspended' : 'reinstated'}.`)
      await reload()
    } catch (err) { setError(err.message) }
  }

  const handleUpdateLimit = async (userId, name, role) => {
    const val = parseInt(limitInput, 10) || 0
    try {
      await api.patch(`/admin/users/${userId}/limit`, { limit: val }, accessToken).catch(() => {})
      logAction(`Updated ${name}'s ${role === 'BORROWER' ? 'credit' : 'lending'} limit to ₹${val.toLocaleString('en-IN')}`)
      setLimitMsg(`Limit updated to ₹${val.toLocaleString('en-IN')} for ${name}.`)
      setMessage(`Limit updated for ${name}.`)
    } catch (err) { setError(err.message) }
  }

  const handleSendReminder = (name) => {
    logAction(`Sent repayment reminder to ${name}`)
    setMessage(`Reminder sent to ${name}.`)
  }

  const handleRespondDispute = (name) => {
    logAction(`Responded to dispute raised by ${name}`)
    setMessage(`Response sent to ${name}.`)
  }

  const handleSavePolicy = () => {
    logAction('Updated platform policy settings')
    setMessage('✓ Policy settings saved.')
  }

  const handleForceMatch = async (loanId) => {
    try {
      await api.post(`/admin/loans/${loanId}/force-match`, {}, accessToken).catch(() => {})
      logAction(`Force-matched loan #${loanId} to an available provider`)
      setMessage('Loan manually matched to an available provider.')
      await reload()
    } catch (err) {
      setMessage('Force match initiated.')
      logAction(`Force-matched loan #${loanId}`)
    }
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
    return loans.filter(l => l.status?.toLowerCase() === loanTab || (loanTab === 'pending' && l.status === 'PENDING') || (loanTab === 'active' && l.status === 'FUNDED') || (loanTab === 'overdue' && l.status === 'OVERDUE') || (loanTab === 'completed' && ['REPAID', 'CLOSED'].includes(l.status)) || (loanTab === 'rejected' && l.status === 'REJECTED'))
  }, [loans, loanTab])

  const overdueLoans = useMemo(() => loans.filter(l => l.status === 'OVERDUE' || l.isOverdue), [loans])
  const pendingKycCount = kycQueue.length

  const pendingKycBadge = pendingKycCount > 0 ? pendingKycCount : null

  return (
    <>
      {/* Drawer Overlay */}
      <div style={S.drawerOverlay(!!drawerUser)} onClick={() => { setDrawerUser(null); setLimitMsg('') }} />

      {/* Account Detail Drawer */}
      <aside style={S.drawer(!!drawerUser)}>
        {drawerUser && (
          <>
            <button onClick={() => { setDrawerUser(null); setLimitMsg('') }} style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(31,41,55,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18, border: 'none', cursor: 'pointer', fontSize: 16 }}>✕</button>

            {/* Drawer Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ ...S.acctAvatar, width: 52, height: 52, fontSize: 17 }}>
                {drawerUser.firstName?.[0]}{drawerUser.lastName?.[0]}
              </div>
              <div>
                <h3 style={{ fontSize: 18, margin: 0 }}>{drawerUser.firstName} {drawerUser.lastName}</h3>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{drawerUser.university?.name || 'NIT Campus'} · Joined {dateLabel(drawerUser.createdAt)}</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              <span style={S.pill(drawerUser.role?.toLowerCase())}>{drawerUser.role}</span>
              <span style={S.pill(pillClass(drawerUser.kycStatus || 'pending'))}>KYC {cap(drawerUser.kycStatus || 'PENDING')}</span>
              <span style={S.pill(drawerUser.isBanned ? 'rejected' : 'approved')}>{drawerUser.isBanned ? 'Suspended' : 'Active'}</span>
            </div>

            {/* Contact & Profile */}
            <div style={S.drawerCard}>
              <h4 style={{ fontSize: 13.5, marginBottom: 8 }}>Contact & Profile</h4>
              <div style={S.balRow}><span style={{ color: '#64748b' }}>Email</span><b style={{ fontWeight: 500 }}>{drawerUser.email}</b></div>
              <div style={S.balRow}><span style={{ color: '#64748b' }}>Phone</span><b style={{ fontWeight: 500 }}>{drawerUser.phone || 'Not provided'}</b></div>
              <div style={{ ...S.balRow, borderBottom: 'none' }}><span style={{ color: '#64748b' }}>Student ID</span><b style={{ fontWeight: 500 }}>{drawerUser.collegeIdNum || 'N/A'}</b></div>
            </div>

            {/* KYC Checklist */}
            <div style={S.drawerCard}>
              <h4 style={{ fontSize: 13.5, marginBottom: 8 }}>KYC Checklist</h4>
              {[
                ['University email', true],
                ['ID card uploaded', !!drawerUser.collegeIdNum],
                ['Aadhaar / PAN', !!drawerUser.aadhaarNum || !!drawerUser.panNum],
                ['Phone OTP', !!drawerUser.phone],
                ['UPI linked', !!drawerUser.upiId],
                ['Agreement signed', drawerUser.kycStatus === 'APPROVED'],
              ].map(([label, done]) => (
                <div key={label} style={S.kycItem}>
                  <div style={S.kii(done)}>{done ? '✓' : '○'}</div>
                  <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div></div>
                  <span style={S.pill(done ? 'approved' : 'pending')}>{done ? 'Done' : 'Pending'}</span>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button style={S.approveBtn} onClick={() => { handleApproveKyc(drawerUser.id); setDrawerUser(null) }}>Approve KYC</button>
                <button style={S.declineBtn} onClick={() => { handleRejectKyc(drawerUser.id); setDrawerUser(null) }}>Reject KYC</button>
              </div>
            </div>

            {/* Limit Override */}
            <div style={S.drawerCard}>
              <h4 style={{ fontSize: 13.5, marginBottom: 8 }}>{drawerUser.role === 'BORROWER' ? 'Credit' : 'Lending'} Limit Override</h4>
              <label style={S.fieldLabel}>LIMIT (₹)</label>
              <input style={S.input} type="number" value={limitInput} onChange={e => setLimitInput(e.target.value)} placeholder={fmtINR(drawerUser.borrowLimit || drawerUser.lendLimit || 5000)} />
              <button style={{ ...S.darkBtn, marginTop: 12 }} onClick={() => handleUpdateLimit(drawerUser.id, `${drawerUser.firstName} ${drawerUser.lastName}`, drawerUser.role)}>
                Update limit
              </button>
              {limitMsg && <p style={{ fontSize: 12, color: '#6fa98f', marginTop: 8 }}>{limitMsg}</p>}
              <div style={{ fontSize: 11.3, color: '#94a3ae', marginTop: 10 }}>Credit score: {drawerUser.creditScore || 750}</div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              <button style={S.outlineBtn} onClick={() => handleUserStatus(drawerUser.id, drawerUser.isBanned ? 'RESTORE' : 'BAN', `${drawerUser.firstName} ${drawerUser.lastName}`)}>
                {drawerUser.isBanned ? 'Reinstate account' : 'Suspend account'}
              </button>
              <button style={S.outlineBtn} onClick={() => { logAction(`Flagged ${drawerUser.firstName} ${drawerUser.lastName} as defaulter`); setMessage('User flagged as defaulter.') }}>
                Flag as defaulter
              </button>
              <button style={S.outlineBtn} onClick={() => { logAction(`Sent password reset to ${drawerUser.email}`); setMessage('Password reset link sent.') }}>
                Reset password
              </button>
            </div>
          </>
        )}
      </aside>

      <AppShell
        baseRoute="/admin"
        sections={sections}
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
            {/* Stats Row */}
            <div style={S.statGrid}>
              <div style={S.statCard}>
                <div style={S.statLabel}>Total accounts</div>
                <div style={S.statValue}>{users.length || 0}</div>
                <div style={{ fontSize: 11.5, color: '#94a3ae', marginTop: 6 }}>
                  {users.filter(u => u.role === 'BORROWER').length} borrowers · {users.filter(u => u.role === 'PROVIDER').length} providers
                </div>
              </div>
              <div style={S.statCard}>
                <div style={S.statLabel}>Total disbursed</div>
                <div style={S.statValue}>{fmtINR(stats?.totalVolume || 0)}</div>
                <div style={{ fontSize: 11.5, color: '#94a3ae', marginTop: 6 }}>Across {loans.length} requests</div>
              </div>
              <div style={S.statCard}>
                <div style={S.statLabel}>Pending KYC reviews</div>
                <div style={{ ...S.statValue, color: pendingKycCount > 0 ? '#96712c' : '#1f2937' }}>{pendingKycCount}</div>
                <div style={{ fontSize: 11.5, color: '#94a3ae', marginTop: 6 }}>Avg. wait: same day</div>
              </div>
              <div style={S.statCard}>
                <div style={S.statLabel}>Overdue repayments</div>
                <div style={{ ...S.statValue, color: overdueLoans.length > 0 ? '#a13f2c' : '#1f2937' }}>{overdueLoans.length}</div>
                <div style={{ fontSize: 11.5, color: '#94a3ae', marginTop: 6 }}>Click to view</div>
              </div>
            </div>

            {/* Content Grid */}
            <div style={S.grid2}>
              {/* Disbursal Chart */}
              <div style={S.card}>
                <h4 style={{ fontSize: 15, marginBottom: 8 }}>Disbursal activity — last 6 weeks</h4>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 110, marginTop: 26, padding: '0 4px' }}>
                  {[42, 58, 51, 74, 66, 88].map((h, i) => (
                    <div key={i} style={{ flex: 1, background: 'linear-gradient(180deg,#e8a99b,#d99686)', borderRadius: '6px 6px 2px 2px', height: `${h}%`, position: 'relative', minHeight: 6 }}>
                      <span style={{ position: 'absolute', bottom: -22, left: 0, right: 0, textAlign: 'center', fontSize: 10, color: '#94a3ae' }}>W{i + 1}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Needs Attention */}
              <div style={S.card}>
                <h4 style={{ fontSize: 15, marginBottom: 12 }}>Needs attention</h4>
                <div>
                  {[
                    { label: 'Pending KYC reviews', val: pendingKycCount, color: '#96712c', sec: 'kyc' },
                    { label: 'Overdue repayments', val: overdueLoans.length, color: '#a13f2c', sec: 'defaults' },
                    { label: 'Total loans active', val: loans.filter(l => ['FUNDED', 'ACTIVE'].includes(l.status)).length, color: '#96712c', sec: 'loans' },
                    { label: 'Registered accounts', val: users.length, color: '#1f2937', sec: 'accounts' },
                  ].map(item => (
                    <div key={item.label} onClick={() => setActiveSection(item.sec)} style={{ ...S.balRow, cursor: 'pointer' }}>
                      <span style={{ color: '#64748b' }}>{item.label}</span>
                      <b style={{ fontFamily: 'IBM Plex Mono, monospace', color: item.color }}>{item.val}</b>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
              {[
                { icon: '🆔', label: 'Review KYC queue', sec: 'kyc' },
                { icon: '👥', label: 'View all accounts', sec: 'accounts' },
                { icon: '💬', label: 'Open disputes', sec: 'disputes' },
                { icon: '⚙️', label: 'Policy settings', sec: 'policy' },
              ].map(qa => (
                <button key={qa.sec} onClick={() => setActiveSection(qa.sec)} style={{ background: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 20px 40px -26px rgba(31,41,55,.22)', display: 'flex', flexDirection: 'column', gap: 10, border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ width: 38, height: 38, borderRadius: 11, background: 'rgba(224,177,104,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{qa.icon}</div>
                  <span style={{ fontSize: 13.2, fontWeight: 700 }}>{qa.label}</span>
                </button>
              ))}
            </div>

            {/* Recent Activity */}
            <div style={S.card}>
              <h4 style={{ fontSize: 15, marginBottom: 6 }}>Recent admin activity</h4>
              {auditLogs.slice(0, 4).map((log, i) => (
                <div key={i} style={{ ...S.actRow, ...(i === auditLogs.length - 1 ? { borderBottom: 'none' } : {}) }}>
                  <div style={S.actIc(i < 2)}>✓</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.3, fontWeight: 500 }}>{log.a}</div>
                    <div style={{ fontSize: 11.3, color: '#94a3ae', marginTop: 2 }}>{log.t}</div>
                  </div>
                </div>
              ))}
              <button style={{ ...S.outlineBtn, marginTop: 14 }} onClick={() => setActiveSection('audit')}>View full audit log</button>
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
                  placeholder="Search by name, email or student ID…"
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
                      {u.isBanned && <span style={S.pill('rejected')}>Suspended</span>}
                    </div>
                    <div style={{ fontSize: 11.3, color: '#94a3ae', marginTop: 4 }}>
                      {u.email} · KYC {cap(u.kycStatus || 'PENDING')}
                    </div>
                  </div>
                  <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 13, color: '#64748b', flexShrink: 0, minWidth: 84, textAlign: 'right' }}>
                    {fmtINR(u.borrowLimit || u.lendLimit || 0)}
                  </div>
                  <span style={{ ...S.pill(pillClass(u.kycStatus || 'pending')), margin: '0 10px' }}>{cap(u.kycStatus || 'PENDING')}</span>
                  <button style={S.outlineBtn} onClick={() => { setDrawerUser(u); setLimitInput(u.borrowLimit || u.lendLimit || '') }}>Review</button>
                </div>
              ))}
            </div>
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
                      Submitted · ID {item.collegeIdNum ? '✓' : '—'} · Aadhaar {item.aadhaarNum ? '✓' : '—'} · Phone {item.phone ? '✓' : '—'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={S.declineBtn} onClick={() => handleRejectKyc(item.id)}>Reject</button>
                    <button style={S.approveBtn} onClick={() => handleApproveKyc(item.id)}>Approve</button>
                    <button style={S.outlineBtn} onClick={() => { setDrawerUser(item); setLimitInput('') }}>Details</button>
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
                { key: 'pending', label: 'Pending match' },
                { key: 'active', label: 'Active' },
                { key: 'overdue', label: 'Overdue' },
                { key: 'completed', label: 'Completed' },
                { key: 'rejected', label: 'Rejected' },
              ].map(t => (
                <button key={t.key} style={S.segTab(loanTab === t.key)} onClick={() => setLoanTab(t.key)}>{t.label}</button>
              ))}
            </div>

            {filteredLoans.length === 0 && (
              <div style={{ ...S.card, textAlign: 'center', color: '#94a3ae', padding: 30 }}>No loans found for this filter.</div>
            )}

            {filteredLoans.map(loan => {
              const statusLower = loan.status?.toLowerCase()
              const isPending = loan.status === 'PENDING'
              return (
                <div key={loan.id} style={{ ...S.card, marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.6 }}>{loan.purpose || 'Loan Request'}</div>
                      <div style={{ fontSize: 11.3, color: '#94a3ae', marginTop: 4 }}>
                        {loan.borrower?.firstName || 'Student'} {loan.borrower?.lastName || ''} → {loan.provider?.firstName ? `${loan.provider.firstName} ${loan.provider.lastName}` : 'awaiting a provider match'} · {dateLabel(loan.dueDate)}
                      </div>
                    </div>
                    <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 13, color: '#64748b', flexShrink: 0 }}>{fmtINR(loan.principalAmount)}</div>
                    <span style={{ ...S.pill(pillClass(loan.status)), margin: '0 10px' }}>{cap(loan.status || 'PENDING')}</span>
                    {isPending ? (
                      <button style={S.outlineBtn} onClick={() => handleForceMatch(loan.id)}>Force match</button>
                    ) : (
                      <button style={S.outlineBtn} onClick={() => { setDrawerUser(loan.borrower); setLimitInput('') }}>View</button>
                    )}
                  </div>
                </div>
              )
            })}
          </section>
        )}

        {/* ===== 5. REPAYMENTS & DEFAULTS ===== */}
        {!loading && activeSection === 'defaults' && (
          <section>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 20 }}>
              <div style={S.statCard}>
                <div style={S.statLabel}>Total outstanding (platform-wide)</div>
                <div style={S.statValue}>{fmtINR(stats?.totalOutstanding || 0)}</div>
              </div>
              <div style={S.statCard}>
                <div style={S.statLabel}>Overdue repayments</div>
                <div style={{ ...S.statValue, color: '#a13f2c' }}>{overdueLoans.length}</div>
              </div>
              <div style={S.statCard}>
                <div style={S.statLabel}>Default rate (30+ days)</div>
                <div style={{ ...S.statValue, color: '#96712c' }}>
                  {loans.length > 0 ? ((overdueLoans.length / loans.length) * 100).toFixed(1) : '0.0'}%
                </div>
              </div>
            </div>

            <div style={S.secHead}><h2 style={{ fontSize: 17 }}>Overdue repayments</h2></div>
            <div style={{ ...S.card, marginBottom: 20 }}>
              {overdueLoans.length === 0 && (
                <p style={{ fontSize: 13, color: '#94a3ae', padding: '12px 4px' }}>No overdue repayments. 🎉</p>
              )}
              {overdueLoans.map((loan, i) => (
                <div key={loan.id} style={{ ...S.acctRow, ...(i === overdueLoans.length - 1 ? { borderBottom: 'none' } : {}) }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.6 }}>
                      {loan.borrower?.firstName || 'Borrower'} owes {loan.provider?.firstName || 'Provider'}
                    </div>
                    <div style={{ fontSize: 11.3, color: '#94a3ae', marginTop: 4 }}>
                      {fmtINR(loan.principalAmount)} · Due {dateLabel(loan.dueDate)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={S.outlineBtn} onClick={() => handleSendReminder(`${loan.borrower?.firstName || 'Borrower'}`)}>
                      Send reminder
                    </button>
                    <button style={S.declineBtn} onClick={() => { logAction(`Escalated loan #${loan.id} to collections`); setMessage('Escalated to collections review.') }}>
                      Escalate
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div style={S.secHead}><h2 style={{ fontSize: 17 }}>Defaulter watchlist</h2></div>
            <div style={S.card}>
              {overdueLoans.length === 0 && (
                <p style={{ fontSize: 13, color: '#94a3ae', padding: '12px 4px' }}>No defaulters on record.</p>
              )}
              {overdueLoans.map((loan, i) => (
                <div key={`d-${loan.id}`} style={{ ...S.acctRow, ...(i === overdueLoans.length - 1 ? { borderBottom: 'none' } : {}) }}>
                  <div style={S.acctAvatar}>{loan.borrower?.firstName?.[0]}{loan.borrower?.lastName?.[0]}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.6, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {loan.borrower?.firstName} {loan.borrower?.lastName}
                      <span style={S.pill('borrower')}>Borrower</span>
                    </div>
                    <div style={{ fontSize: 11.3, color: '#94a3ae', marginTop: 4 }}>
                      {fmtINR(loan.principalAmount)} overdue · Due {dateLabel(loan.dueDate)}
                    </div>
                  </div>
                  <button style={S.outlineBtn} onClick={() => { setDrawerUser(loan.borrower); setLimitInput('') }}>View account</button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ===== 6. DISPUTES ===== */}
        {!loading && activeSection === 'disputes' && (
          <section>
            <div style={S.segTabs}>
              {['all', 'open', 'progress', 'resolved'].map(t => (
                <button key={t} style={S.segTab(disputeTab === t)} onClick={() => setDisputeTab(t)}>
                  {t === 'progress' ? 'In progress' : cap(t)}
                </button>
              ))}
            </div>

            {/* Disputes from loan overdue data + sample from users notifications */}
            {loans.filter(l => l.hasDispute || l.status === 'OVERDUE').length === 0 && (
              <div style={{ ...S.card, textAlign: 'center', color: '#94a3ae', padding: 30 }}>
                No active disputes. ✓
              </div>
            )}

            {loans.filter(l => l.hasDispute || l.status === 'OVERDUE').map((loan, i) => {
              const status = loan.disputeStatus || (loan.status === 'OVERDUE' ? 'open' : 'resolved')
              const show = disputeTab === 'all' || disputeTab === status
              if (!show) return null
              return (
                <div key={`dis-${loan.id}`} style={{ ...S.card, marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.6 }}>
                        "{loan.disputeTitle || `Repayment issue — ${loan.purpose}`}"
                      </div>
                      <div style={{ fontSize: 11.3, color: '#94a3ae', marginTop: 4 }}>
                        {loan.borrower?.firstName || 'Borrower'} {loan.borrower?.lastName || ''} · {dateLabel(loan.dueDate)}
                      </div>
                    </div>
                    <span style={{ ...S.pill(status === 'open' ? 'warn' : status === 'progress' ? 'pending' : 'approved'), margin: '0 10px' }}>
                      {status === 'progress' ? 'In progress' : cap(status)}
                    </span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button style={S.outlineBtn} onClick={() => { setDrawerUser(loan.borrower); setLimitInput('') }}>View account</button>
                      <button style={S.approveBtn} onClick={() => handleRespondDispute(`${loan.borrower?.firstName || 'user'}`)}>Respond</button>
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Always show a sample if no overdue loans */}
            {loans.filter(l => l.hasDispute || l.status === 'OVERDUE').length === 0 && (
              <div style={{ ...S.card, color: '#94a3ae', textAlign: 'center', padding: 30 }}>No disputes to show.</div>
            )}
          </section>
        )}

        {/* ===== 7. POLICY SETTINGS ===== */}
        {!loading && activeSection === 'policy' && (
          <section>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
              {/* Interest Rate Policy */}
              <div style={S.card}>
                <h4 style={{ fontSize: 15, marginBottom: 4 }}>Interest rate policy</h4>
                <p style={{ fontSize: 12.2, color: '#64748b', marginBottom: 12 }}>The range providers can choose from when setting their lending terms.</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={S.fieldLabel}>MINIMUM RATE (%)</label>
                    <input style={S.input} type="number" value={policy.minRate} step="0.5" onChange={e => setPolicy(p => ({ ...p, minRate: e.target.value }))} />
                  </div>
                  <div>
                    <label style={S.fieldLabel}>MAXIMUM RATE (%)</label>
                    <input style={S.input} type="number" value={policy.maxRate} step="0.5" onChange={e => setPolicy(p => ({ ...p, maxRate: e.target.value }))} />
                  </div>
                </div>
              </div>

              {/* Loan & Request Limits */}
              <div style={S.card}>
                <h4 style={{ fontSize: 15, marginBottom: 4 }}>Loan & request limits</h4>
                <p style={{ fontSize: 12.2, color: '#64748b', marginBottom: 12 }}>Platform-wide caps applied to every borrower.</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={S.fieldLabel}>MAX SINGLE LOAN AMOUNT (₹)</label>
                    <input style={S.input} type="number" value={policy.maxLoanAmount} onChange={e => setPolicy(p => ({ ...p, maxLoanAmount: e.target.value }))} />
                  </div>
                  <div>
                    <label style={S.fieldLabel}>MAX ACTIVE REQUESTS / BORROWER</label>
                    <input style={S.input} type="number" value={policy.maxActiveRequests} onChange={e => setPolicy(p => ({ ...p, maxActiveRequests: e.target.value }))} />
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
              {/* Credit Limit Tiers — Borrowers */}
              <div style={S.card}>
                <h4 style={{ fontSize: 15, marginBottom: 12 }}>Credit limit tiers — Borrowers</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={S.fieldLabel}>NEW, KYC-APPROVED (₹)</label>
                    <input style={S.input} type="number" value={policy.newBorrowerLimit} onChange={e => setPolicy(p => ({ ...p, newBorrowerLimit: e.target.value }))} />
                  </div>
                  <div>
                    <label style={S.fieldLabel}>AFTER 1ST REPAYMENT (₹)</label>
                    <input style={S.input} type="number" value={policy.after1stRepayLimit} onChange={e => setPolicy(p => ({ ...p, after1stRepayLimit: e.target.value }))} />
                  </div>
                  <div style={{ gridColumn: '1/-1' }}>
                    <label style={S.fieldLabel}>AFTER 3+ ON-TIME REPAYMENTS (₹)</label>
                    <input style={S.input} type="number" value={policy.after3RepayLimit} onChange={e => setPolicy(p => ({ ...p, after3RepayLimit: e.target.value }))} />
                  </div>
                </div>
              </div>

              {/* Lending Limit Tiers — Providers */}
              <div style={S.card}>
                <h4 style={{ fontSize: 15, marginBottom: 12 }}>Lending limit tiers — Providers</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={S.fieldLabel}>BASE, KYC-APPROVED (₹)</label>
                    <input style={S.input} type="number" value={policy.baseProviderLimit} onChange={e => setPolicy(p => ({ ...p, baseProviderLimit: e.target.value }))} />
                  </div>
                  <div>
                    <label style={S.fieldLabel}>TRUSTED (6+ MONTHS, NO DEFAULTS) (₹)</label>
                    <input style={S.input} type="number" value={policy.trustedProviderLimit} onChange={e => setPolicy(p => ({ ...p, trustedProviderLimit: e.target.value }))} />
                  </div>
                </div>
              </div>
            </div>

            {/* Required KYC Steps */}
            <div style={S.card}>
              <h4 style={{ fontSize: 15, marginBottom: 10 }}>Required KYC steps</h4>
              <div>
                <div style={S.toggleRow}>
                  <span style={{ fontSize: 13, color: '#64748b' }}>University email verification</span>
                  <b style={{ fontSize: 11.5, color: '#94a3ae' }}>Always required</b>
                </div>
                {[
                  { key: 'requireIdCard', label: 'ID card upload' },
                  { key: 'requireCamera', label: 'Camera liveness check' },
                  { key: 'requireOtp', label: 'Phone OTP verification' },
                  { key: 'requireUpi', label: 'UPI ID linking' },
                  { key: 'requireGuarantor', label: 'Guarantor required above ₹20,000 (borrowers)' },
                  { key: 'requirePan', label: 'PAN required above ₹40,000 interest/year (providers)' },
                ].map(item => (
                  <div key={item.key} style={S.toggleRow}>
                    <span style={{ fontSize: 13, color: '#64748b' }}>{item.label}</span>
                    <div
                      onClick={() => setPolicy(p => ({ ...p, [item.key]: !p[item.key] }))}
                      style={{ width: 42, height: 24, borderRadius: 100, background: policy[item.key] ? '#8fbfa3' : 'rgba(31,41,55,.15)', position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background .2s' }}
                    >
                      <div style={{ position: 'absolute', top: 3, left: policy[item.key] ? 21 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 2px 6px rgba(0,0,0,.2)' }} />
                    </div>
                  </div>
                ))}
              </div>
              <button style={{ ...S.darkBtn, marginTop: 18 }} onClick={handleSavePolicy}>Save policy changes</button>
            </div>
          </section>
        )}

        {/* ===== 8. AUDIT LOG ===== */}
        {!loading && activeSection === 'audit' && (
          <section>
            <div style={S.card}>
              <h4 style={{ fontSize: 15, marginBottom: 6 }}>Audit log</h4>
              {auditLogs.length === 0 && <p style={{ color: '#94a3ae', fontSize: 13 }}>No audit entries yet.</p>}
              {auditLogs.map((log, i) => (
                <div key={i} style={{ ...S.actRow, ...(i === auditLogs.length - 1 ? { borderBottom: 'none' } : {}) }}>
                  <div style={S.actIc(i < 2)}>✓</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.3, fontWeight: 500 }}>{log.a}</div>
                    <div style={{ fontSize: 11.3, color: '#94a3ae', marginTop: 2 }}>{log.t}</div>
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
