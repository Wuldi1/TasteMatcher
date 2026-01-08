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
  depth?: number; // inches, optional
  isAuction?: boolean; // defaults to false
  price?: number; // USD price, optional
  maxPrice?: number; // required when isAuction is true; must be >= price
  shouldDisplayPrice?: boolean; // whether to show price to users
  useForTaster?: boolean; // whether artwork should appear in the Taster experience (defaults to false)
  isPrivate?: boolean;
  endDate?: string; // ISO datetime when auction closes; required when isAuction is true
  uploadedBy?: string;
  tags?: string[];
  filename: string; // defined by service
  vector: number[]; // embedding vector for search
  vectorModel: string; // model used for vectorization
  thumbnails?: ThumbnailInfo[];
  probabilityMatch?: number; // confidence score for AI-generated tags
  createdAt?: number; // timestamp
  metadata?: ArtworkMetadata; // allow additional metadata fields
  likedStatus?: LikedStatus; // customer's like/dislike status for the artwork
  preferenceComment?: string; // free-text feedback stored with the viewer's preference
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
  Liked = "Liked",
  NotTasted = "NotTasted",
  Disliked = "Disliked",
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
  liked?: boolean; // true = like, false = dislike
  comment?: string;
  createdAt: number; // Timestamp
  updatedAt?: number;
}

/**
 * Response with untasted artworks for user
 */
export interface UntastedArtworksResponse {
  artworks: Artwork[];
  total: number;
}
