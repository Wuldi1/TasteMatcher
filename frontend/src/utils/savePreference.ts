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
  onOptimisticUpdate?: (artworkId: string, updates: { liked?: boolean; comment?: string }) => void;
}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      artworkId,
      domainId,
      liked,
      comment,
    }: {
      artworkId: string;
      domainId: string;
      liked?: boolean;
      comment?: string;
    }) => {
      if (!domainId || !userId) throw new Error('Domain ID and User ID are required');
      return apiClient.saveArtworkPreference(domainId, userId, { artworkId, domainId, liked, comment });
    },
    onMutate: async ({ artworkId, domainId, liked, comment }) => {
      // Cancel any ongoing queries for artworks
      await queryClient.cancelQueries(['artworks', domainId]);

      // Optionally perform an optimistic update
      if (onOptimisticUpdate) {
        onOptimisticUpdate(artworkId, { liked, comment });
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
