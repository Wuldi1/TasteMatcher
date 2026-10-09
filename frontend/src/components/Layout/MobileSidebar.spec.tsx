import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthContext } from "../../contexts/AuthContext";
import { ViewerPreferencesProvider } from "../../contexts/ViewerPreferencesContext";
import { createMockAuthContext } from "../../test/mocks/authContext";
import { MobileSidebar } from "./MobileSidebar";

jest.mock("../../hooks/useProposalData", () => ({
  useProposalData: () => ({ hasSubmittedProposal: false }),
}));

describe("MobileSidebar", () => {
  it("keeps account, policies, support, and logout reachable from More", async () => {
    const logout = jest.fn();
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/taster"]}>
        <AuthContext.Provider
          value={createMockAuthContext({
            user: {
              id: "customer-1",
              email: "collector@example.com",
              role: "customer",
              domainId: "gallery-1",
              onboardingStatus: "completed",
              swipeCount: 20,
            },
            isAuthenticated: true,
            refreshUser: jest.fn().mockResolvedValue(null),
            logout,
          })}
        >
          <ViewerPreferencesProvider>
            <MobileSidebar />
          </ViewerPreferencesProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    );

    const moreButton = screen.getByRole("button", {
      name: "Open more navigation",
    });
    moreButton.focus();
    await user.click(moreButton);

    expect(screen.getByRole("dialog", { name: "More" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("dialog", { name: "More" }),
    ).not.toBeInTheDocument();
    expect(moreButton).toHaveFocus();

    await user.click(moreButton);

    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "/settings",
    );
    expect(screen.getByRole("link", { name: "Support" })).toHaveAttribute(
      "href",
      "mailto:admin@tastematcher.com",
    );
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "/privacy-policy",
    );
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute(
      "href",
      "/terms-of-service",
    );

    await user.click(screen.getByRole("button", { name: "Display settings" }));
    expect(
      screen.getByRole("dialog", { name: "Display Settings" }),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(moreButton);
    await user.click(screen.getByRole("button", { name: "Log out" }));
    expect(logout).toHaveBeenCalledTimes(1);
  });
});
