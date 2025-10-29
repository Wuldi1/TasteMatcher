export type ThumbnailSize = 'small' | 'medium' | 'large';
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

export interface ThumbnailInfo {
  size: ThumbnailSize;
  url: string;
  width: number;
  height: number;
}