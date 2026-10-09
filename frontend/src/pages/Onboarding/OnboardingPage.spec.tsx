import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthContext } from "../../contexts/AuthContext";
import { createMockAuthContext } from "../../test/mocks/authContext";
import { apiClient } from "../../utils/api";
import { OnboardingPage } from "./OnboardingPage";

jest.mock("../../utils/api", () => ({
  apiClient: {
    updateQuestionnaire: jest.fn(),
    vectorizePreferenceImage: jest.fn(),
    finalizePreferenceVectors: jest.fn(),
    completeOnboarding: jest.fn(),
    skipOnboarding: jest.fn(),
  },
}));

const mockUpdateQuestionnaire = jest.mocked(apiClient.updateQuestionnaire);

function renderPage() {
  const refreshUser = jest.fn().mockResolvedValue({
    id: "customer-1",
    name: "Eleanor",
    email: "eleanor@example.com",
    role: "customer",
    domainId: "gallery-1",
    onboardingStatus: "in_progress",
  });

  render(
    <MemoryRouter>
      <AuthContext.Provider
        value={createMockAuthContext({
          user: {
            id: "customer-1",
            name: "Eleanor",
            email: "eleanor@example.com",
            role: "customer",
            domainId: "gallery-1",
            onboardingStatus: "in_progress",
          },
          isAuthenticated: true,
          refreshUser,
        })}
      >
        <OnboardingPage />
      </AuthContext.Provider>
    </MemoryRouter>,
  );

  return { refreshUser };
}

describe("OnboardingPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateQuestionnaire.mockResolvedValue(undefined as never);
  });

  it("keeps answers and shows a recoverable error when saving fails", async () => {
    mockUpdateQuestionnaire.mockRejectedValueOnce(new Error("offline"));
    renderPage();

    const name = screen.getByLabelText("Full Name");
    await userEvent.clear(name);
    await userEvent.type(name, "Eleanor Ashford");
    await userEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your answers are still here",
    );
    expect(name).toHaveValue("Eleanor Ashford");
    expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
  });

  it("uses named progress and semantic selected choices", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Step 2 of 4")).toBeInTheDocument();
    const paintings = screen.getByRole("button", { name: "Paintings" });
    await userEvent.click(paintings);
    expect(paintings).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByText("Art interests").length).toBeGreaterThan(0);
  });
});
