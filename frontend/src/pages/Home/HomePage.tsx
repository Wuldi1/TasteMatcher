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

import { useAuth } from "../../contexts/AuthContext";
import { CustomerHomePage } from "./CustomerHomePage";
import { DealerHomePage } from "./DealerHomePage";
import { LogOut } from "lucide-react";

export function HomePage() {
  const { user, logout } = useAuth();

  if (!user) {
    return null;
  }

  const isCustomer = user.role === "customer";

  return (
    <div className="relative">
      {isCustomer ? <CustomerHomePage /> : <DealerHomePage />}

      {/* Mobile-only logout (bottom) */}
      <div className="sm:hidden sticky bottom-0 z-30 bg-white/80 backdrop-blur px-4 py-3">
        <button
          onClick={logout}
          className="w-full inline-flex items-center justify-center gap-2 text-sm font-medium text-gray-700 px-3 py-2 rounded-lg border border-gray-200 shadow-sm bg-white hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
          aria-label="Logout"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </div>
    </div>
  );
}
