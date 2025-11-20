import { useEffect, useState } from 'react';
import { apiClient } from '../utils/api';

/**
 * Hook to check if a user has a submitted proposal.
 * @param userId - The ID of the user.
 * @param domainId - The domain ID.
 * @returns A boolean indicating if the user has a submitted proposal.
 */
export function useHasSubmittedProposal(userId?: string, domainId?: string): boolean {
  const [hasSubmittedProposal, setHasSubmittedProposal] = useState(false);

  useEffect(() => {
    const fetchProposals = async () => {
      if (!userId || !domainId) {
        setHasSubmittedProposal(false);
        return;
      }

      try {
        const proposals = await apiClient.listProposals(domainId, userId);
        const submittedProposal = proposals.some((p) => p.status === 'submitted');
        setHasSubmittedProposal(submittedProposal);
      } catch (err) {
        console.error('Failed to fetch proposals', err);
        setHasSubmittedProposal(false);
      }
    };

    fetchProposals();
  }, [userId, domainId]);

  return hasSubmittedProposal;
}
