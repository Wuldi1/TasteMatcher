import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthContext } from "../../contexts/AuthContext";
import { ViewerPreferencesProvider } from "../../contexts/ViewerPreferencesContext";
import { createMockAuthContext } from "../../test/mocks/authContext";
import { SettingsPage } from "./SettingsPage";

describe("SettingsPage", () => {
  it("shows supported account information, preferences, policies, and logout", async () => {
    const logout = jest.fn();
    render(
      <MemoryRouter>
        <AuthContext.Provider
          value={createMockAuthContext({
            user: {
              id: "customer-1",
              name: "Eleanor Ashford",
              email: "eleanor@example.com",
              role: "customer",
              domainId: "gallery-1",
            },
            isAuthenticated: true,
            logout,
          })}
        >
          <ViewerPreferencesProvider>
            <SettingsPage />
          </ViewerPreferencesProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    );

    expect(screen.getByText("Eleanor Ashford")).toBeInTheDocument();
    expect(screen.getByText("eleanor@example.com")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Edit taste profile" }),
    ).toHaveAttribute("href", "/onboarding");
    expect(
      screen.getByRole("link", { name: "Privacy Policy" }),
    ).toHaveAttribute("href", "/privacy-policy");
    expect(
      screen.getByRole("link", { name: "Contact TasteMatcher" }),
    ).toHaveAttribute("href", "mailto:admin@tastematcher.com");

    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(logout).toHaveBeenCalledTimes(1);
  });
});
