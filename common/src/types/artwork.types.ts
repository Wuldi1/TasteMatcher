export type ArtworkMetadata = Record<string, unknown>;

export interface Artwork {
  id: string; // UUID
  domainId: string; // UUID
  type?: string; // Discriminator for single-table design (e.g., 'artwork')
  title: string;
  description: string;
  artist: string;
  date: string;
  signature?: string;
  medium?: string;
  width?: number;
  height?: number;
  price?: number; // USD price, optional
  shouldDisplayPrice?: boolean; // whether to show price to users
  tags?: string[];
  filename: string; // defined by service
  vector: number[]; // embedding vector for search
  vectorModel: string; // model used for vectorization
  thumbnails?: ThumbnailInfo[];
  probabilityMatch?: number; // confidence score for AI-generated tags
  createdAt?: number; // timestamp
  metadata?: ArtworkMetadata; // allow additional metadata fields
  likedStatus?: LikedStatus; // customer's like/dislike status for the artwork
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

export enum LikedStatus {
  Liked = 'Liked',
  NotTasted = 'NotTasted',
  Disliked = 'Disliked',
}

/**
 * Domain artwork statistics
 */
export interface ArtworkStats {
  totalArtworks: number;
  totalLikes: number;
  totalDislikes: number;
  totalSwiped: number;
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
 * Response with untasted artworks for user
 */
export interface UntastedArtworksResponse {
  artworks: Artwork[];
  total: number;
}
