import { ThumbnailService } from './thumbnail.service';
import { ThumbnailConfig } from '@tastematcher/common';

describe('ThumbnailService', () => {
  let service: ThumbnailService;

  beforeEach(() => {
    service = new ThumbnailService();
  });

  describe('generateThumbnail', () => {
    it('should generate thumbnail with correct dimensions', async () => {
      const imageBuffer = Buffer.from('fake-image-data');
      const config: ThumbnailConfig = { width: 150, height: 150, suffix: 'thumb_sm' };

      const result = await service.generateThumbnail(imageBuffer, config);

      expect(result).toBeDefined();
      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.width).toBeLessThanOrEqual(150);
      expect(result.height).toBeLessThanOrEqual(150);
      expect(result.sizeBytes).toBeGreaterThan(0);
    });

    it('should maintain aspect ratio', async () => {
      const imageBuffer = Buffer.from('fake-image-data');
      const config: ThumbnailConfig = { width: 400, height: 400, suffix: 'thumb_md' };

      const result = await service.generateThumbnail(imageBuffer, config);

      const aspectRatio = result.width / result.height;
      expect(aspectRatio).toBeGreaterThan(0);
      expect(aspectRatio).toBeLessThanOrEqual(2); // Reasonable range
    });

    it('should throw on invalid image buffer', async () => {
      const invalidBuffer = Buffer.from('not-an-image');
      const config: ThumbnailConfig = { width: 150, height: 150, suffix: 'thumb_sm' };

      await expect(service.generateThumbnail(invalidBuffer, config)).rejects.toThrow();
    });
  });

  describe('generateMultipleThumbnails', () => {
    it('should generate all configured sizes', async () => {
      const imageBuffer = Buffer.from('fake-image-data');
      const configs: ThumbnailConfig[] = [
        { width: 150, height: 150, suffix: 'thumb_sm' },
        { width: 400, height: 400, suffix: 'thumb_md' },
      ];

      const results = await service.generateMultipleThumbnails(imageBuffer, configs);

      expect(results).toHaveLength(2);
      expect(results[0].suffix).toBe('thumb_sm');
      expect(results[1].suffix).toBe('thumb_md');
    });

    it('should continue on individual thumbnail failure', async () => {
      const imageBuffer = Buffer.from('fake-image-data');
      const configs: ThumbnailConfig[] = [
        { width: 150, height: 150, suffix: 'thumb_sm' },
        { width: -1, height: -1, suffix: 'invalid' }, // Invalid config
      ];

      const results = await service.generateMultipleThumbnails(imageBuffer, configs);

      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.suffix === 'thumb_sm')).toBe(true);
    });
  });
});
