import { Test, TestingModule } from '@nestjs/testing';
import { ArtworksService } from './artworks.service';
import { CosmosService } from '../cosmos/cosmos.service';
import { NotFoundException } from '@nestjs/common';

describe('ArtworksService', () => {
  let service: ArtworksService;
  let cosmosService: jest.Mocked<CosmosService>;

  const mockContainer = {
    items: {
      query: jest.fn(),
    },
    item: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArtworksService,
        {
          provide: CosmosService,
          useValue: {
            getContainer: jest.fn().mockReturnValue(mockContainer),
          },
        },
      ],
    }).compile();

    service = module.get<ArtworksService>(ArtworksService);
    cosmosService = module.get(CosmosService) as jest.Mocked<CosmosService>;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return paginated artworks', async () => {
      const mockArtworks = [
        { id: '1', domainId: 'domain-1', title: 'Artwork 1' },
        { id: '2', domainId: 'domain-1', title: 'Artwork 2' },
      ];

      mockContainer.items.query.mockReturnValue({
        fetchNext: jest.fn().mockResolvedValue({
          resources: mockArtworks,
          continuationToken: 'token-123',
          hasMoreResults: true,
        }),
      });

      const result = await service.findAll('domain-1', { limit: 20 });

      expect(result.items).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.continuationToken).toBe('token-123');
    });
  });

  describe('findOne', () => {
    it('should return artwork by ID', async () => {
      const mockArtwork = { id: '1', domainId: 'domain-1', title: 'Artwork 1' };

      mockContainer.item.mockReturnValue({
        read: jest.fn().mockResolvedValue({ resource: mockArtwork }),
      });

      const result = await service.findOne('domain-1', '1');

      expect(result.id).toBe('1');
      expect(result.title).toBe('Artwork 1');
    });

    it('should throw NotFoundException if artwork not found', async () => {
      mockContainer.item.mockReturnValue({
        read: jest.fn().mockResolvedValue({ resource: null }),
      });

      await expect(service.findOne('domain-1', '999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update artwork metadata', async () => {
      const existing = { id: '1', domainId: 'domain-1', title: 'Old Title' };
      const updated = { ...existing, title: 'New Title' };

      mockContainer.item.mockReturnValue({
        read: jest.fn().mockResolvedValue({ resource: existing }),
        replace: jest.fn().mockResolvedValue({ resource: updated }),
      });

      const result = await service.update('domain-1', '1', { title: 'New Title' });

      expect(result.title).toBe('New Title');
    });
  });

  describe('getStats', () => {
    it('should return aggregated statistics', async () => {
      const mockStats = {
        totalArtworks: 42,
        totalLiked: 28,
        recentlyAdded: 5,
      };

      mockContainer.items.query.mockReturnValue({
        fetchAll: jest.fn()
          .mockResolvedValueOnce({ resources: [42] })  // total
          .mockResolvedValueOnce({ resources: [28] })  // liked
          .mockResolvedValueOnce({ resources: [5] }),  // recent
      });

      const result = await service.getStats('domain-1');

      expect(result.totalArtworks).toBe(42);
      expect(result.totalLiked).toBe(28);
      expect(result.recentlyAdded).toBe(5);
    });

    it('should handle zero results gracefully', async () => {
      mockContainer.items.query.mockReturnValue({
        fetchAll: jest.fn().mockResolvedValue({ resources: [] }),
      });

      const result = await service.getStats('domain-1');

      expect(result.totalArtworks).toBe(0);
      expect(result.totalLiked).toBe(0);
      expect(result.recentlyAdded).toBe(0);
    });
  });
});
