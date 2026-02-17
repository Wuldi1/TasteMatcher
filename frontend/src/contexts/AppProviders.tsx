import { ReactNode } from "react";
import { AuthProvider } from "./AuthContext";
import { DomainProvider } from "./DomainContext"; // Assuming you have this
import { ViewerPreferencesProvider } from "./ViewerPreferencesContext";

interface AppProvidersProps {
  children: ReactNode;
}

/**
 * Central component to wrap all application-level context providers.
 * This ensures the correct provider hierarchy and prevents context access errors.
 * AuthProvider must be at the top.
 */
export function AppProviders({ children }: AppProvidersProps) {
  return (
    <AuthProvider>
      <DomainProvider>
        <ViewerPreferencesProvider>{children}</ViewerPreferencesProvider>
      </DomainProvider>
    </AuthProvider>
  );
}
