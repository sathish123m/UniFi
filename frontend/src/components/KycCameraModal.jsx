import { useState, useRef, useEffect } from 'react'
import { api } from '../lib/api'

export default function KycCameraModal({ isOpen, onClose, accessToken, onSuccess }) {
  const [cameraActive, setCameraActive] = useState(false)
  const [capturedSelfie, setCapturedSelfie] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (isOpen && !capturedSelfie) {
      startCamera()
    }
    return () => {
      stopCamera()
    }
  }, [isOpen])

  if (!isOpen) return null

  const startCamera = async () => {
    setError('')
    setSuccessMsg('')

    if (!navigator?.mediaDevices?.getUserMedia) {
      setError('Webcam access is restricted or unsupported on this connection. You can upload a photo file directly below!')
      setCameraActive(false)
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      setCameraActive(true)
    } catch (err) {
      setError('Webcam permission denied or camera in use. Select a photo file directly below!')
      setCameraActive(false)
    }
  }

  const stopCamera = () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
    } catch {}
    setCameraActive(false)
  }

  const capturePhoto = () => {
    try {
      if (videoRef.current) {
        const canvas = document.createElement('canvas')
        canvas.width = videoRef.current.videoWidth || 640
        canvas.height = videoRef.current.videoHeight || 480
        const ctx = canvas.getContext('2d')
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
        setCapturedSelfie(dataUrl)
        stopCamera()
      }
    } catch (err) {
      setError('Failed to capture photo from video stream')
    }
  }

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      setCapturedSelfie(evt.target.result)
      stopCamera()
    }
    reader.readAsDataURL(file)
  }

  const handleUploadSelfie = async () => {
    if (!capturedSelfie) {
      setError('Please capture or select a photo first.')
      return
    }
    setLoading(true)
    setError('')
    setSuccessMsg('')

    try {
      await api.post('/users/kyc/liveness', { selfie: capturedSelfie }, accessToken)
      setSuccessMsg('✓ Liveness selfie verified & saved to database!')
      onSuccess?.()
      setTimeout(() => {
        onClose()
      }, 1200)
    } catch (err) {
      setError(err.message || 'Failed to upload selfie')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        background: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(12px)',
        display: 'grid',
        placeItems: 'center',
        padding: 20,
      }}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="image/*"
        style={{ display: 'none' }}
      />

      <div
        style={{
          maxWidth: 500,
          width: '100%',
          background: 'var(--card-bg, #161b22)',
          border: '1px solid var(--card-border, #30363d)',
          borderRadius: 20,
          padding: 24,
          boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
          position: 'relative',
          color: 'var(--card-text, #f0f6fc)',
        }}
      >
        <button
          type="button"
          onClick={() => {
            stopCamera()
            onClose()
          }}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            background: 'none',
            border: 'none',
            fontSize: 20,
            color: 'var(--card-muted, #8b949e)',
            cursor: 'pointer',
          }}
        >
          ✕
        </button>

        <h3 style={{ margin: '0 0 6px', fontSize: '1.25rem', fontFamily: 'Syne, sans-serif' }}>
          📷 Live Webcam Face KYC
        </h3>
        <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: 'var(--card-muted, #8b949e)' }}>
          Align your face in the frame or select a photo file to perform live facial verification.
        </p>

        {error && (
          <div className="error-text" style={{ marginBottom: 14 }}>
            {error}
          </div>
        )}
        {successMsg && (
          <div className="success-text" style={{ marginBottom: 14 }}>
            {successMsg}
          </div>
        )}

        <div
          style={{
            width: '100%',
            height: 260,
            borderRadius: 16,
            background: '#000',
            overflow: 'hidden',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          {!cameraActive && !capturedSelfie && (
            <div style={{ textAlign: 'center', padding: 20 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📷</div>
              <button
                type="button"
                onClick={startCamera}
                style={{
                  background: 'var(--gold, #c9a84c)',
                  color: '#000',
                  fontWeight: 700,
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  fontSize: 13,
                  marginRight: 8,
                }}
              >
                Start Webcam
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  fontWeight: 600,
                  border: '1px solid rgba(255,255,255,0.2)',
                  padding: '10px 18px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                Upload Photo File
              </button>
            </div>
          )}

          {cameraActive && (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: '20px 60px',
                  border: '2px dashed var(--green, #00d09c)',
                  borderRadius: '50%',
                  pointerEvents: 'none',
                  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)',
                }}
              />
            </>
          )}

          {capturedSelfie && (
            <img src={capturedSelfie} alt="Captured Selfie" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          {cameraActive && (
            <button
              type="button"
              onClick={capturePhoto}
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 12,
                background: 'var(--green, #00d09c)',
                color: '#000',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              📸 Capture Photo
            </button>
          )}

          {capturedSelfie && (
            <>
              <button
                type="button"
                onClick={() => {
                  setCapturedSelfie(null)
                  startCamera()
                }}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 12,
                  border: '1px solid var(--border, #30363d)',
                  background: 'transparent',
                  color: 'var(--card-text, #fff)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                🔄 Retake
              </button>
              <button
                type="button"
                onClick={handleUploadSelfie}
                disabled={loading}
                style={{
                  flex: 2,
                  padding: 12,
                  borderRadius: 12,
                  background: 'var(--gold, #c9a84c)',
                  color: '#000',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                {loading ? 'Uploading...' : '🔒 Save Photo to DB'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
