// ---------- CODEGEN CHECKLIST (must be satisfied) ----------
// 1. Uses TypeScript strict types (no `any`). If any `any` present, justify with comment.
// 2. Uses shared `common` types for API contracts where applicable.
// 3. Includes unit tests written first (test file present next to implementation).
// 4. Adds structured logging at function entry/exit and on errors.
// 5. Adds at least one assertion or guard for input validation.
// 6. No duplicate logic — reuse existing service/util or extract shared module.
// 7. Adds or updates README or docs if public API changes.
// 8. Adds meaningful JSDoc for exported functions/classes.
// 9. CI-friendly: code passes lint, typecheck, and tests locally.
// -----------------------------------------------------------
import {
  Artwork,
  ArtworkStats,
  Proposal,
  ProposalItem,
  User,
} from "@tastematcher/common";
import {
  Activity,
  Database,
  FileText,
  Layers,
  Mail,
  MessageSquare,
  Paperclip,
  Send,
  Shield,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import CatalogForUser from "../components/Catalog/CatalogForUser";
import SaleProposal from "../components/SaleProposal";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "../components/inputs/SearchableSelect";
import {
  AppInlineLoader,
  AppLoadingState,
} from "../components/Loading/AppLoadingState";
import { useAuth } from "../contexts/AuthContext";
import { apiClient } from "../utils/api";
import { AISuggestionsPage } from "./AISuggestions/AISuggestionsPage";

type UserItem = { id: string; name?: string; email?: string };
const compareByLabel = (left: string, right: string) =>
  left.localeCompare(right, undefined, { sensitivity: "base", numeric: true });

// Helper component for image slideshow
const ImageSlideshow = ({
  images,
  onImageClick,
}: {
  images: string[];
  onImageClick: (src: string) => void;
}) => {
  if (!images || images.length === 0)
    return (
      <div className="text-gray-400 italic text-sm">No images uploaded</div>
    );

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 snap-x scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
      {images.map((src, idx) => (
        <div
          key={idx}
          className="flex-shrink-0 w-40 h-40 rounded-lg overflow-hidden border border-gray-200 snap-start cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all"
          onClick={() => onImageClick(src)}
        >
          <img
            src={src}
            alt={`Reference ${idx + 1}`}
            className="w-full h-full object-cover"
          />
        </div>
      ))}
    </div>
  );
};

