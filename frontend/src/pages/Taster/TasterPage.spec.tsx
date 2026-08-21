import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TasterPage } from "./TasterPage";
import { AuthContext } from "../../contexts/AuthContext";
import { createMockAuthContext } from "../../test/mocks/authContext";

const buildArtworks = (count: number, startAt: number = 1) =>
  Array.from({ length: count }, (_, index) => {
    const sequence = startAt + index;
    return {
      id: `art-${sequence}`,
      title: `Artwork ${sequence}`,
      artist: `Artist ${sequence}`,
      filename: `https://example.com/image-${sequence}.jpg`,
      domainId: "domain-1",
      thumbnails: [],
    };
  });

const mockFetchUntasted = jest.fn();

const mockSavePreference = jest.fn();

jest.mock("../../utils/api", () => ({
  apiClient: {
    fetchUntastedArtworks: (...args: unknown[]) => mockFetchUntasted(...args),
    saveArtworkPreference: (...args: unknown[]) => mockSavePreference(...args),
    refreshCurrentUser: jest.fn(),
    setAuthToken: jest.fn(),
  },
}));

const mockUser = {
  id: "user-1",
  email: "test@example.com",
  domainId: "domain-1",
  domainName: "Test Domain",
  role: "customer" as const,
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

const originalImage = window.Image;

const renderWithProviders = (component: React.ReactElement) => {
  const mockAuthContext = createMockAuthContext({
    user: mockUser,
    isAuthenticated: true,
    stats: {
      totalArtworks: 0,
      totalLikes: 0,
      totalDislikes: 0,
      totalSwiped: 0,
      recentlyAdded: 0,
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={mockAuthContext}>
        {component}
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
};

const getCurrentArtworkCard = async () => {
  await waitFor(() => {
    expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
  });
  await waitFor(() => {
    expect(screen.queryByText(/Loading image/i)).not.toBeInTheDocument();
  });
  await waitFor(() => {
    expect(
      screen.getByRole("button", { name: /^Like this artwork/i }),
    ).not.toBeDisabled();
  });

  // The card has no accessible role of its own; traverse from its visible title.
  // eslint-disable-next-line testing-library/no-node-access
  const card = screen.getByText("Artwork 1").closest(".taster-card");
  expect(card).not.toBeNull();
  return card as HTMLElement;
};

describe("TasterPage", () => {
  beforeEach(() => {
    jest.useRealTimers();
    Object.defineProperty(window, "Image", {
      configurable: true,
      writable: true,
      value: class {
        onload: ((event: Event) => void) | null = null;
        onerror: ((event: Event) => void) | null = null;
        private imageSrc = "";

        set src(value: string) {
          this.imageSrc = value;
          queueMicrotask(() => this.onload?.(new Event("load")));
        }

        get src() {
          return this.imageSrc;
        }
      },
    });
    queryClient.clear();
    mockFetchUntasted.mockReset();
    mockFetchUntasted.mockResolvedValue({
      artworks: buildArtworks(1),
      hasMore: false,
    });
    mockSavePreference.mockReset();
  });

  it("renders taster title and subtitle", async () => {
    renderWithProviders(<TasterPage />);

    await waitFor(() => {
      expect(screen.getByText("Taster")).toBeInTheDocument();
    });

    expect(screen.getByText(/Swipe right to like/i)).toBeInTheDocument();
  });

  it("handles dislike button click", async () => {
    renderWithProviders(<TasterPage />);

    const dislikeButton = await screen.findByLabelText(/Dislike this artwork/i);
    fireEvent.click(dislikeButton);

    await waitFor(() => {
      expect(
        screen.getByLabelText(/Dislike this artwork/i),
      ).toBeInTheDocument();
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "Image", {
      configurable: true,
      writable: true,
      value: originalImage,
    });
  });

  it("shows keyboard navigation hint", async () => {
    renderWithProviders(<TasterPage />);

    await waitFor(() => {
      expect(screen.getByText("Dislike")).toBeInTheDocument();
    });

    expect(screen.getByText("Like")).toBeInTheDocument();
  });

  it("has proper ARIA labels for accessibility", async () => {
    renderWithProviders(<TasterPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("group", { name: /Rating actions/i }),
      ).toBeInTheDocument();
    });
  });

  it("renders untasted artworks", async () => {
    renderWithProviders(<TasterPage />);

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
    });

    // Check for artworks
    expect(screen.getByText(/Artwork 1/i)).toBeInTheDocument();
  });

  it("calls savePreference when swiping", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TasterPage />);

    await waitFor(() => {
      expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
    });

    const likeButton = screen.getByRole("button", {
      name: /^Like this artwork/i,
    });
    await user.click(likeButton);

    // Check API was called after the click
    expect(mockSavePreference).toHaveBeenCalled();
  });

  it("saves a like when desktop drag passes the right swipe threshold", async () => {
    renderWithProviders(<TasterPage />);

    const card = await getCurrentArtworkCard();
    fireEvent.mouseDown(card, {
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    expect(card).toHaveClass("taster-card--dragging");
    fireEvent.mouseMove(card, {
      clientX: 230,
      clientY: 110,
    });
    expect(card).toHaveStyle({
      transform: "translateX(130px) translateY(10px) rotate(6.5deg)",
    });
    fireEvent.mouseUp(card, {
      clientX: 230,
      clientY: 110,
    });

    await waitFor(() => {
      expect(mockSavePreference).toHaveBeenCalledWith("domain-1", "user-1", {
        domainId: "domain-1",
        artworkId: "art-1",
        liked: true,
      });
    });
  });

  it("saves a dislike when mobile drag passes the left swipe threshold", async () => {
    renderWithProviders(<TasterPage />);

    const card = await getCurrentArtworkCard();
    fireEvent.touchStart(card, {
      touches: [{ clientX: 220, clientY: 100 }],
    });
    fireEvent.touchMove(card, {
      touches: [{ clientX: 80, clientY: 100 }],
    });
    fireEvent.touchEnd(card);

    await waitFor(() => {
      expect(mockSavePreference).toHaveBeenCalledWith("domain-1", "user-1", {
        domainId: "domain-1",
        artworkId: "art-1",
        liked: false,
      });
    });
  });

  it("does not save a preference for a short drag", async () => {
    renderWithProviders(<TasterPage />);

    const card = await getCurrentArtworkCard();
    fireEvent.mouseDown(card, {
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.mouseMove(card, {
      clientX: 140,
      clientY: 104,
    });
    fireEvent.mouseUp(card, {
      clientX: 140,
      clientY: 104,
    });

    expect(mockSavePreference).not.toHaveBeenCalled();
  });

  it("shows message when no untasted artworks available", async () => {
    mockFetchUntasted.mockResolvedValue({ artworks: [], hasMore: false });
    renderWithProviders(<TasterPage />);

    await waitFor(() => {
      expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
    });

    expect(screen.getByText(/No Untasted Artworks/i)).toBeInTheDocument();
  });

  it("shows loading state before first untasted response resolves", async () => {
    let resolveFetch:
      | ((value: { artworks: unknown[]; hasMore: boolean }) => void)
      | undefined;
    const fetchPromise = new Promise<{ artworks: unknown[]; hasMore: boolean }>(
      (resolve) => {
        resolveFetch = resolve;
      },
    );
    mockFetchUntasted.mockReturnValueOnce(fetchPromise);

    renderWithProviders(<TasterPage />);

    expect(screen.getByText(/Loading artworks/i)).toBeInTheDocument();
    expect(screen.queryByText(/No Untasted Artworks/i)).not.toBeInTheDocument();

    resolveFetch?.({ artworks: buildArtworks(1), hasMore: false });
    await waitFor(() => {
      expect(screen.getByText(/Artwork 1/i)).toBeInTheDocument();
    });
  });

  it("prefetches next batch when 10 artworks remain", async () => {
    mockFetchUntasted
      .mockResolvedValueOnce({ artworks: buildArtworks(11), hasMore: false })
      .mockResolvedValueOnce({ artworks: buildArtworks(5, 100), hasMore: false });

    renderWithProviders(<TasterPage />);

    await getCurrentArtworkCard();

    jest.useFakeTimers();
    fireEvent.click(screen.getByLabelText(/^Like this artwork/i));
    act(() => {
      jest.advanceTimersByTime(350);
    });
    jest.useRealTimers();

    await waitFor(() => {
      expect(mockFetchUntasted).toHaveBeenCalledTimes(2);
    });
  });
});
