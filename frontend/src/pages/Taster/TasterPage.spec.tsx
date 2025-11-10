import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TasterPage } from './TasterPage';
import { AuthContext } from '../../contexts/AuthContext';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  domainId: 'domain-1',
  domainName: 'Test Domain',
  role: 'user' as const,
};

const mockAuthContext = {
  user: mockUser,
  login: vi.fn(),
  logout: vi.fn(),
  isLoading: false,
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={mockAuthContext}>
        {component}
      </AuthContext.Provider>
    </QueryClientProvider>
  );
};

describe('TasterPage', () => {
  beforeEach(() => {
    queryClient.clear();
  });

  it('renders taster title and subtitle', async () => {
    renderWithProviders(<TasterPage />);
    
    await waitFor(() => {
      expect(screen.getByText('Taster')).toBeInTheDocument();
      expect(screen.getByText(/Swipe right to like/i)).toBeInTheDocument();
    });
  });

  it('handles dislike button click', async () => {
    renderWithProviders(<TasterPage />);
    
    await waitFor(() => {
      const dislikeButton = screen.getByLabelText(/Dislike this artwork/i);
      fireEvent.click(dislikeButton);
    });
    
    await waitFor(() => {
      expect(screen.getByLabelText(/Dislike this artwork/i)).toBeInTheDocument();
    });
  });

  it('shows keyboard navigation hint', async () => {
    renderWithProviders(<TasterPage />);
    
    await waitFor(() => {
      expect(screen.getByText('Dislike')).toBeInTheDocument();
      expect(screen.getByText('Like')).toBeInTheDocument();
    });
  });

  it('has proper ARIA labels for accessibility', async () => {
    renderWithProviders(<TasterPage />);
    
    await waitFor(() => {
      expect(screen.getByRole('group', { name: /Rating actions/i })).toBeInTheDocument();
    });
  });
});
