import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AISuggestionsPage } from "./AISuggestionsPage";
import { AuthContext } from "../../contexts/AuthContext";
import { ViewerPreferencesProvider } from "../../contexts/ViewerPreferencesContext";
import { createMockAuthContext } from "../../test/mocks/authContext";
import type { Artwork } from "@tastematcher/common";

const mockGetRecommendations = jest.fn();
const mockGetAllUsers = jest.fn();
const mockSaveArtworkPreference = jest.fn();

jest.mock("../../utils/api", () => {
  class MockApiError extends Error {
    constructor(
      message: string,
      public readonly status: number = 500,
    ) {
      super(message);
    }
  }

  return {
    ApiError: MockApiError,
    apiClient: {
      getRecommendations: (...args: unknown[]) =>
        mockGetRecommendations(...args),
      getAllUsers: (...args: unknown[]) => mockGetAllUsers(...args),
      saveArtworkPreference: (...args: unknown[]) =>
        mockSaveArtworkPreference(...args),
    },
  };
});

const STORAGE_KEY = "tm.aiSuggestions.includeRated";

const buildArtwork = (id: number): Artwork => ({
  id: `art-${id}`,
  domainId: "domain-1",
  type: "artwork",
  title: `Artwork ${id}`,
  description: `Description ${id}`,
  artist: `Artist ${id}`,
  date: "2024",
  filename: `https://example.com/art-${id}.jpg`,
  vector: Array.from({ length: 1024 }, () => 1),
  vectorModel: "test-model",
});

const buildArtworks = (count: number, startAt: number = 1): Artwork[] =>
  Array.from({ length: count }, (_, index) => buildArtwork(startAt + index));

const buildArtworkWithRecommendationScore = (): Artwork => ({
  ...buildArtwork(1),
  recommendationScore: {
    finalScore: 0.89,
    imageSimilarity: 0.92,
    intentScore: 0.95,
    metadataScore: 0.75,
    behaviorScore: 0.6,
    reasons: ["matches Paintings interest", "artist previously liked"],
  },
});

let latestIntersectionCallback:
  | ((entries: Array<{ isIntersecting: boolean }>) => void)
  | null = null;

class MockIntersectionObserver {
  private readonly callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    latestIntersectionCallback = (
      entries: Array<{ isIntersecting: boolean }>,
    ) => {
      this.callback(entries as IntersectionObserverEntry[], this);
    };
  }

  observe() {
    // no-op
  }

  unobserve() {
    // no-op
  }

  disconnect() {
    // no-op
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds = [];
}

const originalIntersectionObserver = window.IntersectionObserver;

