import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AuthContext } from "../../contexts/AuthContext";
import { createMockAuthContext } from "../../test/mocks/authContext";
import { apiClient } from "../../utils/api";
import { Management } from "./Management";

vi.mock("../../utils/api", () => ({
  apiClient: {
    getAllDomains: vi.fn(),
    getAllCustomerRequests: vi.fn(),
  },
  ApiError: class ApiError extends Error {},
}));

const mockGetAllDomains = vi.mocked(apiClient.getAllDomains);
const mockGetAllCustomerRequests = vi.mocked(apiClient.getAllCustomerRequests);

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

    const desktopAssignDomain = document.getElementById("customer-domain-request-1");
    expect(desktopAssignDomain).not.toBeNull();
    expect(desktopAssignDomain?.hasAttribute("disabled")).toBe(false);
    expect(desktopAssignDomain?.closest("div")?.className).toContain("min-w-[16rem]");
    expect(desktopAssignDomain?.closest("td")?.className).toContain("min-w-[18rem]");
    expect(desktopAssignDomain?.closest("td")?.className).toContain("w-[22rem]");
  });
});
