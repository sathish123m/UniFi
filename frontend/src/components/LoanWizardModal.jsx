import { useMemo, useState } from 'react'
import { api } from '../lib/api'

const PURPOSES = [
  { id: 'TUITION', label: '🎓 Tuition & Exam Fees', icon: '🎓' },
  { id: 'BOOKS', label: '📚 Books & Study Material', icon: '📚' },
  { id: 'HOSTEL', label: '🏠 Hostel & Mess Rent', icon: '🏠' },
  { id: 'FOOD', label: '🍲 Food & Daily Living', icon: '🍲' },
  { id: 'EMERGENCY', label: '🚨 Health & Emergency', icon: '🚨' },
  { id: 'EQUIPMENT', label: '💻 Laptop & Project Gear', icon: '💻' },
]

const TENURES = [
  { id: 'SEVEN', days: 7, label: '7 Days', multiplier: 1.03 },
  { id: 'FOURTEEN', days: 14, label: '14 Days', multiplier: 1.05 },
  { id: 'THIRTY', days: 30, label: '30 Days', multiplier: 1.08 },
  { id: 'SIXTY', days: 60, label: '60 Days', multiplier: 1.12 },
  { id: 'NINETY', days: 90, label: '90 Days', multiplier: 1.16 },
]

const formatINR = (n = 0) => `₹${Number(n).toLocaleString('en-IN')}`

