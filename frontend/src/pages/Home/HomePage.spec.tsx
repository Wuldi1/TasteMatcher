import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { HomePage } from './HomePage';
import { AuthContext } from '../../contexts/AuthContext';
import { describe, it, expect, vi } from 'vitest';

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
        <BrowserRouter>
          {component}
        </BrowserRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
};

describe('HomePage', () => {
  it('renders welcome message with domain name', () => {
    renderWithProviders(<HomePage />);
    
    expect(screen.getByText(/Welcome to Test Domain/i)).toBeInTheDocument();
  });

  it('displays statistics cards', () => {
    renderWithProviders(<HomePage />);
    
    expect(screen.getByText('Total Artworks')).toBeInTheDocument();
    expect(screen.getByText('Likes')).toBeInTheDocument();
    expect(screen.getByText('Recently Added')).toBeInTheDocument();
  });

  it('renders quick action cards with proper links', () => {
    renderWithProviders(<HomePage />);
    
    const uploadLink = screen.getByRole('link', { name: /upload new artworks/i });
    const catalogLink = screen.getByRole('link', { name: /browse your catalog/i });
    const tasterLink = screen.getByRole('link', { name: /start tasting artworks/i });
    
    expect(uploadLink).toHaveAttribute('href', '/upload');
    expect(catalogLink).toHaveAttribute('href', '/catalog');
    expect(tasterLink).toHaveAttribute('href', '/taster');
  });

  it('does not render when user is not authenticated', () => {
    const unauthContext = { ...mockAuthContext, user: null };
    
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={unauthContext}>
          <BrowserRouter>
            <HomePage />
          </BrowserRouter>
        </AuthContext.Provider>
      </QueryClientProvider>
    );
    
    expect(container.firstChild).toBeNull();
  });

  it('has proper ARIA labels for accessibility', () => {
    renderWithProviders(<HomePage />);
    
    expect(screen.getByLabelText('Domain statistics')).toBeInTheDocument();
    expect(screen.getByLabelText('Quick actions')).toBeInTheDocument();
  });
});
