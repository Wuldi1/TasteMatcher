import { Artwork, ThumbnailInfo } from "./artwork";

export type UploadStatus = 'pending' | 'enqueued' | 'processing' | 'completed' | 'failed';

export interface IndexingJobMessage {
  messageId: string;
  artId: string;
  domainId: string;
  blobName: string;
  artwork: Artwork;
  attempt: number;
  enqueuedAt?: number; // timestamp
}


export interface ProcessingStatus {
  artId: string;
  status: UploadStatus;
  progress: number;       // 0-100 percentage
  thumbnails?: Array<ThumbnailInfo>;
  error?: string;          // error message if failed
}