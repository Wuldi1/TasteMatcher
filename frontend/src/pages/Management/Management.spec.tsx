import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthContext } from "../../contexts/AuthContext";
import { createMockAuthContext } from "../../test/mocks/authContext";
import { apiClient } from "../../utils/api";
import { Management } from "./Management";

jest.mock("../../utils/api", () => ({
  apiClient: {
    getAllDomains: jest.fn(),
    getAllCustomerRequests: jest.fn(),
  },
  ApiError: class ApiError extends Error {},
}));

const mockGetAllDomains = jest.mocked(apiClient.getAllDomains);
const mockGetAllCustomerRequests = jest.mocked(apiClient.getAllCustomerRequests);

describe("Management customer requests table", () => {
  beforeEach(() => {
    mockGetAllDomains.mockReset();
    mockGetAllCustomerRequests.mockReset();
  });

  it("keeps the desktop assign-domain field visible and full width", async () => {
    mockGetAllDomains.mockResolvedValue([
      {
        id: "domain-1",
        name: "Domain One",
        adminEmail: "admin@example.com",
        status: "active",
        createdAt: Date.now(),
      },
    ] as never);
    mockGetAllCustomerRequests.mockResolvedValue([
      {
        id: "request-1",
        name: "Customer One",
        email: "customer@example.com",
        message: "Please invite me",
        status: "pending",
        createdAt: Date.now(),
      },
    ] as never);

    const authContext = createMockAuthContext({
      user: {
        id: "admin-1",
        email: "admin@example.com",
        domainId: "domain-1",
        role: "global_admin",
      },
      isAuthenticated: true,
    });

    render(
      <AuthContext.Provider value={authContext}>
        <MemoryRouter>
          <Management />
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    await waitFor(() => {
      expect(mockGetAllDomains).toHaveBeenCalled();
    });

    await userEvent.click(screen.getByRole("button", { name: "Customer Requests" }));

    await waitFor(() => {
      expect(mockGetAllCustomerRequests).toHaveBeenCalled();
    });

    const requestRow = screen
      .getAllByRole("row")
      .find((row) => within(row).queryByText("Customer One"));

    expect(requestRow).toBeTruthy();

    const desktopAssignDomain = within(requestRow as HTMLElement).getByRole(
      "combobox",
      { name: "Assign domain" },
    );

    expect(desktopAssignDomain).toBeTruthy();
    expect(desktopAssignDomain.hasAttribute("disabled")).toBe(false);
  });
});