export default function SalesPage() {
  const { user } = useAuth();
  const domainId = user?.domainId ?? "default";
  const isGlobalAdmin = user?.role === "global_admin";
  const [searchParams, setSearchParams] = useSearchParams();

  // Domains (only used for global_admin)
  const [domains, setDomains] = useState<
    { id: string; name?: string; adminEmail?: string }[]
  >([]);
  const [selectedDomainId, setSelectedDomainId] = useState<string | undefined>(
    isGlobalAdmin ? undefined : domainId,
  );
  const [domainsLoading, setDomainsLoading] = useState<boolean>(false);

  // Effective domain used for domain-scoped APIs in this page:
  // - global_admin: use selectedDomainId (must choose a domain)
  // - domain_owner / dealer: use their own domainId (no special domain dropdown)
  const effectiveDomainId = isGlobalAdmin ? selectedDomainId : domainId;

  const [users, setUsers] = useState<UserItem[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>(
    undefined,
  );
  const domainOptions = useMemo<SearchableSelectOption[]>(
    () =>
      domains
        .map((domain) => ({
          value: domain.id,
          label: domain.name ?? domain.adminEmail ?? domain.id,
        }))
        .sort((a, b) => compareByLabel(a.label, b.label)),
    [domains],
  );
  const userOptions = useMemo<SearchableSelectOption[]>(
    () =>
      users
        .map((account) => ({
          value: account.id,
          label: account.email
            ? `${account.name ?? account.email} (${account.email})`
            : account.name ?? account.id,
        }))
        .sort((a, b) => compareByLabel(a.label, b.label)),
    [users],
  );
  const [activeTab, setActiveTab] = useState<
    "details" | "catalog" | "ai" | "proposal"
  >("details");
  const [preferenceFilter, setPreferenceFilter] = useState<
    "all" | "liked" | "disliked"
  >("all");

  // New: fetched user details + stats
  const [userDetails, setUserDetails] = useState<User | null>(null);
  const [userDetailsLoading, setUserDetailsLoading] = useState(false);
  const [userDetailsError, setUserDetailsError] = useState<string | null>(null);

  const [stats, setStats] = useState<ArtworkStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  // Chat state
  const [newChatComment, setNewChatComment] = useState("");
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [isUploadingChatAttachment, setIsUploadingChatAttachment] =
    useState(false);
  const chatFileInputRef = useRef<HTMLInputElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Lightbox state
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // New: proposal draft state
  const [proposalItem, setProposalItem] = useState<ProposalItem[]>([]);
  const [proposalDetails, setProposalDetails] = useState<Proposal | null>(null); // Store proposal metadata
  const queryDomainId = searchParams.get("domainId") || undefined;
  const queryUserId = searchParams.get("userId") || undefined;

  const totalArtworks =
    (stats as { totalArtworks?: number; total?: number } | null)
      ?.totalArtworks ??
    (stats as { totalArtworks?: number; total?: number } | null)?.total ??
    0;
  const totalSwiped = stats?.totalSwiped ?? 0;
  const totalLikes = stats?.totalLikes ?? 0;
  const totalDislikes = stats?.totalDislikes ?? 0;
  const likeRate = totalSwiped > 0 ? totalLikes / totalSwiped : null;
  const dislikeRate = totalSwiped > 0 ? totalDislikes / totalSwiped : null;
  const swipeCoverage = totalArtworks > 0 ? totalSwiped / totalArtworks : null;
  const aestheticImages =
    userDetails?.personalQuestionnaire?.aestheticAdmiration?.imageUrls
      ?.length ?? 0;
  const collectionImages =
    userDetails?.personalQuestionnaire?.personalCollection?.imageUrls?.length ??
    0;
  const sharedImages = userDetails?.sharedCollectionUploads?.length ?? 0;
  const preferenceImages = aestheticImages + collectionImages + sharedImages;
  const preferenceVectorReady =
    Array.isArray(userDetails?.preferenceVector) &&
    userDetails.preferenceVector.some((value) => value !== 0);
  const feedbackCount = userDetails?.comments?.length ?? 0;
  const lastCommentAt =
    userDetails?.comments && userDetails.comments.length > 0
      ? Math.max(...userDetails.comments.map((c) => c.createdAt))
      : null;

  const syncQueryParams = useCallback(
    (nextDomainId?: string, nextUserId?: string) => {
      const nextParams = new URLSearchParams();
      if (isGlobalAdmin && nextDomainId)
        nextParams.set("domainId", nextDomainId);
      if (nextUserId) nextParams.set("userId", nextUserId);

      const currentString = searchParams.toString();
      const nextString = nextParams.toString();
      if (nextString !== currentString) {
        setSearchParams(nextParams);
      }
    },
    [isGlobalAdmin, searchParams, setSearchParams],
  );

  // Load the correct proposal for the selected user
  useEffect(() => {
    if (!effectiveDomainId || !selectedUserId) {
      setProposalDetails(null);
      setProposalItem([]);
      return;
    }

    (async () => {
      try {
        const proposals = await apiClient.listProposals(
          effectiveDomainId,
          selectedUserId,
        );
        if (proposals.length > 0) {
          const proposal = proposals.find((p) => p.userId === selectedUserId);

          if (proposal) {
            setProposalDetails(proposal);
            setProposalItem(
              proposal.items.map((item) => ({
                artworkId: item.artworkId,
                comments: item.comments ?? [],
                status: item.status ?? "pending",
                askedPrice: item.askedPrice ?? 0,
                askedMaxPrice: item.askedMaxPrice,
              })),
            );
          } else {
            setProposalDetails(null);
            setProposalItem([]);
          }
        } else {
          setProposalDetails(null);
          setProposalItem([]);
        }
      } catch (err) {
        console.error("Failed to load proposals", err);
        setProposalDetails(null);
        setProposalItem([]);
      }
    })();
  }, [effectiveDomainId, selectedUserId]);

  useEffect(() => {
    if (!isGlobalAdmin) return;
    setDomainsLoading(true);
    (async () => {
      try {
        const domainsResponse = await apiClient.getAllDomains();
        const sortedDomains = domainsResponse
          .map((domain) => ({
            id: domain.id,
            name: domain.name,
            adminEmail: domain.adminEmail,
          }))
          .sort((a, b) =>
            compareByLabel(
              a.name ?? a.adminEmail ?? a.id,
              b.name ?? b.adminEmail ?? b.id,
            ),
          );
        setDomains(sortedDomains);
        // If none selected, default to first (functional update avoids stale closure overriding explicit selection)
        if (sortedDomains.length > 0) {
          setSelectedDomainId((current) => current ?? sortedDomains[0].id);
        }
      } catch (err) {
        console.error("Failed to load domains for sales page", err);
        setDomains([]);
      } finally {
        setDomainsLoading(false);
      }
    })();
  }, [isGlobalAdmin]);

  // Load users:
  // - global_admin: require selectedDomainId and call /users/domain/:domainId
  // - others: call /users (server infers domain from JWT)
  useEffect(() => {
    (async () => {
      try {
        if (isGlobalAdmin) {
          if (!selectedDomainId) {
            setUsers([]);
            return;
          }
          const usersResponse = await apiClient.getAllUsers(selectedDomainId);
          const sortedCustomers = usersResponse
            .filter((userItem) => userItem.role === "customer")
            .map((userItem) => ({
              id: userItem.id,
              name: userItem.name ?? userItem.email,
              email: userItem.email,
            }))
            .sort((a, b) => compareByLabel(a.name ?? a.id, b.name ?? b.id));
          setUsers(sortedCustomers);
        } else {
          // domain_owner / dealer: call without domainId so backend uses caller's domain
          const usersResponse = await apiClient.getAllUsers();
          const sortedCustomers = usersResponse
            .filter((userItem) => userItem.role === "customer")
            .map((userItem) => ({
              id: userItem.id,
              name: userItem.name ?? userItem.email,
              email: userItem.email,
            }))
            .sort((a, b) => compareByLabel(a.name ?? a.id, b.name ?? b.id));
          setUsers(sortedCustomers);
        }
      } catch (err) {
        console.error("Failed to load users for sales page", err);
        setUsers([]);
      }
    })();
  }, [isGlobalAdmin, selectedDomainId, domainId]);

  // Clear selected user and proposal draft when domain selection changes (prevent cross-domain drafts)
  useEffect(() => {
    setSelectedUserId(undefined);
    setProposalItem([]);
  }, [selectedDomainId]);

  // Deep link support: populate state from query params
  useEffect(() => {
    if (queryUserId) {
      setSelectedUserId(queryUserId);
      setActiveTab("proposal");
    }
    if (isGlobalAdmin && queryDomainId) {
      setSelectedDomainId(queryDomainId);
    }
  }, [queryUserId, queryDomainId, isGlobalAdmin]);

  // Keep query params in sync with selections
  useEffect(() => {
    syncQueryParams(selectedDomainId, selectedUserId);
  }, [selectedDomainId, selectedUserId, syncQueryParams]);

  const refreshSelectedUserDetails = useCallback(async () => {
    if (!selectedUserId) return null;
    if (isGlobalAdmin && !selectedDomainId) return null;
    try {
      const domainToRequest = isGlobalAdmin ? selectedDomainId : undefined;
      const userResponse = await apiClient.getUser(
        selectedUserId,
        domainToRequest,
      );
      setUserDetails(userResponse);
      setUserDetailsError(null);
      return userResponse;
    } catch (err) {
      console.error("Failed to load user details", err);
      setUserDetailsError("Unable to load user details");
      setUserDetails(null);
      throw err;
    }
  }, [selectedUserId, isGlobalAdmin, selectedDomainId]);

  // Fetch selected user details and domain stats when selection changes
  useEffect(() => {
    if (!selectedUserId) {
      setUserDetails(null);
      setUserDetailsError(null);
      return;
    }

    setUserDetailsLoading(true);
    refreshSelectedUserDetails()
      .catch(() => undefined)
      .finally(() => setUserDetailsLoading(false));
  }, [selectedUserId, refreshSelectedUserDetails]);

  // Scroll chat container to bottom when comments update
  useEffect(() => {
    if (activeTab === "details" && userDetails?.comments) {
      const chatContainer = chatScrollRef.current;
      if (chatContainer) {
        chatContainer.scrollTo({
          top: chatContainer.scrollHeight,
          behavior: "smooth",
        });
      }
    }
  }, [userDetails?.comments, activeTab]);

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatComment.trim() || !selectedUserId) return;

    setIsSendingChat(true);
    try {
      const domainToRequest = isGlobalAdmin ? selectedDomainId : undefined;
      await apiClient.addUserComment(
        selectedUserId,
        newChatComment,
        domainToRequest,
      );
      setNewChatComment("");
      await refreshSelectedUserDetails();
    } catch (error) {
      console.error("Failed to send chat message", error);
    } finally {
      setIsSendingChat(false);
    }
  };

  const uploadChatAttachment = async (file: File) => {
    if (!selectedUserId) return;
    const previousUrls = userDetails?.sharedCollectionUploads ?? [];
    setIsUploadingChatAttachment(true);
    try {
      await apiClient.vectorizePreferenceImage(file, {
        section: "shared_gallery",
      });
      const updatedUser = await refreshSelectedUserDetails();
      const newUrls = updatedUser?.sharedCollectionUploads ?? [];
      const attachmentUrl =
        newUrls.find((url) => !previousUrls.includes(url)) ||
        newUrls[newUrls.length - 1];

      if (attachmentUrl) {
        const domainToRequest = isGlobalAdmin ? selectedDomainId : undefined;
        await apiClient.addUserComment(
          selectedUserId,
          attachmentUrl,
          domainToRequest,
        );
        await refreshSelectedUserDetails();
      }
    } catch (error) {
      console.error("Failed to upload chat attachment", error);
    } finally {
      setIsUploadingChatAttachment(false);
    }
  };

  const handleChatFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      void uploadChatAttachment(file);
    }
    event.target.value = "";
  };

  const handleChatPaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    if (event.clipboardData.files.length > 0) {
      const file = event.clipboardData.files[0];
      event.preventDefault();
      void uploadChatAttachment(file);
    }
  };

  useEffect(() => {
    // Use effectiveDomainId (selectedDomainId for admins, user's domain otherwise)
    if (!effectiveDomainId) {
      setStats(null);
      setStatsError(null);
      return;
    }
    (async () => {
      setStatsLoading(true);
      setStatsError(null);
      try {
        const statsResponse = await apiClient.getArtworkStats(
          effectiveDomainId,
          { userId: selectedUserId },
        );
        setStats(statsResponse);
      } catch (err) {
        console.error("Failed to load artwork stats", err);
        setStatsError("Unable to load stats");
        setStats(null);
      } finally {
        setStatsLoading(false);
      }
    })();
  }, [effectiveDomainId, selectedUserId]);

  // Helper: render onboarding answers in readable form
  function renderQuestionnaire(q: Record<string, unknown>) {
    // Render as sections if nested, otherwise key/value rows
    return Object.entries(q).map(([k, v]) => {
      // Handle completedAt specifically
      if (k === "completedAt" && typeof v === "number") {
        return (
          <div
            key={k}
            className="mb-4 border-b border-gray-100 pb-4 last:border-0 last:pb-0"
          >
            <div className="text-xs font-medium text-gray-500 mb-1">
              {humanize(k)}
            </div>
            <div className="text-sm text-gray-900 font-medium">
              {new Date(v).toLocaleString()}
            </div>
          </div>
        );
      }

      if (v && typeof v === "object" && !Array.isArray(v)) {
        const section = v as Record<string, unknown>;
        return (
          <div
            key={k}
            className="mb-6 border-b border-gray-100 pb-4 last:border-0 last:pb-0"
          >
            <h4 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wide">
              {humanize(k)}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Object.entries(section).map(([sk, sv]) => {
                // Handle imageUrls specifically
                if (sk === "imageUrls" && Array.isArray(sv)) {
                  return (
                    <div key={sk} className="text-sm sm:col-span-2">
                      <div className="text-xs font-medium text-gray-500 mb-2">
                        {humanize(sk)}
                      </div>
                      <ImageSlideshow
                        images={sv as string[]}
                        onImageClick={setLightboxImage}
                      />
                    </div>
                  );
                }
                return (
                  <div key={sk} className="text-sm">
                    <div className="text-xs font-medium text-gray-500 mb-1">
                      {humanize(sk)}
                    </div>
                    <div className="text-sm text-gray-900 font-medium">
                      {formatValue(sv)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      }

      // primitive or array
      return (
        <div
          key={k}
          className="mb-4 border-b border-gray-100 pb-4 last:border-0 last:pb-0"
        >
          <div className="text-xs font-medium text-gray-500 mb-1">
            {humanize(k)}
          </div>
          <div className="text-sm text-gray-900 font-medium">
            {formatValue(v)}
          </div>
        </div>
      );
    });
  }

  function humanize(key: string) {
    return key
      .replace(/([A-Z])/g, " $1")
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function formatValue(v: unknown) {
    if (v == null) return "-";
    if (Array.isArray(v)) return v.join(", ");
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  }

  function formatPercent(value: number | null) {
    if (value == null || Number.isNaN(value)) return "—";
    return `${(value * 100).toFixed(1)}%`;
  }

  // Proposal items as artwork IDs for easy lookup
  const proposalArtworkIds = proposalItem.map((item) => item.artworkId);

  // Add/remove artwork from proposal
  const handleProposalToggle = (artwork: Artwork) => {
    setProposalItem((currentDraft) => {
      const isAlreadyInProposal = currentDraft.some(
        (draftItem) => draftItem.artworkId === artwork.id,
      );
      if (isAlreadyInProposal) {
        // Remove from proposal
        return currentDraft.filter(
          (draftItem) => draftItem.artworkId !== artwork.id,
        );
      } else {
        // Add to proposal
        return [
          {
            artworkId: artwork.id,
            comments: [],
            status: "pending",
            taggedAt: Date.now(),
            title: artwork.title,
            filename: artwork.filename,
            askedPrice: 0,
            askedMaxPrice: undefined,
          },
          ...currentDraft,
        ];
      }
    });
  };

  // --- New styled tab bar and enhanced Details panel UI ---
  return (
    <div className="px-8">
      {/* Lightbox Modal */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/90 p-3 backdrop-blur-sm transition-opacity duration-300 sm:items-center sm:p-4"
          onClick={() => setLightboxImage(null)}
        >
          <button
            className="absolute top-4 right-4 p-2 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors"
            aria-label="Close"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={lightboxImage}
            alt="Full size reference"
            className="max-w-full max-h-[90dvh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Sales Management</h1>
        <p className="text-sm text-gray-500 mt-1">
          Create proposals, browse catalog, and view AI suggestions.
        </p>
      </header>

      <div className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
        {/* If global admin, allow choosing domain first */}
        {isGlobalAdmin && (
          <div>
            <label
              htmlFor="sales-domain"
              className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5"
            >
              Domain
            </label>
            <SearchableSelect
              id="sales-domain"
              ariaLabel="Select domain"
              value={selectedDomainId}
              onChange={setSelectedDomainId}
              options={domainOptions}
              placeholder={domainsLoading ? "Loading..." : "Select a domain..."}
              disabled={domainsLoading}
              className="w-full bg-white border border-gray-200 text-gray-900 py-3 px-4 rounded-xl leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>
        )}

        <div>
          <label
            htmlFor="sales-user"
            className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5"
          >
            Customer
          </label>
          <SearchableSelect
            id="sales-user"
            ariaLabel="Select user"
            disabled={selectedDomainId === undefined}
            value={selectedUserId}
            onChange={setSelectedUserId}
            options={userOptions}
            placeholder="Select a customer..."
            className="w-full bg-white border border-gray-200 text-gray-900 py-3 px-4 rounded-xl leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>
      </div>

      {/* Tab bar */}
      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav
            className="-mb-px flex space-x-8 overflow-x-auto scrollbar-hide"
            aria-label="Tabs"
          >
            {[
              { id: "details", label: "Overview" },
              { id: "catalog", label: "Catalog" },
              { id: "ai", label: "AI Suggestions" },
              { id: "proposal", label: "Proposal" },
            ].map((t) => {
              const active = activeTab === (t.id as any);
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id as any)}
                  className={`
                                        whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors
                                        ${
                                          active
                                            ? "border-blue-500 text-blue-600"
                                            : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                        }
                                    `}
                >
                  {t.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="mt-6">
          {/* Details Panel */}
          <div
            role="tabpanel"
            id="panel-details"
            aria-labelledby="tab-details"
            hidden={activeTab !== "details"}
            className="animate-in fade-in duration-300"
          >
            {!selectedUserId && (
              <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                <p className="text-gray-500">
                  Please select a customer above to view their details.
                </p>
              </div>
            )}

            {selectedUserId && userDetailsLoading && (
              <AppLoadingState
                message="Loading customer details..."
                iconSize="sm"
              />
            )}

            {selectedUserId && userDetailsError && (
              <div className="text-sm text-red-600">{userDetailsError}</div>
            )}

            {selectedUserId && userDetails && (
              <div className="space-y-8">
                {/* Profile Header Card */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col md:flex-row items-start md:items-center gap-6">
                  <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center text-3xl font-bold text-blue-600 shrink-0">
                    {userDetails.name
                      ? userDetails.name
                          .split(" ")
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join("")
                      : (userDetails.email?.[0] ?? "U").toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold text-gray-900">
                      {userDetails.name ?? "Unnamed User"}
                    </h2>
                    <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-gray-500">
                      <div className="flex items-center gap-1.5">
                        <Mail className="w-4 h-4" />
                        {userDetails.email}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Shield className="w-4 h-4" />
                        <span className="capitalize">{userDetails.role}</span>
                      </div>
                    </div>
                  </div>
                  <div className="px-4 py-2 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">
                      Onboarding
                    </div>
                    <div className="text-sm font-medium text-gray-900 mt-1 capitalize">
                      {(userDetails as any).onboardingStatus ?? "Unknown"}
                    </div>
                  </div>
                </div>

                {/* Stats Grid */}
                {statsLoading && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => (
                      <div
                        key={i}
                        className="bg-gray-50 h-24 rounded-xl border border-gray-100 animate-pulse"
                      />
                    ))}
                  </div>
                )}

                {statsError && (
                  <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm">
                    {statsError}
                  </div>
                )}

                {stats && !statsLoading && (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
                      <div className="p-3 bg-purple-50 rounded-lg text-purple-600">
                        <Layers className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 font-medium uppercase">
                          Total Artworks
                        </div>
                        <div className="text-xl font-bold text-gray-900">
                          {totalArtworks || "—"}
                        </div>
                      </div>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
                      <div className="p-3 bg-blue-50 rounded-lg text-blue-600">
                        <Activity className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 font-medium uppercase">
                          Total Swipes
                        </div>
                        <div className="text-xl font-bold text-gray-900">
                          {totalSwiped || "—"}
                        </div>
                      </div>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
                      <div className="p-3 bg-green-50 rounded-lg text-green-600">
                        <Database className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 font-medium uppercase">
                          Like Rate
                        </div>
                        <div className="text-xl font-bold text-gray-900">
                          {formatPercent(likeRate)}
                        </div>
                      </div>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
                      <div className="p-3 bg-orange-50 rounded-lg text-orange-600">
                        <MessageSquare className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 font-medium uppercase">
                          Feedback
                        </div>
                        <div className="text-xl font-bold text-gray-900">
                          {feedbackCount || "—"}
                        </div>
                      </div>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
                      <div className="p-3 bg-cyan-50 rounded-lg text-cyan-600">
                        <Paperclip className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 font-medium uppercase">
                          Preference Images
                        </div>
                        <div className="text-xl font-bold text-gray-900">
                          {preferenceImages || "—"}
                        </div>
                      </div>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
                      <div className="p-3 bg-emerald-50 rounded-lg text-emerald-600">
                        <Database className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 font-medium uppercase">
                          Taste Vector
                        </div>
                        <div className="text-xl font-bold text-gray-900">
                          {preferenceVectorReady ? "Ready" : "Not Ready"}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Questionnaire Section */}
                  <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                    <div className="flex items-center gap-2 mb-6 pb-4 border-b border-gray-100">
                      <FileText className="w-5 h-5 text-gray-400" />
                      <h3 className="text-lg font-bold text-gray-900">
                        Onboarding Questionnaire
                      </h3>
                    </div>
                    <div className="space-y-6">
                      {(userDetails as any).personalQuestionnaire ? (
                        renderQuestionnaire(
                          (userDetails as any).personalQuestionnaire as Record<
                            string,
                            unknown
                          >,
                        )
                      ) : (
                        <div className="text-gray-500 italic">
                          No questionnaire data available.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Technical / Raw Stats Section */}
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 h-fit">
                    <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4">
                      System Data
                    </h3>
                    <div className="space-y-3">
                      {[
                        { label: "User ID", value: userDetails?.id },
                        { label: "Domain ID", value: userDetails?.domainId },
                        { label: "Role", value: userDetails?.role },
                        { label: "Status", value: userDetails?.status },
                        {
                          label: "Onboarding Status",
                          value: userDetails?.onboardingStatus,
                        },
                        {
                          label: "User Created",
                          value: userDetails?.createdAt
                            ? new Date(userDetails.createdAt).toLocaleString()
                            : "—",
                        },
                        {
                          label: "User Updated",
                          value: userDetails?.updatedAt
                            ? new Date(userDetails.updatedAt).toLocaleString()
                            : "—",
                        },
                        {
                          label: "Questionnaire Completed",
                          value: userDetails?.personalQuestionnaire?.completedAt
                            ? new Date(
                                userDetails.personalQuestionnaire.completedAt,
                              ).toLocaleString()
                            : "—",
                        },
                        {
                          label: "Total Artworks",
                          value: totalArtworks,
                        },
                        {
                          label: "Total Swiped",
                          value: totalSwiped,
                        },
                        {
                          label: "Total Likes",
                          value: totalLikes,
                        },
                        {
                          label: "Total Dislikes",
                          value: totalDislikes,
                        },
                        {
                          label: "Like Rate",
                          value: formatPercent(likeRate),
                        },
                        {
                          label: "Dislike Rate",
                          value: formatPercent(dislikeRate),
                        },
                        {
                          label: "Swipe Coverage",
                          value: formatPercent(swipeCoverage),
                        },
                        {
                          label: "Preference Images",
                          value: preferenceImages,
                        },
                        {
                          label: "Feedback Comments",
                          value: feedbackCount,
                        },
                        {
                          label: "Last Comment",
                          value: lastCommentAt
                            ? new Date(lastCommentAt).toLocaleString()
                            : "—",
                        },
                        {
                          label: "Taste Vector",
                          value: preferenceVectorReady ? "Ready" : "Not Ready",
                        },
                      ].map(({ label, value }) => (
                        <div
                          key={label}
                          className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0"
                        >
                          <span className="text-xs text-gray-500 font-medium">
                            {label}
                          </span>
                          <span className="text-sm font-mono text-gray-700">
                            {formatValue(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Chat Section */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-[500px]">
                  <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-blue-500" />
                    <span className="font-medium text-gray-700">
                      Chat with Customer
                    </span>
                  </div>

                  <div
                    ref={chatScrollRef}
                    className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/30"
                  >
                    {!userDetails.comments ||
                    userDetails.comments.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-gray-400">
                        <MessageSquare className="w-12 h-12 mb-2 opacity-20" />
                        <p>No messages yet.</p>
                      </div>
                    ) : (
                      userDetails.comments.map((comment, idx) => {
                        const isCustomer =
                          comment.author === userDetails.name ||
                          comment.author === userDetails.email;
                        const trimmedText = comment.text?.trim() || "";
                        const isImageMessage = /^https?:\/\//i.test(
                          trimmedText,
                        );

                        return (
                          <div
                            key={idx}
                            className={`flex ${!isCustomer ? "justify-end" : "justify-start"}`}
                          >
                            <div
                              className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                                !isCustomer
                                  ? "bg-blue-600 text-white rounded-br-none"
                                  : "bg-white border border-gray-200 text-gray-800 rounded-bl-none shadow-sm"
                              }`}
                            >
                              <div
                                className={`text-xs mb-1 ${!isCustomer ? "text-blue-100" : "text-gray-500"}`}
                              >
                                {!isCustomer ? "You" : comment.author} •{" "}
                                {new Date(
                                  comment.createdAt,
                                ).toLocaleDateString()}
                              </div>
                              {isImageMessage ? (
                                <a
                                  href={trimmedText}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block"
                                >
                                  <div
                                    className={`rounded-xl overflow-hidden border ${!isCustomer ? "border-white/30 bg-white/10" : "border-gray-200 bg-gray-50"}`}
                                  >
                                    <img
                                      src={trimmedText}
                                      alt="Shared attachment"
                                      className="w-full max-w-[220px] h-36 object-cover"
                                    />
                                  </div>
                                  <span
                                    className={`mt-1 block text-[10px] uppercase tracking-wide ${!isCustomer ? "text-blue-100" : "text-gray-400"}`}
                                  >
                                    Tap to open full size
                                  </span>
                                </a>
                              ) : (
                                <p className="text-sm whitespace-pre-wrap break-words">
                                  {comment.text}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="p-4 bg-white border-t border-gray-100">
                    <form
                      onSubmit={handleSendChat}
                      className="flex gap-2 items-center"
                    >
                      <input
                        ref={chatFileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={handleChatFileChange}
                      />
                      <button
                        type="button"
                        onClick={() => chatFileInputRef.current?.click()}
                        className="text-gray-500 hover:text-blue-600 transition-colors p-2 rounded-full hover:bg-blue-50"
                        title="Attach an image"
                        disabled={isSendingChat || isUploadingChatAttachment}
                      >
                        <Paperclip className="w-5 h-5" />
                      </button>
                      <input
                        type="text"
                        value={newChatComment}
                        onChange={(e) => setNewChatComment(e.target.value)}
                        placeholder="Type a message to the customer..."
                        className="flex-1 border border-gray-300 rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        disabled={isSendingChat || isUploadingChatAttachment}
                        onPaste={handleChatPaste}
                      />
                      <button
                        type="submit"
                        disabled={
                          !newChatComment.trim() ||
                          isSendingChat ||
                          isUploadingChatAttachment
                        }
                        className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {isSendingChat ? (
                          <AppInlineLoader size="sm" theme="light" />
                        ) : (
                          <Send className="w-5 h-5" />
                        )}
                      </button>
                      {isUploadingChatAttachment && (
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <AppInlineLoader size="xs" label="Uploading..." />
                        </span>
                      )}
                    </form>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Catalog Panel */}
          <div
            role="tabpanel"
            id="panel-catalog"
            aria-labelledby="tab-catalog"
            hidden={activeTab !== "catalog"}
          >
            {!selectedUserId && (
              <div>Please select a user to view the catalog.</div>
            )}
            {selectedUserId && (
              <div>
                <div className="mb-4">
                  <span className="text-sm font-medium text-gray-700 mr-3">
                    Filter by feedback
                  </span>
                  <div className="inline-flex items-center gap-2">
                    {(["all", "liked", "disliked"] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setPreferenceFilter(option)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                          preferenceFilter === option
                            ? "bg-blue-600 text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        {option === "all"
                          ? "All"
                          : option === "liked"
                            ? "Liked"
                            : "Disliked"}
                      </button>
                    ))}
                  </div>
                </div>

                <CatalogForUser
                  domainId={effectiveDomainId ?? domainId}
                  userId={selectedUserId}
                  preferenceFilter={
                    preferenceFilter === "all" ? undefined : preferenceFilter
                  }
                  onAddToDraft={(artwork) => {
                    setProposalItem((currentDraft) => {
                      const isAlreadyInProposal = currentDraft.some(
                        (draftItem) => draftItem.artworkId === artwork.id,
                      );

                      if (isAlreadyInProposal) {
                        // Remove from proposal
                        return currentDraft.filter(
                          (draftItem) => draftItem.artworkId !== artwork.id,
                        );
                      } else {
                        // Add to proposal
                        return [
                          {
                            artworkId: artwork.id,
                            comments: [],
                            status: "pending",
                            taggedAt: Date.now(),
                            title: artwork.title,
                            filename: artwork.filename,
                            askedPrice: 0,
                            askedMaxPrice: undefined,
                          },
                          ...currentDraft,
                        ];
                      }
                    });
                  }}
                  showPreferenceButtons={false}
                  ownersExperience={true}
                  isInProposal={(artworkId) =>
                    proposalItem.some(
                      (draftItem) => draftItem.artworkId === artworkId,
                    )
                  }
                />
              </div>
            )}
          </div>

          {/* AI Panel (unchanged) */}
          <div
            role="tabpanel"
            id="panel-ai"
            aria-labelledby="tab-ai"
            hidden={activeTab !== "ai"}
          >
            {!selectedUserId && (
              <div>Please select a user to see AI suggestions.</div>
            )}
            {selectedUserId && (
              <AISuggestionsPage
                domainId={effectiveDomainId}
                userId={selectedUserId}
                proposalItems={proposalArtworkIds}
                onAddToProposal={handleProposalToggle}
                readonlyThumbs={true}
                showOwnerRatedFilter={true}
              />
            )}
          </div>

          {/* Proposal Panel */}
          <div
            role="tabpanel"
            id="panel-proposal"
            aria-labelledby="tab-proposal"
            hidden={activeTab !== "proposal"}
          >
            {!selectedUserId && (
              <div>Please select a user to manage proposals.</div>
            )}
            {selectedUserId && (
              <div>
                {proposalDetails && (
                  <div className="mb-4 p-4 bg-gray-50 border rounded shadow-sm">
                    <h3 className="text-lg font-semibold">Proposal Details</h3>
                    <p className="text-sm text-gray-600">
                      <strong>Status:</strong> {proposalDetails.status}
                    </p>
                    <p className="text-sm text-gray-600">
                      <strong>Created At:</strong>{" "}
                      {new Date(proposalDetails.createdAt).toLocaleString()}
                    </p>
                    {proposalDetails.updatedAt && (
                      <p className="text-sm text-gray-600">
                        <strong>Last Updated:</strong>{" "}
                        {new Date(proposalDetails.updatedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}

                <SaleProposal
                  domainId={effectiveDomainId ?? domainId}
                  dealerEmail={user?.email}
                  userId={selectedUserId}
                  userName={
                    userDetails?.name ?? userDetails?.email ?? "Specialist"
                  }
                  draftItems={proposalItem}
                  onDraftChange={(items: ProposalItem[]) =>
                    setProposalItem(items)
                  }
                  proposalId={proposalDetails?.id}
                  onProposalSave={(proposal) => setProposalDetails(proposal)}
                  onProposalDelete={() => {
                    setProposalDetails(null);
                    setProposalItem([]);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
