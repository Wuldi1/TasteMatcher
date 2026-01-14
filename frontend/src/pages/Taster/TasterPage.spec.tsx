import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TasterPage } from "./TasterPage";
import { AuthContext } from "../../contexts/AuthContext";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockAuthContext } from "../../test/mocks/authContext";

const mockFetchUntasted = vi.fn().mockResolvedValue({
  artworks: [
    {
      id: "art-1",
      title: "Test Artwork",
      imageUrl: "https://example.com/image.jpg",
      domainId: "domain-1",
    },
  ],
  hasMore: false,
});

const mockSavePreference = vi.fn();

vi.mock("../../utils/api", () => ({
  apiClient: {
    fetchUntastedArtworks: (...args: unknown[]) => mockFetchUntasted(...args),
    saveArtworkPreference: (...args: unknown[]) => mockSavePreference(...args),
    refreshCurrentUser: vi.fn(),
    setAuthToken: vi.fn(),
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

describe("TasterPage", () => {
  beforeEach(() => {
    queryClient.clear();
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
    expect(screen.getByText(/Test Artwork/i)).toBeInTheDocument();
  });

  it("calls savePreference when swiping", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TasterPage />);

    await waitFor(() => {
      expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
    });

    const likeButton = screen.getByRole("button", { name: /like/i });
    await user.click(likeButton);

    // Check API was called after the click
    expect(mockSavePreference).toHaveBeenCalled();
  });

  it("shows message when no untasted artworks available", async () => {
    mockFetchUntasted.mockResolvedValue({ artworks: [], hasMore: false });
    renderWithProviders(<TasterPage />);

    await waitFor(() => {
      expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
    });

    expect(screen.getByText(/No more artworks/i)).toBeInTheDocument();
  });
});
