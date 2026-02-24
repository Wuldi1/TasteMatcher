import { useAuth } from "../../contexts/AuthContext";
import { useProposalData } from "../../hooks/useProposalData";
import { Link } from "react-router-dom";
import type { DomainActivitySummaryResponse } from "@tastematcher/common";
import {
  Users,
  ShoppingCart,
  FileText,
  PlusCircle,
  BarChart2,
  CheckCircle,
  Image,
} from "lucide-react";
import "./HomePage.css";
import { useEffect, useState } from "react";
import { apiClient } from "../../utils/api";

export function DealerHomePage() {
  const { user } = useAuth();
  const { proposals, hasSubmittedProposal, loading } = useProposalData(
    user?.domainId!,
    undefined,
    user?.role === "dealer" ? user?.id : undefined,
  );
  const [recentArtworks, setRecentArtworks] = useState<number>(0);
  const [domains, setDomains] = useState<Array<{ id: string; name?: string }>>(
    [],
  );
  const [selectedDomainId, setSelectedDomainId] = useState<string>("");
  const [activitySummary, setActivitySummary] =
    useState<DomainActivitySummaryResponse | null>(null);
  const [activityLoading, setActivityLoading] = useState<boolean>(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const canViewActivitySummary =
    user?.role === "domain_owner" || user?.role === "global_admin";
  const activityDomainId =
    user?.role === "global_admin" ? selectedDomainId : user?.domainId;

  useEffect(() => {
    const fetchRecentArtworks = async () => {
      try {
        const stats = await apiClient.getUserStats();
        setRecentArtworks(stats?.recentlyAdded || 0);
      } catch (err) {
        console.error("Failed to fetch recent artworks stats", err);
      }
    };

    if (user?.domainId) {
      fetchRecentArtworks();
    }
  }, [user?.domainId]);

  useEffect(() => {
    if (user?.role !== "global_admin") return;
    (async () => {
      try {
        const loadedDomains = await apiClient.getAllDomains();
        setDomains(
          loadedDomains.map((domain) => ({ id: domain.id, name: domain.name })),
        );
        setSelectedDomainId((prev) => prev || loadedDomains[0]?.id || "");
      } catch (err) {
        console.error("Failed to load domains for home activity summary", err);
      }
    })();
  }, [user?.role]);

  useEffect(() => {
    if (!canViewActivitySummary || !activityDomainId) {
      setActivitySummary(null);
      return;
    }

    setActivityLoading(true);
    setActivityError(null);
    (async () => {
      try {
        const summary = await apiClient.getDomainActivitySummary(activityDomainId);
        setActivitySummary(summary);
      } catch (err) {
        console.error("Failed to load domain activity summary", err);
        setActivityError("Unable to load activity summary.");
      } finally {
        setActivityLoading(false);
      }
    })();
  }, [canViewActivitySummary, activityDomainId]);

  if (!user) {
    return null;
  }

  // Calculate stats
  const totalProposals = proposals?.length || 0;
  const pendingProposals =
    proposals?.filter((p) => p.status === "submitted").length || 0;
  const acceptedProposals =
    proposals?.filter((p) => p.status === "accepted").length || 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="dealer-home-page p-4 sm:p-6 md:p-8 space-y-8">
      {/* Welcome Header */}
      <header className="bg-gradient-to-r from-green-500 to-blue-500 text-white rounded-lg p-6 shadow-md">
        <h1 className="text-3xl font-bold">Hello, {user.name}!</h1>
        <p className="text-lg mt-2">
          Manage your gallery and customers effectively.
        </p>
      </header>

      {/* Dealer Stats */}
      <section className="space-y-6">
        <h2 className="text-xl font-semibold">Your Stats</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow-md p-4 flex flex-col items-center">
            <BarChart2 className="w-10 h-10 text-blue-500" />
            <h3 className="text-lg font-medium mt-2">{totalProposals}</h3>
            <p className="text-sm text-gray-600">Total Proposals</p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-4 flex flex-col items-center">
            <FileText className="w-10 h-10 text-yellow-500" />
            <h3 className="text-lg font-medium mt-2">{pendingProposals}</h3>
            <p className="text-sm text-gray-600">Pending Proposals</p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-4 flex flex-col items-center">
            <CheckCircle className="w-10 h-10 text-green-500" />
            <h3 className="text-lg font-medium mt-2">{acceptedProposals}</h3>
            <p className="text-sm text-gray-600">Accepted Proposals</p>
          </div>
        </div>
      </section>

      {/* Dealer Actions */}
      <section className="space-y-6">
        <h2 className="text-xl font-semibold">Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <Link
            to="/management"
            className="bg-blue-100 rounded-lg shadow-md p-4 flex flex-col items-center hover:bg-blue-200"
          >
            <Users className="w-10 h-10 text-blue-500" />
            <h3 className="text-lg font-medium mt-2">Manage Users</h3>
            <p className="text-sm text-gray-600 text-center">
              Invite users, manage roles, and track activity.
            </p>
          </Link>
          <Link
            to="/sales"
            className="bg-green-100 rounded-lg shadow-md p-4 flex flex-col items-center hover:bg-green-200"
          >
            <ShoppingCart className="w-10 h-10 text-green-500" />
            <h3 className="text-lg font-medium mt-2">Manage Proposals</h3>
            <p className="text-sm text-gray-600 text-center">
              Create and manage sales proposals for your customers.
            </p>
          </Link>
          <Link
            to="/upload"
            className="bg-yellow-100 rounded-lg shadow-md p-4 flex flex-col items-center hover:bg-yellow-200"
          >
            <PlusCircle className="w-10 h-10 text-yellow-500" />
            <h3 className="text-lg font-medium mt-2">Upload Artworks</h3>
            <p className="text-sm text-gray-600 text-center">
              Add new artworks to your gallery.
            </p>
          </Link>
          {hasSubmittedProposal && (
            <Link
              to="/buying-proposal"
              className="bg-purple-100 rounded-lg shadow-md p-4 flex flex-col items-center hover:bg-purple-200"
            >
              <FileText className="w-10 h-10 text-purple-500" />
              <h3 className="text-lg font-medium mt-2">View Proposals</h3>
              <p className="text-sm text-gray-600 text-center">
                Track customer responses to your proposals.
              </p>
            </Link>
          )}
        </div>
      </section>

      {/* Recent Activity */}
      <section className="space-y-6">
        <h2 className="text-xl font-semibold">Recent Activity</h2>
        <div className="bg-white rounded-lg shadow-md p-4 space-y-4">
          {/* Recent Artworks */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Image className="w-6 h-6 text-blue-500" />
              <span className="text-sm font-medium">New Artworks Uploaded</span>
            </div>
            <span className="text-sm text-gray-600">
              {recentArtworks} in the past week
            </span>
            <Link
              to="/catalog"
              className="text-blue-500 text-sm hover:underline"
            >
              View Catalog
            </Link>
          </div>

          {/* Recent Proposals */}
          {proposals?.length === 0 ? (
            <p className="text-sm text-gray-600">No recent proposals.</p>
          ) : (
            <ul className="space-y-4">
              {proposals?.slice(0, 5).map((proposal) => {
                const approvedCount =
                  proposal.items?.filter((item) => item.status === "approved")
                    .length || 0;
                const rejectedCount =
                  proposal.items?.filter((item) => item.status === "rejected")
                    .length || 0;
                const pendingCount =
                  proposal.items?.filter((item) => item.status === "pending")
                    .length || 0;

                return (
                  <li
                    key={proposal.id}
                    className="flex justify-between items-center"
                  >
                    <div>
                      <h3 className="text-sm font-medium">{`Proposal #${proposal.id}`}</h3>
                      <p className="text-xs text-gray-500">
                        {approvedCount} Approved, {rejectedCount} Rejected,{" "}
                        {pendingCount} Pending
                      </p>
                      <p className="text-xs text-gray-400">
                        Last Updated:{" "}
                        {new Date(proposal.updatedAt || "NaN").toLocaleString()}
                      </p>
                    </div>
                    <Link
                      to={`/sales/${proposal.id}`}
                      className="text-blue-500 text-sm hover:underline"
                    >
                      View
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {canViewActivitySummary && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Last 7 Days Activity</h2>
            {user.role === "global_admin" && (
              <select
                value={selectedDomainId}
                onChange={(e) => setSelectedDomainId(e.target.value)}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                aria-label="Select domain for activity summary"
              >
                {domains.map((domain) => (
                  <option key={domain.id} value={domain.id}>
                    {domain.name || domain.id}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
            {activityLoading && (
              <div className="p-4 text-sm text-gray-600">Loading summary...</div>
            )}
            {!activityLoading && activityError && (
              <div className="p-4 text-sm text-red-600">{activityError}</div>
            )}
            {!activityLoading &&
              !activityError &&
              activitySummary &&
              activitySummary.rows.length === 0 && (
                <div className="p-4 text-sm text-gray-600">
                  No activity events in the past 7 days.
                </div>
              )}
            {!activityLoading &&
              !activityError &&
              activitySummary &&
              activitySummary.rows.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold text-gray-700">
                          User
                        </th>
                        <th className="px-4 py-2 text-left font-semibold text-gray-700">
                          Logins (timestamps)
                        </th>
                        <th className="px-4 py-2 text-left font-semibold text-gray-700">
                          Swipes
                        </th>
                        <th className="px-4 py-2 text-left font-semibold text-gray-700">
                          Proposal updates
                        </th>
                        <th className="px-4 py-2 text-left font-semibold text-gray-700">
                          Likes
                        </th>
                        <th className="px-4 py-2 text-left font-semibold text-gray-700">
                          Dislikes
                        </th>
                        <th className="px-4 py-2 text-left font-semibold text-gray-700">
                          Artwork comments
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {activitySummary.rows.map((row) => {
                        const loginPreview = row.loginTimestamps
                          .slice(0, 3)
                          .map((timestamp) =>
                            new Date(timestamp).toLocaleString(),
                          );
                        const remainingLogins = Math.max(
                          0,
                          row.loginTimestamps.length - loginPreview.length,
                        );
                        return (
                          <tr key={row.userId} className="border-b border-gray-100">
                            <td className="px-4 py-2 align-top">
                              <div className="font-medium text-gray-800">
                                {row.userName || row.userEmail || row.userId}
                              </div>
                              <div className="text-xs text-gray-500">
                                {row.userEmail || row.userId}
                              </div>
                            </td>
                            <td className="px-4 py-2 align-top text-gray-700">
                              {row.loginTimestamps.length === 0 ? (
                                <span className="text-gray-400">—</span>
                              ) : (
                                <div className="space-y-1">
                                  {loginPreview.map((value) => (
                                    <div key={`${row.userId}-${value}`}>{value}</div>
                                  ))}
                                  {remainingLogins > 0 && (
                                    <div className="text-xs text-gray-500">
                                      +{remainingLogins} more
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-2 align-top text-gray-800">
                              {row.swipes}
                            </td>
                            <td className="px-4 py-2 align-top text-gray-800">
                              {row.proposalUpdates}
                            </td>
                            <td className="px-4 py-2 align-top text-gray-800">
                              {row.likes}
                            </td>
                            <td className="px-4 py-2 align-top text-gray-800">
                              {row.dislikes}
                            </td>
                            <td className="px-4 py-2 align-top text-gray-800">
                              {row.artworkComments}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
          </div>
        </section>
      )}
    </div>
  );
}
