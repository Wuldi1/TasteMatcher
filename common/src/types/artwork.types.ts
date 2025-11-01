export type ArtworkMetadata = Record<string, unknown>;

export interface Artwork {
  id: string; // UUID
  domainId: string; // UUID
  title: string;
  description: string;
  artist: string;
  category: string;
  filename: string; // defined by service
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

export interface ThumbnailGenerationResult extends ThumbnailSize {
  buffer: Buffer;
  sizeBytes: number;
}
