import { describe, it, expect } from 'vitest';
import { generatePreferenceId } from '../preference.utils';

describe('preference.utils', () => {
  describe('generatePreferenceId', () => {
    it('should generate composite ID from userId and artworkId', () => {
      const result = generatePreferenceId('user-123', 'artwork-456');
      expect(result).toBe('user-123_artwork-456');
    });

    it('should handle UUIDs correctly', () => {
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const artworkId = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
      const result = generatePreferenceId(userId, artworkId);
      expect(result).toBe(`${userId}_${artworkId}`);
    });

    it('should throw error if userId is empty', () => {
      expect(() => generatePreferenceId('', 'artwork-123')).toThrow(
        'userId and artworkId are required to generate preference ID'
      );
    });

    it('should throw error if artworkId is empty', () => {
      expect(() => generatePreferenceId('user-123', '')).toThrow(
        'userId and artworkId are required to generate preference ID'
      );
    });

    it('should throw error if both are empty', () => {
      expect(() => generatePreferenceId('', '')).toThrow(
        'userId and artworkId are required to generate preference ID'
      );
    });

    it('should handle special characters in IDs', () => {
      const result = generatePreferenceId('user-abc-123', 'artwork-xyz-789');
      expect(result).toBe('user-abc-123_artwork-xyz-789');
    });
  });
});
