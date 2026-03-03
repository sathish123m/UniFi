import { useMemo } from 'react'
import { useTheme } from '../context/ThemeContext'

const roleMeta = {
  BORROWER: { badge: 'Borrower', accent: 'b', icon: '🎓' },
  PROVIDER: { badge: 'Provider', accent: 'p', icon: '💼' },
  SUPER_ADMIN: { badge: 'Super Admin', accent: 'a', icon: '⚙️' },
  MOD_ADMIN: { badge: 'Moderator', accent: 'a', icon: '🛡️' },
  FINANCE_ADMIN: { badge: 'Finance Admin', accent: 'a', icon: '📊' },
}

const topTabs = [
  { key: 'b', className: 'active-b', label: '🎓 Borrower', roles: ['BORROWER'] },
  { key: 'p', className: 'active-p', label: '💼 Provider', roles: ['PROVIDER'] },
  { key: 'a', className: 'active-a', label: '⚙️ Admin', roles: ['SUPER_ADMIN', 'MOD_ADMIN', 'FINANCE_ADMIN'] },
]

export default function AppShell({
  user,
  onLogout,
  title,
  subtitle,
  sections,
  activeSection,
  onSectionChange,
  children,
  stats = [],
}) {
  const { isDark, toggleTheme } = useTheme()
  const role = useMemo(() => roleMeta[user?.role] || { badge: 'User', accent: 'b', icon: '👤' }, [user?.role])
  const roleLabelClass = role.accent === 'p' ? 'pl-p' : role.accent === 'a' ? 'pl-a' : 'pl-b'
  const name = `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.firstName || 'UniFi User'
  const accentTone = role.accent === 'p' ? 'green' : role.accent === 'a' ? 'blue' : 'gold'
  const visibleTabs = useMemo(() => {
    if (['SUPER_ADMIN', 'MOD_ADMIN', 'FINANCE_ADMIN'].includes(user?.role)) return topTabs
    return topTabs.filter((tab) => tab.roles.includes(user?.role))
  }, [user?.role])

  return (
    <div className={`portal-root role-${role.accent}`}>
      <div className="noise portal-noise"></div>

      <nav className="portal-nav">
        <div className="nav-logo">
          UniFi <span>Secure Post-Login Portal</span>
        </div>
        <div className="nav-tabs">
          {visibleTabs.map((tab) => (
            <span key={tab.key} className={`nav-tab ${role.accent === tab.key ? tab.className : ''}`}>
              {tab.label}
            </span>
          ))}
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

      <div className="portal-shell">
        <aside className="portal-sidebar">
          <div className={`portal-label ${roleLabelClass}`}>
            {role.icon} {role.badge} Portal
          </div>

          <div className="portal-sidebar-head">
            <div className="logo">UniFi</div>
            <p className="sidebar-meta">Campus Lending Network</p>
          </div>

          <nav className="portal-nav-list">
            {sections.map((section, index) => (
              <button
                key={section.key}
                className={`portal-nav-item ${activeSection === section.key ? 'active' : ''}`}
                onClick={() => onSectionChange(section.key)}
                type="button"
              >
                <span className="portal-nav-index">{String(section.order || index + 1).padStart(2, '0')}</span>
                <span>{section.label}</span>
              </button>
            ))}
          </nav>

          <div className="portal-user-card">
            <div className={`portal-user-avatar tone-${accentTone}`}>{(name[0] || 'U').toUpperCase()}</div>
            <div>
              <strong>{name}</strong>
              <p>{user?.email}</p>
            </div>
          </div>
        </aside>

        <main className="portal-main">
          <header className="portal-topbar">
            <div>
              <h1>{title}</h1>
              <p>{subtitle}</p>
            </div>
            <div className="user-chip">
              <span className={`chip chip-${accentTone}`}>{role.badge}</span>
              <strong>{user?.firstName || 'User'}</strong>
            </div>
          </header>

          {stats.length ? (
            <section className="portal-stat-row">
              {stats.map((stat) => (
                <article key={stat.label} className={`portal-stat-card tone-${stat.tone || accentTone}`}>
                  <span>{stat.label}</span>
                  <strong>{stat.value}</strong>
                </article>
              ))}
            </section>
          ) : null}

          <section className="portal-content">{children}</section>
        </main>
      </div>
    </div>
  )
}
