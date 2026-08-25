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
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CheckCircle,
  Database,
  Eye,
  FileText,
  Layers,
  Mail,
  MessageSquare,
  Paperclip,
  Send,
  Shield,
  Sparkles,
  Trash2,
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
type ProposalWizardStep =
  | "customer"
  | "works"
  | "curate"
  | "presentation"
  | "review";
type ProposalWizardSource = "ai" | "catalog";
type ViewingRoomPriceVisibility = "show" | "hide" | "per_item";
type ViewingRoomMetadata = {
  title: string;
  introNote: string;
  expiresAt: string;
  priceVisibility: ViewingRoomPriceVisibility;
};
type ExtendedProposalItem = ProposalItem & {
  title?: string;
  filename?: string;
  taggedAt?: number;
};

const compareByLabel = (left: string, right: string) =>
  left.localeCompare(right, undefined, { sensitivity: "base", numeric: true });

const PROPOSAL_WIZARD_STEPS: Array<{
  id: ProposalWizardStep;
  label: string;
}> = [
  { id: "customer", label: "Customer" },
  { id: "works", label: "Select Works" },
  { id: "curate", label: "Curate" },
  { id: "presentation", label: "Presentation" },
  { id: "review", label: "Review & Share" },
];

const DEFAULT_VIEWING_ROOM_METADATA: ViewingRoomMetadata = {
  title: "",
  introNote: "",
  expiresAt: "",
  priceVisibility: "show",
};

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
  const [isProposalWizardOpen, setIsProposalWizardOpen] = useState(false);
  const [proposalWizardStep, setProposalWizardStep] =
    useState<ProposalWizardStep>("customer");
  const [proposalWizardSource, setProposalWizardSource] =
    useState<ProposalWizardSource>("ai");
  const [viewingRoomMetadata, setViewingRoomMetadata] =
    useState<ViewingRoomMetadata>(DEFAULT_VIEWING_ROOM_METADATA);
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

  const proposalMetadataPayload = useMemo<Proposal["metadata"]>(() => {
    const existing = proposalDetails?.metadata ?? {};
    return {
      ...existing,
      viewingRoom: {
        title: viewingRoomMetadata.title.trim(),
        introNote: viewingRoomMetadata.introNote.trim(),
        expiresAt: viewingRoomMetadata.expiresAt
          ? new Date(viewingRoomMetadata.expiresAt).getTime()
          : undefined,
        priceVisibility: viewingRoomMetadata.priceVisibility,
      },
    };
  }, [proposalDetails?.metadata, viewingRoomMetadata]);

  const selectedCustomerLabel = useMemo(() => {
    const selected = userOptions.find(
      (option) => option.value === selectedUserId,
    );
    return selected?.label ?? userDetails?.name ?? userDetails?.email ?? "";
  }, [selectedUserId, userDetails?.email, userDetails?.name, userOptions]);

  const currentWizardStepIndex = PROPOSAL_WIZARD_STEPS.findIndex(
    (step) => step.id === proposalWizardStep,
  );

  const canAdvanceProposalWizard = useMemo(() => {
    if (proposalWizardStep === "customer") {
      return Boolean(effectiveDomainId && selectedUserId);
    }
    if (proposalWizardStep === "works" || proposalWizardStep === "curate") {
      return proposalItem.length > 0;
    }
    if (proposalWizardStep === "presentation") {
      return viewingRoomMetadata.title.trim().length > 0;
    }
    return true;
  }, [
    effectiveDomainId,
    proposalItem.length,
    proposalWizardStep,
    selectedUserId,
    viewingRoomMetadata.title,
  ]);

  const startProposalWizard = () => {
    setProposalWizardStep(selectedUserId ? "works" : "customer");
    setIsProposalWizardOpen(true);
  };

  const closeProposalWizard = () => {
    setIsProposalWizardOpen(false);
  };

  const goToNextProposalWizardStep = () => {
    if (!canAdvanceProposalWizard) return;
    const nextStep = PROPOSAL_WIZARD_STEPS[currentWizardStepIndex + 1];
    if (nextStep) {
      setProposalWizardStep(nextStep.id);
    }
  };

  const goToPreviousProposalWizardStep = () => {
    const previousStep = PROPOSAL_WIZARD_STEPS[currentWizardStepIndex - 1];
    if (previousStep) {
      setProposalWizardStep(previousStep.id);
    }
  };

  const updateViewingRoomMetadata = <Key extends keyof ViewingRoomMetadata>(
    key: Key,
    value: ViewingRoomMetadata[Key],
  ) => {
    setViewingRoomMetadata((current) => ({ ...current, [key]: value }));
  };

  const getProposalItemTitle = (item: ProposalItem) =>
    (item as ExtendedProposalItem).title ?? item.artworkId;

  const getProposalItemImage = (item: ProposalItem) =>
    (item as ExtendedProposalItem).filename;

  const removeProposalItem = (artworkId: string) => {
    setProposalItem((currentDraft) =>
      currentDraft.filter((item) => item.artworkId !== artworkId),
    );
  };

  const moveProposalItem = (artworkId: string, direction: -1 | 1) => {
    setProposalItem((currentDraft) => {
      const currentIndex = currentDraft.findIndex(
        (item) => item.artworkId === artworkId,
      );
      const nextIndex = currentIndex + direction;
      if (
        currentIndex < 0 ||
        nextIndex < 0 ||
        nextIndex >= currentDraft.length
      ) {
        return currentDraft;
      }
      const nextDraft = [...currentDraft];
      const [item] = nextDraft.splice(currentIndex, 1);
      nextDraft.splice(nextIndex, 0, item);
      return nextDraft;
    });
  };

  // Load the correct proposal for the selected user
  useEffect(() => {
    if (!effectiveDomainId || !selectedUserId) {
      setProposalDetails(null);
      setProposalItem([]);
      setViewingRoomMetadata(DEFAULT_VIEWING_ROOM_METADATA);
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
            const viewingRoom = proposal.metadata?.viewingRoom as
              | Partial<{
                  title: string;
                  introNote: string;
                  expiresAt: number;
                  priceVisibility: ViewingRoomPriceVisibility;
                }>
              | undefined;
            setViewingRoomMetadata({
              title: viewingRoom?.title ?? "",
              introNote: viewingRoom?.introNote ?? "",
              expiresAt: viewingRoom?.expiresAt
                ? new Date(viewingRoom.expiresAt).toISOString().slice(0, 10)
                : "",
              priceVisibility: viewingRoom?.priceVisibility ?? "show",
            });
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
            setViewingRoomMetadata(DEFAULT_VIEWING_ROOM_METADATA);
          }
        } else {
          setProposalDetails(null);
          setProposalItem([]);
          setViewingRoomMetadata(DEFAULT_VIEWING_ROOM_METADATA);
        }
      } catch (err) {
        console.error("Failed to load proposals", err);
        setProposalDetails(null);
        setProposalItem([]);
        setViewingRoomMetadata(DEFAULT_VIEWING_ROOM_METADATA);
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

      {isProposalWizardOpen && (
        <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-gray-950/70 p-3 backdrop-blur-sm sm:p-6">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="proposal-wizard-title"
            className="my-2 flex w-full max-w-7xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:my-6"
          >
            <div className="border-b border-gray-200 bg-white px-5 py-4 sm:px-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2
                    id="proposal-wizard-title"
                    className="text-xl font-bold text-gray-900"
                  >
                    Proposal Wizard
                  </h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Build a private viewing room in a guided sales flow.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeProposalWizard}
                  className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
                  aria-label="Close proposal wizard"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <ol className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-5">
                {PROPOSAL_WIZARD_STEPS.map((step, index) => {
                  const isActive = step.id === proposalWizardStep;
                  const isComplete = index < currentWizardStepIndex;
                  return (
                    <li key={step.id}>
                      <button
                        type="button"
                        onClick={() => setProposalWizardStep(step.id)}
                        className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-colors ${
                          isActive
                            ? "border-blue-600 bg-blue-50 text-blue-700"
                            : isComplete
                              ? "border-green-200 bg-green-50 text-green-700"
                              : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                        }`}
                      >
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                            isActive
                              ? "bg-blue-600 text-white"
                              : isComplete
                                ? "bg-green-600 text-white"
                                : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {isComplete ? (
                            <CheckCircle className="h-3.5 w-3.5" />
                          ) : (
                            index + 1
                          )}
                        </span>
                        <span className="truncate">{step.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>

            <div className="max-h-[calc(100dvh-15rem)] flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              {proposalWizardStep === "customer" && (
                <div className="mx-auto max-w-3xl space-y-6">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">
                      Choose the collector
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      The proposal will use this customer&apos;s taste profile,
                      feedback, and existing draft.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {isGlobalAdmin && (
                      <div>
                        <label
                          htmlFor="wizard-sales-domain"
                          className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500"
                        >
                          Domain
                        </label>
                        <SearchableSelect
                          id="wizard-sales-domain"
                          ariaLabel="Select proposal domain"
                          value={selectedDomainId}
                          onChange={setSelectedDomainId}
                          options={domainOptions}
                          placeholder={
                            domainsLoading ? "Loading..." : "Select a domain..."
                          }
                          disabled={domainsLoading}
                          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 leading-tight text-gray-900 transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                      </div>
                    )}

                    <div>
                      <label
                        htmlFor="wizard-sales-user"
                        className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500"
                      >
                        Customer
                      </label>
                      <SearchableSelect
                        id="wizard-sales-user"
                        ariaLabel="Select proposal customer"
                        disabled={selectedDomainId === undefined}
                        value={selectedUserId}
                        onChange={setSelectedUserId}
                        options={userOptions}
                        placeholder="Select a customer..."
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 leading-tight text-gray-900 transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                  </div>

                  {selectedUserId && userDetails && (
                    <div className="grid grid-cols-1 gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:grid-cols-4">
                      <div>
                        <div className="text-xs font-semibold uppercase text-gray-500">
                          Swipes
                        </div>
                        <div className="text-lg font-bold text-gray-900">
                          {totalSwiped}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase text-gray-500">
                          Like Rate
                        </div>
                        <div className="text-lg font-bold text-gray-900">
                          {formatPercent(likeRate)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase text-gray-500">
                          Taste Vector
                        </div>
                        <div className="text-lg font-bold text-gray-900">
                          {preferenceVectorReady ? "Ready" : "Not Ready"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase text-gray-500">
                          Feedback
                        </div>
                        <div className="text-lg font-bold text-gray-900">
                          {feedbackCount}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {proposalWizardStep === "works" && (
                <div className="space-y-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">
                        Select works
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">
                        Add artworks from AI Suggestions or the full catalog.
                        Selected works are carried into the proposal draft.
                      </p>
                    </div>
                    <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1">
                      {(["ai", "catalog"] as const).map((source) => (
                        <button
                          key={source}
                          type="button"
                          onClick={() => setProposalWizardSource(source)}
                          className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                            proposalWizardSource === source
                              ? "bg-white text-blue-700 shadow-sm"
                              : "text-gray-600 hover:text-gray-900"
                          }`}
                        >
                          {source === "ai" ? "AI Suggestions" : "Catalog"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-900">
                    {proposalItem.length} works selected for{" "}
                    {selectedCustomerLabel || "this customer"}.
                  </div>

                  {proposalWizardSource === "ai" ? (
                    <AISuggestionsPage
                      domainId={effectiveDomainId}
                      userId={selectedUserId}
                      proposalItems={proposalArtworkIds}
                      onAddToProposal={handleProposalToggle}
                      readonlyThumbs={true}
                      showOwnerRatedFilter={true}
                    />
                  ) : (
                    <CatalogForUser
                      domainId={effectiveDomainId ?? domainId}
                      userId={selectedUserId ?? ""}
                      preferenceFilter={
                        preferenceFilter === "all"
                          ? undefined
                          : preferenceFilter
                      }
                      onAddToDraft={handleProposalToggle}
                      showPreferenceButtons={false}
                      ownersExperience={true}
                      isInProposal={(artworkId) =>
                        proposalItem.some(
                          (draftItem) => draftItem.artworkId === artworkId,
                        )
                      }
                    />
                  )}
                </div>
              )}

              {proposalWizardStep === "curate" && (
                <div className="mx-auto max-w-4xl space-y-5">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">
                      Curate the order
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Put the strongest works first and remove anything that
                      weakens the room.
                    </p>
                  </div>

                  {proposalItem.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 py-12 text-center text-gray-500">
                      Add at least one artwork before curating.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {proposalItem.map((item, index) => (
                        <div
                          key={item.artworkId}
                          className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-3 shadow-sm"
                        >
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100 text-sm font-semibold text-gray-500">
                            {getProposalItemImage(item) ? (
                              <img
                                src={getProposalItemImage(item)}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              index + 1
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-semibold text-gray-900">
                              {getProposalItemTitle(item)}
                            </div>
                            <div className="text-xs text-gray-500">
                              Position {index + 1}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                moveProposalItem(item.artworkId, -1)
                              }
                              disabled={index === 0}
                              className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                              aria-label="Move artwork up"
                            >
                              <ArrowUp className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                moveProposalItem(item.artworkId, 1)
                              }
                              disabled={index === proposalItem.length - 1}
                              className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                              aria-label="Move artwork down"
                            >
                              <ArrowDown className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeProposalItem(item.artworkId)}
                              className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50"
                              aria-label="Remove artwork"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {proposalWizardStep === "presentation" && (
                <div className="mx-auto max-w-3xl space-y-6">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">
                      Shape the viewing room
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      These details travel with the proposal and will power the
                      private viewing-room presentation.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label
                        htmlFor="viewing-room-title"
                        className="mb-1.5 block text-sm font-semibold text-gray-700"
                      >
                        Proposal title
                      </label>
                      <input
                        id="viewing-room-title"
                        type="text"
                        value={viewingRoomMetadata.title}
                        onChange={(event) =>
                          updateViewingRoomMetadata(
                            "title",
                            event.target.value,
                          )
                        }
                        placeholder="Works selected for you"
                        className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="viewing-room-intro"
                        className="mb-1.5 block text-sm font-semibold text-gray-700"
                      >
                        Intro note
                      </label>
                      <textarea
                        id="viewing-room-intro"
                        value={viewingRoomMetadata.introNote}
                        onChange={(event) =>
                          updateViewingRoomMetadata(
                            "introNote",
                            event.target.value,
                          )
                        }
                        rows={5}
                        placeholder="A short advisor note for the collector."
                        className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <label
                          htmlFor="viewing-room-expiry"
                          className="mb-1.5 block text-sm font-semibold text-gray-700"
                        >
                          Expiry date
                        </label>
                        <input
                          id="viewing-room-expiry"
                          type="date"
                          value={viewingRoomMetadata.expiresAt}
                          onChange={(event) =>
                            updateViewingRoomMetadata(
                              "expiresAt",
                              event.target.value,
                            )
                          }
                          className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="viewing-room-price-visibility"
                          className="mb-1.5 block text-sm font-semibold text-gray-700"
                        >
                          Price visibility
                        </label>
                        <select
                          id="viewing-room-price-visibility"
                          value={viewingRoomMetadata.priceVisibility}
                          onChange={(event) =>
                            updateViewingRoomMetadata(
                              "priceVisibility",
                              event.target.value as ViewingRoomPriceVisibility,
                            )
                          }
                          className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                        >
                          <option value="show">Show prices</option>
                          <option value="hide">Hide prices</option>
                          <option value="per_item">Use per-item settings</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {proposalWizardStep === "review" && selectedUserId && (
                <div className="space-y-5">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">
                          Review & share
                        </h3>
                        <p className="mt-1 text-sm text-gray-500">
                          Finalize prices and notes, then save as draft or
                          publish for the collector.
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                        <Eye className="h-4 w-4 text-blue-600" />
                        {viewingRoomMetadata.title || "Untitled proposal"}
                      </div>
                    </div>
                  </div>
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
                    proposalMetadata={proposalMetadataPayload}
                    onProposalSave={(proposal) => {
                      setProposalDetails(proposal);
                      setIsProposalWizardOpen(false);
                      setActiveTab("proposal");
                    }}
                    onProposalDelete={() => {
                      setProposalDetails(null);
                      setProposalItem([]);
                    }}
                  />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 border-t border-gray-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="text-sm text-gray-500">
                {proposalItem.length} selected works
                {selectedCustomerLabel ? ` for ${selectedCustomerLabel}` : ""}
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={goToPreviousProposalWizardStep}
                  disabled={currentWizardStepIndex <= 0}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
                {proposalWizardStep !== "review" ? (
                  <button
                    type="button"
                    onClick={goToNextProposalWizardStep}
                    disabled={!canAdvanceProposalWizard}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                    <ArrowRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={closeProposalWizard}
                    className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    Continue Editing
                  </button>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Sales Management
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Create proposals, browse catalog, and view AI suggestions.
          </p>
        </div>
        <button
          type="button"
          onClick={startProposalWizard}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          <Sparkles className="h-4 w-4" />
          Create Proposal
        </button>
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
                  proposalMetadata={proposalMetadataPayload}
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
