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
  Artwork,
  ArtworkStats,
  Domain,
  DomainRequest,
  DomainVerificationResultResponse,
  PaginatedResponse,
  PersonalQuestionnaire,
  Proposal,
  Role,
  UntastedArtworksResponse,
  User,
  UserStatsResponse,
} from "@tastematcher/common";

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
    this.name = "ApiError";
  }
}

/**
 * Base API client with shared functionality for all requests
 * Handles authentication, headers, error handling, and logging
 */
class BaseApiClient {
  protected baseURL: string;
  protected authToken: string | null = null;

  constructor() {
    console.log("BaseApiClient initialized", window.location.hostname);
    if (
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1"
    ) {
      console.log("Setting baseURL to localhost for development");
      this.baseURL = "http://localhost:8080";
    } else if (window.location.hostname.includes("tastematcher-dev-web")) {
      console.log(
        "Setting baseURL to tastematcher-dev-api.azurewebsites.net for development"
      );
      this.baseURL = "https://tastematcher-dev-api.azurewebsites.net";
    } else if (window.location.hostname.includes("tastematcher-stg-web")) {
      console.log(
        "Setting baseURL to tastematcher-stg-api.azurewebsites.net for staging"
      );
      this.baseURL = "https://tastematcher-stg-api.azurewebsites.net";
    } else if (window.location.hostname.includes("tastematcher.art")) {
      console.log("Setting baseURL to api.tastematcher.art for production");
      this.baseURL = "https://api.tastematcher.art";
    } else {
      this.baseURL = process.env.REACT_APP_API_URL!;
    }

    this.loadAuthToken();
  }

  /**
   * Load authentication token from localStorage
   */
  private loadAuthToken(): void {
    const storedToken =
      localStorage.getItem("tm_auth_token") || localStorage.getItem("token");
    if (storedToken) {
      this.authToken = storedToken;
    }
  }

  /**
   * Set authentication token for API requests
   */
  setAuthToken(token: string | null): void {
    if (!token) {
      this.clearAuthToken();
      return;
    }
    this.authToken = token;
    localStorage.setItem("token", token);
    localStorage.setItem("tm_auth_token", token);
  }

  /**
   * Clear authentication token
   */
  clearAuthToken(): void {
    this.authToken = null;
    localStorage.removeItem("token");
    localStorage.removeItem("tm_auth_token");
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
      headers["Content-Type"] = "application/json";
    }

    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
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