const renderPage = ({
  role,
  showOwnerRatedFilter = true,
  selectedUserId,
  defaultIncludeRated,
}: {
  role: "customer" | "dealer" | "domain_owner" | "global_admin";
  showOwnerRatedFilter?: boolean;
  selectedUserId?: string;
  defaultIncludeRated?: boolean;
}) => {
  const effectiveSelectedUserId =
    selectedUserId ?? (role === "customer" ? undefined : "customer-1");

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const authContext = createMockAuthContext({
    user: {
      id: role === "customer" ? "customer-1" : "owner-1",
      email: "test@example.com",
      domainId: "domain-1",
      role,
      onboardingStatus: "completed",
      swipeCount: 40,
    },
    isAuthenticated: true,
    stats: {
      totalArtworks: 0,
      totalLikes: 0,
      totalDislikes: 0,
      totalSwiped: 40,
      recentlyAdded: 0,
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={authContext}>
        <MemoryRouter>
          <ViewerPreferencesProvider>
            <AISuggestionsPage
              domainId="domain-1"
              userId={effectiveSelectedUserId}
              showOwnerRatedFilter={showOwnerRatedFilter}
              defaultIncludeRated={defaultIncludeRated}
            />
          </ViewerPreferencesProvider>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
};

describe("AISuggestionsPage owner includeRated filter", () => {
  beforeEach(() => {
    latestIntersectionCallback = null;
    localStorage.clear();
    mockGetRecommendations.mockReset();
    mockGetAllUsers.mockReset();
    mockSaveArtworkPreference.mockReset();
    mockGetAllUsers.mockResolvedValue([]);
    mockGetRecommendations.mockResolvedValue([]);
    Object.defineProperty(window, "IntersectionObserver", {
      configurable: true,
      writable: true,
      value: MockIntersectionObserver,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "IntersectionObserver", {
      configurable: true,
      writable: true,
      value: originalIntersectionObserver,
    });
  });

  it("shows the include-rated toggle for owner in Sales context", async () => {
    renderPage({ role: "domain_owner", showOwnerRatedFilter: true });

    await waitFor(() => {
      expect(mockGetRecommendations).toHaveBeenCalled();
    });

    expect(
      await screen.findByLabelText("Include rated artworks"),
    ).toBeInTheDocument();
    expect(mockGetRecommendations).toHaveBeenCalledWith(
      "domain-1",
      "customer-1",
      20,
      0,
      false,
    );
  });

  it("defaults include-rated on when requested by proposal context", async () => {
    localStorage.setItem(STORAGE_KEY, "false");

    renderPage({
      role: "domain_owner",
      showOwnerRatedFilter: true,
      defaultIncludeRated: true,
    });

    await waitFor(() => {
      expect(mockGetRecommendations).toHaveBeenCalledWith(
        "domain-1",
        "customer-1",
        20,
        0,
        true,
      );
    });

    const toggle = await screen.findByLabelText("Include rated artworks");
    expect(toggle).toBeInstanceOf(HTMLInputElement);
    expect((toggle as HTMLInputElement).checked).toBe(true);
  });

  it("hides the include-rated toggle for customers", async () => {
    renderPage({
      role: "customer",
      showOwnerRatedFilter: true,
      selectedUserId: "customer-1",
    });

    expect(
      screen.queryByLabelText("Include rated artworks"),
    ).not.toBeInTheDocument();
    expect(mockGetRecommendations).not.toHaveBeenCalled();
  });

  it("uses stored include-rated preference on mount", async () => {
    localStorage.setItem(STORAGE_KEY, "true");

    renderPage({ role: "domain_owner", showOwnerRatedFilter: true });

    await waitFor(() => {
      expect(mockGetRecommendations).toHaveBeenCalledWith(
        "domain-1",
        "customer-1",
        20,
        0,
        true,
      );
    });

    const toggle = await screen.findByLabelText("Include rated artworks");
    expect(toggle).toBeInstanceOf(HTMLInputElement);
    const input = toggle as HTMLInputElement;
    expect(input.checked).toBe(true);
  });

  it("refetches from first page when include-rated is toggled after pagination", async () => {
    mockGetRecommendations
      .mockResolvedValueOnce(buildArtworks(20, 1))
      .mockResolvedValueOnce(buildArtworks(20, 21))
      .mockResolvedValueOnce(buildArtworks(20, 200));

    renderPage({ role: "domain_owner", showOwnerRatedFilter: true });

    await waitFor(() => {
      expect(mockGetRecommendations).toHaveBeenNthCalledWith(
        1,
        "domain-1",
        "customer-1",
        20,
        0,
        false,
      );
    });

    await screen.findByText("Artwork 1");
    latestIntersectionCallback?.([{ isIntersecting: true }]);

    await waitFor(() => {
      expect(mockGetRecommendations).toHaveBeenNthCalledWith(
        2,
        "domain-1",
        "customer-1",
        20,
        20,
        false,
      );
    });

    fireEvent.click(await screen.findByLabelText("Include rated artworks"));

    await waitFor(() => {
      expect(mockGetRecommendations).toHaveBeenNthCalledWith(
        3,
        "domain-1",
        "customer-1",
        20,
        0,
        true,
      );
    });
  });

  it("shows recommendation reasoning for owners", async () => {
    mockGetRecommendations.mockResolvedValueOnce([
      buildArtworkWithRecommendationScore(),
    ]);

    renderPage({ role: "domain_owner", showOwnerRatedFilter: true });

    expect(
      await screen.findByLabelText("Recommendation reasoning for Artwork 1"),
    ).toBeInTheDocument();
    expect(screen.getByText("Image")).toBeInTheDocument();
    expect(screen.getByText("Intent")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Explain AI recommendation score categories"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Image: visual similarity to the customer taste vectors/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("matches Paintings interest")).toBeInTheDocument();
    expect(screen.getByText("artist previously liked")).toBeInTheDocument();
  });

  it("hides recommendation reasoning for customers", async () => {
    mockGetRecommendations.mockResolvedValueOnce([
      buildArtworkWithRecommendationScore(),
    ]);

    renderPage({
      role: "customer",
      showOwnerRatedFilter: false,
    });

    await screen.findByText("Artwork 1");
    expect(
      screen.queryByLabelText("Recommendation reasoning for Artwork 1"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Explain AI recommendation score categories"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("matches Paintings interest"),
    ).not.toBeInTheDocument();
  });
});
