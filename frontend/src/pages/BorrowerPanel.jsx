import { useEffect, useMemo, useState } from 'react'
import AppShell from '../components/AppShell'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { openRazorpayCheckout } from '../lib/razorpay'

const sections = [
  { key: 'overview', label: 'Dashboard' },
  { key: 'account', label: 'Account Profile' },
  { key: 'kyc', label: 'KYC & Verification' },
  { key: 'borrow', label: 'Raise Request' },
  { key: 'repay', label: 'Repayment Hub' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'help', label: 'Help & Support' },
]

const formatINR = (n = 0) => `₹${Number(n).toLocaleString('en-IN')}`
const dateLabel = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'TBD')

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

  // Form states
  const [upi, setUpi] = useState('')
  const [currentUpi, setCurrentUpi] = useState(null)

  const [personalForm, setPersonalForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
  })

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })

  const [borrowForm, setBorrowForm] = useState({
    principalAmount: 2500,
    tenure: 'FOURTEEN',
    purpose: 'BOOKS',
    purposeNote: '',
    guarantorEmail: '',
    agreedToTerms: false,
  })

  const [kycForm, setKycForm] = useState({
    collegeIdNum: '',
    aadhaarNum: '',
    panNum: '',
  })

  const [supportTicket, setSupportTicket] = useState({
    subject: '',
    category: 'GENERAL',
    message: '',
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
        api.get('/users/upi', accessToken).catch(() => ({ data: {} })),
      ])
      setDashboard(d.data)
      setProfile(p.data)
      setMyLoans(l.data || [])
      setNotifications(n.data || [])
      setCreditHistory(c.data || [])
      setCurrentUpi(u.data?.upiId || null)

      if (p.data) {
        setPersonalForm({
          firstName: p.data.firstName || '',
          lastName: p.data.lastName || '',
          phone: p.data.phone || '',
        })
        setKycForm({
          collegeIdNum: p.data.collegeIdNum || '',
          aadhaarNum: p.data.aadhaarNum || '',
          panNum: p.data.panNum || '',
        })
      }
    } catch (err) {
      setError(err.message || 'Failed to load borrower dashboard')
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

  const unreadCount = useMemo(() => notifications.filter((n) => !n.isRead).length, [notifications])

  // Calculation engine for borrow request
  const borrowCalc = useMemo(() => {
    const principal = Number(borrowForm.principalAmount || 0)
    const multiplierMap = { SEVEN: 1.03, FOURTEEN: 1.05, THIRTY: 1.08, SIXTY: 1.12, NINETY: 1.16 }
    const daysMap = { SEVEN: 7, FOURTEEN: 14, THIRTY: 30, SIXTY: 60, NINETY: 90 }

    const multiplier = multiplierMap[borrowForm.tenure] || 1.05
    const days = daysMap[borrowForm.tenure] || 14
    const repayable = Math.round(principal * multiplier)
    const interest = repayable - principal

    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + days)

    return {
      principal,
      repayable,
      interest,
      dueDate: dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      isHighValue: principal > 5000,
    }
  }, [borrowForm.principalAmount, borrowForm.tenure])

  const handleUpdateProfile = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    try {
      await api.patch('/users/profile', personalForm, accessToken)
      setMessage('Profile details updated successfully.')
      await reload()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleLinkUpi = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    try {
      await api.post('/users/upi', { upiId: upi }, accessToken)
      setMessage('UPI ID linked successfully.')
      setUpi('')
      await reload()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleSubmitBorrow = async (e) => {
    e.preventDefault()
    if (!borrowForm.agreedToTerms) {
      setError('Please agree to campus lending terms to submit request.')
      return
    }
    setError('')
    setMessage('')
    try {
      await api.post(
        '/loans/request',
        {
          principalAmount: borrowCalc.principal,
          tenure: borrowForm.tenure,
          purpose: borrowForm.purpose,
          purposeNote: borrowForm.purposeNote || `${borrowForm.purpose} loan request`,
          guarantorEmail: borrowCalc.isHighValue ? borrowForm.guarantorEmail : undefined,
        },
        accessToken
      )
      setMessage('🚀 Loan request submitted to Campus Marketplace!')
      setActiveSection('overview')
      await reload()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleRepay = async (loanId) => {
    setError('')
    setMessage('')
    try {
      const order = await api.post(`/payments/repay/${loanId}`, {}, accessToken)
      if (order.data?.provider === 'MOCK') {
        await api.post(`/payments/repay/${loanId}/confirm`, {}, accessToken)
      } else if (order.data?.provider === 'RAZORPAY') {
        const payment = await openRazorpayCheckout({
          key: order.data.keyId,
          orderId: order.data.orderId,
          amount: order.data.amount,
          description: `Repayment for Loan #${loanId}`,
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
      setMessage('🎉 Repayment completed successfully!')
      await reload()
    } catch (err) {
      setError(err.message)
    }
  }

  const markNotificationRead = async (id) => {
    try {
      await api.patch(`/users/notifications/${id}/read`, {}, accessToken)
      await reload()
    } catch (err) {
      // Ignore
    }
  }

  return (
    <AppShell
      roleLabel="Borrower"
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
            <div className="portal-label pl-b">📊 Borrower Overview</div>
            <h2>Campus Credit Snapshot & Active Requests</h2>
          </div>

          <div className="portal-grid portal-grid-three">
            <article className="portal-stat-card">
              <span className="portal-stat-label">Available Credit Limit</span>
              <span className="portal-stat-value">{formatINR(profile?.borrowLimit || 25000)}</span>
              <span className="portal-chip pchip-green" style={{ marginTop: 8 }}>
                ✓ {profile?.kycStatus === 'APPROVED' ? 'Verified Borrower' : 'KYC Submitted'}
              </span>
            </article>

            <article className="portal-stat-card">
              <span className="portal-stat-label">Credit Score</span>
              <span className="portal-stat-value" style={{ color: 'var(--gold)' }}>
                {profile?.creditScore || 750} <small>/ 900</small>
              </span>
              <span className="portal-chip pchip-gold" style={{ marginTop: 8 }}>
                Grade A+ Campus Rating
              </span>
            </article>

            <article className="portal-stat-card">
              <span className="portal-stat-label">Total Borrowed</span>
              <span className="portal-stat-value">{formatINR(dashboard?.totalBorrowed || 0)}</span>
              <span className="portal-chip pchip-blue" style={{ marginTop: 8 }}>
                {myLoans.length} Loans Total
              </span>
            </article>
          </div>

          <div className="portal-grid portal-grid-two">
            <article className="portal-panel-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <h3 style={{ margin: 0 }}>Active Loan Progress</h3>
                {activeLoan && (
                  <span className={`status-pill ${activeLoan.status?.toLowerCase()}`}>
                    {activeLoan.status}
                  </span>
                )}
              </div>

              {activeLoan ? (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 6 }}>
                    <span>Amount: <strong>{formatINR(activeLoan.principalAmount)}</strong></span>
                    <span>Repayable: <strong style={{ color: 'var(--gold)' }}>{formatINR(activeLoan.repayableAmount || activeLoan.principalAmount * 1.08)}</strong></span>
                  </div>
                  <div style={{ background: 'var(--surface)', borderRadius: 10, height: 10, overflow: 'hidden', margin: '12px 0' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${activeLoan.status === 'REPAID' ? 100 : 35}%`,
                        background: 'linear-gradient(90deg, #00d09c, #059669)',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--muted)' }}>
                    <span>Purpose: <strong>{activeLoan.purpose}</strong></span>
                    <span>Due Date: <strong>{dateLabel(activeLoan.dueDate)}</strong></span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => handleRepay(activeLoan.id)}
                    style={{ width: '100%', marginTop: 16, padding: 12, borderRadius: 10 }}
                  >
                    💳 Repay Now ({formatINR(activeLoan.repayableAmount || activeLoan.principalAmount * 1.08)})
                  </button>
                </div>
              ) : (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--muted)' }}>
                  <p>No active loan currently. Apply for a micro-loan anytime!</p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setActiveSection('borrow')}
                    style={{ marginTop: 12, padding: '10px 20px', borderRadius: 10 }}
                  >
                    🚀 Raise Borrower Request
                  </button>
                </div>
              )}
            </article>

            <article className="portal-panel-card">
              <h3>Quick Actions</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
                <button
                  type="button"
                  onClick={() => setActiveSection('borrow')}
                  style={{
                    padding: 16,
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: '1.4rem' }}>🎓</div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', marginTop: 4 }}>Apply Loan</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Instant peer request</div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveSection('repay')}
                  style={{
                    padding: 16,
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: '1.4rem' }}>💳</div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', marginTop: 4 }}>Repayments</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>UPI & Razorpay</div>
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
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Upload Student ID</div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveSection('help')}
                  style={{
                    padding: 16,
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: '1.4rem' }}>🎧</div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', marginTop: 4 }}>Help & Support</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>24/7 Campus Support</div>
                </button>
              </div>
            </article>
          </div>
        </section>
      )}

      {/* ===== 2. ACCOUNT PROFILE ===== */}
      {activeSection === 'account' && (
        <section className="stack-lg">
          <div className="portal-section-head">
            <div className="portal-label pl-b">👤 Student Profile</div>
            <h2>Account Details & Security Settings</h2>
          </div>

          <div className="portal-grid portal-grid-two">
            <form className="portal-panel-card form" onSubmit={handleUpdateProfile}>
              <h3>Personal & Campus Info</h3>
              <label>
                First Name
                <input
                  value={personalForm.firstName}
                  onChange={(e) => setPersonalForm((p) => ({ ...p, firstName: e.target.value }))}
                  required
                />
              </label>

              <label>
                Last Name
                <input
                  value={personalForm.lastName}
                  onChange={(e) => setPersonalForm((p) => ({ ...p, lastName: e.target.value }))}
                />
              </label>

              <label>
                University Email (Locked)
                <input value={profile?.email || user?.email || ''} disabled style={{ opacity: 0.6 }} />
              </label>

              <label>
                Phone Number
                <input
                  value={personalForm.phone}
                  onChange={(e) => setPersonalForm((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="+91..."
                />
              </label>

              <button className="btn btn-primary" type="submit" style={{ marginTop: 10 }}>
                Save Profile Changes
              </button>
            </form>

            <form className="portal-panel-card form" onSubmit={handleLinkUpi}>
              <h3>UPI & Disbursement Setup</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 12 }}>
                Current Linked UPI: <strong>{currentUpi || 'Not linked yet'}</strong>
              </p>
              <label>
                New UPI Address
                <input
                  value={upi}
                  onChange={(e) => setUpi(e.target.value)}
                  placeholder="e.g. name@okaxis or student@upi"
                  required
                />
              </label>

              <button className="btn btn-primary" type="submit" style={{ marginTop: 10 }}>
                Link UPI Address
              </button>
            </form>
          </div>
        </section>
      )}

      {/* ===== 3. KYC & VERIFICATION ===== */}
      {activeSection === 'kyc' && (
        <section className="stack-lg">
          <div className="portal-section-head">
            <div className="portal-label pl-b">🆔 Student KYC & Verification</div>
            <h2>Campus Verification Stepper & Documents</h2>
          </div>

          <div className="portal-panel-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0 }}>KYC Status Check</h3>
                <span style={{ fontSize: '0.83rem', color: 'var(--muted)' }}>Verified student accounts get instant peer funding.</span>
              </div>
              <span className="portal-chip pchip-green" style={{ fontSize: '0.9rem', padding: '8px 16px' }}>
                ✓ {profile?.kycStatus || 'VERIFIED'}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, margin: '20px 0' }}>
              <div style={{ background: 'var(--surface)', padding: 14, borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Step 1</div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginTop: 2 }}>Campus Email</div>
                <div style={{ color: '#059669', fontSize: '0.78rem', fontWeight: 600, marginTop: 4 }}>✓ Verified</div>
              </div>

              <div style={{ background: 'var(--surface)', padding: 14, borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Step 2</div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginTop: 2 }}>Student ID Card</div>
                <div style={{ color: '#059669', fontSize: '0.78rem', fontWeight: 600, marginTop: 4 }}>✓ Attached</div>
              </div>

              <div style={{ background: 'var(--surface)', padding: 14, borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Step 3</div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginTop: 2 }}>Govt. Aadhaar / PAN</div>
                <div style={{ color: '#059669', fontSize: '0.78rem', fontWeight: 600, marginTop: 4 }}>✓ Submitted</div>
              </div>

              <div style={{ background: 'var(--surface)', padding: 14, borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Step 4</div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginTop: 2 }}>Video Liveness</div>
                <div style={{ color: '#059669', fontSize: '0.78rem', fontWeight: 600, marginTop: 4 }}>✓ Checked</div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ===== 4. RAISE REQUEST ===== */}
      {activeSection === 'borrow' && (
        <section className="stack-lg">
          <div className="portal-section-head">
            <div className="portal-label pl-b">🎓 Raise Borrower Request</div>
            <h2>Interactive Micro-Loan Application Wizard</h2>
          </div>

          <form className="portal-panel-card stack-sm" onSubmit={handleSubmitBorrow} style={{ maxWidth: 640 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontWeight: 600, fontSize: '0.9rem' }}>Select Requested Amount:</label>
                <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--gold)' }}>{formatINR(borrowForm.principalAmount)}</span>
              </div>
              <input
                type="range"
                min={500}
                max={50000}
                step={500}
                value={borrowForm.principalAmount}
                onChange={(e) => setBorrowForm((p) => ({ ...p, principalAmount: Number(e.target.value) }))}
                style={{ width: '100%', accentColor: '#c9a84c' }}
              />
            </div>

            <div style={{ marginTop: 14 }}>
              <label style={{ fontWeight: 600, fontSize: '0.9rem', display: 'block', marginBottom: 8 }}>Repayment Tenure:</label>
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
                {[
                  { id: 'SEVEN', label: '7 Days', rate: '3%' },
                  { id: 'FOURTEEN', label: '14 Days', rate: '5%' },
                  { id: 'THIRTY', label: '30 Days', rate: '8%' },
                  { id: 'SIXTY', label: '60 Days', rate: '12%' },
                  { id: 'NINETY', label: '90 Days', rate: '16%' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setBorrowForm((p) => ({ ...p, tenure: item.id }))}
                    style={{
                      flex: 1,
                      padding: '10px 8px',
                      borderRadius: 10,
                      border: borrowForm.tenure === item.id ? '2px solid #c9a84c' : '1px solid var(--border)',
                      background: borrowForm.tenure === item.id ? 'rgba(201, 168, 76, 0.15)' : 'var(--surface)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{item.label}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{item.rate}</div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 16, border: '1px solid var(--border)', marginTop: 14 }}>
              <h4 style={{ margin: 0, fontSize: '0.95rem' }}>Loan Calculation Summary</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10, fontSize: '0.85rem' }}>
                <div>
                  <span style={{ color: 'var(--muted)' }}>Principal Amount:</span>
                  <div style={{ fontWeight: 700 }}>{formatINR(borrowCalc.principal)}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)' }}>Total Repayable:</span>
                  <div style={{ fontWeight: 800, color: 'var(--gold)' }}>{formatINR(borrowCalc.repayable)}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)' }}>Estimated Due Date:</span>
                  <div style={{ fontWeight: 700 }}>{borrowCalc.dueDate}</div>
                </div>
              </div>
            </div>

            {borrowCalc.isHighValue && (
              <div style={{ marginTop: 12, background: 'rgba(245, 158, 11, 0.1)', padding: 12, borderRadius: 10, border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#b45309' }}>
                  ⚠️ Peer Guarantor Required: Loans above ₹5,000 require 1 verified peer student email.
                </span>
                <input
                  type="email"
                  placeholder="Enter Campus Peer Email (e.g. friend@lpu.in)..."
                  value={borrowForm.guarantorEmail}
                  onChange={(e) => setBorrowForm((p) => ({ ...p, guarantorEmail: e.target.value }))}
                  style={{ width: '100%', marginTop: 8, borderRadius: 8, padding: 8, border: '1px solid var(--border)' }}
                />
              </div>
            )}

            <label style={{ display: 'flex', gap: 8, marginTop: 14, cursor: 'pointer', fontSize: '0.82rem' }}>
              <input
                type="checkbox"
                checked={borrowForm.agreedToTerms}
                onChange={(e) => setBorrowForm((p) => ({ ...p, agreedToTerms: e.target.checked }))}
              />
              <span>I agree to campus peer lending rules and pledge to repay on or before due date.</span>
            </label>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={!borrowForm.agreedToTerms}
              style={{ width: '100%', padding: 14, borderRadius: 10, marginTop: 14 }}
            >
              🚀 Submit Loan Request to Marketplace
            </button>
          </form>
        </section>
      )}

      {/* ===== 5. REPAYMENT HUB ===== */}
      {activeSection === 'repay' && (
        <section className="stack-lg">
          <div className="portal-section-head">
            <div className="portal-label pl-b">💳 Repayment Hub</div>
            <h2>Manage Loan Repayments & Settlement Receipts</h2>
          </div>

          <div className="portal-panel-card">
            <h3>My Active & Historic Loans</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
              {myLoans.map((loan) => (
                <div
                  key={loan.id}
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
                    <div style={{ fontWeight: 700 }}>{formatINR(loan.principalAmount)} ({loan.purpose})</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                      Due: {dateLabel(loan.dueDate)} · Total Repayable: {formatINR(loan.repayableAmount || loan.principalAmount * 1.08)}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className={`status-pill ${loan.status?.toLowerCase()}`}>
                      {loan.status}
                    </span>
                    {['PENDING', 'FUNDED', 'ACTIVE'].includes(loan.status) && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => handleRepay(loan.id)}
                        style={{ padding: '6px 14px', fontSize: '0.82rem' }}
                      >
                        Repay
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {!myLoans.length && <p style={{ color: 'var(--muted)' }}>No loan history available.</p>}
            </div>
          </div>
        </section>
      )}

      {/* ===== 6. NOTIFICATIONS ===== */}
      {activeSection === 'notifications' && (
        <section className="stack-lg">
          <div className="portal-section-head">
            <div className="portal-label pl-b">🔔 Notifications</div>
            <h2>Campus Alerts & Loan Updates</h2>
          </div>

          <div className="portal-panel-card stack-sm">
            {notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => markNotificationRead(n.id)}
                style={{
                  padding: 14,
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: n.isRead ? 'var(--surface)' : 'rgba(201, 168, 76, 0.1)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{n.title}</div>
                <div style={{ fontSize: '0.83rem', color: 'var(--muted)', marginTop: 2 }}>{n.message}</div>
              </div>
            ))}
            {!notifications.length && <p style={{ color: 'var(--muted)' }}>No notification alerts.</p>}
          </div>
        </section>
      )}

      {/* ===== 7. HELP & SUPPORT ===== */}
      {activeSection === 'help' && (
        <section className="stack-lg">
          <div className="portal-section-head">
            <div className="portal-label pl-b">🎧 Help & Support</div>
            <h2>Frequently Asked Questions & Campus Support</h2>
          </div>

          <div className="portal-grid portal-grid-two">
            <div className="portal-panel-card">
              <h3>Frequently Asked Questions</h3>
              <div className="stack-sm" style={{ marginTop: 12, fontSize: '0.85rem' }}>
                <details style={{ background: 'var(--surface)', padding: 12, borderRadius: 8 }}>
                  <summary style={{ fontWeight: 700, cursor: 'pointer' }}>How fast are funds disbursed?</summary>
                  <p style={{ marginTop: 6, color: 'var(--muted)' }}>Disbursements take 1-5 minutes directly to your linked UPI address after a provider funds your request.</p>
                </details>
                <details style={{ background: 'var(--surface)', padding: 12, borderRadius: 8 }}>
                  <summary style={{ fontWeight: 700, cursor: 'pointer' }}>What happens if I miss a repayment?</summary>
                  <p style={{ marginTop: 6, color: 'var(--muted)' }}>A late fee of ₹50/day applies and credit score is penalized. Formal hold notices are generated for defaults.</p>
                </details>
              </div>
            </div>

            <div className="portal-panel-card">
              <h3>Contact Campus Desk</h3>
              <p style={{ fontSize: '0.83rem', color: 'var(--muted)' }}>Email: support@unifi.campus | Hours: 9 AM - 8 PM IST</p>
            </div>
          </div>
        </section>
      )}
    </AppShell>
  )
}
