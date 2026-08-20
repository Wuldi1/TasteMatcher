import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  AutomaticUploadApprovalResponse,
  AutomaticUploadPreviewResponse,
  Domain,
  Role,
} from "@tastematcher/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthContext } from "../../contexts/AuthContext";
import { DomainContext } from "../../contexts/DomainContext";
import { RoleProtectedRoute } from "../../routes/RoleProtectedRoute";
import { createMockAuthContext } from "../../test/mocks/authContext";
import { apiClient } from "../../utils/api";
import { NAVIGATION_LINKS } from "../../constants/navigation";
import { AutomaticUploadsPage } from "./AutomaticUploadsPage";

vi.mock("../../utils/api", () => ({
  apiClient: {
    getAllDomains: vi.fn(),
    previewAutomaticUploads: vi.fn(),
    approveAutomaticUploads: vi.fn(),
  },
  ApiError: class ApiError extends Error {},
}));

const domain: Domain = {
  id: "domain-1",
  name: "North Gallery",
  adminEmail: "owner@example.com",
  status: "active",
  createdAt: 1,
  updatedAt: 1,
};

const previewResponse: AutomaticUploadPreviewResponse = {
  provider: "phillips",
  source: {
    provider: "phillips",
    sourceAuctionUrl: "https://www.phillips.com/auction/NY030826",
    auctionCode: "NY030826",
    auctionTitle: "Modern & Contemporary Art",
    location: "New York",
    endsAt: "2026-08-30T18:00:00.000Z",
  },
  issues: [],
  drafts: [
    {
      draftId: "draft-1",
      included: true,
      source: {
        identity: {
          provider: "phillips",
          sourceAuctionUrl: "https://www.phillips.com/auction/NY030826",
          sourceLotNumber: "12",
          sourceLotUrl: "https://www.phillips.com/detail/example/NY030826/12",
        },
        sourceImageUrl: "https://images.phillips.com/image-12.jpg",
        originalEstimateText: "$20,000 - $30,000",
        originalEstimateCurrency: "USD",
        originalEstimateLow: 20000,
        originalEstimateHigh: 30000,
        pricingConversionStatus: "not_required",
      },
      artwork: {
        title: "Untitled",
        artist: "Example Artist",
        description: "Catalog description",
        date: "2024",
        medium: "Oil on canvas",
        width: 80,
        height: 100,
        isAuction: true,
        price: 20000,
        maxPrice: 30000,
        endDate: "2026-08-30T18:00:00.000Z",
        shouldDisplayPrice: true,
        useForTaster: true,
        isPrivate: false,
        tags: ["phillips"],
      },
      issues: [],
    },
    {
      draftId: "draft-2",
      included: true,
      source: {
        identity: {
          provider: "phillips",
          sourceAuctionUrl: "https://www.phillips.com/auction/NY030826",
          sourceLotNumber: "13",
        },
        sourceImageUrl: "https://images.phillips.com/image-13.jpg",
        pricingConversionStatus: "not_attempted",
      },
      artwork: {
        title: "Second work",
        artist: "Second Artist",
        description: "",
        date: "2025",
        isAuction: false,
        shouldDisplayPrice: false,
        useForTaster: true,
        isPrivate: false,
        tags: [],
      },
      issues: [],
    },
  ],
};

const renderPage = (role: Role = "domain_owner") => {
  const auth = createMockAuthContext({
    user: {
      id: "user-1",
      email: "owner@example.com",
      domainId: domain.id,
      role,
    },
    isAuthenticated: true,
  });

  return render(
    <AuthContext.Provider value={auth}>
      <DomainContext.Provider
        value={{
          currentDomain: domain,
          setCurrentDomain: vi.fn(),
          isLoading: false,
        }}
      >
        <MemoryRouter>
          <AutomaticUploadsPage />
        </MemoryRouter>
      </DomainContext.Provider>
    </AuthContext.Provider>,
  );
};