export default function LoanWizardModal({ isOpen, onClose, accessToken, onSuccess }) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    principalAmount: 2500,
    purpose: 'BOOKS',
    purposeNote: '',
    tenure: 'FOURTEEN',
    guarantorEmail: '',
    agreedToTerms: false,
  })

  const selectedTenure = useMemo(
    () => TENURES.find((t) => t.id === form.tenure) || TENURES[1],
    [form.tenure]
  )

  const calculation = useMemo(() => {
    const principal = Number(form.principalAmount || 0)
    const repayable = Math.round(principal * selectedTenure.multiplier)
    const interest = repayable - principal
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + selectedTenure.days)

    const isHighValue = principal > 5000

    return {
      principal,
      repayable,
      interest,
      dueDate: dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      isHighValue,
    }
  }, [form.principalAmount, selectedTenure])

  if (!isOpen) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.agreedToTerms) {
      setError('Please accept the campus lending terms to submit your request.')
      return
    }
    setError('')
    setLoading(true)
    try {
      await api.post(
        '/loans/request',
        {
          principalAmount: calculation.principal,
          tenure: form.tenure,
          purpose: form.purpose,
          purposeNote: form.purposeNote || `${form.purpose} micro-loan request`,
          guarantorEmail: calculation.isHighValue ? form.guarantorEmail : undefined,
        },
        accessToken
      )
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to submit loan request')
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

        <div style={{ marginBottom: 20 }}>
          <span className="portal-chip" style={{ background: 'rgba(201, 168, 76, 0.15)', color: '#d97706', border: '1px solid rgba(201, 168, 76, 0.3)' }}>
            Step {step} of 3
          </span>
          <h3 style={{ fontSize: '1.4rem', marginTop: 8, marginBottom: 4 }}>Apply for Campus Loan</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Zero paperwork. Direct peer-to-peer campus funding.</p>
        </div>

        {error && <div className="error-text" style={{ marginBottom: 16 }}>{error}</div>}

        {step === 1 && (
          <div className="stack-sm">
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontWeight: 600, fontSize: '0.9rem' }}>Select Loan Amount:</label>
                <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--gold)' }}>{formatINR(form.principalAmount)}</span>
              </div>
              <input
                type="range"
                min={500}
                max={50000}
                step={500}
                value={form.principalAmount}
                onChange={(e) => setForm((p) => ({ ...p, principalAmount: Number(e.target.value) }))}
                style={{ width: '100%', accentColor: '#c9a84c' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--muted)', marginTop: 4 }}>
                <span>₹500</span>
                <span>₹25,000</span>
                <span>₹50,000</span>
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <label style={{ fontWeight: 600, fontSize: '0.9rem', display: 'block', marginBottom: 8 }}>Loan Category:</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {PURPOSES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, purpose: item.id }))}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: form.purpose === item.id ? '2px solid #c9a84c' : '1px solid var(--border)',
                      background: form.purpose === item.id ? 'rgba(201, 168, 76, 0.12)' : 'var(--surface)',
                      textAlign: 'left',
                      fontSize: '0.83rem',
                      fontWeight: form.purpose === item.id ? 700 : 500,
                      cursor: 'pointer',
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: 6 }}>Notes / Explanation (Optional):</label>
              <textarea
                placeholder="Explain what you need this loan for (e.g. Books for End-Sem Exam)..."
                value={form.purposeNote}
                onChange={(e) => setForm((p) => ({ ...p, purposeNote: e.target.value }))}
                rows={2}
                style={{ width: '100%', borderRadius: 10, padding: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}
              />
            </div>

            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setStep(2)}
              style={{ width: '100%', marginTop: 20, padding: 12, borderRadius: 10 }}
            >
              Continue to Duration ➔
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="stack-sm">
            <label style={{ fontWeight: 600, fontSize: '0.9rem', display: 'block', marginBottom: 8 }}>Select Repayment Duration:</label>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
              {TENURES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, tenure: item.id }))}
                  style={{
                    flex: '1 0 75px',
                    padding: '12px 8px',
                    borderRadius: 10,
                    border: form.tenure === item.id ? '2px solid #c9a84c' : '1px solid var(--border)',
                    background: form.tenure === item.id ? 'rgba(201, 168, 76, 0.15)' : 'var(--surface)',
                    textAlign: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: '0.95rem', fontWeight: 800 }}>{item.label}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2 }}>{Math.round((item.multiplier - 1) * 100)}% interest</div>
                </button>
              ))}
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginTop: 16 }}>
              <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text)' }}>Loan Calculation Summary</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12, fontSize: '0.85rem' }}>
                <div>
                  <span style={{ color: 'var(--muted)' }}>Principal Amount:</span>
                  <div style={{ fontWeight: 700 }}>{formatINR(calculation.principal)}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)' }}>Interest & Fees:</span>
                  <div style={{ fontWeight: 700, color: '#059669' }}>+{formatINR(calculation.interest)}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)' }}>Total Repayable:</span>
                  <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--gold)' }}>{formatINR(calculation.repayable)}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)' }}>Due Date:</span>
                  <div style={{ fontWeight: 700 }}>{calculation.dueDate}</div>
                </div>
              </div>
            </div>

            {calculation.isHighValue && (
              <div style={{ marginTop: 14, background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: 10, padding: 12 }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#b45309' }}>
                  ⚠️ Peer Guarantor Required: Loans above ₹5,000 require 1 verified peer student email for approval.
                </span>
                <input
                  type="email"
                  placeholder="Enter Campus Peer Email (e.g. friend@lpu.in)..."
                  value={form.guarantorEmail}
                  onChange={(e) => setForm((p) => ({ ...p, guarantorEmail: e.target.value }))}
                  style={{ width: '100%', marginTop: 8, borderRadius: 8, padding: 8, border: '1px solid var(--border)' }}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setStep(1)}
                style={{ flex: 1, padding: 12, borderRadius: 10 }}
              >
                ← Back
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setStep(3)}
                style={{ flex: 2, padding: 12, borderRadius: 10 }}
              >
                Review Summary ➔
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <form onSubmit={handleSubmit} className="stack-sm">
            <div style={{ background: 'rgba(201, 168, 76, 0.08)', border: '1px dashed rgba(201, 168, 76, 0.4)', borderRadius: 12, padding: 18 }}>
              <h4 style={{ margin: 0, fontSize: '1rem' }}>Final Review & Campus Pledge</h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 4, marginBottom: 12 }}>
                By submitting, your loan request will be listed on the UniFi Campus Marketplace for peer funding.
              </p>
              <ul style={{ paddingLeft: 18, margin: 0, fontSize: '0.82rem', color: 'var(--text)', lineHeight: 1.6 }}>
                <li>Requested Amount: <strong>{formatINR(calculation.principal)}</strong></li>
                <li>Total Repayment: <strong>{formatINR(calculation.repayable)}</strong> due on <strong>{calculation.dueDate}</strong></li>
                <li>Timely payments build your campus credit score and unlock higher borrowing limits.</li>
              </ul>
            </div>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 14, cursor: 'pointer', fontSize: '0.8rem' }}>
              <input
                type="checkbox"
                checked={form.agreedToTerms}
                onChange={(e) => setForm((p) => ({ ...p, agreedToTerms: e.target.checked }))}
                style={{ marginTop: 2 }}
              />
              <span>I pledge to repay this peer loan on or before the due date as per UniFi campus guidelines.</span>
            </label>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setStep(2)}
                disabled={loading}
                style={{ flex: 1, padding: 12, borderRadius: 10 }}
              >
                ← Back
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading || !form.agreedToTerms}
                style={{ flex: 2, padding: 12, borderRadius: 10 }}
              >
                {loading ? 'Submitting Request...' : '🚀 Submit Loan Request'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
