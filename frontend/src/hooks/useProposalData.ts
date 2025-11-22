import { useEffect, useState } from 'react';
import { apiClient } from '../utils/api';
import { Proposal, ProposalStatus } from '@tastematcher/common';

interface ProposalMetadata {
    suggestedArtworks: number;
    approved: number;
    rejected: number;
    notResponded: number;
    lastUpdated: number | null;
    proposalStatus: ProposalStatus;
}

/**
 * Hook to fetch proposal data for a user.
 * @param userId - The ID of the user.
 * @param domainId - The domain ID.
 * @returns An object containing `hasSubmittedProposal` and `proposalMetadata`.
 */
export function useProposalData(domainId?: string, userId?: string, dealerUserId?: string): {
    hasSubmittedProposal: boolean;
    proposalMetadata: ProposalMetadata | null;
    proposals?: Proposal[];
    loading: boolean;
} {
    const [hasSubmittedProposal, setHasSubmittedProposal] = useState(false);
    const [proposalMetadata, setProposalMetadata] = useState<ProposalMetadata | null>(null);
    const [proposals, setProposals] = useState<Proposal[] | undefined>(undefined);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchProposals = async () => {
            setLoading(true);
            if (!domainId) {
                setHasSubmittedProposal(false);
                setProposalMetadata(null);
                setProposals([]);
                setLoading(false);
                return;
            }

            try {
                const allProposals = await apiClient.listProposals(domainId, userId, dealerUserId);

                const submittedProposal = allProposals.find((p) => p.status === 'submitted');

                if (submittedProposal) {
                    setHasSubmittedProposal(true);

                    const metadata: ProposalMetadata = {
                        suggestedArtworks: submittedProposal.items.length,
                        approved: submittedProposal.items.filter((i) => i.status === 'approved').length,
                        rejected: submittedProposal.items.filter((i) => i.status === 'rejected').length,
                        notResponded: submittedProposal.items.filter((i) => i.status === 'pending').length,
                        lastUpdated: submittedProposal.updatedAt || null,
                        proposalStatus: submittedProposal.status,
                    };

                    setProposalMetadata(metadata);
                    setProposals(allProposals);

                } else {
                    setHasSubmittedProposal(false);
                    setProposalMetadata(null);
                    setProposals([]);
                }
            } catch (err) {
                console.error('Failed to fetch proposals:', err);
                setHasSubmittedProposal(false);
                setProposalMetadata(null);
                setProposals([]);
            } finally {
                setLoading(false);
            }
        };

        fetchProposals();
    }, [userId, domainId, dealerUserId]);

    return { hasSubmittedProposal, proposalMetadata, proposals, loading };
}
