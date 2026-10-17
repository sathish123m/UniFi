import { useState, useRef, useEffect } from 'react'
import { api } from '../lib/api'
import { isValidAadhaar, normalizeAadhaar, isValidPan, normalizePan, imageFileError } from '../lib/kycValidation'

export default function MultiDocumentKycModal({ isOpen, onClose, accessToken, currentKyc, onSuccess }) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const [formData, setFormData] = useState({
    collegeIdNum: currentKyc?.studentIdNumber || '',
    aadhaarNumber: '',
    panNumber: '',
  })

  const [files, setFiles] = useState({
    collegeIdDoc: null,
    aadhaarFront: null,
    aadhaarBack: null,
    panDoc: null,
  })

  const [cameraActive, setCameraActive] = useState(false)
  const [capturedSelfie, setCapturedSelfie] = useState(null)
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  const stopCamera = () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
    } catch {}
    setCameraActive(false)
  }

  // Attach the live stream once the <video> element is mounted (it only renders
  // when cameraActive is true), avoiding the srcObject-before-mount race.
  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
    }
  }, [cameraActive])

  // Always release the camera when the modal closes or unmounts.
  useEffect(() => {
    if (!isOpen) stopCamera()
    return () => stopCamera()
  }, [isOpen])

  // Close on Escape so keyboard users aren't trapped.
  useEffect(() => {
    if (!isOpen) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  // Client-side format validation for instant feedback. The server re-checks
  // everything (and sniffs real image bytes) before anything is stored, so an
  // admin only ever reviews format-valid submissions.
  const handleFileChange = (key, file, label) => {
    if (!file) return
    const err = imageFileError(file, label)
    if (err) {
      setError(err)
      setFiles((p) => ({ ...p, [key]: null }))
      return
    }
    setError('')
    setFiles((p) => ({ ...p, [key]: file }))
  }

  const goToStep2 = () => {
    if (!formData.collegeIdNum.trim()) { setError('Enter your college roll / registration number.'); return }
    if (!files.collegeIdDoc) { setError('Upload your college ID front image.'); return }
    setError('')
    setStep(2)
  }

  const goToStep3 = () => {
    if (!isValidAadhaar(formData.aadhaarNumber)) { setError('Enter a valid 12-digit Aadhaar number (the checksum did not match).'); return }
    if (!files.aadhaarFront) { setError('Upload the Aadhaar front image.'); return }
    if (!files.aadhaarBack) { setError('Upload the Aadhaar back image.'); return }
    if (!isValidPan(formData.panNumber)) { setError('Enter a valid PAN in the format ABCPZ1234K.'); return }
    if (!files.panDoc) { setError('Upload your PAN card image.'); return }
    setError('')
    setStep(3)
  }

  const startCamera = async () => {
    setError('')
    if (!navigator?.mediaDevices?.getUserMedia) {
      setError('Webcam access is restricted or unsupported on this connection. Please try a different browser.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 } })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setCameraActive(true)
    } catch (err) {
      setError('Webcam access denied or unavailable. Please grant camera permission to complete Video KYC.')
    }
  }

  const captureSelfie = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas')
      canvas.width = videoRef.current.videoWidth || 480
      canvas.height = videoRef.current.videoHeight || 360
      const ctx = canvas.getContext('2d')
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height)
      setCapturedSelfie(canvas.toDataURL('image/jpeg'))
      stopCamera()
    }
  }

  const handleSubmitAll = async (e) => {
    e.preventDefault()
    setError('')
    setSuccessMsg('')
    if (!capturedSelfie) { setError('Capture a selfie before submitting.'); return }
    setLoading(true)
    try {
      const payload = new FormData()
      payload.append('collegeIdNum', formData.collegeIdNum)
      payload.append('aadhaarNumber', normalizeAadhaar(formData.aadhaarNumber))
      payload.append('panNumber', normalizePan(formData.panNumber))
      if (files.collegeIdDoc) payload.append('collegeIdDoc', files.collegeIdDoc)
      if (files.aadhaarFront) payload.append('aadhaarFront', files.aadhaarFront)
      if (files.aadhaarBack) payload.append('aadhaarBack', files.aadhaarBack)
      if (files.panDoc) payload.append('panDoc', files.panDoc)
      if (capturedSelfie) payload.append('livenessSelfie', capturedSelfie)

      await api.post('/users/kyc/submit', payload, accessToken, true)
      setSuccessMsg('KYC documents submitted successfully! Admin review in progress.')
      onSuccess?.()
      setTimeout(() => onClose(), 1500)
    } catch (err) {
      setError(err.message || 'Failed to submit KYC documents')
    } finally {
      setLoading(false)
    }
  }

  const labelStyle = { fontSize: '0.83rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }
  const inputStyle = { width: '100%', borderRadius: 10, padding: 10, border: '1px solid var(--border)', background: 'var(--surface)' }

  return (
    <div className="modal-backdrop" style={{ zIndex: 1100 }}>
      <div className="portal-alert-card" role="dialog" aria-modal="true" aria-label="KYC document verification" style={{ maxWidth: 580, width: '92%', padding: 28, position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close verification"
          style={{ position: 'absolute', top: 18, right: 18, background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}
        >
          ✕
        </button>

        <div style={{ marginBottom: 18 }}>
          <span className="portal-chip" style={{ background: 'rgba(0, 208, 156, 0.15)', color: '#059669', border: '1px solid rgba(0, 208, 156, 0.3)' }}>
            Verification Stepper ({step}/3)
          </span>
          <h3 style={{ fontSize: '1.4rem', marginTop: 8, marginBottom: 4 }}>Student KYC Verification</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Submit your student ID, government identity (Aadhaar &amp; PAN) and a selfie for admin review to unlock borrowing &amp; peer-funding.</p>
        </div>

        {error && <div className="error-text" style={{ marginBottom: 14 }}>{error}</div>}
        {successMsg && <div className="success-text" style={{ marginBottom: 14 }}>{successMsg}</div>}

        {step === 1 && (
          <div className="stack-sm">
            <h4 style={{ margin: 0, fontSize: '0.95rem' }}>1. Student College ID Card</h4>
            <div>
              <label style={labelStyle}>College Roll / Registration Number:</label>
              <input
                type="text"
                placeholder="e.g. 12014589 or 2024-LPU-88"
                value={formData.collegeIdNum}
                onChange={(e) => setFormData((p) => ({ ...p, collegeIdNum: e.target.value }))}
                style={inputStyle}
              />
            </div>

            <div style={{ marginTop: 10 }}>
              <label style={labelStyle}>Upload College ID Front Image:</label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => handleFileChange('collegeIdDoc', e.target.files[0], 'College ID image')}
                style={{ width: '100%', padding: 8 }}
              />
              {files.collegeIdDoc && <small style={{ color: '#059669', fontWeight: 600 }}>✓ Attached: {files.collegeIdDoc.name}</small>}
            </div>

            <button
              type="button"
              className="btn btn-primary"
              onClick={goToStep2}
              style={{ width: '100%', marginTop: 20, padding: 12, borderRadius: 10 }}
            >
              Continue to Government ID ➔
            </button>
          </div>
        )}
        {step === 2 && (
          <div className="stack-sm">
            <h4 style={{ margin: 0, fontSize: '0.95rem' }}>2. Government Identity (Aadhaar &amp; PAN)</h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '4px 0 8px' }}>
              Numbers are format-checked here (Aadhaar checksum &amp; PAN pattern) and encrypted before an admin reviews them.
            </p>

            <div>
              <label style={labelStyle}>Aadhaar Number (12 digits):</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={14}
                placeholder="1234 5678 9012"
                value={formData.aadhaarNumber}
                onChange={(e) => setFormData((p) => ({ ...p, aadhaarNumber: e.target.value }))}
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
              <div>
                <label style={{ ...labelStyle, fontSize: '0.78rem' }}>Aadhaar Front Image:</label>
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => handleFileChange('aadhaarFront', e.target.files[0], 'Aadhaar front image')} style={{ width: '100%' }} />
                {files.aadhaarFront && <small style={{ color: '#059669', fontWeight: 600 }}>✓ {files.aadhaarFront.name}</small>}
              </div>
              <div>
                <label style={{ ...labelStyle, fontSize: '0.78rem' }}>Aadhaar Back Image:</label>
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => handleFileChange('aadhaarBack', e.target.files[0], 'Aadhaar back image')} style={{ width: '100%' }} />
                {files.aadhaarBack && <small style={{ color: '#059669', fontWeight: 600 }}>✓ {files.aadhaarBack.name}</small>}
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={labelStyle}>PAN Card Number (10 characters):</label>
              <input
                type="text"
                maxLength={10}
                placeholder="e.g. ABCPZ1234K"
                value={formData.panNumber}
                onChange={(e) => setFormData((p) => ({ ...p, panNumber: e.target.value.toUpperCase() }))}
                style={inputStyle}
              />
            </div>

            <div style={{ marginTop: 8 }}>
              <label style={{ ...labelStyle, fontSize: '0.78rem' }}>PAN Card Image:</label>
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => handleFileChange('panDoc', e.target.files[0], 'PAN card image')} style={{ width: '100%' }} />
              {files.panDoc && <small style={{ color: '#059669', fontWeight: 600 }}>✓ {files.panDoc.name}</small>}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button type="button" className="btn btn-ghost" onClick={() => { setError(''); setStep(1) }} style={{ flex: 1, padding: 12, borderRadius: 10 }}>
                ← Back
              </button>
              <button type="button" className="btn btn-primary" onClick={goToStep3} style={{ flex: 2, padding: 12, borderRadius: 10 }}>
                Continue to Selfie ➔
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <form onSubmit={handleSubmitAll} className="stack-sm">
            <h4 style={{ margin: 0, fontSize: '0.95rem' }}>3. Selfie Capture</h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '4px 0 12px' }}>
              Capture a clear selfie inside the frame. It is submitted with your documents for an admin to review — approval is manual.
            </p>

            <div style={{ background: '#000', borderRadius: 14, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
              {!cameraActive && !capturedSelfie && (
                <button type="button" className="btn btn-primary" onClick={startCamera} style={{ padding: '10px 20px', borderRadius: 10 }}>
                  📷 Open Webcam Camera
                </button>
              )}

              {cameraActive && (
                <>
                  <video ref={videoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <div style={{ position: 'absolute', inset: 30, border: '2px dashed #00d09c', borderRadius: '50%', pointerEvents: 'none' }} />
                </>
              )}

              {capturedSelfie && (
                <img src={capturedSelfie} alt="Liveness Selfie" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              )}
            </div>

            {cameraActive && (
              <button type="button" className="btn btn-primary" onClick={captureSelfie} style={{ width: '100%', marginTop: 10, padding: 10, background: '#059669', color: '#fff' }}>
                📸 Capture Liveness Selfie
              </button>
            )}

            {capturedSelfie && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <span style={{ color: '#059669', fontWeight: 600, fontSize: '0.82rem' }}>✓ Liveness selfie captured!</span>
                <button type="button" onClick={startCamera} style={{ background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer', fontSize: '0.8rem' }}>
                  Retake Photo
                </button>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button type="button" className="btn btn-ghost" onClick={() => { setError(''); setStep(2) }} disabled={loading} style={{ flex: 1, padding: 12, borderRadius: 10 }}>
                ← Back
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading} style={{ flex: 2, padding: 12, borderRadius: 10 }}>
                {loading ? 'Uploading & Submitting...' : '🔒 Submit Complete KYC'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

