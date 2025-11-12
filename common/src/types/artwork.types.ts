export type ArtworkMetadata = Record<string, unknown>;

export interface Artwork {
  id: string; // UUID
  domainId: string; // UUID
  title: string;
  description: string;
  artist: string;
  category: string;
  classification: string;
  department: string;
  country: string;
  date: string;
  filename: string; // defined by service
  vector: number[]; // embedding vector for search
  vectorModel: string; // model used for vectorization
  thumbnails?: ThumbnailInfo[];
  tags?: string[];
  createdAt?: number; // timestamp
  metadata?: ArtworkMetadata; // allow additional metadata fields
}

export interface ThumbnailSize {
  width: number;
  height: number;
}

export interface ThumbnailInfo extends ThumbnailSize {
  url: string;
}

export interface ThumbnailGenerationResult extends ThumbnailInfo {
  buffer: Buffer;
  sizeBytes: number;
}

/**
 * Domain artwork statistics
 */
export interface ArtworkStats {
  totalArtworks: number;
  totalLiked: number;
  recentlyAdded: number; // Last 7 days
}

/**
 * User preference for an artwork (like/dislike)
 * Stored in Cosmos DB to track user-artwork interactions
 */
export interface ArtworkPreference {
  id: string; // Format: `${userId}_${artworkId}` - generated via generatePreferenceId()
  userId: string; // Partition key for efficient user-scoped queries
  artworkId: string;
  domainId: string;
  liked: boolean; // true = like, false = dislike
  createdAt: number; // Timestamp
}

/**
 * Request to save artwork preference
 */
export interface SavePreferenceRequest {
  artworkId: string;
  liked: boolean;
}

/**
 * Response with untasted artworks for user
 */
export interface UntastedArtworksResponse {
  artworks: Artwork[];
  total: number;
}
