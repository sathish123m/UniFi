import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Uni-Fi ErrorBoundary caught an exception:', error, errorInfo)
  }

  handleResetState = () => {
    this.setState({ hasError: false, error: null })
  }

  handleFullReload = () => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg-main, #0d1117)',
            color: 'var(--text-main, #f0f6fc)',
            fontFamily: 'Inter, system-ui, sans-serif',
            padding: 24,
          }}
        >
          <div
            style={{
              maxWidth: 500,
              width: '100%',
              background: 'var(--bg-card, #161b22)',
              border: '1px solid var(--border-color, #30363d)',
              borderRadius: 16,
              padding: 32,
              textAlign: 'center',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: '#f85149' }}>
              Temporary Notice
            </h2>
            <p style={{ fontSize: 13.5, color: '#8b949e', marginBottom: 20, lineHeight: 1.5 }}>
              A UI component encountered an unexpected event. Your session and account data remain completely safe.
            </p>

            {this.state.error?.message && (
              <div
                style={{
                  background: 'rgba(248, 81, 73, 0.1)',
                  border: '1px solid rgba(248, 81, 73, 0.3)',
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 12,
                  color: '#ff7b72',
                  textAlign: 'left',
                  marginBottom: 20,
                  wordBreak: 'break-word',
                }}
              >
                {this.state.error.message}
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                type="button"
                onClick={this.handleResetState}
                style={{
                  background: 'var(--accent-gold, #c9a84c)',
                  color: '#0d1117',
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px 18px',
                  fontWeight: 700,
                  fontSize: 13.5,
                  cursor: 'pointer',
                }}
              >
                🔄 Resume Application
              </button>
              <button
                type="button"
                onClick={this.handleFullReload}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  color: '#c9d1d9',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 8,
                  padding: '10px 18px',
                  fontWeight: 600,
                  fontSize: 13.5,
                  cursor: 'pointer',
                }}
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
