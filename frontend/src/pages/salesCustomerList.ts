import type { Proposal, ProposalStatus } from "@tastematcher/common";

export type SalesCustomer = {
  id: string;
  name?: string;
  email?: string;
};

export type SalesCustomerProposalStatus = ProposalStatus | "none";

export type SalesCustomerListItem = {
  customer: SalesCustomer;
  proposal?: Proposal;
  proposalStatus: SalesCustomerProposalStatus;
};

const STATUS_ORDER: Record<SalesCustomerProposalStatus, number> = {
  submitted: 0,
  draft: 1,
  accepted: 2,
  rejected: 3,
  none: 4,
};

const getProposalTimestamp = (proposal?: Proposal) =>
  proposal?.updatedAt ?? proposal?.submittedAt ?? proposal?.createdAt ?? 0;

const compareText = (left: string, right: string) =>
  left.localeCompare(right, undefined, { sensitivity: "base", numeric: true });

/**
 * Joins all customers with their highest-priority proposal for the sales list.
 * Active proposals stay at the top, followed by closed proposals and customers
 * who do not yet have a proposal.
 */
export function buildSalesCustomerList(
  customers: SalesCustomer[],
  proposals: Proposal[],
): SalesCustomerListItem[] {
  const proposalsByCustomer = new Map<string, Proposal[]>();

  for (const proposal of proposals) {
    const existing = proposalsByCustomer.get(proposal.userId) ?? [];
    existing.push(proposal);
    proposalsByCustomer.set(proposal.userId, existing);
  }

  return customers
    .map((customer) => {
      const proposal = [...(proposalsByCustomer.get(customer.id) ?? [])].sort(
        (left, right) =>
          STATUS_ORDER[left.status] - STATUS_ORDER[right.status] ||
          getProposalTimestamp(right) - getProposalTimestamp(left),
      )[0];

      return {
        customer,
        proposal,
        proposalStatus: proposal?.status ?? "none",
      };
    })
    .sort(
      (left, right) =>
        STATUS_ORDER[left.proposalStatus] -
          STATUS_ORDER[right.proposalStatus] ||
        getProposalTimestamp(right.proposal) -
          getProposalTimestamp(left.proposal) ||
        compareText(
          left.customer.name ?? left.customer.email ?? left.customer.id,
          right.customer.name ?? right.customer.email ?? right.customer.id,
        ),
    );
}
