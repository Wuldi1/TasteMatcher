// ---------- CODEGEN CHECKLIST (must be satisfied) ----------
// 1. Uses TypeScript strict types (no `any`). 
// 2. Uses shared `common` types for API contracts where applicable.
// 3. Includes error handling and retry logic for external calls.
// 4. Adds structured logging for API calls and errors.
// 5. Adds input validation and guards.
// 6. No duplicate logic — centralized API client.
// 7. Professional error handling with typed responses.
// 8. Includes JSDoc for exported functions.
// 9. CI-friendly: passes typecheck and lint.
// -----------------------------------------------------------

import {
  Domain,
  DomainVerificationResultResponse,
  Artwork,
  User,
  Role,
  DomainRequest,
  PersonalQuestionnaire,
  ArtworkStats,
  UntastedArtworksResponse,
  SavePreferenceRequest,
  PaginatedResponse
} from '@tastematcher/common';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

/**
 * Custom API Error with status code and optional error code
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Base API client with shared functionality for all requests
 * Handles authentication, headers, error handling, and logging
 */
class BaseApiClient {
  protected baseURL: string;
  protected authToken: string | null = null;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
    this.loadAuthToken();
  }

  /**
   * Load authentication token from localStorage
   */
  private loadAuthToken(): void {
    const storedToken = localStorage.getItem('tm_auth_token') || localStorage.getItem('token');
    if (storedToken) {
      this.authToken = storedToken;
    }
  }

  /**
   * Set authentication token for API requests
   */
  setAuthToken(token: string): void {
    this.authToken = token;
    localStorage.setItem('token', token);
    localStorage.setItem('tm_auth_token', token);
  }

  /**
   * Clear authentication token
   */
  clearAuthToken(): void {
    this.authToken = null;
    localStorage.removeItem('token');
    localStorage.removeItem('tm_auth_token');
  }

  /**
   * Get authentication token
   */
  protected getAuthToken(): string | null {
    return this.authToken;
  }

  /**
   * Get default headers with authentication
   */
  protected getHeaders(includeContentType: boolean = true): HeadersInit {
    const headers: HeadersInit = {};

    if (includeContentType) {
      headers['Content-Type'] = 'application/json';
    }

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    return headers;
  }

  /**
   * Make a request with proper error handling and logging
   */
  protected async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    const method = options.method || 'GET';

    console.debug('API Request:', { method, url });

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...this.getHeaders(),
          ...options.headers,
        },
      });

      if (!response.ok) {
        await this.handleErrorResponse(response, url);
      }

      const data = await response.json();
      console.debug('API Response:', { url, status: response.status });
      return data;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      console.error('Network Error:', { url, error });
      throw new ApiError('Network error', 0);
    }
  }

  /**
   * Handle error responses with proper logging
   */
  private async handleErrorResponse(response: Response, url: string): Promise<never> {
    let errorMessage = `HTTP ${response.status}`;
    let errorCode: string | undefined;

    try {
      const errorData = await response.json();
      errorMessage = errorData.message || errorData.error || errorMessage;
      errorCode = errorData.code;
    } catch {
      // If JSON parsing fails, try to get text
      try {
        errorMessage = await response.text() || errorMessage;
      } catch {
        // Use default error message
      }
    }

    console.error('API Error:', { status: response.status, url, error: errorMessage, code: errorCode });
    throw new ApiError(errorMessage, response.status, errorCode);
  }

  /**
   * Upload file with FormData
   */
  protected async uploadFile<T>(
    endpoint: string,
    file: File,
    additionalData?: Record<string, any>
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    const formData = new FormData();
    formData.append('file', file);

    if (additionalData) {
      Object.entries(additionalData).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          formData.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
        }
      });
    }

    console.debug('Upload Request:', { url, fileName: file.name, fileSize: file.size });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          // Don't set Content-Type - browser will set it with boundary for multipart/form-data
        },
        body: formData,
      });

      if (!response.ok) {
        await this.handleErrorResponse(response, url);
      }

      const data = await response.json();
      console.info('Upload Success:', { url, status: response.status });
      return data;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      console.error('Upload Network Error:', { url, error });
      throw new ApiError('Upload network error', 0);
    }
  }

  /**
   * Validate email format
   */
  protected validateEmail(email: string): void {
    if (!email || !email.includes('@')) {
      throw new ApiError('Valid email is required', 400);
    }
  }

  /**
   * Validate required field
   */
  protected validateRequired(value: any, fieldName: string): void {
    if (!value) {
      throw new ApiError(`${fieldName} is required`, 400);
    }
  }
}

/**
 * Centralized API client with all endpoints
 * Handles domains, users, artworks, authentication, and onboarding
 */
class ApiClient extends BaseApiClient {
  // ========== Domain Endpoints ==========

  /**
   * Request an existing domain verification by admin email
   */
  async requestDomainVerification(adminEmail: string): Promise<Domain> {
    this.validateEmail(adminEmail);
    const encodedEmail = encodeURIComponent(adminEmail);
    return this.request<Domain>(`/api/domains/auth/${encodedEmail}`, { method: 'GET' });
  }

