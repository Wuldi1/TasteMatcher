import React, { useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { apiClient } from "../../utils/api";
import ProposalView from "../../components/Proposal/ProposalView";
import type { Proposal } from "@tastematcher/common";
import { AppLoadingState } from "../../components/Loading/AppLoadingState";

export function BuyingProposalPage() {
  const { user } = useAuth();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);

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

  const handleStatusChange = async (
    status: "accepted" | "rejected" | "submitted",
  ) => {
    if (!proposal) return;

    try {
      const updatedProposal = await apiClient.updateProposal(
        user?.domainId!,
        proposal.id,
        { status },
      );
      setProposal(updatedProposal);
      alert(
        `Proposal ${status === "accepted" ? "accepted" : "rejected"} successfully!`,
      );
    } catch (err) {
      console.error("Failed to update proposal status", err);
      alert("Failed to update proposal status");
    }
  };

  if (loading) {
    return <AppLoadingState message="Loading your proposal..." />;
  }

  if (!proposal) {
    return <div>No submitted proposal found.</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Buying Proposal</h1>
      <ProposalView
        proposal={proposal}
        // isDealerView={false} // TODO : Is this a mistake?
        onStatusChange={handleStatusChange}
      />
    </div>
  );
}
