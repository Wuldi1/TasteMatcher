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

import { useAuth } from '../../contexts/AuthContext';
import { CustomerHomePage } from './CustomerHomePage';
import { DealerHomePage } from './DealerHomePage';

export function HomePage() {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  if (user.role === 'customer') {
    return <CustomerHomePage />;
  }
  else {
    return <DealerHomePage />;
  }
}
