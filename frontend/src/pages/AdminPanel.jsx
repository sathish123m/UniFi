import { useEffect, useMemo, useState } from 'react'
import AppShell from '../components/AppShell'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

const money = (n = 0) => `INR ${Number(n).toLocaleString('en-IN')}`
const dateLabel = (value) => (value ? new Date(value).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : 'N/A')

const sections = [
  { key: 'overview', label: 'Overview' },
  { key: 'kyc', label: 'KYC Queue' },
  { key: 'loans', label: 'Loan Monitor' },
  { key: 'users', label: 'User Mgmt' },
  { key: 'reports', label: 'Reports' },
  { key: 'config', label: 'Config' },
  { key: 'alerts', label: 'Alerts' },
  { key: 'admins', label: 'Admins' },
]

const loanStatusClass = (status = '') => {
  if (status === 'REPAID') return 'badge-repaid'
  if (status === 'DEFAULTED') return 'badge-overdue'
  if (status === 'ACTIVE') return 'badge-active'
  return 'badge-pending'
}

export default function AdminPanel() {
  const { accessToken, user, logout } = useAuth()
  const canEditConfig = ['SUPER_ADMIN', 'FINANCE_ADMIN'].includes(user.role)
  const [activeSection, setActiveSection] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [stats, setStats] = useState(null)
  const [kycQueue, setKycQueue] = useState([])
  const [users, setUsers] = useState([])
  const [loans, setLoans] = useState([])
  const [admins, setAdmins] = useState([])
  const [configDraft, setConfigDraft] = useState(null)

  const [newAdmin, setNewAdmin] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    role: 'MOD_ADMIN',
  })

  const filteredSections = useMemo(
    () => sections.filter((s) => !(s.key === 'admins' && user.role !== 'SUPER_ADMIN')),
    [user.role]
  )

  const reload = async () => {
    setLoading(true)
    setError('')
    try {
      const [s, k, u, l, c] = await Promise.all([
        api.get('/admin/stats', accessToken),
        api.get('/admin/kyc/queue', accessToken),
        api.get('/admin/users', accessToken),
        api.get('/admin/loans', accessToken),
        api.get('/admin/config', accessToken),
      ])

      setStats(s.data)
      setKycQueue(k.data || [])
      setUsers(u.data?.users || [])
      setLoans(l.data?.loans || [])
      setConfigDraft(c.data)

      if (user.role === 'SUPER_ADMIN') {
        const a = await api.get('/admin/admins', accessToken)
        setAdmins(a.data || [])
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
  }, [])

  useEffect(() => {
    if (user.role !== 'SUPER_ADMIN' && activeSection === 'admins') {
      setActiveSection('overview')
    }
  }, [user.role, activeSection])

  const monthlyBars = useMemo(() => {
    const map = new Map()
    loans.forEach((loan) => {
      const date = new Date(loan.createdAt || loan.updatedAt || Date.now())
      const key = `${date.getFullYear()}-${date.getMonth()}`
      map.set(key, (map.get(key) || 0) + 1)
    })

    const items = Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([k, count]) => ({
        key: k,
        count,
      }))

    const maxCount = Math.max(...items.map((i) => i.count), 1)
    return items.map((i) => ({ ...i, h: Math.max(20, Math.round((i.count / maxCount) * 100)) }))
  }, [loans])

  const statusBreakdown = useMemo(() => {
    const counts = { ACTIVE: 0, REPAID: 0, OVERDUE: 0, PENDING: 0 }
    loans.forEach((loan) => {
      if (counts[loan.status] !== undefined) counts[loan.status] += 1
      else counts.PENDING += 1
    })
    return counts
  }, [loans])

  const alertItems = useMemo(() => {
    const now = Date.now()
    const overdue = loans.filter(
      (l) => l.status === 'DEFAULTED' || l.isOverdue || (l.status === 'ACTIVE' && l.dueAt && new Date(l.dueAt).getTime() < now)
    )
    const suspendedUsers = users.filter((u) => u.isSuspended || u.isBanned)

    const alerts = []
    if (overdue.length) {
      alerts.push({
        id: 'overdue',
        tone: 'high',
        title: `${overdue.length} overdue/late loans detected`,
        detail: 'Review loan monitor and trigger reminders or collections.',
        action: () => setActiveSection('loans'),
        actionLabel: 'Open Loan Monitor',
      })
    }
    if (kycQueue.length) {
      alerts.push({
        id: 'kyc',
        tone: 'medium',
        title: `${kycQueue.length} KYC requests pending`,
        detail: 'Pending KYC slows onboarding and borrowing throughput.',
        action: () => setActiveSection('kyc'),
        actionLabel: 'Review KYC',
      })
    }
    if (suspendedUsers.length) {
      alerts.push({
        id: 'users',
        tone: 'low',
        title: `${suspendedUsers.length} users under moderation`,
        detail: 'Check if policy actions should be restored or escalated.',
        action: () => setActiveSection('users'),
        actionLabel: 'Open User Mgmt',
      })
    }

    if (!alerts.length) {
      alerts.push({
        id: 'healthy',
        tone: 'low',
        title: 'Platform health is stable',
        detail: 'No critical admin alerts are currently active.',
        action: () => setActiveSection('overview'),
        actionLabel: 'Back to Overview',
      })
    }

    return alerts
  }, [kycQueue.length, loans, users])

  const adminStats = [
    { label: 'Total Users', value: stats?.users || 0, tone: 'blue' },
    { label: 'Total Loans', value: stats?.loans || 0, tone: 'gold' },
    { label: 'Active Loans', value: stats?.activeLoan || 0, tone: 'green' },
    { label: 'Platform Revenue', value: money(stats?.revenue || 0), tone: 'blue' },
  ]

  const reviewKyc = async (userId, action) => {
    setError('')
    setMessage('')
    try {
      await api.patch(`/admin/kyc/${userId}`, { action, reason: action === 'REJECTED' ? 'Document quality issue' : '' }, accessToken)
      setMessage(`KYC ${action.toLowerCase()} successfully.`)
      await reload()
    } catch (err) {
      setError(err.message)
    }
  }

  const changeUserStatus = async (id, action) => {
    setError('')
    setMessage('')
    try {
      await api.patch(`/admin/users/${id}/status`, { action, reason: 'Admin policy action' }, accessToken)
      setMessage(`User ${action.toLowerCase()} action completed.`)
      await reload()
    } catch (err) {
      setError(err.message)
    }
  }

  const createAdmin = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    try {
      await api.post('/admin/admins', newAdmin, accessToken)
      setMessage('Admin account created.')
      setNewAdmin({ email: '', password: '', firstName: '', lastName: '', role: 'MOD_ADMIN' })
      await reload()
    } catch (err) {
      setError(err.message)
    }
  }

  const saveConfig = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    try {
      await api.post(
        '/admin/config',
        {
          interestRatePercent: Number(configDraft.interestRatePercent),
          platformFeePercent: Number(configDraft.platformFeePercent),
          minLoanAmount: Number(configDraft.minLoanAmount),
          maxLoanAmount: Number(configDraft.maxLoanAmount),
          providerAcceptWindowHours: Number(configDraft.providerAcceptWindowHours),
          providerFundWindowHours: Number(configDraft.providerFundWindowHours),
        },
        accessToken
      )
      setMessage('Platform config updated.')
      await reload()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <AppShell
      user={user}
      onLogout={logout}
      title="Admin Control Center"
      subtitle="KYC review, monitoring, reports, alerts, and live platform controls."
      sections={filteredSections}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      stats={adminStats}
    >
      {loading ? <p>Loading...</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
      {message ? <p className="success-text">{message}</p> : null}

      {!loading && activeSection === 'overview' && (
        <section className="portal-section">
          <div className="portal-section-head">
            <div className="portal-label pl-a">⚙️ Admin Dashboard</div>
            <h2>Platform Health and High-Priority Signals</h2>
          </div>

          <div className="portal-grid portal-grid-two">
            <article className="portal-panel-card">
              <h3>Risk Snapshot</h3>
              <div className="stack-sm">
                <div className="portal-kv-row">
                  <span>Pending KYC</span>
                  <strong>{kycQueue.length}</strong>
                </div>
                <div className="portal-kv-row">
                  <span>Users on Platform</span>
                  <strong>{users.length}</strong>
                </div>
                <div className="portal-kv-row">
                  <span>Total Loans Tracked</span>
                  <strong>{loans.length}</strong>
                </div>
                <div className="portal-kv-row">
                  <span>Revenue</span>
                  <strong>{money(stats?.revenue || 0)}</strong>
                </div>
              </div>
            </article>

            <article className="portal-panel-card">
              <h3>Critical Alerts</h3>
              <div className="stack-sm">
                {alertItems.slice(0, 3).map((alert) => (
                  <div key={alert.id} className={`portal-alert-card ${alert.tone}`}>
                    <strong>{alert.title}</strong>
                    <small>{alert.detail}</small>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>
      )}

      {!loading && activeSection === 'kyc' && (
        <section className="portal-section">
          <div className="portal-section-head">
            <div className="portal-label pl-a">🔍 KYC Review Queue</div>
            <h2>Approve or Reject Identity Requests</h2>
          </div>

          <div className="portal-panel-card stack-sm">
            {kycQueue.map((item) => (
              <div className="portal-row" key={item.id}>
                <div className="portal-row-main">
                  <strong>
                    {item.firstName} {item.lastName}
                  </strong>
                  <small>{item.email}</small>
                </div>
                <div className="inline-actions">
                  <button className="btn btn-primary" type="button" onClick={() => reviewKyc(item.id, 'APPROVED')}>
                    Approve
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={() => reviewKyc(item.id, 'REJECTED')}>
                    Reject
                  </button>
                </div>
              </div>
            ))}
            {!kycQueue.length ? <p>No pending KYC records.</p> : null}
          </div>
        </section>
      )}

      {!loading && activeSection === 'loans' && (
        <section className="portal-section">
          <div className="portal-section-head">
            <div className="portal-label pl-a">📋 Loan Monitor</div>
            <h2>Cross-Portal Loan Monitoring</h2>
          </div>

          <div className="portal-panel-card stack-sm">
            {loans.map((l) => (
              <div className="portal-row" key={l.id}>
                <div className="portal-row-main">
                  <strong>{l.publicId}</strong>
                  <small>
                    {l.status} · Borrower {l.borrower?.email || 'N/A'} · Due {dateLabel(l.dueAt)}
                  </small>
                </div>
                <div className="portal-row-end">
                  <span className={`badge ${loanStatusClass(l.status)}`}>{l.status}</span>
                  <strong>{money(l.principalAmount)}</strong>
                </div>
              </div>
            ))}
            {!loans.length ? <p>No loans.</p> : null}
          </div>
        </section>
      )}

      {!loading && activeSection === 'users' && (
        <section className="portal-section">
          <div className="portal-section-head">
            <div className="portal-label pl-a">👥 User Management</div>
            <h2>Moderation and Enforcement</h2>
          </div>

          <div className="portal-panel-card stack-sm">
            {users.map((u) => (
              <div className="portal-row" key={u.id}>
                <div className="portal-row-main">
                  <strong>
                    {u.firstName} {u.lastName}
                  </strong>
                  <small>
                    {u.email} · {u.role} · KYC {u.kycStatus} · {u.isBanned ? 'BANNED' : u.isSuspended ? 'SUSPENDED' : 'ACTIVE'}
                  </small>
                </div>
                <div className="inline-actions">
                  <button className="btn btn-ghost" type="button" onClick={() => changeUserStatus(u.id, 'SUSPEND')}>
                    Suspend
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={() => changeUserStatus(u.id, 'BAN')}>
                    Ban
                  </button>
                  <button className="btn btn-primary" type="button" onClick={() => changeUserStatus(u.id, 'RESTORE')}>
                    Restore
                  </button>
                </div>
              </div>
            ))}
            {!users.length ? <p>No users.</p> : null}
          </div>
        </section>
      )}

      {!loading && activeSection === 'reports' && (
        <section className="portal-section">
          <div className="portal-section-head">
            <div className="portal-label pl-a">💹 Revenue & Reports</div>
            <h2>Monthly Trend and Portfolio Health</h2>
          </div>

          <div className="portal-grid portal-grid-two">
            <article className="portal-panel-card">
              <h3>Loan Volume (Last Months)</h3>
              <div className="portal-bars portal-bars-blue">
                {monthlyBars.map((bar) => (
                  <div key={bar.key} className="portal-bar" style={{ height: `${bar.h}%` }}></div>
                ))}
              </div>
              {!monthlyBars.length ? <p>No report data yet.</p> : null}
            </article>

            <article className="portal-panel-card">
              <h3>Status Breakdown</h3>
              <div className="stack-sm">
                <div className="portal-kv-row">
                  <span>Active</span>
                  <strong>{statusBreakdown.ACTIVE}</strong>
                </div>
                <div className="portal-kv-row">
                  <span>Repaid</span>
                  <strong>{statusBreakdown.REPAID}</strong>
                </div>
                <div className="portal-kv-row">
                  <span>Overdue</span>
                  <strong>{statusBreakdown.OVERDUE}</strong>
                </div>
                <div className="portal-kv-row">
                  <span>Pending / Other</span>
                  <strong>{statusBreakdown.PENDING}</strong>
                </div>
                <div className="portal-chip-list">
                  <button type="button" className="portal-chip">Export CSV</button>
                  <button type="button" className="portal-chip">Export PDF</button>
                </div>
              </div>
            </article>
          </div>
        </section>
      )}

      {!loading && activeSection === 'config' && configDraft && (
        <section className="portal-section">
          <div className="portal-section-head">
            <div className="portal-label pl-a">⚙️ Platform Config</div>
            <h2>Live Financial Rules and Windows</h2>
          </div>

          <form className="portal-panel-card form" onSubmit={saveConfig}>
            <div className="form-row">
              <label>
                Interest %
                <input
                  type="number"
                  step="0.1"
                  value={configDraft.interestRatePercent}
                  onChange={(e) => setConfigDraft((p) => ({ ...p, interestRatePercent: e.target.value }))}
                />
              </label>
              <label>
                Platform Fee %
                <input
                  type="number"
                  step="0.1"
                  value={configDraft.platformFeePercent}
                  onChange={(e) => setConfigDraft((p) => ({ ...p, platformFeePercent: e.target.value }))}
                />
              </label>
            </div>

            <div className="form-row">
              <label>
                Min Loan Amount
                <input
                  type="number"
                  value={configDraft.minLoanAmount}
                  onChange={(e) => setConfigDraft((p) => ({ ...p, minLoanAmount: e.target.value }))}
                />
              </label>
              <label>
                Max Loan Amount
                <input
                  type="number"
                  value={configDraft.maxLoanAmount}
                  onChange={(e) => setConfigDraft((p) => ({ ...p, maxLoanAmount: e.target.value }))}
                />
              </label>
            </div>

            <div className="form-row">
              <label>
                Provider Accept Window (hrs)
                <input
                  type="number"
                  value={configDraft.providerAcceptWindowHours}
                  onChange={(e) => setConfigDraft((p) => ({ ...p, providerAcceptWindowHours: e.target.value }))}
                />
              </label>
              <label>
                Provider Fund Window (hrs)
                <input
                  type="number"
                  value={configDraft.providerFundWindowHours}
                  onChange={(e) => setConfigDraft((p) => ({ ...p, providerFundWindowHours: e.target.value }))}
                />
              </label>
            </div>

            <button className="btn btn-primary" type="submit" disabled={!canEditConfig}>
              Save Config
            </button>
            {!canEditConfig ? <p>Only Super Admin and Finance Admin can update config.</p> : null}
          </form>
        </section>
      )}

      {!loading && activeSection === 'alerts' && (
        <section className="portal-section">
          <div className="portal-section-head">
            <div className="portal-label pl-a">🔔 Platform Alerts</div>
            <h2>Severity-based Monitoring Feed</h2>
          </div>

          <div className="portal-panel-card stack-sm">
            {alertItems.map((alert) => (
              <div key={alert.id} className={`portal-alert-card ${alert.tone}`}>
                <div>
                  <strong>{alert.title}</strong>
                  <small>{alert.detail}</small>
                </div>
                <button className="btn btn-ghost" type="button" onClick={alert.action}>
                  {alert.actionLabel}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {!loading && activeSection === 'admins' && user.role === 'SUPER_ADMIN' && (
        <section className="portal-section">
          <div className="portal-section-head">
            <div className="portal-label pl-a">🛡️ Admin Access</div>
            <h2>Create and Manage Admin Accounts</h2>
          </div>

          <div className="portal-grid portal-grid-two">
            <form className="portal-panel-card form" onSubmit={createAdmin}>
              <h3>Create Admin</h3>
              <div className="form-row">
                <input
                  value={newAdmin.firstName}
                  onChange={(e) => setNewAdmin((p) => ({ ...p, firstName: e.target.value }))}
                  placeholder="First name"
                  required
                />
                <input
                  value={newAdmin.lastName}
                  onChange={(e) => setNewAdmin((p) => ({ ...p, lastName: e.target.value }))}
                  placeholder="Last name"
                  required
                />
              </div>
              <input
                value={newAdmin.email}
                onChange={(e) => setNewAdmin((p) => ({ ...p, email: e.target.value }))}
                placeholder="Admin email"
                type="email"
                required
              />
              <input
                value={newAdmin.password}
                onChange={(e) => setNewAdmin((p) => ({ ...p, password: e.target.value }))}
                placeholder="Strong password"
                type="password"
                required
              />
              <select value={newAdmin.role} onChange={(e) => setNewAdmin((p) => ({ ...p, role: e.target.value }))}>
                <option value="MOD_ADMIN">Mod Admin</option>
                <option value="FINANCE_ADMIN">Finance Admin</option>
              </select>
              <button className="btn btn-primary" type="submit">
                Create Admin
              </button>
            </form>

            <article className="portal-panel-card">
              <h3>Existing Admins</h3>
              <div className="stack-sm">
                {admins.map((a) => (
                  <div className="portal-row compact" key={a.id}>
                    <div className="portal-row-main">
                      <strong>
                        {a.firstName} {a.lastName}
                      </strong>
                      <small>{a.role}</small>
                    </div>
                    <span>{a.email}</span>
                  </div>
                ))}
                {!admins.length ? <p>No admins available.</p> : null}
              </div>
            </article>
          </div>
        </section>
      )}
    </AppShell>
  )
}
