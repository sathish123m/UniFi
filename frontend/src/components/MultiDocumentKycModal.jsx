import { useState, useRef } from 'react'
import { api } from '../lib/api'

export default function MultiDocumentKycModal({ isOpen, onClose, accessToken, currentKyc, onSuccess }) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const [formData, setFormData] = useState({
    collegeIdNum: currentKyc?.collegeIdNum || '',
    aadhaarNum: currentKyc?.aadhaarNum || '',
    panNum: currentKyc?.panNum || '',
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

  if (!isOpen) return null

  const handleFileChange = (key, file) => {
    if (file) {
      setFiles((p) => ({ ...p, [key]: file }))
    }
  }

  const startCamera = async () => {
    setError('')
    if (!navigator?.mediaDevices?.getUserMedia) {
      setError('Webcam access is restricted or unsupported on this connection. Please upload an ID document instead.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 } })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
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
      const dataUrl = canvas.toDataURL('image/jpeg')
      setCapturedSelfie(dataUrl)

      // Stop camera stream
      const stream = videoRef.current.srcObject
      if (stream) {
        stream.getTracks().forEach((track) => track.stop())
      }
      setCameraActive(false)
    }
  }

  const handleSubmitAll = async (e) => {
    e.preventDefault()
    setError('')
    setSuccessMsg('')
    setLoading(true)

    try {
      const payload = new FormData()
      payload.append('collegeIdNum', formData.collegeIdNum)
      payload.append('aadhaarNum', formData.aadhaarNum)
      payload.append('panNum', formData.panNum)

      if (files.collegeIdDoc) payload.append('collegeIdDoc', files.collegeIdDoc)
      if (files.aadhaarFront) payload.append('aadhaarFront', files.aadhaarFront)
      if (files.aadhaarBack) payload.append('aadhaarBack', files.aadhaarBack)
      if (files.panDoc) payload.append('panDoc', files.panDoc)
      if (capturedSelfie) payload.append('livenessSelfie', capturedSelfie)

      await api.post('/users/kyc/submit', payload, accessToken, true)
      setSuccessMsg('KYC documents submitted successfully! Admin review in progress.')
      onSuccess?.()
      setTimeout(() => {
        onClose()
      }, 1500)
    } catch (err) {
      setError(err.message || 'Failed to submit KYC documents')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-backdrop" style={{ zIndex: 1100 }}>
      <div className="portal-alert-card" style={{ maxWidth: 580, width: '92%', padding: 28, position: 'relative' }}>
        <button
          type="button"
          onClick={onClose}
          style={{ position: 'absolute', top: 18, right: 18, background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}
        >
          ✕
        </button>

        <div style={{ marginBottom: 18 }}>
          <span className="portal-chip" style={{ background: 'rgba(0, 208, 156, 0.15)', color: '#059669', border: '1px solid rgba(0, 208, 156, 0.3)' }}>
            Verification Stepper ({step}/3)
          </span>
          <h3 style={{ fontSize: '1.4rem', marginTop: 8, marginBottom: 4 }}>Enhanced Student KYC Verification</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Verify your identity to unlock borrowing & peer-funding limits.</p>
        </div>

        {error && <div className="error-text" style={{ marginBottom: 14 }}>{error}</div>}
        {successMsg && <div className="success-text" style={{ marginBottom: 14 }}>{successMsg}</div>}

        {step === 1 && (
          <div className="stack-sm">
            <h4 style={{ margin: 0, fontSize: '0.95rem' }}>1. Student College ID Card</h4>
            <div>
              <label style={{ fontSize: '0.83rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>College Roll / Registration Number:</label>
              <input
                type="text"
                placeholder="e.g. 12014589 or 2024-LPU-88"
                value={formData.collegeIdNum}
                onChange={(e) => setFormData((p) => ({ ...p, collegeIdNum: e.target.value }))}
                style={{ width: '100%', borderRadius: 10, padding: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}
              />
            </div>

            <div style={{ marginTop: 10 }}>
              <label style={{ fontSize: '0.83rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Upload College ID Front Image:</label>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => handleFileChange('collegeIdDoc', e.target.files[0])}
                style={{ width: '100%', padding: 8 }}
              />
              {files.collegeIdDoc && <small style={{ color: '#059669', fontWeight: 600 }}>✓ Attached: {files.collegeIdDoc.name}</small>}
            </div>

            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setStep(2)}
              style={{ width: '100%', marginTop: 20, padding: 12, borderRadius: 10 }}
            >
              Continue to Govt. Docs ➔
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="stack-sm">
            <h4 style={{ margin: 0, fontSize: '0.95rem' }}>2. Govt. Identity (Aadhaar & PAN)</h4>
            <div>
              <label style={{ fontSize: '0.83rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Aadhaar Number (12 digits):</label>
              <input
                type="text"
                maxLength={12}
                placeholder="12-digit Aadhaar Number"
                value={formData.aadhaarNum}
                onChange={(e) => setFormData((p) => ({ ...p, aadhaarNum: e.target.value }))}
                style={{ width: '100%', borderRadius: 10, padding: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block' }}>Aadhaar Front Image:</label>
                <input type="file" accept="image/*" onChange={(e) => handleFileChange('aadhaarFront', e.target.files[0])} style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block' }}>Aadhaar Back Image:</label>
                <input type="file" accept="image/*" onChange={(e) => handleFileChange('aadhaarBack', e.target.files[0])} style={{ width: '100%' }} />
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: '0.83rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>PAN Card Number (10 characters):</label>
              <input
                type="text"
                maxLength={10}
                placeholder="e.g. ABCDE1234F"
                value={formData.panNum}
                onChange={(e) => setFormData((p) => ({ ...p, panNum: e.target.value.toUpperCase() }))}
                style={{ width: '100%', borderRadius: 10, padding: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setStep(1)} style={{ flex: 1, padding: 12, borderRadius: 10 }}>
                ← Back
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setStep(3)} style={{ flex: 2, padding: 12, borderRadius: 10 }}>
                Continue to Video KYC ➔
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <form onSubmit={handleSubmitAll} className="stack-sm">
            <h4 style={{ margin: 0, fontSize: '0.95rem' }}>3. Video KYC & Liveness Selfie Check</h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '4px 0 12px' }}>
              Position your face inside the frame to complete the real-time liveness verification.
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
              <button type="button" className="btn btn-ghost" onClick={() => setStep(2)} disabled={loading} style={{ flex: 1, padding: 12, borderRadius: 10 }}>
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
