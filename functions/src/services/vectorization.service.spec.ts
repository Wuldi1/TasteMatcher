import { VectorizationService } from './vectorization.service';

describe('VectorizationService', () => {
  let service: VectorizationService;
  let mockVisionClient: jest.Mocked<any>;

  beforeEach(() => {
    mockVisionClient = {
      analyzeImage: jest.fn(),
    };
    service = new VectorizationService(mockVisionClient);
  });

  describe('vectorizeImage', () => {
    it('should return embedding vector from AI Vision', async () => {
      const imageBuffer = Buffer.from('fake-image');
      mockVisionClient.analyzeImage.mockResolvedValue({
        modelVersion: 'florence-2',
        vectorEmbedding: new Array(1024).fill(0.1),
      });

      const result = await service.vectorizeImage(imageBuffer);

      expect(result.embedding).toHaveLength(1024);
      expect(result.model).toBe('florence-2');
      expect(mockVisionClient.analyzeImage).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({ features: ['vectorize'] })
      );
    });

    it('should throw on AI Vision API failure', async () => {
      mockVisionClient.analyzeImage.mockRejectedValue(new Error('API failure'));

      await expect(service.vectorizeImage(Buffer.from('test'))).rejects.toThrow('API failure');
    });

    it('should validate embedding dimensions', async () => {
      mockVisionClient.analyzeImage.mockResolvedValue({
        modelVersion: 'test',
        vectorEmbedding: [0.1, 0.2], // Too short
      });

      await expect(service.vectorizeImage(Buffer.from('test'))).rejects.toThrow(
        'Invalid embedding'
      );
    });
  });
});
