// ---------- CODEGEN CHECKLIST (must be satisfied) ----------
// 1. Uses TypeScript strict types (no `any`).
// 2. Uses shared `common` types for API contracts where applicable.
// 3. Includes unit tests written first (test file present next to implementation).
// 4. Adds structured logging at function entry/exit and on errors.
// 5. Adds at least one assertion or guard for input validation.
// 6. No duplicate logic — reuse existing service/util or extract shared module.
// 7. Adds or updates README or docs if public API changes.
// 8. Adds meaningful JSDoc for exported functions/classes.
// 9. CI-friendly: code passes lint, typecheck, and tests locally.
// 10. Frontend-specific: responsive (mobile + desktop), smooth, accessible (WCAG AA).
// -----------------------------------------------------------

import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Home, Upload, Grid, Heart } from 'lucide-react';
import './AppLayout.css';

interface NavItem {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  ariaLabel: string;
}

const navItems: NavItem[] = [
  { to: '/home', icon: Home, label: 'Home', ariaLabel: 'Navigate to home page' },
  { to: '/upload', icon: Upload, label: 'Upload', ariaLabel: 'Navigate to upload pictures' },
  { to: '/catalog', icon: Grid, label: 'Catalog', ariaLabel: 'Navigate to artwork catalog' },
  { to: '/taster', icon: Heart, label: 'Taster', ariaLabel: 'Navigate to taster' },
];

/**
 * Main application layout with responsive navigation.
 * - Mobile: Bottom navigation bar (fixed)
 * - Desktop: Left sidebar navigation
 */
export function AppLayout() {
  const location = useLocation();

  return (
    <div className="app-layout">
      {/* Desktop sidebar */}
      <nav className="app-nav app-nav--desktop" role="navigation" aria-label="Main navigation">
        <div className="app-nav__header">
          <h1 className="app-nav__logo">TasteMatcher</h1>
        </div>
        <ul className="app-nav__list">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
            
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) => 
                    `app-nav__link ${isActive ? 'app-nav__link--active' : ''}`
                  }
                  aria-label={item.ariaLabel}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon className="app-nav__icon" aria-hidden="true" />
                  <span className="app-nav__label">{item.label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Main content area */}
      <main className="app-main" role="main">
        <Outlet />
      </main>

      {/* Mobile bottom navigation */}
      <nav className="app-nav app-nav--mobile" role="navigation" aria-label="Mobile navigation">
        <ul className="app-nav__list">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
            
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) => 
                    `app-nav__link ${isActive ? 'app-nav__link--active' : ''}`
                  }
                  aria-label={item.ariaLabel}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon className="app-nav__icon" aria-hidden="true" />
                  <span className="app-nav__label">{item.label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
