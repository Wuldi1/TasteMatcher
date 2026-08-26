import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { AuthPage } from "./AuthPage";
import { AuthContext } from "../../contexts/AuthContext";
import { createMockAuthContext } from "../../test/mocks/authContext";
import { apiClient } from "../../utils/api";

jest.mock("../../utils/api", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    errorCode?: string;

    constructor(
      message: string,
      status: number,
      errorCode?: string,
    ) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.errorCode = errorCode;
    }
  },
  apiClient: {
    getHealth: jest.fn(),
    requestLoginCode: jest.fn(),
    verifyLoginCode: jest.fn(),
    createDomainRequest: jest.fn(),
    createCustomerRequest: jest.fn(),
  },
}));

const mockGetHealth = jest.mocked(apiClient.getHealth);
const originalUiVersion = process.env.REACT_APP_UI_VERSION;

beforeEach(() => {
  process.env.REACT_APP_UI_VERSION = "";
  mockGetHealth.mockResolvedValue({
    status: "healthy",
    version: "1.0.0",
    deploymentVersion: "v0.8.24",
    commit: "abcdef123456",
    environment: "test",
    timestamp: "2026-08-26T00:00:00.000Z",
    checks: {
      database: "ok",
      storage: "ok",
    },
  });
});

afterEach(() => {
  process.env.REACT_APP_UI_VERSION = originalUiVersion;
});

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
  it("renders the login form", async () => {
    renderWithProviders(<AuthPage />);

    expect(
      screen.getByRole("heading", { name: "TasteMatcher" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email Address")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
    expect(
      await screen.findByText("UI/API v0.local..8.24"),
    ).toBeInTheDocument();
  });

  it("shows UI and API deployment versions below the logo", async () => {
    renderWithProviders(<AuthPage />);

    expect(
      await screen.findByText("UI/API v0.local..8.24"),
    ).toBeInTheDocument();
  });
});
