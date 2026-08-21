import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { AuthPage } from "./AuthPage";
import { AuthContext } from "../../contexts/AuthContext";
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
  it("renders the login form", () => {
    renderWithProviders(<AuthPage />);

    expect(
      screen.getByRole("heading", { name: "TasteMatcher" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email Address")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });
});
