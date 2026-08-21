import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Artwork } from "@tastematcher/common";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthContext } from "../../contexts/AuthContext";
import { ViewerPreferencesProvider } from "../../contexts/ViewerPreferencesContext";
import { createMockAuthContext } from "../../test/mocks/authContext";
import { apiClient } from "../../utils/api";
import { CatalogPage } from "./CatalogPage";

jest.mock("../../utils/api", () => ({
  apiClient: {
    getArtworks: jest.fn(),
  },
}));

const mockGetArtworks = jest.mocked(apiClient.getArtworks);

const buildArtwork = (index: number): Artwork =>
  ({
    id: `art-${index}`,
    domainId: "domain-1",
    type: "artwork",
    title: `Artwork ${index}`,
    description: `Description ${index}`,
    artist: `Artist ${index}`,
    date: "2024",
    filename: `https://example.com/art-${index}.jpg`,
    vector: Array.from({ length: 1024 }, () => 1),
    vectorModel: "test-model",
    createdAt: Date.now() - index,
  }) as Artwork;

const buildArtworks = (count: number, startAt: number = 1): Artwork[] =>
  Array.from({ length: count }, (_, index) => buildArtwork(startAt + index));

class MockIntersectionObserver {
  observe() {}

  unobserve() {}

  disconnect() {}

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds = [];
}

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const authContext = createMockAuthContext({
    user: {
      id: "owner-1",
      email: "owner@example.com",
      domainId: "domain-1",
      role: "domain_owner",
      onboardingStatus: "completed",
    },
    isAuthenticated: true,
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={authContext}>
        <ViewerPreferencesProvider>
          <MemoryRouter>
            <CatalogPage />
          </MemoryRouter>
        </ViewerPreferencesProvider>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
};

describe("CatalogPage pagination", () => {
  beforeEach(() => {
    mockGetArtworks.mockReset();
    globalThis.IntersectionObserver =
      MockIntersectionObserver as typeof IntersectionObserver;
    if (typeof window !== "undefined") {
      window.IntersectionObserver =
        MockIntersectionObserver as typeof IntersectionObserver;
    }
  });

  afterEach(() => {
    // @ts-expect-error test cleanup
    delete globalThis.IntersectionObserver;
    if (typeof window !== "undefined") {
      // @ts-expect-error test cleanup
      delete window.IntersectionObserver;
    }
  });

  it("requests 40 artworks per page and stops after the last page", async () => {
    mockGetArtworks
      .mockResolvedValueOnce({
        items: buildArtworks(40),
        continuationToken: "page-2",
        hasMore: true,
      })
      .mockResolvedValueOnce({
        items: buildArtworks(5, 100),
        continuationToken: undefined,
        hasMore: false,
      });

    renderPage();

    await waitFor(() => {
      expect(mockGetArtworks).toHaveBeenNthCalledWith(
        1,
        "domain-1",
        expect.objectContaining({
          limit: 40,
          continuationToken: undefined,
        }),
      );
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Load more artworks" }),
      ).not.toBeNull();
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Load more artworks" }),
    );

    await waitFor(() => {
      expect(mockGetArtworks).toHaveBeenNthCalledWith(
        2,
        "domain-1",
        expect.objectContaining({
          limit: 40,
          continuationToken: "page-2",
        }),
      );
    });

    expect(
      screen.queryByRole("button", { name: "Load more artworks" }),
    ).toBeNull();
    expect(mockGetArtworks).toHaveBeenCalledTimes(2);
  });
});
