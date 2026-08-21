import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  AutomaticUploadApprovalResponse,
  AutomaticUploadPreviewResponse,
  Domain,
  Role,
} from "@tastematcher/common";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthContext } from "../../contexts/AuthContext";
import { DomainContext } from "../../contexts/DomainContext";
import { RoleProtectedRoute } from "../../routes/RoleProtectedRoute";
import { createMockAuthContext } from "../../test/mocks/authContext";
import { apiClient } from "../../utils/api";
import { NAVIGATION_LINKS } from "../../constants/navigation";
import {
  AutomaticUploadsPage,
  validateAutomaticUploadDraft,
} from "./AutomaticUploadsPage";

jest.mock("../../utils/api", () => ({
  apiClient: {
    getAllDomains: jest.fn(),
    previewAutomaticUploads: jest.fn(),
    approveAutomaticUploads: jest.fn(),
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
          setCurrentDomain: jest.fn(),
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
    screen.getByLabelText("Auction URL"),
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

describe("validateAutomaticUploadDraft", () => {
  const withTags = (tags: string[]) => ({
    ...structuredClone(previewResponse.drafts[0]),
    artwork: {
      ...structuredClone(previewResponse.drafts[0].artwork),
      tags,
    },
  });

  it("enforces the API tag count and length limits", () => {
    expect(
      validateAutomaticUploadDraft(
        withTags(Array.from({ length: 50 }, (_, index) => `tag-${index}`)),
      ).filter((issue) => issue.scope === "field" && issue.field === "tags"),
    ).toHaveLength(0);
    expect(
      validateAutomaticUploadDraft(
        withTags(Array.from({ length: 51 }, (_, index) => `tag-${index}`)),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "too_many_tags", blocking: true }),
      ]),
    );
    expect(
      validateAutomaticUploadDraft(withTags(["a".repeat(100)])).filter(
        (issue) => issue.scope === "field" && issue.field === "tags",
      ),
    ).toHaveLength(0);
    expect(validateAutomaticUploadDraft(withTags(["a".repeat(101)]))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "tag_too_long", blocking: true }),
      ]),
    );
  });
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
    jest.mocked(apiClient.getAllDomains).mockReset();
    jest.mocked(apiClient.previewAutomaticUploads).mockReset();
    jest.mocked(apiClient.approveAutomaticUploads).mockReset();
    jest
      .mocked(apiClient.previewAutomaticUploads)
      .mockResolvedValue(previewResponse);
  });

  it("identifies supported and unsupported auction provider domains", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(
      screen.getByText("Supported providers: Phillips."),
    ).toBeInTheDocument();
    const urlInput = screen.getByLabelText("Auction URL");
    const reviewButton = screen.getByRole("button", { name: "Review content" });
    expect(reviewButton).toBeDisabled();

    await user.type(
      urlInput,
      "https://www.sothebys.com/en/buy/auction/2026/example",
    );
    expect(
      screen.getByText("This auction provider is not supported yet."),
    ).toBeInTheDocument();
    expect(reviewButton).toBeDisabled();

    await user.clear(urlInput);
    await user.type(urlInput, "https://www.phillips.com/about");
    expect(
      screen.getByText("This auction provider is not supported yet."),
    ).toBeInTheDocument();
    expect(reviewButton).toBeDisabled();

    await user.clear(urlInput);
    await user.type(urlInput, "https://www.phillips.com/auction/NY030826");
    expect(
      screen.getByText("Supported provider: Phillips"),
    ).toBeInTheDocument();
    expect(reviewButton).toBeEnabled();
  });

  it("shows the TasteMatcher loading state while preparing a preview", async () => {
    jest
      .mocked(apiClient.previewAutomaticUploads)
      .mockImplementation(() => new Promise(() => undefined));
    renderPage();
    const user = userEvent.setup();

    await user.type(
      screen.getByLabelText("Auction URL"),
      "https://www.phillips.com/auction/NY030826",
    );
    await user.click(screen.getByRole("button", { name: "Review content" }));

    expect(
      await screen.findByText("Reading auction lots and preparing drafts..."),
    ).toBeInTheDocument();
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
    jest.mocked(apiClient.approveAutomaticUploads).mockResolvedValue(approval);
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

    expect(
      within(firstDraft).getByText("Artist is required."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Upload 2 selected artworks" }),
    ).toBeDisabled();

    await user.type(
      within(firstDraft).getByLabelText("Artist"),
      "Corrected Artist",
    );
    expect(
      within(firstDraft).queryByText("Artist is required."),
    ).not.toBeInTheDocument();
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
    jest.mocked(apiClient.previewAutomaticUploads).mockResolvedValue(response);
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
    expect(
      screen.queryByText("Auction end date is required."),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Upload 2 selected artworks" }),
    ).toBeEnabled();

    jest.mocked(apiClient.approveAutomaticUploads).mockResolvedValue({
      created: [],
      skipped: [],
      failed: [],
    });
    await user.click(
      screen.getByRole("button", { name: "Upload 2 selected artworks" }),
    );
    const expectedIso = new Date(2026, 8, 1, 18, 0).toISOString();
    await waitFor(() => {
      const request = jest.mocked(apiClient.approveAutomaticUploads).mock
        .calls[0][1];
      expect(request.drafts).toHaveLength(2);
      request.drafts.forEach((draft) => {
        expect(draft.artwork.endDate).toBe(expectedIso);
      });
    });
  });

  it("bulk edits display, Taster, and privacy values on selected drafts only", async () => {
    jest.mocked(apiClient.approveAutomaticUploads).mockResolvedValue({
      created: [],
      skipped: [],
      failed: [],
    });
    renderPage();
    const user = await previewAuction();
    const firstDraft = screen.getByTestId("automatic-upload-draft-draft-1");
    const secondDraft = screen.getByTestId("automatic-upload-draft-draft-2");

    await user.click(within(secondDraft).getByLabelText("Include lot 13"));
    await user.click(
      within(
        screen.getByRole("group", { name: "Display price bulk value" }),
      ).getByRole("button", { name: "Hide" }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Apply Display price to selected",
      }),
    );
    await user.click(
      within(
        screen.getByRole("group", { name: "Use for Taster bulk value" }),
      ).getByRole("button", { name: "Exclude" }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Apply Use for Taster to selected",
      }),
    );
    await user.click(
      within(
        screen.getByRole("group", { name: "Private bulk value" }),
      ).getByRole("button", { name: "Private" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Apply Private to selected" }),
    );

    expect(
      within(firstDraft).getByLabelText("Display price"),
    ).not.toBeChecked();
    expect(
      within(firstDraft).getByLabelText("Use for Taster"),
    ).not.toBeChecked();
    expect(within(firstDraft).getByLabelText("Private")).toBeChecked();
    expect(within(secondDraft).getByLabelText("Use for Taster")).toBeChecked();
    expect(within(secondDraft).getByLabelText("Private")).not.toBeChecked();

    await user.click(
      screen.getByRole("button", { name: "Upload 1 selected artwork" }),
    );
    await waitFor(() =>
      expect(apiClient.approveAutomaticUploads).toHaveBeenCalledTimes(1),
    );
    const request = jest.mocked(apiClient.approveAutomaticUploads).mock
      .calls[0][1];
    expect(request.drafts).toHaveLength(1);
    expect(request.drafts[0].artwork).toMatchObject({
      shouldDisplayPrice: false,
      useForTaster: false,
      isPrivate: true,
    });
  });

  it("appends deduplicated tags to selected drafts only", async () => {
    jest.mocked(apiClient.approveAutomaticUploads).mockResolvedValue({
      created: [],
      skipped: [],
      failed: [],
    });
    renderPage();
    const user = await previewAuction();
    const firstDraft = screen.getByTestId("automatic-upload-draft-draft-1");
    const secondDraft = screen.getByTestId("automatic-upload-draft-draft-2");

    await user.click(within(secondDraft).getByLabelText("Include lot 13"));
    await user.type(
      screen.getByLabelText("Add tags to selected drafts"),
      "featured, Contemporary, FEATURED, phillips",
    );
    await user.click(screen.getByRole("button", { name: "Add to selected" }));

    expect(within(firstDraft).getByLabelText("Tags")).toHaveValue(
      "phillips, featured, Contemporary",
    );
    expect(within(secondDraft).getByLabelText("Tags")).toHaveValue("");

    await user.click(
      screen.getByRole("button", { name: "Upload 1 selected artwork" }),
    );
    await waitFor(() =>
      expect(apiClient.approveAutomaticUploads).toHaveBeenCalledTimes(1),
    );
    expect(
      jest.mocked(apiClient.approveAutomaticUploads).mock.calls[0][1].drafts[0]
        .artwork.tags,
    ).toEqual(["phillips", "featured", "Contemporary"]);
  });

  it("supports multi-word and comma-separated tags in an individual draft", async () => {
    jest.mocked(apiClient.approveAutomaticUploads).mockResolvedValue({
      created: [],
      skipped: [],
      failed: [],
    });
    renderPage();
    const user = await previewAuction();
    const firstDraft = screen.getByTestId("automatic-upload-draft-draft-1");
    const secondDraft = screen.getByTestId("automatic-upload-draft-draft-2");
    const tagsInput = within(firstDraft).getByLabelText("Tags");

    await user.clear(tagsInput);
    await user.type(tagsInput, "modern art, featured");
    expect(tagsInput).toHaveValue("modern art, featured");
    await user.tab();
    expect(tagsInput).toHaveValue("modern art, featured");
    await user.click(within(secondDraft).getByLabelText("Include lot 13"));
    await user.click(
      screen.getByRole("button", { name: "Upload 1 selected artwork" }),
    );

    await waitFor(() =>
      expect(apiClient.approveAutomaticUploads).toHaveBeenCalledTimes(1),
    );
    expect(
      jest.mocked(apiClient.approveAutomaticUploads).mock.calls[0][1].drafts[0]
        .artwork.tags,
    ).toEqual(["modern art", "featured"]);
  });

  it("renders ISO auction dates locally and stores individual edits as ISO UTC", async () => {
    jest.mocked(apiClient.approveAutomaticUploads).mockResolvedValue({
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
      within(
        screen.getByTestId("automatic-upload-draft-draft-2"),
      ).getByLabelText("Include lot 13"),
    );
    await user.click(
      screen.getByRole("button", { name: "Upload 1 selected artwork" }),
    );

    await waitFor(() => {
      const request = jest.mocked(apiClient.approveAutomaticUploads).mock
        .calls[0][1];
      expect(request.drafts[0].artwork.endDate).toBe(
        new Date(2026, 8, 2, 10, 30).toISOString(),
      );
    });
  });

  it("disables selection and draft editing while approval is pending", async () => {
    jest
      .mocked(apiClient.approveAutomaticUploads)
      .mockImplementation(
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
    jest.mocked(apiClient.approveAutomaticUploads).mockResolvedValue({
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
      await screen.findByText(
        "Phillips blocked the image download. Retry this lot.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Untitled")).not.toBeInTheDocument();
    expect(screen.getByText("Second work")).toBeInTheDocument();
  });

  it("uses structured failure issues without leaving a generic validation blocker", async () => {
    jest.mocked(apiClient.approveAutomaticUploads).mockResolvedValue({
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
      within(
        screen.getByTestId("automatic-upload-draft-draft-1"),
      ).getByLabelText("Include lot 12"),
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
    jest.mocked(apiClient.approveAutomaticUploads).mockResolvedValue({
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
      within(
        screen.getByTestId("automatic-upload-draft-draft-1"),
      ).getByLabelText("Include lot 12"),
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
    jest.mocked(apiClient.previewAutomaticUploads).mockResolvedValue(response);
    jest
      .mocked(apiClient.approveAutomaticUploads)
      .mockImplementation(async (_domainId, request) => ({
        created: request.drafts.map((draft) => ({
          draftId: draft.draftId,
          status: "created" as const,
          artworkId: `artwork-${draft.draftId}`,
          sourceIdentity: draft.source.identity,
        })),
        skipped: [],
        failed: [],
      }));
    renderPage();

    const user = await previewAuction();
    await user.click(
      screen.getByRole("button", { name: "Upload 101 selected artworks" }),
    );

    await waitFor(() => {
      expect(apiClient.approveAutomaticUploads).toHaveBeenCalledTimes(6);
    });
    expect(
      jest
        .mocked(apiClient.approveAutomaticUploads)
        .mock.calls.map((call) => call[1].drafts.length),
    ).toEqual([20, 20, 20, 20, 20, 1]);
    expect(
      await screen.findByText("101 artworks uploaded."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No drafts remain in this batch."),
    ).toBeInTheDocument();
  });

  it("keeps prior chunk successes when a later approval request fails", async () => {
    const response = buildLargePreview(101);
    jest.mocked(apiClient.previewAutomaticUploads).mockResolvedValue(response);
    jest
      .mocked(apiClient.approveAutomaticUploads)
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

    expect(
      await screen.findByText("20 artworks uploaded."),
    ).toBeInTheDocument();
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
      "This auction provider is not supported yet.",
    ],
    [
      "https://user:secret@www.phillips.com/auction/NY030826",
      "Auction URLs cannot include credentials.",
    ],
    [
      "https://www.phillips.com:444/auction/NY030826",
      "Auction URLs cannot use a non-default port.",
    ],
  ])("rejects unsupported preflight URL %s", async (url, message) => {
    renderPage();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Auction URL"), url);

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Review content" }),
    ).toBeDisabled();
    expect(apiClient.previewAutomaticUploads).not.toHaveBeenCalled();
  });

  it("loads a required target gallery selector for a global admin", async () => {
    jest
      .mocked(apiClient.getAllDomains)
      .mockResolvedValue([
        domain,
        { ...domain, id: "domain-2", name: "South Gallery" },
      ]);
    renderPage("global_admin");

    expect(
      await screen.findByRole("combobox", { name: "Target gallery" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Choose the gallery that will receive approved artwork.",
      ),
    ).toBeInTheDocument();
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
                <RoleProtectedRoute
                  allowedRoles={["domain_owner", "global_admin"]}
                >
                  <div>Restricted automatic uploads</div>
                </RoleProtectedRoute>
              }
            />
            <Route path="/home" element={<div>Home route</div>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    expect(
      screen.queryByText("Restricted automatic uploads"),
    ).not.toBeInTheDocument();
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
