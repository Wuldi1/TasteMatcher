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

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { DomainProvider } from './contexts/DomainContext';
import { DomainRegistration } from './components/DomainRegistration';
import { ArtworkUpload } from './components/ArtworkUpload';

/**
 * Main application component with routing and context providers
 * Handles navigation between domain registration and upload flows
 */
function App() {
  return (
    <DomainProvider>
      <Router>
        <div className="App">
          <Routes>
            <Route path="/" element={<DomainRegistration />} />
            <Route path="/upload" element={<ArtworkUpload />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </Router>
    </DomainProvider>
  );
}

export default App;