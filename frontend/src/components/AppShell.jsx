/**
 * AppShell — URL-driven portal layout
 *
 * Navigation model:
 *   - Sidebar nav calls useNavigate() — every click updates the URL.
 *   - Active section is derived from useParams(':section') — single source of truth.
 *   - Browser Back / Forward work natively.
 *   - useEffect scrolls to top on section change.
 *
 * Props:
 *   roleLabel     string   – "Borrower" | "Provider" | "Super Admin" etc.
 *   sections      Array    – [{ key, label }] — drives sidebar menu
 *   baseRoute     string   – "/borrower" | "/provider" | "/admin"
 *   onLogout      fn       – logout handler
 *   user          object   – profile object (firstName, lastName, email, role)
 *   badgeCounts   object   – { [sectionKey]: number|null } — notification dots
 *   children      ReactNode
 */
import { useEffect, useMemo } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'

const roleMeta = {
  BORROWER:      { badge: 'Borrower',      accent: 'b', icon: '🎓' },
  PROVIDER:      { badge: 'Provider',      accent: 'p', icon: '💼' },
  SUPER_ADMIN:   { badge: 'Super Admin',   accent: 'a', icon: '⚙️' },
  MOD_ADMIN:     { badge: 'Moderator',     accent: 'a', icon: '🛡️' },
  FINANCE_ADMIN: { badge: 'Finance Admin', accent: 'a', icon: '📊' },
}

export default function AppShell({
  user,
  onLogout,
  sections,
  baseRoute,
  children,
  badgeCounts = {},
}) {
  const navigate  = useNavigate()
  const { section: activeSection } = useParams()
  const location  = useLocation()
  const { isDark, toggleTheme } = useTheme()

  const role = useMemo(
    () => roleMeta[user?.role] || { badge: 'User', accent: 'b', icon: '👤' },
    [user?.role]
  )

  const roleLabelClass = role.accent === 'p' ? 'pl-p' : role.accent === 'a' ? 'pl-a' : 'pl-b'
  const accentTone     = role.accent === 'p' ? 'green' : role.accent === 'a' ? 'blue' : 'gold'
  const name           = `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'UniFi User'

  // Scroll to top on every section transition & update document title
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
    const currentSectionLabel = sections.find((s) => s.key === activeSection)?.label || 'Portal'
    document.title = `${currentSectionLabel} — ${role.badge} | Uni-Fi`
  }, [location.pathname, activeSection, role.badge, sections])

  const goTo = (sectionKey) => {
    navigate(`${baseRoute}/${sectionKey}`)
  }

  return (
    <div className={`portal-root role-${role.accent}`}>
      <div className="noise portal-noise" />

      {/* ── Top navigation bar ──────────────────────────────────────────── */}
      <nav className="portal-nav">
        <div className="nav-logo">
          UniFi <span>Secure Post-Login Portal</span>
        </div>

        <div className="nav-tabs">
          <span className={`nav-tab active-${role.accent}`}>
            {role.icon} {role.badge}
          </span>
        </div>

        <div className="portal-nav-actions">
          <button className="btn btn-ghost theme-toggle" type="button" onClick={toggleTheme}>
            {isDark ? '☀️ Light' : '🌙 Dark'}
          </button>
          <button className="btn btn-ghost portal-nav-logout" type="button" onClick={onLogout}>
            Logout
          </button>
        </div>
      </nav>

      {/* ── Shell body (sidebar + main) ──────────────────────────────────── */}
      <div className="portal-shell">

        {/* ── Sidebar ─────────────────────────────────────────────────── */}
        <aside className="portal-sidebar">
          <div className={`portal-label ${roleLabelClass}`}>
            {role.icon} {role.badge} Portal
          </div>

          <div className="portal-sidebar-head">
            <div className="logo">UniFi</div>
            <p className="sidebar-meta">Campus Lending Network</p>
          </div>

          <nav className="portal-nav-list">
            {sections.map((section, index) => {
              const badge = badgeCounts[section.key]
              const isActive = activeSection === section.key

              return (
                <button
                  key={section.key}
                  className={`portal-nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => goTo(section.key)}
                  type="button"
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span className="portal-nav-index">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span>{section.label}</span>

                  {/* Notification badge dot */}
                  {badge != null && badge > 0 && (
                    <span style={{
                      marginLeft: 'auto',
                      minWidth: 20,
                      height: 20,
                      borderRadius: 100,
                      background: '#d99686',
                      color: '#fff',
                      fontSize: 10.5,
                      fontFamily: 'IBM Plex Mono, monospace',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 5px',
                    }}>
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>

          {/* ── User identity card ──────────────────────────────────────── */}
          <div className="portal-user-card">
            <div className={`portal-user-avatar tone-${accentTone}`}>
              {(name[0] || 'U').toUpperCase()}
            </div>
            <div>
              <strong>{name}</strong>
              <p>{user?.email}</p>
            </div>
          </div>
        </aside>

        {/* ── Main content ─────────────────────────────────────────────── */}
        <main className="portal-main">
          {/* Topbar breadcrumb */}
          <header className="portal-topbar">
            <div>
              {/* Section title derived from sections manifest */}
              <h1>
                {sections.find((s) => s.key === activeSection)?.label || 'Portal'}
              </h1>
              <p style={{ fontSize: 12.5, color: '#94a3ae', marginTop: 3 }}>
                {baseRoute}/{activeSection || 'overview'}
              </p>
            </div>
            <div className="user-chip">
              <span className={`chip chip-${accentTone}`}>{role.badge}</span>
              <strong>{user?.firstName || 'User'}</strong>
            </div>
          </header>

          <section className="portal-content">
            {children}
          </section>
        </main>
      </div>
    </div>
  )
}
