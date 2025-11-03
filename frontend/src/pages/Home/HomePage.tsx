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

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { ArrowRight, Upload, Grid, Heart } from 'lucide-react';
import { Link } from 'react-router-dom';
import './HomePage.css';

interface DomainStats {
  totalArtworks: number;
  totalLikes: number;
  totalDislikes: number;
  recentlyAdded: number;
}

/**
 * Home page displaying domain information and quick action cards.
 * Shows domain name, statistics, and navigation shortcuts.
 */
export function HomePage() {
  const { user } = useAuth();

  // Fetch domain stats (placeholder - will be implemented with backend)
  const { data: stats, isLoading } = useQuery<DomainStats>({
    queryKey: ['domain-stats', user?.domainId],
    queryFn: async () => {
      // TODO: Replace with actual API call
      return {
        totalArtworks: 42,
        totalLikes: 28,
        totalDislikes: 14,
        recentlyAdded: 5,
      };
    },
    enabled: !!user?.domainId,
  });

  if (!user) {
    return null;
  }

  return (
    <div className="home-page">
      <header className="home-header">
        <h1 className="home-title">Welcome to {user.domainName || 'TasteMatcher'}</h1>
        <p className="home-subtitle">
          Manage your artwork collection and discover your taste preferences
        </p>
      </header>

      {/* Statistics cards */}
      <section className="home-stats" aria-label="Domain statistics">
        <div className="stat-card">
          <div className="stat-card__icon stat-card__icon--primary">
            <Grid aria-hidden="true" />
          </div>
          <div className="stat-card__content">
            <h2 className="stat-card__value">{isLoading ? '...' : stats?.totalArtworks}</h2>
            <p className="stat-card__label">Total Artworks</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card__icon stat-card__icon--success">
            <Heart aria-hidden="true" />
          </div>
          <div className="stat-card__content">
            <h2 className="stat-card__value">{isLoading ? '...' : stats?.totalLikes}</h2>
            <p className="stat-card__label">Likes</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card__icon stat-card__icon--warning">
            <Upload aria-hidden="true" />
          </div>
          <div className="stat-card__content">
            <h2 className="stat-card__value">{isLoading ? '...' : stats?.recentlyAdded}</h2>
            <p className="stat-card__label">Recently Added</p>
          </div>
        </div>
      </section>

      {/* Quick action cards */}
      <section className="home-actions" aria-label="Quick actions">
        <h2 className="home-actions__title">Quick Actions</h2>
        <div className="action-cards">
          <Link to="/upload" className="action-card" aria-label="Upload new artworks">
            <div className="action-card__icon">
              <Upload aria-hidden="true" />
            </div>
            <h3 className="action-card__title">Upload Pictures</h3>
            <p className="action-card__description">
              Add new artworks to your collection
            </p>
            <ArrowRight className="action-card__arrow" aria-hidden="true" />
          </Link>

          <Link to="/catalog" className="action-card" aria-label="Browse your catalog">
            <div className="action-card__icon">
              <Grid aria-hidden="true" />
            </div>
            <h3 className="action-card__title">Browse Catalog</h3>
            <p className="action-card__description">
              View all your uploaded artworks
            </p>
            <ArrowRight className="action-card__arrow" aria-hidden="true" />
          </Link>

          <Link to="/taster" className="action-card" aria-label="Start tasting artworks">
            <div className="action-card__icon">
              <Heart aria-hidden="true" />
            </div>
            <h3 className="action-card__title">Start Taster</h3>
            <p className="action-card__description">
              Swipe through artworks and build your taste profile
            </p>
            <ArrowRight className="action-card__arrow" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  );
}
