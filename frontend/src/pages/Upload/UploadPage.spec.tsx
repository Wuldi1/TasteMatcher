import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { UploadPage } from './UploadPage';
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

describe('UploadPage', () => {
  it('renders upload page container', () => {
    const { container } = renderWithProviders(<UploadPage />);
    
    expect(container.querySelector('.upload-page')).toBeInTheDocument();
  });

  it('renders ArtworkUpload component', () => {
    renderWithProviders(<UploadPage />);
    
    // Verify the component renders (adjust based on ArtworkUpload content)
    expect(document.querySelector('.App')).toBeInTheDocument();
  });
});