      const text = await response.text();
      return text ? JSON.parse(text) : ({} as T);
    } catch (error) {
      console.log(error);
      if (error instanceof ApiError) {
        throw error;
      }
      console.error("Network Error:", { url, error });
      throw new ApiError("Network error", 0);
    }
  }

  /**
   * Handle error responses with proper logging
   */
  private async handleErrorResponse(
    response: Response,
    url: string
  ): Promise<never> {
    if (response.status === 401) {
      this.clearAuthToken();
      console.error("API Error: Unauthorized, clearing auth token", { url });
      window.location.reload();
      throw new ApiError("Unauthorized", 401);
    }

    let errorMessage = `HTTP ${response.status}`;
    let errorCode: string | undefined;

    try {
      const errorData = await response.json();
      errorMessage = errorData.message || errorData.error || errorMessage;
      errorCode = errorData.code;
    } catch {
      // If JSON parsing fails, try to get text
      try {
        errorMessage = (await response.text()) || errorMessage;
      } catch {
        // Use default error message
      }
    }

    console.error("API Error:", {
      status: response.status,
      url,
      error: errorMessage,
      code: errorCode,
    });
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
    formData.append("file", file);

    if (additionalData) {
      Object.entries(additionalData).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          formData.append(
            key,
            typeof value === "object" ? JSON.stringify(value) : String(value)
          );
        }
      });
    }

    console.debug("Upload Request:", {
      url,
      fileName: file.name,
      fileSize: file.size,
    });

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.authToken}`,
          // Don't set Content-Type - browser will set it with boundary for multipart/form-data
        },
        body: formData,
      });

      if (!response.ok) {
        await this.handleErrorResponse(response, url);
      }

      const data = await response.json();
      console.info("Upload Success:", { url, status: response.status });
      return data;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      console.error("Upload Network Error:", { url, error });
      throw new ApiError("Upload network error", 0);
    }
  }

  /**
   * Validate email format
   */
  protected validateEmail(email: string): void {
    if (!email || !email.includes("@")) {
      throw new ApiError("Valid email is required", 400);
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
    return this.request<Domain>(`/domains/auth/${encodedEmail}`, {
      method: "GET",
    });
  }

  /**
   * Create a new domain
   */
  async createDomain(request: {
    name: string;
    adminEmail: string;
  }): Promise<Domain> {
    this.validateRequired(request.name, "Name");
    this.validateEmail(request.adminEmail);
    return this.request<Domain>("/domains", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  /**
   * Verify domain ownership with the provided code
   */
  async verifyDomainCode(
    adminEmail: string,
    code: string
  ): Promise<DomainVerificationResultResponse> {
    if (!code || code.length !== 6) {
      throw new ApiError("Verification code must be 6 digits", 400);
    }
    const encodedEmail = encodeURIComponent(adminEmail);
    return this.request<DomainVerificationResultResponse>(
      `/domains/verify/${encodedEmail}`,
      {
        method: "POST",
        body: JSON.stringify({ code }),
      }
    );
  }

  /**
   * Get domain by ID
   */
  async getDomainById(domainId: string): Promise<Domain> {
    this.validateRequired(domainId, "Domain ID");
    return this.request<Domain>(`/domains/${domainId}`, { method: "GET" });
  }

  /**
   * Get all domains (global admin only)
   */
  async getAllDomains(): Promise<Domain[]> {
    return this.request<Domain[]>("/domains", { method: "GET" });
  }

  /**
   * Update domain
   */
  async updateDomain(
    domainId: string,
    data: { name?: string }
  ): Promise<Domain> {
    this.validateRequired(domainId, "Domain ID");
    return this.request<Domain>(`/domains/${domainId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  /**
   * Delete domain
   */
  async deleteDomain(domainId: string): Promise<void> {
    this.validateRequired(domainId, "Domain ID");
    await this.request<void>(`/domains/${domainId}`, { method: "DELETE" });
  }

  /**
   * Create domain by admin (global admin only)
   */
  async createDomainByAdmin(data: {
    name: string;
    email: string;
    domainName: string;
    proposedDomainName: string;
  }): Promise<Domain> {
    return this.request<Domain>("/domains/create", {
      method: "POST",
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
    return this.request<DomainRequest>("/auth/domain-request", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /**
   * Get all domain requests (global admin only)
   */
  async getAllDomainRequests(): Promise<DomainRequest[]> {
    return this.request<DomainRequest[]>("/domains/requests/all", {
      method: "GET",
    });
  }

  // ========== User Management Endpoints ==========

  /**
   * Get all users (optionally filtered by domain for global admins)
   */
  async getAllUsers(domainId?: string): Promise<User[]> {
    const url = domainId ? `/users/domain/${domainId}` : "/users";
    return this.request<User[]>(url, { method: "GET" });
  }

  /**
   * Get user by ID
   */
  async getUser(userId: string, domainId?: string): Promise<User> {
    this.validateRequired(userId, "User ID");
    const url = domainId
      ? `/users/${userId}?domainId=${domainId}`
      : `/users/${userId}`;
    return this.request<User>(url, { method: "GET" });
  }

  /**
   * Update user
   */
  async updateUser(
    userId: string,
    data: { name?: string; role?: Role }
  ): Promise<User> {
    this.validateRequired(userId, "User ID");
    return this.request<User>(`/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  /**
   * Add a comment to a user
   */
  async addUserComment(userId: string, text: string): Promise<User> {
    this.validateRequired(userId, "User ID");
    this.validateRequired(text, "Comment text");
    return this.request<User>(`/users/${userId}/comments`, {
      method: "POST",
      body: JSON.stringify({ text }),
    });
  }

  /**
   * Delete user
   */
  async deleteUser(userId: string): Promise<void> {
    this.validateRequired(userId, "User ID");
    await this.request<void>(`/users/${userId}`, { method: "DELETE" });
  }

  /**
   * Invite user to domain
   */
  async inviteUser(data: {
    name: string;
    email: string;
    domainId: string;
    role: Role;
  }): Promise<User> {
    this.validateRequired(data.name, "Name");
    this.validateEmail(data.email);
    return this.request<User>("/users/invite", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /**
   * Refresh current user and get new token
   */
  async refreshCurrentUser(): Promise<{ user: User; token: string }> {
    return this.request<{ user: User; token: string }>("/users/me/refresh", {
      method: "GET",
    });
  }

  /**
   * Fetch user stats for the current user.
   * @param domainId - The domain ID.
   * @returns User stats including total likes, dislikes, swipes, and recently added artworks.
   */
  async getUserStats(): Promise<UserStatsResponse> {
    return this.request<UserStatsResponse>("/users/stats", { method: "GET" });
  }

  // ========== Artwork Endpoints ==========

  /**
   * Upload artwork with file and optional metadata
   */
  async uploadArtwork(
    domainId: string,
    file: File,
    artworkMetadata?: Partial<Artwork>
  ): Promise<Artwork> {
    this.validateRequired(domainId, "Domain ID");
    this.validateRequired(file, "File");

    return this.uploadFile<Artwork>(
      `/domains/${domainId}/uploads`,
      file,
      artworkMetadata ? { artwork: artworkMetadata } : undefined
    );
  }

  async replaceArtworkImage(
    domainId: string,
    artworkId: string,
    file: File
  ): Promise<Artwork> {
    this.validateRequired(domainId, "Domain ID");
    this.validateRequired(artworkId, "Artwork ID");
    this.validateRequired(file, "File");
    return this.uploadFile<Artwork>(
      `/domains/${domainId}/uploads/${artworkId}/image`,
      file
    );
  }

  /**
   * Get artwork statistics for a domain
   */
  async getArtworkStats(domainId: string): Promise<ArtworkStats> {
    this.validateRequired(domainId, "Domain ID");
    return this.request<ArtworkStats>(`/domains/${domainId}/artworks/stats`, {
      method: "GET",
    });
  }

  /**
   * Get artworks for a domain with optional pagination and filtering
   *
   * If `options.userId` is provided and the caller is authorized (domain_owner/global_admin or dealer where allowed),
   * the backend may include per-artwork liked/disliked status for that user.
   */
  async getArtworks(
    domainId: string,
    options?: {
      limit?: number;
      continuationToken?: string;
      sortBy?: string;
      sortOrder?: "asc" | "desc";
      filterBy?: string;
      userId?: string;
      preference?: "liked" | "disliked";
    }
  ): Promise<PaginatedResponse<Artwork>> {
    this.validateRequired(domainId, "Domain ID");
    const params = new URLSearchParams();

    if (options?.limit !== undefined)
      params.append("limit", String(options.limit));
    if (options?.continuationToken)
      params.append("continuationToken", options.continuationToken);
    if (options?.sortBy) params.append("sortBy", options.sortBy);
    if (options?.sortOrder) params.append("sortOrder", options.sortOrder);
    if (options?.filterBy) params.append("filterBy", options.filterBy);
    if (options?.userId) params.append("userId", options.userId);
    if (options?.preference) params.append("preference", options.preference);

    const queryString = params.toString();
    const endpoint = `/domains/${domainId}/artworks${queryString ? `?${queryString}` : ""}`;
    return this.request<PaginatedResponse<Artwork>>(endpoint, {
      method: "GET",
    });
  }

  /**
   * Get single artwork by ID
   */
  async getArtwork(domainId: string, artworkId: string): Promise<Artwork> {
    this.validateRequired(domainId, "Domain ID");
    this.validateRequired(artworkId, "Artwork ID");
    return this.request<Artwork>(`/domains/${domainId}/artworks/${artworkId}`, {
      method: "GET",
    });
  }

  /**
   * Update artwork metadata
   */
  async updateArtwork(
    domainId: string,
    artworkId: string,
    data: Partial<Artwork>
  ): Promise<Artwork> {
    this.validateRequired(domainId, "Domain ID");
    this.validateRequired(artworkId, "Artwork ID");
    return this.request<Artwork>(`/domains/${domainId}/artworks/${artworkId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  /**
   * Delete artwork
   */
  async deleteArtwork(domainId: string, artworkId: string): Promise<void> {
    this.validateRequired(domainId, "Domain ID");
    this.validateRequired(artworkId, "Artwork ID");
    await this.request(`/domains/${domainId}/artworks/${artworkId}`, {
      method: "DELETE",
    });
  }

  /**
   * Fetch untasted artworks for user (Taster page)
   */
  async fetchUntastedArtworks(
    domainId: string,
    userId: string,
    limit: number = 20
  ): Promise<UntastedArtworksResponse> {
    return await this.request<UntastedArtworksResponse>(
      `/domains/${domainId}/artworks/untasted/${userId}?limit=${limit}`,
      { method: "GET" }
    );
  }

  async saveArtworkPreference(
    domainId: string,
    userId: string,
    preference: {
      artworkId: string;
      domainId: string;
      liked?: boolean;
      comment?: string;
    }
  ): Promise<void> {
    await this.request<UntastedArtworksResponse>(
      `/domains/${domainId}/artworks/preferences/${userId}`,
      { method: "POST", body: JSON.stringify(preference) }
    );
  }

  /**
   * Get recommendations for a domain
   */
  async getRecommendations(
    domainId: string,
    userId?: string,
    limit?: number,
    offset?: number
  ): Promise<Array<Artwork>> {
    this.validateRequired(domainId, "Domain ID");
    let params = "";
    if (limit) {
      params += `?limit=${encodeURIComponent(limit)}`;
    }
    if (offset) {
      params += params
        ? `&offset=${encodeURIComponent(offset)}`
        : `?offset=${encodeURIComponent(offset)}`;
    }
    if (userId) {
      params += params
        ? `&userId=${encodeURIComponent(userId)}`
        : `?userId=${encodeURIComponent(userId)}`;
    }
    return this.request<Array<Artwork>>(
      `/domains/${domainId}/artworks/recommendations${params}`,
      { method: "GET" }
    );
  }

  // ========== Sales / Proposals Endpoints ==========

  /**
   * List proposals for a domain (optionally filter by userId)
   */
  async listProposals(
    domainId: string,
    userId?: string,
    dealerUserId?: string
  ): Promise<Proposal[]> {
    this.validateRequired(domainId, "Domain ID");
    let params = "";
    if (dealerUserId) {
      params = `?dealerUserId=${encodeURIComponent(dealerUserId)}`;
    } else if (userId) {
      params = `?userId=${encodeURIComponent(userId)}`;
    }
    return this.request<Proposal[]>(
      `/domains/${domainId}/sales/proposals${params}`,
      { method: "GET" }
    );
  }

  /**
   * Get a specific proposal by ID
   */
  async getProposal(domainId: string, proposalId: string): Promise<Proposal> {
    this.validateRequired(domainId, "Domain ID");
    this.validateRequired(proposalId, "Proposal ID");
    return this.request<Proposal>(
      `/domains/${domainId}/sales/proposals/${proposalId}`,
      { method: "GET" }
    );
  }

  /**
   * Create a new proposal
   */
  async createProposal(
    domainId: string,
    proposal: Partial<Proposal>
  ): Promise<Proposal> {
    this.validateRequired(domainId, "Domain ID");
    this.validateRequired(proposal.userId, "User ID");
    return this.request<Proposal>(`/domains/${domainId}/sales/proposals`, {
      method: "POST",
      body: JSON.stringify(proposal),
    });
  }

  /**
   * Update an existing proposal
   */
  async updateProposal(
    domainId: string,
    proposalId: string,
    update: Partial<Proposal>
  ): Promise<Proposal> {
    this.validateRequired(domainId, "Domain ID");
    this.validateRequired(proposalId, "Proposal ID");
    return this.request<Proposal>(
      `/domains/${domainId}/sales/proposals/${proposalId}`,
      {
        method: "PATCH",
        body: JSON.stringify(update),
      }
    );
  }

  /**
   * Delete a proposal
   */
  async deleteProposal(domainId: string, proposalId: string): Promise<void> {
    this.validateRequired(domainId, "Domain ID");
    this.validateRequired(proposalId, "Proposal ID");
    await this.request<void>(
      `/domains/${domainId}/sales/proposals/${proposalId}`,
      { method: "DELETE" }
    );
  }

  /**
   * Ping a customer about a proposal (send reminder)
   */
  async pingProposal(domainId: string, proposalId: string): Promise<void> {
    this.validateRequired(domainId, "Domain ID");
    this.validateRequired(proposalId, "Proposal ID");
    await this.request<void>(
      `/domains/${domainId}/sales/proposals/${proposalId}/ping`,
      { method: "POST" }
    );
  }

  // ========== Authentication Endpoints (Public) ==========

  /**
   * Request login verification code
   */
  async requestLoginCode(email: string): Promise<{ message: string }> {
    this.validateEmail(email);
    return this.request<{ message: string }>("/auth/login/request", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  }

  /**
   * Verify login code and get JWT token
   */
  async verifyLoginCode(
    email: string,
    code: string
  ): Promise<DomainVerificationResultResponse> {
    this.validateEmail(email);
    if (!code || code.length !== 6) {
      throw new ApiError("Verification code must be 6 digits", 400);
    }
    return this.request<DomainVerificationResultResponse>(
      "/auth/login/verify",
      {
        method: "POST",
        body: JSON.stringify({ email, code }),
      }
    );
  }

  // ========== Onboarding Endpoints ==========

  /**
   * Upload preference image for onboarding
   */
  async vectorizePreferenceImage(
    file: File,
    options?: { section?: "aesthetic" | "collection" | "shared_gallery" }
  ): Promise<{ success: boolean; message: string; vectorized: number }> {
    this.validateRequired(file, "File");
    const section = options?.section;
    const endpoint = section
      ? `/users/me/vectorize-preference-image?section=${encodeURIComponent(section)}`
      : "/users/me/vectorize-preference-image";
    return this.uploadFile<{
      success: boolean;
      message: string;
      vectorized: number;
    }>(endpoint, file);
  }

  /**
   * Finalize preference vectors after uploading images
   */
  async finalizePreferenceVectors(): Promise<{
    success: boolean;
    message: string;
    totalVectors: number;
  }> {
    return this.request<{
      success: boolean;
      message: string;
      totalVectors: number;
    }>("/users/me/finalize-preference-vectors", { method: "POST" });
  }

  /**
   * Update user questionnaire
   */
  async updateQuestionnaire(data: {
    personalQuestionnaire: Partial<PersonalQuestionnaire>;
  }): Promise<User> {
    return this.request<User>("/users/me/questionnaire", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  /**
   * Complete onboarding
   */
  async completeOnboarding(): Promise<User> {
    return this.request<User>("/users/me/complete-onboarding", {
      method: "POST",
    });
  }

  /**
   * Skip onboarding (can be resumed later)
   */
  async skipOnboarding(): Promise<User> {
    return this.request<User>("/users/me/skip-onboarding", { method: "POST" });
  }
}

/**
 * Singleton API client instance
 */
export const apiClient = new ApiClient();

/**
 * Legacy function for artwork stats (for backward compatibility)
 * @deprecated Use apiClient.getArtworkStats() instead
 */
export async function fetchArtworkStats(
  domainId: string
): Promise<ArtworkStats> {
  return apiClient.getArtworkStats(domainId);
}