const previewAuction = async () => {
  const user = userEvent.setup();
  await user.type(
    screen.getByLabelText("Phillips auction URL"),
    "https://www.phillips.com/auction/NY030826",
  );
  await user.click(screen.getByRole("button", { name: "Review content" }));
  await screen.findByText("Modern & Contemporary Art");
  return user;
};

const clonePreview = (): AutomaticUploadPreviewResponse =>
  structuredClone(previewResponse);

const buildLargePreview = (count: number): AutomaticUploadPreviewResponse => ({
  ...clonePreview(),
  drafts: Array.from({ length: count }, (_, index) => {
    const draftNumber = index + 1;
    const template = previewResponse.drafts[0];
    return {
      ...structuredClone(template),
      draftId: `large-draft-${draftNumber}`,
      source: {
        ...structuredClone(template.source),
        identity: {
          ...template.source.identity,
          sourceLotNumber: String(draftNumber),
        },
      },
      artwork: {
        ...structuredClone(template.artwork),
        title: `Large batch artwork ${draftNumber}`,
      },
    };
  }),
});

const toLocalDateTimeValue = (value: string): string => {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

describe("AutomaticUploadsPage", () => {
  beforeEach(() => {
    vi.mocked(apiClient.getAllDomains).mockReset();
    vi.mocked(apiClient.previewAutomaticUploads).mockReset();
    vi.mocked(apiClient.approveAutomaticUploads).mockReset();
    vi.mocked(apiClient.previewAutomaticUploads).mockResolvedValue(
      previewResponse,
    );
  });

  it("previews drafts, edits local fields, excludes a lot, and approves the selection", async () => {
    const approval: AutomaticUploadApprovalResponse = {
      created: [
        {
          draftId: "draft-1",
          status: "created",
          artworkId: "artwork-1",
          sourceIdentity: previewResponse.drafts[0].source.identity,
        },
      ],
      skipped: [],
      failed: [],
    };
    vi.mocked(apiClient.approveAutomaticUploads).mockResolvedValue(approval);
    renderPage();

    const user = await previewAuction();
    const firstDraft = screen.getByTestId("automatic-upload-draft-draft-1");
    const secondDraft = screen.getByTestId("automatic-upload-draft-draft-2");

    await user.clear(within(firstDraft).getByLabelText("Title"));
    await user.type(within(firstDraft).getByLabelText("Title"), "Edited title");
    await user.click(within(secondDraft).getByLabelText("Include lot 13"));
    await user.click(
      screen.getByRole("button", { name: "Upload 1 selected artwork" }),
    );

    await waitFor(() => {
      expect(apiClient.approveAutomaticUploads).toHaveBeenCalledWith(
        "domain-1",
        expect.objectContaining({
          provider: "phillips",
          drafts: [
            expect.objectContaining({
              draftId: "draft-1",
              artwork: expect.objectContaining({ title: "Edited title" }),
            }),
          ],
        }),
      );
    });
    expect(await screen.findByText("1 artwork uploaded.")).toBeInTheDocument();
    expect(screen.queryByText("Edited title")).not.toBeInTheDocument();
    expect(screen.getByText("Second work")).toBeInTheDocument();
  });

  it("blocks approval until selected client validation issues are corrected", async () => {
    renderPage();
    const user = await previewAuction();
    const firstDraft = screen.getByTestId("automatic-upload-draft-draft-1");

    await user.clear(within(firstDraft).getByLabelText("Artist"));

    expect(within(firstDraft).getByText("Artist is required.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Upload 2 selected artworks" }),
    ).toBeDisabled();

    await user.type(within(firstDraft).getByLabelText("Artist"), "Corrected Artist");
    expect(within(firstDraft).queryByText("Artist is required.")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Upload 2 selected artworks" }),
    ).toBeEnabled();
  });

  it("applies one auction end date to every selected draft and clears end-date issues", async () => {
    const response = clonePreview();
    response.source = { ...response.source, endsAt: undefined };
    response.drafts = response.drafts.map((draft) => ({
      ...draft,
      artwork: { ...draft.artwork, isAuction: true, endDate: undefined },
      issues: [
        {
          scope: "field",
          field: "endDate",
          code: "auction_end_date_required",
          message: "Auction end date is required.",
          severity: "error",
          blocking: true,
        },
      ],
    }));
    vi.mocked(apiClient.previewAutomaticUploads).mockResolvedValue(response);
    renderPage();

    const user = await previewAuction();
    expect(
      screen.getByRole("button", { name: "Upload 2 selected artworks" }),
    ).toBeDisabled();

    await user.type(
      screen.getByLabelText("Set auction end date for selected drafts"),
      "2026-09-01T18:00",
    );
    await user.click(screen.getByRole("button", { name: "Apply to selected" }));

    screen.getAllByLabelText("Auction end date").forEach((input) => {
      expect(input).toHaveValue("2026-09-01T18:00");
    });
    expect(screen.queryByText("Auction end date is required.")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Upload 2 selected artworks" }),
    ).toBeEnabled();

    vi.mocked(apiClient.approveAutomaticUploads).mockResolvedValue({
      created: [],
      skipped: [],
      failed: [],
    });
    await user.click(
      screen.getByRole("button", { name: "Upload 2 selected artworks" }),
    );
    const expectedIso = new Date(2026, 8, 1, 18, 0).toISOString();
    await waitFor(() => {
      const request = vi.mocked(apiClient.approveAutomaticUploads).mock
        .calls[0][1];
      expect(request.drafts).toHaveLength(2);
      request.drafts.forEach((draft) => {
        expect(draft.artwork.endDate).toBe(expectedIso);
      });
    });
  });

  it("renders ISO auction dates locally and stores individual edits as ISO UTC", async () => {
    vi.mocked(apiClient.approveAutomaticUploads).mockResolvedValue({
      created: [],
      skipped: [],
      failed: [],
    });
    renderPage();

    const user = await previewAuction();
    const firstDraft = screen.getByTestId("automatic-upload-draft-draft-1");
    const endDateInput = within(firstDraft).getByLabelText("Auction end date");
    expect(endDateInput).toHaveValue(
      toLocalDateTimeValue("2026-08-30T18:00:00.000Z"),
    );

    await user.clear(endDateInput);
    await user.type(endDateInput, "2026-09-02T10:30");
    await user.click(
      within(screen.getByTestId("automatic-upload-draft-draft-2")).getByLabelText(
        "Include lot 13",
      ),
    );
    await user.click(
      screen.getByRole("button", { name: "Upload 1 selected artwork" }),
    );

    await waitFor(() => {
      const request = vi.mocked(apiClient.approveAutomaticUploads).mock
        .calls[0][1];
      expect(request.drafts[0].artwork.endDate).toBe(
        new Date(2026, 8, 2, 10, 30).toISOString(),
      );
    });
  });

  it("disables selection and draft editing while approval is pending", async () => {
    vi.mocked(apiClient.approveAutomaticUploads).mockImplementation(
      () => new Promise<AutomaticUploadApprovalResponse>(() => undefined),
    );
    renderPage();

    const user = await previewAuction();
    await user.click(
      screen.getByRole("button", { name: "Upload 2 selected artworks" }),
    );
    await waitFor(() => {
      expect(apiClient.approveAutomaticUploads).toHaveBeenCalledTimes(1);
    });

    const firstDraft = screen.getByTestId("automatic-upload-draft-draft-1");
    expect(within(firstDraft).getByLabelText("Title")).toBeDisabled();
    expect(within(firstDraft).getByLabelText("Include lot 12")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Select all" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Exclude all" })).toBeDisabled();
    expect(
      screen.getByLabelText("Set auction end date for selected drafts"),
    ).toBeDisabled();
  });

  it("retains failed drafts with an actionable approval message", async () => {
    vi.mocked(apiClient.approveAutomaticUploads).mockResolvedValue({
      created: [
        {
          draftId: "draft-1",
          status: "created",
          artworkId: "artwork-1",
          sourceIdentity: previewResponse.drafts[0].source.identity,
        },
      ],
      skipped: [],
      failed: [
        {
          draftId: "draft-2",
          status: "failed",
          sourceIdentity: previewResponse.drafts[1].source.identity,
          code: "image_download_failed",
          message: "Phillips blocked the image download. Retry this lot.",
          retryable: true,
        },
      ],
    });
    renderPage();

    const user = await previewAuction();
    await user.click(
      screen.getByRole("button", { name: "Upload 2 selected artworks" }),
    );

    expect(
      await screen.findByText("Phillips blocked the image download. Retry this lot."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Untitled")).not.toBeInTheDocument();
    expect(screen.getByText("Second work")).toBeInTheDocument();
  });

  it("uses structured failure issues without leaving a generic validation blocker", async () => {
    vi.mocked(apiClient.approveAutomaticUploads).mockResolvedValue({
      created: [],
      skipped: [],
      failed: [
        {
          draftId: "draft-2",
          status: "failed",
          sourceIdentity: previewResponse.drafts[1].source.identity,
          code: "validation_failed",
          message: "Artwork validation failed.",
          retryable: false,
          issues: [
            {
              scope: "field",
              field: "title",
              code: "title_format",
              message: "Title must include catalog text.",
              severity: "error",
              blocking: true,
            },
          ],
        },
      ],
    });
    renderPage();

    const user = await previewAuction();
    await user.click(
      within(screen.getByTestId("automatic-upload-draft-draft-1")).getByLabelText(
        "Include lot 12",
      ),
    );
    await user.click(
      screen.getByRole("button", { name: "Upload 1 selected artwork" }),
    );

    const failedDraft = await screen.findByTestId(
      "automatic-upload-draft-draft-2",
    );
    expect(
      within(failedDraft).getByText("Title must include catalog text."),
    ).toBeInTheDocument();
    expect(
      within(failedDraft).queryByText("Artwork validation failed."),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Upload 1 selected artwork" }),
    ).toBeDisabled();

    await user.clear(within(failedDraft).getByLabelText("Title"));
    await user.type(
      within(failedDraft).getByLabelText("Title"),
      "Corrected catalog title",
    );

    expect(
      within(failedDraft).queryByText("Title must include catalog text."),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Upload 1 selected artwork" }),
    ).toBeEnabled();
  });

  it("clears a generic validation failure after any artwork field is corrected", async () => {
    vi.mocked(apiClient.approveAutomaticUploads).mockResolvedValue({
      created: [],
      skipped: [],
      failed: [
        {
          draftId: "draft-2",
          status: "failed",
          sourceIdentity: previewResponse.drafts[1].source.identity,
          code: "validation_failed",
          message: "Artwork schema validation failed.",
          retryable: false,
        },
      ],
    });
    renderPage();

    const user = await previewAuction();
    await user.click(
      within(screen.getByTestId("automatic-upload-draft-draft-1")).getByLabelText(
        "Include lot 12",
      ),
    );
    await user.click(
      screen.getByRole("button", { name: "Upload 1 selected artwork" }),
    );

    const failedDraft = await screen.findByTestId(
      "automatic-upload-draft-draft-2",
    );
    expect(
      within(failedDraft).getByText("Artwork schema validation failed."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Upload 1 selected artwork" }),
    ).toBeDisabled();

    await user.type(within(failedDraft).getByLabelText("Medium"), "Digital");

    expect(
      within(failedDraft).queryByText("Artwork schema validation failed."),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Upload 1 selected artwork" }),
    ).toBeEnabled();
  });

  it("splits large approvals into chunks of at most 20 and aggregates results", async () => {
    const response = buildLargePreview(101);
    vi.mocked(apiClient.previewAutomaticUploads).mockResolvedValue(response);
    vi.mocked(apiClient.approveAutomaticUploads).mockImplementation(
      async (_domainId, request) => ({
        created: request.drafts.map((draft) => ({
          draftId: draft.draftId,
          status: "created" as const,
          artworkId: `artwork-${draft.draftId}`,
          sourceIdentity: draft.source.identity,
        })),
        skipped: [],
        failed: [],
      }),
    );
    renderPage();

    const user = await previewAuction();
    await user.click(
      screen.getByRole("button", { name: "Upload 101 selected artworks" }),
    );

    await waitFor(() => {
      expect(apiClient.approveAutomaticUploads).toHaveBeenCalledTimes(6);
    });
    expect(
      vi
        .mocked(apiClient.approveAutomaticUploads)
        .mock.calls.map((call) => call[1].drafts.length),
    ).toEqual([20, 20, 20, 20, 20, 1]);
    expect(await screen.findByText("101 artworks uploaded.")).toBeInTheDocument();
    expect(screen.getByText("No drafts remain in this batch.")).toBeInTheDocument();
  });

  it("keeps prior chunk successes when a later approval request fails", async () => {
    const response = buildLargePreview(101);
    vi.mocked(apiClient.previewAutomaticUploads).mockResolvedValue(response);
    vi.mocked(apiClient.approveAutomaticUploads)
      .mockResolvedValueOnce({
        created: response.drafts.slice(0, 20).map((draft) => ({
          draftId: draft.draftId,
          status: "created" as const,
          artworkId: `artwork-${draft.draftId}`,
          sourceIdentity: draft.source.identity,
        })),
        skipped: [],
        failed: [],
      })
      .mockRejectedValueOnce(new Error("Approval service unavailable."));
    renderPage();

    const user = await previewAuction();
    await user.click(
      screen.getByRole("button", { name: "Upload 101 selected artworks" }),
    );

    expect(await screen.findByText("20 artworks uploaded.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Upload stopped after 20 of 101 drafts were processed. Approval service unavailable.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("automatic-upload-draft-large-draft-1"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId("automatic-upload-draft-large-draft-21"),
    ).toBeInTheDocument();
  });

  it.each([
    [
      "https://auctions.phillips.com/auction/NY030826",
      "Only Phillips auction URLs are supported.",
    ],
    [
      "https://user:secret@www.phillips.com/auction/NY030826",
      "Phillips auction URLs cannot include credentials.",
    ],
    [
      "https://www.phillips.com:444/auction/NY030826",
      "Phillips auction URLs cannot use a non-default port.",
    ],
  ])("rejects unsupported preflight URL %s", async (url, message) => {
    renderPage();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Phillips auction URL"), url);
    await user.click(screen.getByRole("button", { name: "Review content" }));

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(apiClient.previewAutomaticUploads).not.toHaveBeenCalled();
  });

  it("loads a required target gallery selector for a global admin", async () => {
    vi.mocked(apiClient.getAllDomains).mockResolvedValue([
      domain,
      { ...domain, id: "domain-2", name: "South Gallery" },
    ]);
    renderPage("global_admin");

    expect(await screen.findByRole("combobox", { name: "Target gallery" })).toBeInTheDocument();
    expect(screen.getByText("Choose the gallery that will receive approved artwork.")).toBeInTheDocument();
  });
});

describe("RoleProtectedRoute", () => {
  it("redirects a dealer instead of rendering an owner-only route", () => {
    const auth = createMockAuthContext({
      user: {
        id: "dealer-1",
        email: "dealer@example.com",
        domainId: "domain-1",
        role: "dealer",
      },
      isAuthenticated: true,
    });

    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={["/automatic-uploads"]}>
          <Routes>
            <Route
              path="/automatic-uploads"
              element={
                <RoleProtectedRoute allowedRoles={["domain_owner", "global_admin"]}>
                  <div>Restricted automatic uploads</div>
                </RoleProtectedRoute>
              }
            />
            <Route path="/home" element={<div>Home route</div>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    expect(screen.queryByText("Restricted automatic uploads")).not.toBeInTheDocument();
    expect(screen.getByText("Home route")).toBeInTheDocument();
  });

  it("exposes the navigation item only to owners and global admins", () => {
    const link = NAVIGATION_LINKS.find(
      (navigationLink) => navigationLink.id === "automatic-uploads",
    );

    expect(link?.href).toBe("/automatic-uploads");
    expect(link?.roles).toEqual(["domain_owner", "global_admin"]);
  });
});
