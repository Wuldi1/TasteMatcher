import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { AuthPage } from "./AuthPage";
import { AuthContext } from "../../contexts/AuthContext";
import { describe, it, expect } from "vitest";
import { createMockAuthContext } from "../../test/mocks/authContext";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

const renderWithProviders = (component: React.ReactElement) => {
  const mockAuthContext = createMockAuthContext();
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={mockAuthContext}>
        <BrowserRouter>{component}</BrowserRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
};

describe("AuthPage", () => {
  it("renders DomainRegistration component", () => {
    renderWithProviders(<AuthPage />);

    // Verify the component renders using Testing Library queries
    expect(screen.getByRole("main")).toBeInTheDocument();
  });
});