  /**
   * Create a new domain
   */
  async createDomain(request: { name: string; adminEmail: string }): Promise<Domain> {
    this.validateRequired(request.name, 'Name');
    this.validateEmail(request.adminEmail);
    return this.request<Domain>('/api/domains', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * Verify domain ownership with the provided code
   */
  async verifyDomainCode(adminEmail: string, code: string): Promise<DomainVerificationResultResponse> {
    if (!code || code.length !== 6) {
      throw new ApiError('Verification code must be 6 digits', 400);
    }
    const encodedEmail = encodeURIComponent(adminEmail);
    return this.request<DomainVerificationResultResponse>(`/api/domains/verify/${encodedEmail}`, {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  /**
   * Get domain by ID
   */
  async getDomainById(domainId: string): Promise<Domain> {
    this.validateRequired(domainId, 'Domain ID');
    return this.request<Domain>(`/api/domains/${domainId}`, { method: 'GET' });
  }

  /**
   * Get all domains (global admin only)
   */
  async getAllDomains(): Promise<Domain[]> {
    return this.request<Domain[]>('/api/domains', { method: 'GET' });
  }

  /**
   * Update domain
   */
  async updateDomain(domainId: string, data: { name?: string }): Promise<Domain> {
    this.validateRequired(domainId, 'Domain ID');
    return this.request<Domain>(`/api/domains/${domainId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /**
   * Delete domain
   */
  async deleteDomain(domainId: string): Promise<void> {
    this.validateRequired(domainId, 'Domain ID');
    await this.request<void>(`/api/domains/${domainId}`, { method: 'DELETE' });
  }

  /**
   * Create domain by admin (global admin only)
   */
  async createDomainByAdmin(data: {
    userName: string;
    email: string;
    domainName: string;
  }): Promise<Domain> {
    return this.request<Domain>('/api/domains/create', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Create domain request (public)
   */
  async createDomainRequest(data: {
    name: string;
    email: string;
    proposedDomainName: string;
    message?: string;
  }): Promise<DomainRequest> {
    return this.request<DomainRequest>('/api/auth/domain-request', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Get all domain requests (global admin only)
   */
  async getAllDomainRequests(): Promise<DomainRequest[]> {
    return this.request<DomainRequest[]>('/api/domains/requests/all', { method: 'GET' });
  }

  // ========== User Management Endpoints ==========

  /**
   * Get all users (optionally filtered by domain for global admins)
   */
  async getAllUsers(domainId?: string): Promise<User[]> {
    const url = domainId ? `/api/users/domain/${domainId}` : '/api/users';
    return this.request<User[]>(url, { method: 'GET' });
  }

  /**
   * Get user by ID
   */
  async getUser(userId: string): Promise<User> {
    this.validateRequired(userId, 'User ID');
    return this.request<User>(`/api/users/${userId}`, { method: 'GET' });
  }

  /**
   * Update user
   */
  async updateUser(userId: string, data: { name?: string; role?: Role }): Promise<User> {
    this.validateRequired(userId, 'User ID');
    return this.request<User>(`/api/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /**
   * Delete user
   */
  async deleteUser(userId: string): Promise<void> {
    this.validateRequired(userId, 'User ID');
    await this.request<void>(`/api/users/${userId}`, { method: 'DELETE' });
  }

  /**
   * Invite user to domain
   */
  async inviteUser(data: { name: string; email: string; role: Role }): Promise<User> {
    this.validateRequired(data.name, 'Name');
    this.validateEmail(data.email);
    return this.request<User>('/api/users/invite', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Refresh current user and get new token
   */
  async refreshCurrentUser(): Promise<{ user: User; token: string }> {
    return this.request<{ user: User; token: string }>('/api/users/me/refresh', {
      method: 'GET',
    });
  }

  // ========== Artwork Endpoints ==========

  /**
   * Upload artwork with file and optional metadata
   */
  async uploadArtwork(domainId: string, file: File, artworkMetadata?: Partial<Artwork>): Promise<Artwork> {
    this.validateRequired(domainId, 'Domain ID');
    this.validateRequired(file, 'File');

    return this.uploadFile<Artwork>(
      `/api/domains/${domainId}/uploads`,
      file,
      artworkMetadata ? { artwork: artworkMetadata } : undefined
    );
  }

  /**
   * Get artwork statistics for a domain
   */
  async getArtworkStats(domainId: string): Promise<ArtworkStats> {
    this.validateRequired(domainId, 'Domain ID');
    return this.request<ArtworkStats>(`/api/domains/${domainId}/artworks/stats`, { method: 'GET' });
  }

  /**
   * Get artworks for a domain with optional pagination and filtering
   */
  async getArtworks(
    domainId: string,
    options?: {
      limit?: number;
      continuationToken?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      filterBy?: string;
    }
  ): Promise<PaginatedResponse<Artwork>> {
    this.validateRequired(domainId, 'Domain ID');
    const params = new URLSearchParams();
    
    if (options?.limit !== undefined) params.append('limit', String(options.limit));
    if (options?.continuationToken) params.append('continuationToken', options.continuationToken);
    if (options?.sortBy) params.append('sortBy', options.sortBy);
    if (options?.sortOrder) params.append('sortOrder', options.sortOrder);
    if (options?.filterBy) params.append('filterBy', options.filterBy);
    
    const queryString = params.toString();
    const endpoint = `/api/domains/${domainId}/artworks${queryString ? `?${queryString}` : ''}`;
    return this.request<PaginatedResponse<Artwork>>(endpoint, { method: 'GET' });
  }

  /**
   * Get single artwork by ID
   */
  async getArtwork(domainId: string, artworkId: string): Promise<Artwork> {
    this.validateRequired(domainId, 'Domain ID');
    this.validateRequired(artworkId, 'Artwork ID');
    return this.request<Artwork>(`/api/domains/${domainId}/artworks/${artworkId}`, { method: 'GET' });
  }

  /**
   * Update artwork metadata
   */
  async updateArtwork(domainId: string, artworkId: string, data: Partial<Artwork>): Promise<Artwork> {
    this.validateRequired(domainId, 'Domain ID');
    this.validateRequired(artworkId, 'Artwork ID');
    return this.request<Artwork>(`/api/domains/${domainId}/artworks/${artworkId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /**
   * Delete artwork
   */
  async deleteArtwork(domainId: string, artworkId: string): Promise<void> {
    this.validateRequired(domainId, 'Domain ID');
    this.validateRequired(artworkId, 'Artwork ID');
    await this.request<void>(`/api/domains/${domainId}/artworks/${artworkId}`, { method: 'DELETE' });
  }

  /**
   * Fetch untasted artworks for user (Taster page)
   */
  async fetchUntastedArtworks(
    domainId: string,
    userId: string,
    limit: number = 20
  ): Promise<UntastedArtworksResponse> {
    return await this.request<UntastedArtworksResponse>(`/api/domains/${domainId}/artworks/untasted/${userId}?limit=${limit}`, { method: 'GET' });
  }

  async saveArtworkPreference(
  domainId: string,
  userId: string,
  preference: SavePreferenceRequest
): Promise<void> {
  await this.request<UntastedArtworksResponse>(`/api/domains/${domainId}/artworks/preferences/${userId}`, { method: 'POST', body: JSON.stringify(preference) });
}

  /**
   * Get recommendations for a domain
   */
  async getRecommendations(domainId: string, userId?: string): Promise<Array<Artwork>> {
    this.validateRequired(domainId, 'Domain ID');
    const params = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    return this.request<Array<Artwork>>(
      `/api/domains/${domainId}/artworks/recommendations${params}`,
      { method: 'GET' },
    );
  }

  // ======= Authentication Endpoints (Public) ==========

  /**
   * Request login verification code
   */
  async requestLoginCode(email: string): Promise<{ message: string }> {
    this.validateEmail(email);
    return this.request<{ message: string }>('/api/auth/login/request', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  /**
   * Verify login code and get JWT token
   */
  async verifyLoginCode(email: string, code: string): Promise<{ token: string }> {
    this.validateEmail(email);
    if (!code || code.length !== 6) {
      throw new ApiError('Verification code must be 6 digits', 400);
    }
    return this.request<{ token: string }>('/api/auth/login/verify', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    });
  }

  // ========== Onboarding Endpoints ==========

  /**
   * Upload preference image for onboarding
   */
  async uploadPreferenceImage(file: File): Promise<{ success: boolean; message: string; vectorized: number }> {
    this.validateRequired(file, 'File');
    return this.uploadFile<{ success: boolean; message: string; vectorized: number }>(
      '/api/users/me/vectorize-preference-image',
      file
    );
  }

  /**
   * Finalize preference vectors after uploading images
   */
  async finalizePreferenceVectors(): Promise<{ success: boolean; message: string; totalVectors: number }> {
    return this.request<{ success: boolean; message: string; totalVectors: number }>(
      '/api/users/me/finalize-preference-vectors',
      { method: 'POST' }
    );
  }

  /**
   * Update user questionnaire
   */
  async updateUserQuestionnaire(questionnaire: PersonalQuestionnaire): Promise<User> {
    return this.request<User>('/api/users/me/questionnaire', {
      method: 'PATCH',
      body: JSON.stringify({ personalQuestionnaire: questionnaire }),
    });
  }

  /**
   * Complete onboarding
   */
  async completeOnboarding(): Promise<User> {
    return this.request<User>('/api/users/me/complete-onboarding', { method: 'POST' });
  }

  /**
   * Skip onboarding (can be resumed later)
   */
  async skipOnboarding(): Promise<User> {
    return this.request<User>('/api/users/me/skip-onboarding', { method: 'POST' });
  }
}

/**
 * Singleton API client instance
 */
export const apiClient = new ApiClient(API_BASE_URL);

/**
 * Legacy function for artwork stats (for backward compatibility)
 * @deprecated Use apiClient.getArtworkStats() instead
 */
export async function fetchArtworkStats(domainId: string): Promise<ArtworkStats> {
  return apiClient.getArtworkStats(domainId);
}
