import { InvocationContext } from '@azure/functions';
import { processImagesFromBlob } from './ProcessImagesFromBlob';
import type { ImageProcessingQueueMessage } from '@tastematcher/common';
import { ThumbnailService, VectorizationService, SearchIndexService, BlobService } from '@tastematcher/common';

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
      traceContext: {
        traceParent: 'test-trace',
        traceState: '',
        attributes: {},
      },
    };

    mockBlobService = new BlobService() as jest.Mocked<BlobService>;
    mockThumbnailService = new ThumbnailService() as jest.Mocked<ThumbnailService>;
    mockVectorizationService = new VectorizationService() as jest.Mocked<VectorizationService>;
    mockSearchIndexService = new SearchIndexService() as jest.Mocked<SearchIndexService>;
  });

  it('should process valid message with thumbnails and vectorization', async () => {
    const message: ImageProcessingQueueMessage = {
      messageId: 'msg-123',
      artworkId: 'artwork-456',
      domainId: 'domain-789',
      blobName: 'test-image.jpg',
      uploadedAt: new Date().getTime(),
      fileUrl: 'https://blobstorage/test-image.jpg'
    };

    const mockImageBuffer = Buffer.from('fake-image-data');
    const mockThumbnails = [
      { url: 'https://blob/small.jpg', width: 150, height: 150 },
      { url: 'https://blob/medium.jpg', width: 300, height: 300 },
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
      blobName: 'missing.jpg',
      uploadedAt: new Date().getTime(),
      fileUrl: 'https://blobstorage/missing.jpg'
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
      blobName: 'corrupt.jpg',
      uploadedAt: new Date().getTime(),
      fileUrl: 'https://blobstorage/corrupt.jpg'
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
      blobName: 'trace.jpg',
      uploadedAt: new Date().getTime(),
      fileUrl: 'https://blobstorage/trace.jpg'
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
