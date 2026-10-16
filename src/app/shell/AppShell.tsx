import { Link, NavLink, Outlet } from 'react-router'

import { Badge, IconDashboard, IconMatches, IconPlus, IconSettings, LinkButton } from '@/components/common'
import { resolveDataSource } from '@/services'
import { cx } from '@/utils/cx'

import s from './AppShell.module.css'

const NAV = [
  { to: '/', label: 'Dashboard', icon: IconDashboard, end: true },
  { to: '/matches', label: 'Matches', icon: IconMatches, end: false },
  { to: '/settings', label: 'Settings', icon: IconSettings, end: false },
]

export function AppShell() {
  const source = resolveDataSource()
  return (
    <div className={s.shell}>
      <header className={s.topbar}>
        <Link to="/" className={s.brand} aria-label="Football Intelligence by Ugiat, home">
          <img className={s.brandMark} src="/brand/ugiat-mark.png" alt="" width={30} height={30} />
          <span className={s.brandWord}>ugiat</span>
          <span className={s.brandDivider} aria-hidden="true" />
          <span className={s.brandProduct}>Football Intelligence</span>
        </Link>
        <div className={s.topbarRight}>
          <Badge tone={source === 'mock' ? 'warning' : 'accent'} dot pulse={source !== 'mock'} title="Where the data comes from (VITE_DATA_SOURCE)">
            {source === 'mock' ? 'Mock data' : 'Live API'}
          </Badge>
          <LinkButton to="/matches/new" variant="primary">
            <IconPlus size={16} />
            New Match
          </LinkButton>
        </div>
      </header>

      <aside className={s.sidebar}>
        <nav className={s.nav} aria-label="Main">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => cx(s.navLink, isActive && s.active)}>
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className={s.sidebarFooter}>
          <img src="/brand/ugiat-logo.png" alt="Ugiat" className={s.footerLogo} />
          <span>beyond human senses</span>
        </div>
      </aside>

      <main className={s.content}>
        <Outlet />
      </main>
    </div>
  )
}
