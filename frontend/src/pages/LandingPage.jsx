import { useEffect } from 'react'

export default function LandingPage() {
  useEffect(() => {
    document.title = 'UniFi — Borrow Within Your Campus'
  }, [])

  return (
    <div className="landing-frame-wrap">
      <iframe
        className="landing-frame"
        title="UniFi Landing"
        src="/unifi-landing.html"
        loading="eager"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  )
}
