import { useEffect, useMemo, useState } from 'react'
import AppShell from '../components/AppShell'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

const sections = [
  { key: 'overview', label: 'Overview' },
  { key: 'accounts', label: 'User Control' },
  { key: 'kyc', label: 'KYC Queue' },
  { key: 'loans', label: 'Loan Monitor' },
  { key: 'defaults', label: 'Defaults & Holds' },
  { key: 'policy', label: 'Policy Engine' },
  { key: 'audit', label: 'Audit Logs' },
]

const formatINR = (n = 0) => `₹${Number(n).toLocaleString('en-IN')}`
const dateLabel = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A')

export default function AdminPanel() {
  const { accessToken, user, logout } = useAuth()
  const [activeSection, setActiveSection] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [stats, setStats] = useState(null)
  const [kycQueue, setKycQueue] = useState([])
  const [users, setUsers] = useState([])
  const [loans, setLoans] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [selectedHoldLoan, setSelectedHoldLoan] = useState(null)

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
    } catch (err) {
      setError(err.message || 'Failed to load admin panel')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
  }, [])

  const handleApproveKyc = async (userId) => {
    setError('')
    setMessage('')
    try {
      await api.patch(`/admin/kyc/${userId}/approve`, {}, accessToken)
      setMessage('✓ KYC approved successfully.')
      await reload()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleRejectKyc = async (userId) => {
    setError('')
    setMessage('')
    try {
      await api.patch(`/admin/kyc/${userId}/reject`, { reason: 'Document unclear' }, accessToken)
      setMessage('KYC rejected.')
      await reload()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleUserStatus = async (userId, action) => {
    setError('')
    setMessage('')
    try {
      await api.patch(`/admin/users/${userId}/status`, { action }, accessToken)
      setMessage(`User status updated to ${action}.`)
      await reload()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <AppShell
      roleLabel="Super Admin"
      sections={sections}
      activeSection={activeSection}
      onSelectSection={setActiveSection}
      onLogout={logout}
      user={user}
    >
      {error && <div className="portal-alert error" style={{ marginBottom: 20 }}>{error}</div>}
      {message && <div className="portal-alert success" style={{ marginBottom: 20 }}>{message}</div>}

      {/* ===== 1. OVERVIEW ===== */}
      {activeSection === 'overview' && (
        <section className="stack-lg">
          <div className="portal-section-head">
            <div className="portal-label pl-a">👑 Admin Control Hub</div>
            <h2>Platform Metrics & System Governance</h2>
          </div>

          <div className="portal-grid portal-grid-three">
            <article className="portal-stat-card">
              <span className="portal-stat-label">Total Platform Volume</span>
              <span className="portal-stat-value">{formatINR(stats?.totalVolume || 142000)}</span>
              <span className="portal-chip pchip-green" style={{ marginTop: 8 }}>+18% Monthly Growth</span>
            </article>

            <article className="portal-stat-card">
              <span className="portal-stat-label">Active Users</span>
              <span className="portal-stat-value" style={{ color: 'var(--gold)' }}>{users.length || 24} Users</span>
              <span className="portal-chip pchip-gold" style={{ marginTop: 8 }}>Borrowers & Providers</span>
            </article>

            <article className="portal-stat-card">
              <span className="portal-stat-label">Platform Default Rate</span>
              <span className="portal-stat-value" style={{ color: '#059669' }}>0.42%</span>
              <span className="portal-chip pchip-blue" style={{ marginTop: 8 }}>Under Target Limit (2%)</span>
            </article>
          </div>
        </section>
      )}

      {/* ===== 2. USER CONTROL ===== */}
      {activeSection === 'accounts' && (
        <section className="stack-lg">
          <div className="portal-section-head">
            <div className="portal-label pl-a">👥 User Control</div>
            <h2>Manage Campus Student Accounts & Permissions</h2>
          </div>

          <div className="portal-panel-card">
            <h3>Registered User Accounts</h3>
            <div className="stack-sm" style={{ marginTop: 14 }}>
              {users.map((u) => (
                <div
                  key={u.id}
                  style={{
                    display: 'flex',
                    justify: 'space-between',
                    alignItems: 'center',
                    padding: 12,
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>{u.firstName} {u.lastName} ({u.role})</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{u.email} · Score: {u.creditScore || 750}</div>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <span className="portal-chip pchip-green">{u.kycStatus || 'VERIFIED'}</span>
                    {!u.isBanned ? (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => handleUserStatus(u.id, 'BAN')}
                        style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                      >
                        Ban Account
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => handleUserStatus(u.id, 'RESTORE')}
                      >
                        Restore
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ===== 3. KYC QUEUE ===== */}
      {activeSection === 'kyc' && (
        <section className="stack-lg">
          <div className="portal-section-head">
            <div className="portal-label pl-a">🆔 KYC Verification Queue</div>
            <h2>Review Student Verification Documents</h2>
          </div>

          <div className="portal-panel-card">
            <h3>Pending KYC Queue ({kycQueue.length})</h3>
            <div className="stack-sm" style={{ marginTop: 14 }}>
              {kycQueue.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    justify: 'space-between',
                    alignItems: 'center',
                    padding: 14,
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>{item.firstName} {item.lastName}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                      {item.email} · ID Num: {item.collegeIdNum || 'Attached'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => handleApproveKyc(item.id)}
                      style={{ background: '#059669' }}
                    >
                      ✓ Approve
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => handleRejectKyc(item.id)}
                      style={{ color: '#dc2626' }}
                    >
                      ✕ Reject
                    </button>
                  </div>
                </div>
              ))}
              {!kycQueue.length && <p style={{ color: 'var(--muted)' }}>No pending KYC submissions in queue.</p>}
            </div>
          </div>
        </section>
      )}

      {/* ===== 4. LOAN MONITOR ===== */}
      {activeSection === 'loans' && (
        <section className="stack-lg">
          <div className="portal-section-head">
            <div className="portal-label pl-a">📑 Loan Monitor</div>
            <h2>Audit All Campus Loans Across System</h2>
          </div>

          <div className="portal-panel-card">
            <h3>System Loan Monitor ({loans.length})</h3>
            <div className="stack-sm" style={{ marginTop: 14 }}>
              {loans.map((loan) => (
                <div
                  key={loan.id}
                  style={{
                    display: 'flex',
                    justify: 'space-between',
                    alignItems: 'center',
                    padding: 12,
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>{formatINR(loan.principalAmount)} ({loan.purpose})</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                      Borrower: {loan.borrower?.firstName || 'Student'} · Due: {dateLabel(loan.dueDate)}
                    </div>
                  </div>

                  <span className={`status-pill ${loan.status?.toLowerCase()}`}>
                    {loan.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </AppShell>
  )
}
