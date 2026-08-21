import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { HomePage } from "./HomePage";
import { AuthContext } from "../../contexts/AuthContext";
import { createMockAuthContext } from "../../test/mocks/authContext";

jest.mock("../../hooks/useProposalData", () => ({
  useProposalData: () => ({
    hasSubmittedProposal: false,
    proposalMetadata: null,
    proposals: [],
    loading: false,
  }),
}));

const mockUser = {
  id: "user-1",
  name: "Test User",
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
  it("renders a personalized welcome message", () => {
    renderWithProviders(<HomePage />);

    expect(
      screen.getByRole("heading", { name: "Hello, Test User!" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/welcome to your/i)).toHaveTextContent("gallery");
  });

  it("displays customer journey and profile statistics", () => {
    renderWithProviders(<HomePage />);

    expect(
      screen.getByRole("heading", { name: "Your Journey" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Your Profile Section" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Artworks Liked")).toBeInTheDocument();
    expect(screen.getByText("Artworks Disliked")).toBeInTheDocument();
    expect(screen.getByText("Total Swipes")).toBeInTheDocument();
  });

  it("renders journey cards with proper links", () => {
    renderWithProviders(<HomePage />);

    const onboardingLink = screen.getByRole("link", {
      name: /complete onboarding/i,
    });
    const tasterLink = screen.getByRole("link", {
      name: /train your model/i,
    });

    expect(onboardingLink).toHaveAttribute("href", "/onboarding");
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

  it("provides an accessible logout control", () => {
    renderWithProviders(<HomePage />);

    expect(screen.getByRole("button", { name: "Logout" })).toBeEnabled();
  });
});
