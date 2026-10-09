import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { apiClient } from "../../utils/api";
import ProposalView from "../../components/Proposal/ProposalView";
import type { Proposal } from "@tastematcher/common";
import { AppLoadingState } from "../../components/Loading/AppLoadingState";

export function BuyingProposalPage() {
  const { user } = useAuth();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const recordedProposalOpenRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const fetchProposal = async () => {
      try {
        const proposals = await apiClient.listProposals(
          user?.domainId!,
          user?.id!,
        );
        const submittedProposal = proposals.find(
          (p) => p.status === "submitted",
        );
        setProposal(submittedProposal || null);
      } catch (err) {
        console.error("Failed to fetch proposals", err);
      } finally {
        setLoading(false);
      }
    };

    if (user?.id && user?.domainId) {
      fetchProposal();
    }
  }, [user?.id, user?.domainId]);

  useEffect(() => {
    if (!proposal) return;
    if (recordedProposalOpenRef.current === proposal.id) return;
    recordedProposalOpenRef.current = proposal.id;
    void apiClient
      .recordProposalEngagement(proposal.domainId, proposal.id, {
        event: "opened",
      })
      .then((updated) => setProposal(updated))
      .catch((error) => console.error("Failed to record proposal open", error));
  }, [proposal]);

  if (loading) {
    return <AppLoadingState message="Loading your proposal..." />;
  }

  if (!proposal) {
    return <div>No submitted proposal found.</div>;
  }

  return (
    <div>
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
          Your private viewing
        </p>
        <h1 className="mt-2 text-4xl font-normal md:text-6xl">
          Art worth living with.
        </h1>
        <p className="mt-3 max-w-2xl text-gray-600">
          Consider every work individually, leave a note, and update the
          proposal when you are ready to continue the conversation.
        </p>
      </div>
      <ProposalView
        proposal={proposal}
        onArtworkViewed={(artworkId) => {
          void apiClient
            .recordProposalEngagement(proposal.domainId, proposal.id, {
              event: "artwork_viewed",
              artworkId,
            })
            .catch((error) =>
              console.error("Failed to record artwork view", error),
            );
        }}
      />
    </div>
  );
}
