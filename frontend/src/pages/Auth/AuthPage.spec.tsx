import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AuthPage } from './AuthPage';
import { AuthContext } from '../../contexts/AuthContext';
import { describe, it, expect, vi } from 'vitest';

const mockAuthContext = {
  user: null,
  login: vi.fn(),
  register: vi.fn(),
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

describe('AuthPage', () => {
  it('renders DomainRegistration component', () => {
    renderWithProviders(<AuthPage />);
    
    // Verify the component renders (adjust based on DomainRegistration content)
    expect(document.querySelector('.App')).toBeInTheDocument();
  });
});
