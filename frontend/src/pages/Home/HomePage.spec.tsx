import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { HomePage } from "./HomePage";
import { AuthContext } from "../../contexts/AuthContext";
import { describe, it, expect } from "vitest";
import { createMockAuthContext } from "../../test/mocks/authContext";

const mockUser = {
  id: "user-1",
  email: "test@example.com",
  domainId: "domain-1",
  domainName: "Test Domain",
  role: "customer" as const,
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

const renderWithProviders = (component: React.ReactElement) => {
  const mockAuthContext = createMockAuthContext({
    user: mockUser,
    isAuthenticated: true,
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={mockAuthContext}>
        <BrowserRouter>{component}</BrowserRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
};

describe("HomePage", () => {
  it("renders welcome message with domain name", () => {
    renderWithProviders(<HomePage />);

    expect(screen.getByText(/Welcome to Test Domain/i)).toBeInTheDocument();
  });

  it("displays statistics cards", async () => {
    renderWithProviders(<HomePage />);

    // Verify statistics are rendered
    await waitFor(() => {
      expect(screen.getByText(/Total Artworks/i)).toBeInTheDocument();
    });
    expect(screen.getByText("Likes")).toBeInTheDocument();
    expect(screen.getByText("Recently Added")).toBeInTheDocument();
  });

  it("renders quick action cards with proper links", () => {
    renderWithProviders(<HomePage />);

    const uploadLink = screen.getByRole("link", {
      name: /upload new artworks/i,
    });
    const catalogLink = screen.getByRole("link", {
      name: /browse your catalog/i,
    });
    const tasterLink = screen.getByRole("link", {
      name: /start tasting artworks/i,
    });

    expect(uploadLink).toHaveAttribute("href", "/upload");
    expect(catalogLink).toHaveAttribute("href", "/catalog");
    expect(tasterLink).toHaveAttribute("href", "/taster");
  });

  it("does not render when user is not authenticated", () => {
    const unauthContext = createMockAuthContext();

    render(
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={unauthContext}>
          <BrowserRouter>
            <HomePage />
          </BrowserRouter>
        </AuthContext.Provider>
      </QueryClientProvider>,
    );

    expect(screen.queryByText(/Welcome to/i)).not.toBeInTheDocument();
  });

  it("has proper ARIA labels for accessibility", () => {
    renderWithProviders(<HomePage />);

    expect(screen.getByLabelText("Domain statistics")).toBeInTheDocument();
    expect(screen.getByLabelText("Quick actions")).toBeInTheDocument();
  });
});
