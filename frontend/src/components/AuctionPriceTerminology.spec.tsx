import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Artwork, ProposalItem } from "@tastematcher/common";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthContext } from "../contexts/AuthContext";
import { ViewerPreferencesProvider } from "../contexts/ViewerPreferencesContext";
import { createMockAuthContext } from "../test/mocks/authContext";
import { apiClient } from "../utils/api";
import SaleProposal from "./SaleProposal";
import { EditArtworkModal } from "./EditArtworkModal/EditArtworkModal";

jest.mock("../utils/api", () => ({
  apiClient: {
    getArtwork: jest.fn(),
    getDomainById: jest.fn(),
    getUser: jest.fn(),
    createProposal: jest.fn(),
    replaceArtworkImage: jest.fn(),
    updateArtwork: jest.fn(),
  },
}));

const artwork: Artwork = {
  id: "artwork-1",
  domainId: "domain-1",
  title: "Auction work",
  description: "Description",
  artist: "Artist",
  date: "2024",
  isAuction: true,
  price: 200,
  maxPrice: 100,
  shouldDisplayPrice: true,
  useForTaster: true,
  isPrivate: false,
  filename: "artwork.jpg",
  vector: [],
  vectorModel: "test",
  uploadedBy: "owner-1",
};

const renderEditModal = () => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const auth = createMockAuthContext({
    user: {
      id: "owner-1",
      email: "owner@example.com",
      domainId: "domain-1",
      role: "domain_owner",
    },
    isAuthenticated: true,
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        <EditArtworkModal
          artwork={artwork}
          onClose={jest.fn()}
          onSave={jest.fn()}
        />
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
};

describe("auction price terminology", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  it("uses low and high price labels and validation in the artwork editor", () => {
    renderEditModal();

    expect(screen.getByText("Low price (USD)")).toBeInTheDocument();
    expect(screen.getByText("High price / reserve")).toBeInTheDocument();
    expect(
      screen.getByText("High price must be ≥ low price (USD)."),
    ).toBeInTheDocument();
  });

  it("uses low and high asking-price labels and validation in proposals", async () => {
    const item: ProposalItem = {
      artworkId: artwork.id,
      comments: [],
      status: "pending",
      askedPrice: 200,
      askedMaxPrice: 100,
    };
    jest.mocked(apiClient.getArtwork).mockResolvedValue(artwork);
    jest.mocked(apiClient.getDomainById).mockResolvedValue({
      id: "domain-1",
      name: "Gallery",
    } as never);
    jest.mocked(apiClient.getUser).mockResolvedValue({} as never);
    const user = userEvent.setup();

    render(
      <ViewerPreferencesProvider>
        <SaleProposal
          domainId="domain-1"
          userId="customer-1"
          userName="Customer"
          draftItems={[item]}
        />
      </ViewerPreferencesProvider>,
    );

    expect(screen.getByText("Low Asking Price")).toBeInTheDocument();
    expect(screen.getByText("High Asking Price")).toBeInTheDocument();
    await waitFor(() => expect(apiClient.getArtwork).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Create & Publish" }));
    expect(
      screen.getByText("High price must be greater than or equal to low price"),
    ).toBeInTheDocument();
  });

  it("saves viewing-room metadata with proposal drafts", async () => {
    const item: ProposalItem = {
      artworkId: artwork.id,
      comments: [],
      status: "pending",
      askedPrice: 200,
    };
    const viewingRoom = {
      title: "Works selected for Avery",
      introNote: "A focused group based on recent likes.",
      priceVisibility: "show",
    };
    jest.mocked(apiClient.getArtwork).mockResolvedValue(artwork);
    jest.mocked(apiClient.getDomainById).mockResolvedValue({
      id: "domain-1",
      name: "Gallery",
    } as never);
    jest.mocked(apiClient.getUser).mockResolvedValue({} as never);
    jest.mocked(apiClient.createProposal).mockResolvedValue({
      id: "proposal-1",
      type: "proposal",
      domainId: "domain-1",
      userId: "customer-1",
      items: [item],
      generalComments: [],
      metadata: { viewingRoom },
      status: "draft",
      createdAt: Date.now(),
    } as never);
    const user = userEvent.setup();

    render(
      <ViewerPreferencesProvider>
        <SaleProposal
          domainId="domain-1"
          userId="customer-1"
          userName="Customer"
          draftItems={[item]}
          proposalMetadata={{ viewingRoom }}
        />
      </ViewerPreferencesProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Save Draft" }));
    await user.click(screen.getByRole("button", { name: "Create Draft" }));

    await waitFor(() => {
      expect(apiClient.createProposal).toHaveBeenCalledWith(
        "domain-1",
        expect.objectContaining({
          metadata: { viewingRoom },
          status: "draft",
        }),
      );
    });
  });
});
