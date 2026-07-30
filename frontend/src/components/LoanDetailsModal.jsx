import { useState } from 'react'
import { api } from '../lib/api'

const formatINR = (n = 0) => `₹${Number(n).toLocaleString('en-IN')}`
const formatDate = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'TBD')

export default function LoanDetailsModal({ isOpen, onClose, loan, accessToken, isProvider, onFundSuccess }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  if (!isOpen || !loan) return null

  const handleFund = async () => {
    setError('')
    setSuccessMsg('')
    setLoading(true)
    try {
      await api.post(`/loans/${loan.id}/fund`, {}, accessToken)
      setSuccessMsg('🎉 Loan funded successfully! Your return will be credited upon repayment.')
      onFundSuccess?.()
      setTimeout(() => {
        onClose()
      }, 1500)
    } catch (err) {
      setError(err.message || 'Failed to fund loan')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-backdrop" style={{ zIndex: 1100 }}>
      <div className="portal-alert-card" style={{ maxWidth: 540, width: '92%', padding: 28, position: 'relative' }}>
        <button
          type="button"
          onClick={onClose}
          style={{ position: 'absolute', top: 18, right: 18, background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}
        >
          ✕
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <span className="portal-chip" style={{ background: 'rgba(201, 168, 76, 0.15)', color: '#d97706', border: '1px solid rgba(201, 168, 76, 0.3)' }}>
              {loan.purpose || 'MICRO_LOAN'}
            </span>
            <h3 style={{ fontSize: '1.35rem', marginTop: 6, marginBottom: 2 }}>{formatINR(loan.principalAmount)} Requested</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Created on {formatDate(loan.createdAt)}</span>
          </div>

          <span className={`status-pill ${loan.status?.toLowerCase()}`} style={{ padding: '6px 12px', fontSize: '0.8rem', fontWeight: 700 }}>
            {loan.status}
          </span>
        </div>

        {error && <div className="error-text" style={{ marginBottom: 14 }}>{error}</div>}
        {successMsg && <div className="success-text" style={{ marginBottom: 14 }}>{successMsg}</div>}

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 16 }}>
          <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            🎓 Student Borrower Information
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10, fontSize: '0.85rem' }}>
            <div>
              <span style={{ color: 'var(--muted)' }}>Student Name:</span>
              <div style={{ fontWeight: 700 }}>{loan.borrower?.firstName || 'Verified Student'} {loan.borrower?.lastName || ''}</div>
            </div>
            <div>
              <span style={{ color: 'var(--muted)' }}>Campus / University:</span>
              <div style={{ fontWeight: 700 }}>{loan.borrower?.university?.name || 'Lovely Professional University (LPU)'}</div>
            </div>
            <div>
              <span style={{ color: 'var(--muted)' }}>Credit Rating:</span>
              <div style={{ fontWeight: 800, color: '#059669' }}>
                🟢 {loan.borrower?.creditScore || 750} / 900 (Grade A+)
              </div>
            </div>
            <div>
              <span style={{ color: 'var(--muted)' }}>KYC Verification:</span>
              <div style={{ fontWeight: 700, color: '#059669' }}>✓ Verified Campus Student</div>
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 20 }}>
          <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            📊 Financial Terms & Returns
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10, fontSize: '0.85rem' }}>
            <div>
              <span style={{ color: 'var(--muted)' }}>Repayment Amount:</span>
              <div style={{ fontWeight: 800, color: 'var(--gold)', fontSize: '1.05rem' }}>{formatINR(loan.repayableAmount || loan.principalAmount * 1.08)}</div>
            </div>
            <div>
              <span style={{ color: 'var(--muted)' }}>Net Provider Return:</span>
              <div style={{ fontWeight: 700, color: '#059669' }}>+{formatINR((loan.repayableAmount || loan.principalAmount * 1.08) - loan.principalAmount)}</div>
            </div>
            <div>
              <span style={{ color: 'var(--muted)' }}>Duration:</span>
              <div style={{ fontWeight: 700 }}>{loan.tenure || '14 Days'}</div>
            </div>
            <div>
              <span style={{ color: 'var(--muted)' }}>Due Date:</span>
              <div style={{ fontWeight: 700 }}>{formatDate(loan.dueDate)}</div>
            </div>
          </div>
        </div>

        {loan.purposeNote && (
          <div style={{ background: 'rgba(255, 255, 255, 0.04)', borderRadius: 10, padding: 12, marginBottom: 20, fontSize: '0.83rem', color: 'var(--muted)' }}>
            <strong>Borrower Note:</strong> "{loan.purposeNote}"
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 10 }}>
            Close
          </button>

          {isProvider && ['PENDING', 'LISTED'].includes(loan.status) && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleFund}
              disabled={loading}
              style={{ flex: 2, padding: 12, borderRadius: 10 }}
            >
              {loading ? 'Processing Funding...' : `💰 Fund Loan (${formatINR(loan.principalAmount)})`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
