const formatINR = (n = 0) => `₹${Number(n).toLocaleString('en-IN')}`

export default function UniversityHoldNoticeModal({ isOpen, onClose, loan }) {
  if (!isOpen || !loan) return null

  const studentName = `${loan.borrower?.firstName || 'Student'} ${loan.borrower?.lastName || ''}`.trim()
  const universityName = loan.borrower?.university?.name || 'Lovely Professional University'
  const rollNumber = loan.borrower?.collegeIdNum || '12014589'
  const amountDue = formatINR(loan.repayableAmount || loan.principalAmount * 1.1)
  const overdueDays = Math.max(1, Math.floor((Date.now() - new Date(loan.dueDate || Date.now()).getTime()) / (1000 * 60 * 60 * 24)))
  const noticeDate = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  const referenceNo = `UNIFI/HOLD/${new Date().getFullYear()}/${loan.id?.slice(0, 6).toUpperCase()}`

  const printNotice = () => {
    window.print()
  }

  return (
    <div className="modal-backdrop" style={{ zIndex: 1200 }}>
      <div
        className="portal-alert-card"
        style={{
          maxWidth: 680,
          width: '94%',
          padding: 36,
          background: '#ffffff',
          color: '#0f172a',
          position: 'relative',
          borderRadius: 16,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{ position: 'absolute', top: 18, right: 18, background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}
        >
          ✕
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #0f172a', paddingBottom: 16, marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#c9a84c', textTransform: 'uppercase', letterSpacing: 1 }}>UniFi Campus Compliance</h2>
            <div style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>Financial Integrity & Non-Payback Risk Mitigation Office</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: '0.78rem', color: '#64748b' }}>
            <div><strong>Ref:</strong> {referenceNo}</div>
            <div><strong>Date:</strong> {noticeDate}</div>
          </div>
        </div>

        <div style={{ fontSize: '0.9rem', lineHeight: 1.6, color: '#1e293b' }}>
          <div style={{ marginBottom: 14 }}>
            <strong>To:</strong><br />
            The Office of the Registrar & Student Welfare,<br />
            {universityName}
          </div>

          <div style={{ fontWeight: 700, textDecoration: 'underline', marginBottom: 14, fontSize: '0.95rem' }}>
            SUBJECT: Official Administrative Hold Request for Defaulted Student Micro-Loan Account
          </div>

          <p>Respected Sir/Madam,</p>

          <p>
            This official notice is issued by <strong>UniFi Peer-to-Peer Campus Lending Network</strong> regarding student borrower{' '}
            <strong>{studentName}</strong> (Roll / Reg. No: <strong>{rollNumber}</strong>).
          </p>

          <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 10, padding: 14, margin: '14px 0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.85rem' }}>
              <div><strong>Defaulted Loan ID:</strong> {loan.publicId || loan.id}</div>
              <div><strong>Overdue Amount:</strong> {amountDue}</div>
              <div><strong>Days Overdue:</strong> {overdueDays} Days</div>
              <div><strong>Credit Score Penalty:</strong> -80 Points Applied</div>
            </div>
          </div>

          <p>
            Despite multiple reminders, the aforementioned student has defaulted on their peer campus obligation. As per campus credit policy guidelines, we request the administration to place an <strong>Academic Transcript & Clearance Hold</strong> on the student record until the financial obligation is settled.
          </p>

          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
            <div>
              <div style={{ fontWeight: 700 }}>Authorized Signatory</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>UniFi Risk & Campus Compliance Board</div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="btn btn-ghost" onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8 }}>
                Close
              </button>
              <button type="button" className="btn btn-primary" onClick={printNotice} style={{ padding: '8px 18px', borderRadius: 8 }}>
                🖨️ Print / Save Official Notice
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
