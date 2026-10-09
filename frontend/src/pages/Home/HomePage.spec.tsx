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
  it("renders a personalized private-gallery welcome", () => {
    renderWithProviders(<HomePage />);

    expect(
      screen.getByRole("heading", { name: "A collection, distinctly yours." }),
    ).toBeInTheDocument();
    expect(screen.getByText(/welcome back, Test User/i)).toHaveTextContent(
      "private gallery",
    );
  });

  it("displays customer journey and profile statistics", () => {
    renderWithProviders(<HomePage />);

    expect(
      screen.getByRole("heading", { name: "Your private gallery" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Your taste, in progress" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Works that stayed with you")).toBeInTheDocument();
    expect(screen.getByText("Works passed over")).toBeInTheDocument();
    expect(screen.getByText("Works considered")).toBeInTheDocument();
  });

  it("renders journey cards with proper links", () => {
    renderWithProviders(<HomePage />);

    const onboardingLink = screen.getByRole("link", {
      name: /begin your taste profile/i,
    });
    const tasterLink = screen.getByRole("link", {
      name: /discover your taste/i,
    });
    const collectionLink = screen.getByRole("link", {
      name: /share your collection/i,
    });

    expect(onboardingLink).toHaveAttribute("href", "/onboarding");
    expect(tasterLink).toHaveAttribute("href", "/taster");
    expect(collectionLink).toHaveAttribute(
      "href",
      "/onboarding?step=3#collection-section",
    );
  });

  it("shows a loading state while the user record is unavailable", () => {
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

    expect(
      screen.getByText("Preparing your private gallery..."),
    ).toBeInTheDocument();
  });

  it("provides an accessible logout control", () => {
    renderWithProviders(<HomePage />);

    expect(screen.getByRole("button", { name: "Logout" })).toBeEnabled();
  });
});
