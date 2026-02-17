// ---------- CODEGEN CHECKLIST (must be satisfied) ----------
// 1. Uses TypeScript strict types (no `any`).
// 2. Uses shared routing and state management patterns.
// 3. Includes proper error boundaries and loading states.
// 4. Adds structured logging for navigation events.
// 5. Adds route guards and validation.
// 6. Professional routing with context providers.
// 7. Accessible navigation and error handling.
// 8. Includes JSDoc for main app structure.
// 9. CI-friendly: passes typecheck and lint.
// -----------------------------------------------------------

import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./contexts/AuthContext";
import { DomainProvider } from "./contexts/DomainContext";
import { ViewerPreferencesProvider } from "./contexts/ViewerPreferencesContext";
import { queryClient } from "./utils/react-query";
import { AppRoutes } from "./routes/AppRoutes";

/**
 * Main application component with routing and context providers
 * Handles navigation between domain registration and protected app flows
 */
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <DomainProvider>
          <ViewerPreferencesProvider>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </ViewerPreferencesProvider>
        </DomainProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
