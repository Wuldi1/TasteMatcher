import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './api';

/**
 * Hook to handle saving artwork preferences (like/dislike).
 * Provides mutation logic for updating preferences.
 */
export const useSavePreference = ({
  domainId,
  userId,
  onOptimisticUpdate,
}: {
  domainId: string;
  userId: string;
  onOptimisticUpdate?: (artworkId: string, liked: boolean) => void;
}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ artworkId, liked }: { artworkId: string; liked: boolean }) => {
      if (!domainId || !userId) throw new Error('Domain ID and User ID are required');
      return apiClient.saveArtworkPreference(domainId, userId, { artworkId, liked });
    },
    onMutate: async ({ artworkId, liked }) => {
      // Cancel any ongoing queries for artworks
      await queryClient.cancelQueries(['artworks', domainId]);

      // Optionally perform an optimistic update
      if (onOptimisticUpdate) {
        onOptimisticUpdate(artworkId, liked);
      }

      return { previousData: queryClient.getQueriesData(['artworks', domainId]) };
    },
    onError: (_error, _variables, context) => {
      // Revert to previous data if optimistic update failed
      if (context?.previousData) {
        queryClient.setQueriesData(['artworks', domainId], context.previousData);
      }
    },
    onSuccess: () => {
      // Invalidate queries to refresh data
      queryClient.invalidateQueries(['artworks', domainId]);
      queryClient.invalidateQueries(['untasted-artworks', domainId, userId]);
    },
  });
};
