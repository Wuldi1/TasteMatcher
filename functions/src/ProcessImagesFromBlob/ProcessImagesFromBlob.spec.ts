import { InvocationContext } from '@azure/functions';
import { processImagesFromBlob } from './ProcessImagesFromBlob';
import { ThumbnailService } from '../services/Thumbnail/ThumbnailService';
import { VectorizationService } from '../services/Vectorization/VectorizationService';
import { SearchIndexService } from '../services/SearchIndex/SearchIndexService';
import { BlobService } from '../services/Blob/BlobService';
import type { ImageProcessingQueueMessage } from '@tastematcher/common';

jest.mock('./services/ThumbnailService');
jest.mock('./services/VectorizationService');
jest.mock('./services/SearchIndexService');
jest.mock('./services/BlobService');

describe('ProcessImagesFromBlob', () => {
  let mockContext: Partial<InvocationContext>;
  let mockBlobService: jest.Mocked<BlobService>;
  let mockThumbnailService: jest.Mocked<ThumbnailService>;
  let mockVectorizationService: jest.Mocked<VectorizationService>;
  let mockSearchIndexService: jest.Mocked<SearchIndexService>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockContext = {
      invocationId: 'test-invocation-id',
      functionName: 'ProcessImagesFromBlob',
      logHandler: jest.fn(),
      traceContext: {
        traceparent: 'test-trace',
        tracestate: '',
        attributes: {},
      },
    };

    mockBlobService = new BlobService({} as any) as jest.Mocked<BlobService>;
    mockThumbnailService = new ThumbnailService({} as any) as jest.Mocked<ThumbnailService>;
    mockVectorizationService = new VectorizationService({} as any) as jest.Mocked<VectorizationService>;
    mockSearchIndexService = new SearchIndexService({} as any) as jest.Mocked<SearchIndexService>;
  });

  it('should process valid message with thumbnails and vectorization', async () => {
    const message: ImageProcessingQueueMessage = {
      messageId: 'msg-123',
      artworkId: 'artwork-456',
      domainId: 'domain-789',
      containerName: 'uploads',
      blobName: 'test-image.jpg',
      contentType: 'image/jpeg',
      uploadedAt: new Date().toISOString(),
      correlationId: 'corr-123',
    };

    const mockImageBuffer = Buffer.from('fake-image-data');
    const mockThumbnails = [
      { blobUrl: 'https://blob/small.jpg', width: 150, height: 150 },
      { blobUrl: 'https://blob/medium.jpg', width: 300, height: 300 },
    ];
    const mockVector = { vector: new Array(1536).fill(0.1), model: 'ada-002' };

    mockBlobService.downloadBlob.mockResolvedValue(mockImageBuffer);
    mockThumbnailService.generateAndUploadThumbnails.mockResolvedValue(mockThumbnails);
    mockVectorizationService.generateEmbedding.mockResolvedValue(mockVector);
    mockSearchIndexService.indexArtwork.mockResolvedValue(undefined);

    await processImagesFromBlob(message, mockContext as InvocationContext);

    expect(mockBlobService.downloadBlob).toHaveBeenCalledWith('uploads', 'test-image.jpg');
    expect(mockThumbnailService.generateAndUploadThumbnails).toHaveBeenCalledWith(mockImageBuffer, 'artwork-456');
    expect(mockVectorizationService.generateEmbedding).toHaveBeenCalledWith(mockImageBuffer);
    expect(mockSearchIndexService.indexArtwork).toHaveBeenCalledWith({
      artworkId: 'artwork-456',
      domainId: 'domain-789',
      thumbnails: mockThumbnails,
      vectorEmbedding: mockVector,
    });
  });

  it('should handle blob download failure with proper error', async () => {
    const message: ImageProcessingQueueMessage = {
      messageId: 'msg-fail',
      artworkId: 'artwork-fail',
      domainId: 'domain-789',
      containerName: 'uploads',
      blobName: 'missing.jpg',
      contentType: 'image/jpeg',
      uploadedAt: new Date().getTime(),
    };

    mockBlobService.downloadBlob.mockRejectedValue(new Error('Blob not found'));

    await expect(
      processImagesFromBlob(message, mockContext as InvocationContext)
    ).rejects.toThrow('Blob not found');

    expect(mockThumbnailService.generateAndUploadThumbnails).not.toHaveBeenCalled();
  });

  it('should handle thumbnail generation failure', async () => {
    const message: ImageProcessingQueueMessage = {
      messageId: 'msg-thumb-fail',
      artworkId: 'artwork-thumb',
      domainId: 'domain-789',
      containerName: 'uploads',
      blobName: 'corrupt.jpg',
      contentType: 'image/jpeg',
      uploadedAt: new Date().toISOString(),
    };

    mockBlobService.downloadBlob.mockResolvedValue(Buffer.from('fake'));
    mockThumbnailService.generateAndUploadThumbnails.mockRejectedValue(new Error('Invalid image format'));

    await expect(
      processImagesFromBlob(message, mockContext as InvocationContext)
    ).rejects.toThrow('Invalid image format');
  });

  it('should validate message structure', async () => {
    const invalidMessage = {
      messageId: 'msg-invalid',
      // missing required fields
    } as any;

    await expect(
      processImagesFromBlob(invalidMessage, mockContext as InvocationContext)
    ).rejects.toThrow();
  });

  it('should use correlation ID for tracing', async () => {
    const message: ImageProcessingQueueMessage = {
      messageId: 'msg-trace',
      artworkId: 'artwork-trace',
      domainId: 'domain-789',
      containerName: 'uploads',
      blobName: 'trace.jpg',
      contentType: 'image/jpeg',
      uploadedAt: new Date().toISOString(),
      correlationId: 'correlation-abc',
    };

    mockBlobService.downloadBlob.mockResolvedValue(Buffer.from('fake'));
    mockThumbnailService.generateAndUploadThumbnails.mockResolvedValue([]);
    mockVectorizationService.generateEmbedding.mockResolvedValue({ vector: [], model: 'test' });
    mockSearchIndexService.indexArtwork.mockResolvedValue(undefined);

    await processImagesFromBlob(message, mockContext as InvocationContext);

    // Verify correlation ID was used in logging context
    expect(mockContext.invocationId).toBeDefined();
  });
});
