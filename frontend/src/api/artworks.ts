import type { Artwork, PaginatedResponse, ArtworkStats, UntastedArtworksResponse, SavePreferenceRequest } from '@tastematcher/common';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

/**
 * Get auth token from localStorage
 */
function getAuthToken(): string {
  return localStorage.getItem('token') || '';
}

/**
 * Fetch artworks with pagination and filters
 */
export async function fetchArtworks(
  domainId: string,
  params: {
    limit?: number;
    continuationToken?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    artist?: string;
    tags?: string;
    searchQuery?: string;
  }
): Promise<PaginatedResponse<Artwork>> {
  const queryParams = new URLSearchParams();
  
  if (params.limit) queryParams.append('limit', params.limit.toString());
  if (params.continuationToken) queryParams.append('continuationToken', params.continuationToken);
  if (params.sortBy) queryParams.append('sortBy', params.sortBy);
  if (params.sortOrder) queryParams.append('sortOrder', params.sortOrder);
  if (params.artist) queryParams.append('artist', params.artist);
  if (params.tags) queryParams.append('tags', params.tags);
  if (params.searchQuery) queryParams.append('searchQuery', params.searchQuery);

  const url = `${API_BASE_URL}/api/domains/${domainId}/artworks?${queryParams.toString()}`;
  const token = getAuthToken();

  console.log('Fetching artworks from API:', { 
    url, 
    hasToken: !!token,
    tokenLength: token?.length 
  });

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  console.log('Fetch response:', { 
    status: response.status, 
    statusText: response.statusText,
    ok: response.ok 
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('API error:', { status: response.status, errorText });
    throw new Error(`Failed to fetch artworks: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  console.log('API response data:', { 
    itemsCount: data.items?.length,
    hasMore: data.hasMore,
    continuationToken: data.continuationToken 
  });

  return data;
}

/**
 * Get single artwork by ID
 */
export async function fetchArtwork(domainId: string, artworkId: string): Promise<Artwork> {
  const response = await fetch(
    `${API_BASE_URL}/api/domains/${domainId}/artworks/${artworkId}`,
    {
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch artwork');
  }

  return response.json();
}

/**
 * Update artwork metadata
 */
export async function updateArtwork(
  domainId: string,
  artworkId: string,
  artwork: Artwork
): Promise<Artwork> {
  const response = await fetch(
    `${API_BASE_URL}/api/domains/${domainId}/artworks/${artworkId}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`,
      },
      body: JSON.stringify(artwork),
    }
  );

  if (!response.ok) {
    throw new Error('Failed to update artwork');
  }

  return response.json();
}

/**
 * Delete artwork
 */
export async function deleteArtwork(domainId: string, artworkId: string): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/domains/${domainId}/artworks/${artworkId}`,
    {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to delete artwork');
  }
}

/**
 * Fetch artwork statistics for domain
 */
export async function fetchArtworkStats(domainId: string): Promise<ArtworkStats> {
  const response = await fetch(
    `${API_BASE_URL}/api/domains/${domainId}/artworks/stats`,
    {
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch artwork statistics');
  }

  return response.json();
}

/**
 * Fetch untasted artworks for user (Taster page)
 */
export async function fetchUntastedArtworks(
  domainId: string,
  userId: string,
  limit: number = 20
): Promise<UntastedArtworksResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/domains/${domainId}/artworks/untasted/${userId}?limit=${limit}`,
    {
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch untasted artworks');
  }

  return response.json();
}

/**
 * Save user preference for artwork
 */
export async function saveArtworkPreference(
  domainId: string,
  userId: string,
  preference: SavePreferenceRequest
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/domains/${domainId}/artworks/preferences/${userId}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`,
      },
      body: JSON.stringify(preference),
    }
  );

  if (!response.ok) {
    throw new Error('Failed to save artwork preference');
  }
}
