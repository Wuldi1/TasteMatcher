// ---------- CODEGEN CHECKLIST (must be satisfied) ----------
// 1. Uses TypeScript strict types (no `any`).
// 2. Uses shared `common` types for API contracts where applicable.
// 3. Includes unit tests written first (test file present next to implementation).
// 4. Adds structured logging at function entry/exit and on errors.
// 5. Adds at least one assertion or guard for input validation.
// 6. No duplicate logic — reuse existing service/util or extract shared module.
// 7. Adds or updates README or docs if public API changes.
// 8. Adds meaningful JSDOC for exported functions/classes.
// 9. CI-friendly: code passes lint, typecheck, and tests locally.
// 10. Frontend-specific: responsive (mobile + desktop), smooth, accessible (WCAG AA).
// -----------------------------------------------------------

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { Artwork, ArtworkFeedback } from "@tastematcher/common";
import {
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Edit,
  Eye,
  EyeOff,
  Gavel,
  Lock,
  MessageSquare,
  Search,
  Sparkles,
  Square,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Unlock,
  User,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { EditArtworkModal } from "../../components/EditArtworkModal/EditArtworkModal";
import { AppLoadingState } from "../../components/Loading/AppLoadingState";
import { useAuth } from "../../contexts/AuthContext";
import { useViewerPreferences } from "../../contexts/ViewerPreferencesContext";
import { apiClient } from "../../utils/api";
import { isArtworkNew, isAuctionEnded } from "../../utils/general";
import {
  formatDimensionsForViewer,
  formatPriceRangeForViewer,
} from "../../utils/viewFormatting";
import "./CatalogPage.css";

const getViewedStorageKey = (domainId: string, userId?: string) =>
  `tm.viewedArtworks.${userId || "anon"}.${domainId}`;
const compareByLabel = (left: string, right: string) =>
  left.localeCompare(right, undefined, { sensitivity: "base", numeric: true });
const CATALOG_PAGE_SIZE = 40;

/**
 * Catalog page displaying all uploaded artworks in a responsive grid.
 * Features: lazy loading, search/filter, edit, delete operations, multi-select with bulk actions.
 */
export function CatalogPage() {
  const { user, isInitializing: authLoading } = useAuth();
  const { currency, dimensionUnit } = useViewerPreferences();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isGlobalAdmin = user?.role === "global_admin";
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<string>("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedArtwork, setSelectedArtwork] = useState<Artwork | null>(null);
  const [editingArtwork, setEditingArtwork] = useState<Artwork | null>(null);
  const [domains, setDomains] = useState<Array<{ id: string; name?: string }>>(
    [],
  );
  const [domainsLoading, setDomainsLoading] = useState(false);
  const [selectedDomainId, setSelectedDomainId] = useState<string | undefined>(
    undefined,
  );
  const [selectedArtworks, setSelectedArtworks] = useState<Set<string>>(
    new Set(),
  ); // For multi-select
  const [deletingArtworks, setDeletingArtworks] = useState<Set<string>>(
    new Set(),
  ); // For animation
  const [viewedArtworks, setViewedArtworks] = useState<Set<string>>(
    () => new Set(),
  );
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [showEndedAuctions, setShowEndedAuctions] = useState(true);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [feedbackTab, setFeedbackTab] = useState<
    "preferences" | "comments" | "proposals"
  >("preferences");
  const [preferenceSort, setPreferenceSort] = useState<{
    field: "status" | "timestamp";
    direction: "asc" | "desc";
  }>({ field: "timestamp", direction: "desc" });
  const [commentSort, setCommentSort] = useState<{
    field: "timestamp" | "username";
    direction: "asc" | "desc";
  }>({ field: "timestamp", direction: "desc" });
  const preferenceFilter = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const value = params.get("view");
    if (value === "liked" || value === "disliked") {
      return value;
    }
    return undefined;
  }, [location.search]);

  const effectiveDomainId = isGlobalAdmin ? selectedDomainId : user?.domainId;
  const sortedDomains = useMemo(
    () =>
      [...domains].sort((a, b) =>
        compareByLabel(a.name ?? a.id, b.name ?? b.id),
      ),
    [domains],
  );
  const viewedStorageKey =
    effectiveDomainId && user?.id
      ? getViewedStorageKey(effectiveDomainId, user.id)
      : undefined;

  useEffect(() => {
    if (!viewedStorageKey) {
      setViewedArtworks(new Set());
      return;
    }
    try {
      const raw = localStorage.getItem(viewedStorageKey);
      if (!raw) {
        setViewedArtworks(new Set());
        return;
      }
      const parsed = JSON.parse(raw) as string[];
      setViewedArtworks(new Set(parsed));
    } catch {
      setViewedArtworks(new Set());
    }
  }, [viewedStorageKey]);

  const markViewed = useCallback(
    (artworkId: string) => {
      if (!viewedStorageKey) return;
      setViewedArtworks((prev) => {
        if (prev.has(artworkId)) return prev;
        const next = new Set(prev);
        next.add(artworkId);
        try {
          localStorage.setItem(viewedStorageKey, JSON.stringify([...next]));
        } catch {
          // ignore storage errors
        }
        return next;
      });
    },
    [viewedStorageKey],
  );
  const canViewFeedback =
    user?.role === "global_admin" ||
    user?.role === "domain_owner" ||
    user?.role === "dealer";

  useEffect(() => {
    if (!isGlobalAdmin) {
      setSelectedDomainId(user?.domainId);
      return;
    }
    setDomainsLoading(true);
    (async () => {
      try {
        const domainsResponse = await apiClient.getAllDomains();
        const nextDomains = domainsResponse
          .map((domain) => ({
            id: domain.id,
            name: domain.name,
          }))
          .sort((a, b) => compareByLabel(a.name ?? a.id, b.name ?? b.id));
        setDomains(nextDomains);
        if (!selectedDomainId && nextDomains.length > 0) {
          setSelectedDomainId(nextDomains[0].id);
        }
      } catch (err) {
        console.error("Failed to load domains for catalog", err);
        setDomains([]);
      } finally {
        setDomainsLoading(false);
      }
    })();
  }, [isGlobalAdmin, selectedDomainId, user?.domainId]);

  useEffect(() => {
    setSelectedArtworks(new Set());
    setSelectedArtwork(null);
    setEditingArtwork(null);
    setFeedbackTab("preferences");
  }, [effectiveDomainId]);

  useEffect(() => {
    if (selectedArtwork) {
      setFeedbackTab("preferences");
    }
  }, [selectedArtwork]);

  const feedbackQuery = useQuery({
    queryKey: ["artwork-feedback", effectiveDomainId, selectedArtwork?.id],
    queryFn: async (): Promise<ArtworkFeedback> => {
      if (!effectiveDomainId || !selectedArtwork) {
        throw new Error("Missing domain or artwork");
      }
      return apiClient.getArtworkFeedback(effectiveDomainId, selectedArtwork.id);
    },
    enabled: Boolean(canViewFeedback && effectiveDomainId && selectedArtwork),
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const clearPreferenceFilter = () => {
    if (!preferenceFilter) return;
    const params = new URLSearchParams(location.search);
    params.delete("view");
    navigate(
      { pathname: location.pathname, search: params.toString() },
      { replace: true },
    );
  };

  // Fetch artworks with infinite scroll
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: queryLoading,
    error,
  } = useInfiniteQuery({
    queryKey: [
      "artworks",
      effectiveDomainId,
      debouncedSearchQuery,
      sortBy,
      sortOrder,
      preferenceFilter,
      showEndedAuctions,
    ],
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) => {
      if (!effectiveDomainId) {
        throw new Error("No domain ID");
      }
      const result = await apiClient.getArtworks(effectiveDomainId, {
        limit: CATALOG_PAGE_SIZE,
        continuationToken: pageParam,
        sortBy,
        sortOrder,
        preference: preferenceFilter,
        searchQuery: debouncedSearchQuery || undefined,
        includeEndedAuctions: showEndedAuctions,
      });
      return result;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      // Defensive: lastPage may be undefined or not an object
      if (
        !lastPage ||
        typeof lastPage !== "object" ||
        !("continuationToken" in lastPage)
      )
        return undefined;
      if (!("hasMore" in lastPage) || !lastPage.hasMore) {
        return undefined;
      }
      return lastPage.continuationToken || undefined;
    },
    enabled: !!effectiveDomainId,
    staleTime: 30000,
    retry: 2,
  });

  // Defensive: flatten pages only if data.pages is an array
  const allArtworks = Array.isArray(data?.pages)
    ? data.pages.flatMap((page) =>
        Array.isArray(page?.items) ? page.items : [],
      )
    : [];

  const filteredArtworks = allArtworks;

  const feedbackData = feedbackQuery.data;
  const sortedPreferences = useMemo(() => {
    if (!feedbackData?.preferences?.items) return [];
    const items = [...feedbackData.preferences.items];
    const direction = preferenceSort.direction === "asc" ? 1 : -1;
    if (preferenceSort.field === "status") {
      items.sort((a, b) => {
        const statusValue = (value?: boolean) =>
          value === true ? 2 : value === false ? 1 : 0;
        return (
          (statusValue(a.liked) - statusValue(b.liked)) * direction
        );
      });
      return items;
    }
    items.sort((a, b) => {
      const aTime = a.updatedAt ?? a.createdAt ?? 0;
      const bTime = b.updatedAt ?? b.createdAt ?? 0;
      return (aTime - bTime) * direction;
    });
    return items;
  }, [feedbackData, preferenceSort]);

  const sortedComments = useMemo(() => {
    if (!feedbackData?.comments?.items) return [];
    const items = [...feedbackData.comments.items];
    const direction = commentSort.direction === "asc" ? 1 : -1;
    if (commentSort.field === "username") {
      items.sort((a, b) => {
        const aName = (a.userName || a.userEmail || "").toLowerCase();
        const bName = (b.userName || b.userEmail || "").toLowerCase();
        if (aName === bName) return 0;
        return aName > bName ? direction : -direction;
      });
      return items;
    }
    items.sort((a, b) => (a.createdAt - b.createdAt) * direction);
    return items;
  }, [feedbackData, commentSort]);
  const selectedArtworkRecords = filteredArtworks.filter((artwork) =>
    selectedArtworks.has(artwork.id),
  );
  const canModifyPrivacy = Boolean(
    user?.id &&
      selectedArtworkRecords.length > 0 &&
      selectedArtworkRecords.every((artwork) => artwork.uploadedBy === user.id),
  );

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (artworkId: string) => {
      if (!effectiveDomainId) throw new Error("No domain ID");
      return apiClient.deleteArtwork(effectiveDomainId, artworkId);
    },
    onSuccess: (_, artworkId) => {
      // Immediately remove from cache
      queryClient.setQueryData(
        [
          "artworks",
          effectiveDomainId,
          debouncedSearchQuery,
          sortBy,
          sortOrder,
          preferenceFilter,
          showEndedAuctions,
        ],
        (oldData: any) => {
          if (!oldData || !Array.isArray(oldData.pages)) return oldData;
          return {
            ...oldData,
            pages: oldData.pages.map((page: any) => ({
              ...page,
              items: Array.isArray(page.items)
                ? page.items.filter((item: any) => item.id !== artworkId)
                : page.items,
            })),
          };
        },
      );
      setSelectedArtwork(null);
      setDeletingArtworks((prev) => new Set(prev).add(artworkId));
      setTimeout(
        () =>
          setDeletingArtworks((prev) => {
            const newSet = new Set(prev);
            newSet.delete(artworkId);
            return newSet;
          }),
        300,
      ); // Animation duration
      // Invalidate to ensure cache consistency
      queryClient.invalidateQueries({
        queryKey: ["artworks", effectiveDomainId],
      });
    },
  });

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (artworkIds: string[]) => {
      if (!effectiveDomainId) throw new Error("No domain ID");
      await Promise.all(
        artworkIds.map((id) => apiClient.deleteArtwork(effectiveDomainId, id)),
      );
    },
    onSuccess: (_, artworkIds) => {
      // Immediately remove from cache
      queryClient.setQueryData(
        [
          "artworks",
          effectiveDomainId,
          debouncedSearchQuery,
          sortBy,
          sortOrder,
          preferenceFilter,
          showEndedAuctions,
        ],
        (oldData: any) => {
          if (!oldData || !Array.isArray(oldData.pages)) return oldData;
          return {
            ...oldData,
            pages: oldData.pages.map((page: any) => ({
              ...page,
              items: Array.isArray(page.items)
                ? page.items.filter(
                    (item: any) => !artworkIds.includes(item.id),
                  )
                : page.items,
            })),
          };
        },
      );
      setSelectedArtworks(new Set());
      artworkIds.forEach((id) => {
        setDeletingArtworks((prev) => new Set(prev).add(id));
        setTimeout(
          () =>
            setDeletingArtworks((prev) => {
              const newSet = new Set(prev);
              newSet.delete(id);
              return newSet;
            }),
          300,
        );
      });
      // Invalidate to ensure cache consistency
      queryClient.invalidateQueries({
        queryKey: ["artworks", effectiveDomainId],
      });
    },
  });

  // Bulk update price visibility
  const bulkUpdatePriceVisibility = useMutation({
    mutationFn: async ({
      artworkIds,
      shouldDisplayPrice,
    }: {
      artworkIds: string[];
      shouldDisplayPrice: boolean;
    }) => {
      if (!effectiveDomainId) throw new Error("No domain ID");
      await Promise.all(
        artworkIds.map((id) =>
          apiClient.updateArtwork(effectiveDomainId, id, {
            shouldDisplayPrice,
          }),
        ),
      );
    },
    onSuccess: (_, { artworkIds, shouldDisplayPrice }) => {
      // Update cache
      queryClient.setQueryData(
        ["artworks", effectiveDomainId, searchQuery, sortBy, sortOrder],
        (oldData: any) => {
          if (!oldData || !Array.isArray(oldData.pages)) return oldData;
          return {
            ...oldData,
            pages: oldData.pages.map((page: any) => ({
              ...page,
              items: Array.isArray(page.items)
                ? page.items.map((item: any) =>
                    artworkIds.includes(item.id)
                      ? { ...item, shouldDisplayPrice }
                      : item,
                  )
                : page.items,
            })),
          };
        },
      );
      setSelectedArtworks(new Set());
    },
  });

  const bulkUpdateTasterFlag = useMutation({
    mutationFn: async ({
      artworkIds,
      useForTaster,
    }: {
      artworkIds: string[];
      useForTaster: boolean;
    }) => {
      if (!effectiveDomainId) throw new Error("No domain ID");
      await Promise.all(
        artworkIds.map((id) =>
          apiClient.updateArtwork(effectiveDomainId, id, { useForTaster }),
        ),
      );
    },
    onSuccess: (_, { artworkIds, useForTaster }) => {
      queryClient.setQueryData(
        ["artworks", effectiveDomainId, searchQuery, sortBy, sortOrder],
        (oldData: any) => {
          if (!oldData || !Array.isArray(oldData.pages)) return oldData;
          return {
            ...oldData,
            pages: oldData.pages.map((page: any) => ({
              ...page,
              items: Array.isArray(page.items)
                ? page.items.map((item: any) =>
                    artworkIds.includes(item.id)
                      ? { ...item, useForTaster }
                      : item,
                  )
                : page.items,
            })),
          };
        },
      );
      setSelectedArtworks(new Set());
    },
  });

  const bulkUpdatePrivacy = useMutation({
    mutationFn: async ({
      artworkIds,
      isPrivate,
    }: {
      artworkIds: string[];
      isPrivate: boolean;
    }) => {
      if (!effectiveDomainId) throw new Error("No domain ID");
      await Promise.all(
        artworkIds.map((id) =>
          apiClient.updateArtwork(effectiveDomainId, id, { isPrivate }),
        ),
      );
    },
    onSuccess: (_, { artworkIds, isPrivate }) => {
      queryClient.setQueryData(
        ["artworks", effectiveDomainId, searchQuery, sortBy, sortOrder],
        (oldData: any) => {
          if (!oldData || !Array.isArray(oldData.pages)) return oldData;
          return {
            ...oldData,
            pages: oldData.pages.map((page: any) => ({
              ...page,
              items: Array.isArray(page.items)
                ? page.items.map((item: any) =>
                    artworkIds.includes(item.id)
                      ? { ...item, isPrivate }
                      : item,
                  )
                : page.items,
            })),
          };
        },
      );
      setSelectedArtwork((prev) =>
        prev && artworkIds.includes(prev.id) ? { ...prev, isPrivate } : prev,
      );
      setSelectedArtworks(new Set());
    },
  });

  // Replace custom hook with local mutation that performs a safe optimistic update
  const savePreferenceMutation = useMutation({
    mutationFn: async ({
      artworkId,
      liked,
    }: {
      artworkId: string;
      liked: boolean;
    }) => {
      if (!effectiveDomainId || !user?.id)
        throw new Error("User not authenticated");
      return apiClient.saveArtworkPreference(effectiveDomainId, user.id, {
        domainId: effectiveDomainId,
        artworkId,
        liked,
      });
    },
    // Optimistic update
    onMutate: async ({
      artworkId,
      liked,
    }: {
      artworkId: string;
      liked: boolean;
    }) => {
      const queryKey = [
        "artworks",
        effectiveDomainId,
        searchQuery,
        sortBy,
        sortOrder,
        preferenceFilter,
      ];
      await queryClient.cancelQueries({ queryKey });

      const previousData = queryClient.getQueryData(queryKey);

      // Defensive clone
      let newData: any = undefined;
      try {
        newData = previousData
          ? JSON.parse(JSON.stringify(previousData))
          : previousData;
      } catch {
        newData = previousData;
      }

      if (newData && Array.isArray(newData.pages)) {
        newData.pages = newData.pages.map((page: any) => ({
          ...page,
          items: Array.isArray(page?.items)
            ? page.items.map((it: any) =>
                it?.id === artworkId
                  ? { ...it, likedStatus: liked ? "Liked" : "Disliked" }
                  : it,
              )
            : page.items,
        }));
        queryClient.setQueryData(queryKey, newData);
      }

      // Optimistically update selectedArtwork if it's open
      const prevSelected = selectedArtwork;
      if (prevSelected && prevSelected.id === artworkId) {
        // @ts-ignore
        setSelectedArtwork({
          ...prevSelected,
          // @ts-ignore
          likedStatus: liked ? "Liked" : "Disliked",
        });
      }

      return { previousData, prevSelected };
    },
    onError: (err, variables, context: any) => {
      const queryKey = [
        "artworks",
        effectiveDomainId,
        searchQuery,
        sortBy,
        sortOrder,
      ];
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
      }
      // rollback selected artwork
      if (context?.prevSelected) {
        setSelectedArtwork(context.prevSelected);
      }
      console.error("Failed saving preference", err);
    },
  });

  const handleLoadMore = () => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  const handleClearSearch = () => {
    setSearchQuery("");
  };

  const handleArtworkClick = (artwork: Artwork) => {
    markViewed(artwork.id);
    setSelectedArtwork(artwork);
  };

  const handleCloseModal = () => {
    setSelectedArtwork(null);
  };

  const selectedIndex = useMemo(() => {
    if (!selectedArtwork) return -1;
    return filteredArtworks.findIndex((a) => a.id === selectedArtwork.id);
  }, [filteredArtworks, selectedArtwork]);
  const hasPrev = selectedIndex > 0;
  const hasNext =
    selectedIndex >= 0 && selectedIndex < filteredArtworks.length - 1;

  const handlePrevArtwork = useCallback(() => {
    if (!hasPrev) return;
    setSelectedArtwork(filteredArtworks[selectedIndex - 1]);
  }, [filteredArtworks, hasPrev, selectedIndex]);

  const handleNextArtwork = useCallback(() => {
    if (!hasNext) {
      if (hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
      return;
    }
    setSelectedArtwork(filteredArtworks[selectedIndex + 1]);
  }, [
    filteredArtworks,
    hasNext,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    selectedIndex,
  ]);

  useEffect(() => {
    if (!selectedArtwork) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        handlePrevArtwork();
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        handleNextArtwork();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedArtwork, handlePrevArtwork, handleNextArtwork]);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || !hasNextPage || isFetchingNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchNextPage();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    if (!selectedArtwork) return;
    if (!hasNextPage || isFetchingNextPage) return;
    if (selectedIndex >= filteredArtworks.length - 3) {
      fetchNextPage();
    }
  }, [
    selectedArtwork,
    selectedIndex,
    filteredArtworks.length,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  ]);

  const handleEditClick = (artwork: Artwork, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingArtwork(artwork);
  };

  const handleDeleteClick = (artwork: Artwork, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete "${artwork.title}"?`)) {
      deleteMutation.mutate(artwork.id);
    }
  };

  // Multi-select handlers
  const handleSelectArtwork = (artworkId: string, selected: boolean) => {
    setSelectedArtworks((prev) => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(artworkId);
      } else {
        newSet.delete(artworkId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedArtworks.size === filteredArtworks.length) {
      setSelectedArtworks(new Set());
    } else {
      setSelectedArtworks(new Set(filteredArtworks.map((a) => a.id)));
    }
  };

  const handleUnselectAll = () => {
    setSelectedArtworks(new Set());
  };

  const handleBulkDelete = () => {
    if (window.confirm(`Delete ${selectedArtworks.size} selected artworks?`)) {
      bulkDeleteMutation.mutate(Array.from(selectedArtworks));
    }
  };

  const handleBulkMakePricesVisible = () => {
    bulkUpdatePriceVisibility.mutate({
      artworkIds: Array.from(selectedArtworks),
      shouldDisplayPrice: true,
    });
  };

  const handleBulkMakePricesHidden = () => {
    bulkUpdatePriceVisibility.mutate({
      artworkIds: Array.from(selectedArtworks),
      shouldDisplayPrice: false,
    });
  };

  const handleBulkEnableTaster = () => {
    bulkUpdateTasterFlag.mutate({
      artworkIds: Array.from(selectedArtworks),
      useForTaster: true,
    });
  };

  const handleBulkDisableTaster = () => {
    bulkUpdateTasterFlag.mutate({
      artworkIds: Array.from(selectedArtworks),
      useForTaster: false,
    });
  };

  const handleBulkMakePrivate = () => {
    bulkUpdatePrivacy.mutate({
      artworkIds: Array.from(selectedArtworks),
      isPrivate: true,
    });
  };

  const handleBulkMakePublic = () => {
    bulkUpdatePrivacy.mutate({
      artworkIds: Array.from(selectedArtworks),
      isPrivate: false,
    });
  };

  // Handler to like/dislike from catalog or modal
  const handlePreferenceClick = (
    artworkId: string,
    liked: boolean,
    e?: React.MouseEvent,
  ) => {
    e?.stopPropagation();
    if (!user || user.role !== "customer") return;

    markViewed(artworkId);
    savePreferenceMutation.mutate({ artworkId, liked });
  };

  return (
    <div
      className="p-4 sm:p-6 md:p-8"
      // ensure page content and fixed toolbar are above mobile nav / home indicator
      style={{
        paddingBottom: "calc(env(safe-area-inset-bottom, 16px) + 160px)",
      }}
    >
      <div className="catalog-page">
        <header className="catalog-header">
          <h1 className="catalog-title">Artwork Catalog</h1>

          {/* Search and Filter Bar */}
          <div className="catalog-controls">
            <div className="catalog-search">
              <label htmlFor="catalog-search-input" className="sr-only">
                Search artworks
              </label>
              <div className="catalog-search__wrapper">
                <Search className="catalog-search__icon" aria-hidden="true" />
                <input
                  id="catalog-search-input"
                  type="text"
                  className="catalog-search__input"
                  placeholder="Search artworks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search artworks"
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="catalog-search__clear"
                    onClick={handleClearSearch}
                    aria-label="Clear search"
                  >
                    <X aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>

            {/* Sort and Filter Controls */}
            <div className="catalog-filters">
              {isGlobalAdmin && (
                <div className="catalog-filter-group">
                  <label
                    htmlFor="domain-select"
                    className="catalog-filter-label"
                  >
                    Domain
                  </label>
                  <select
                    id="domain-select"
                    className="catalog-filter-select"
                    value={selectedDomainId ?? ""}
                    onChange={(e) =>
                      setSelectedDomainId(e.target.value || undefined)
                    }
                    disabled={domainsLoading || sortedDomains.length === 0}
                  >
                    <option value="" disabled>
                      {domainsLoading ? "Loading domains..." : "Select domain"}
                    </option>
                    {sortedDomains.map((domain) => (
                      <option key={domain.id} value={domain.id}>
                        {domain.name
                          ? `${domain.name} (${domain.id})`
                          : domain.id}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="catalog-filter-group">
                <label htmlFor="sort-by" className="catalog-filter-label">
                  Sort By
                </label>
                <select
                  id="sort-by"
                  className="catalog-filter-select"
                  value={`${sortBy}-${sortOrder}`}
                  onChange={(e) => {
                    const [field, order] = e.target.value.split("-");
                    setSortBy(field);
                    setSortOrder(order as "asc" | "desc");
                  }}
                >
                  <optgroup label="Date Added">
                    <option value="createdAt-desc">Newest First</option>
                    <option value="createdAt-asc">Oldest First</option>
                  </optgroup>
                  <optgroup label="Title">
                    <option value="title-asc">A → Z</option>
                    <option value="title-desc">Z → A</option>
                  </optgroup>
                  <optgroup label="Artist">
                    <option value="artist-asc">A → Z</option>
                    <option value="artist-desc">Z → A</option>
                  </optgroup>
                  <optgroup label="Date Created">
                    <option value="date-desc">Newest First</option>
                    <option value="date-asc">Oldest First</option>
                  </optgroup>
                </select>
              </div>
              <div className="catalog-filter-group">
                <span className="catalog-filter-label">Auctions</span>
                <label className="catalog-switch">
                  <input
                    id="show-ended"
                    type="checkbox"
                    className="catalog-switch__input"
                    checked={showEndedAuctions}
                    onChange={(e) => setShowEndedAuctions(e.target.checked)}
                  />
                  <span className="catalog-switch__track" aria-hidden="true">
                    <span className="catalog-switch__thumb" />
                  </span>
                  <span className="catalog-switch__text">
                    Display old auction artworks
                  </span>
                </label>
              </div>
            </div>

            {/* Select All Checkbox */}
            {user?.role !== "customer" && (
              <div className="catalog-select-all hidden md:block">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={
                      selectedArtworks.size === filteredArtworks.length &&
                      filteredArtworks.length > 0
                    }
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Select All</span>
                </label>
              </div>
            )}
          </div>

          {/* Multi-select toolbar */}
          {selectedArtworks.size > 0 && user?.role !== "customer" && (
            <>
              {/* Desktop Toolbar */}
              <div className="hidden md:flex mt-4 items-center justify-between rounded-lg bg-blue-50 p-4 animate-in fade-in slide-in-from-top-2">
                <span className="text-sm font-medium text-blue-900">
                  {selectedArtworks.size} selected
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={handleUnselectAll}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    <X className="w-4 h-4" />
                    Unselect All
                  </button>
                  <div className="h-8 w-px bg-blue-200 mx-2" />
                  <button
                    onClick={handleBulkMakePricesVisible}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium bg-white text-green-700 border border-green-200 hover:bg-green-50 transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    Show Prices
                  </button>
                  <button
                    onClick={handleBulkMakePricesHidden}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    <EyeOff className="w-4 h-4" />
                    Hide Prices
                  </button>
                  <button
                    onClick={handleBulkEnableTaster}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium bg-white text-purple-700 border border-purple-200 hover:bg-purple-50 transition-colors"
                  >
                    <Sparkles className="w-4 h-4" />
                    Use in Taster
                  </button>
                  <button
                    onClick={handleBulkDisableTaster}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    <Sparkles className="w-4 h-4 text-gray-500" />
                    Remove from Taster
                  </button>
                  {canModifyPrivacy && (
                    <>
                      <button
                        onClick={handleBulkMakePrivate}
                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium bg-white text-gray-800 border border-gray-200 hover:bg-gray-100 transition-colors"
                      >
                        <Lock className="w-4 h-4" />
                        Mark Private
                      </button>
                      <button
                        onClick={handleBulkMakePublic}
                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors"
                      >
                        <Unlock className="w-4 h-4" />
                        Make Public
                      </button>
                    </>
                  )}
                  <button
                    onClick={handleBulkDelete}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium bg-white text-red-700 border border-red-200 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              </div>

              {/* Mobile Toolbar (Fixed Bottom) */}
              <div
                className="md:hidden fixed left-4 right-4 z-50 bg-white rounded-xl shadow-xl border border-gray-200 p-3 flex items-center justify-between animate-in slide-in-from-bottom-4"
                // lift toolbar well above mobile navigation / home-indicator
                style={{
                  bottom: "calc(env(safe-area-inset-bottom, 16px) + 88px)",
                }}
              >
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleUnselectAll}
                    className="p-2 text-gray-500 hover:bg-gray-100 rounded-full"
                    aria-label="Unselect all"
                  >
                    <X className="w-5 h-5" />
                  </button>
                  <span className="text-sm font-bold text-gray-900">
                    {selectedArtworks.size} selected
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleBulkMakePricesVisible}
                    className="p-2.5 text-green-600 bg-green-50 rounded-lg active:scale-95 transition-transform"
                    aria-label="Make prices visible"
                  >
                    <Eye className="w-5 h-5" />
                  </button>
                  <button
                    onClick={handleBulkMakePricesHidden}
                    className="p-2.5 text-gray-600 bg-gray-100 rounded-lg active:scale-95 transition-transform"
                    aria-label="Make prices hidden"
                  >
                    <EyeOff className="w-5 h-5" />
                  </button>
                  <button
                    onClick={handleBulkEnableTaster}
                    className="p-2.5 text-purple-600 bg-purple-50 rounded-lg active:scale-95 transition-transform"
                    aria-label="Use in Taster"
                  >
                    <Sparkles className="w-5 h-5" />
                  </button>
                  <button
                    onClick={handleBulkDisableTaster}
                    className="p-2.5 text-gray-500 bg-gray-100 rounded-lg active:scale-95 transition-transform"
                    aria-label="Remove from Taster"
                  >
                    <Sparkles className="w-5 h-5" />
                  </button>
                  {canModifyPrivacy && (
                    <>
                      <button
                        onClick={handleBulkMakePrivate}
                        className="p-2.5 text-gray-700 bg-gray-100 rounded-lg active:scale-95 transition-transform"
                        aria-label="Mark private"
                      >
                        <Lock className="w-5 h-5" />
                      </button>
                      <button
                        onClick={handleBulkMakePublic}
                        className="p-2.5 text-gray-500 bg-gray-100 rounded-lg active:scale-95 transition-transform"
                        aria-label="Make public"
                      >
                        <Unlock className="w-5 h-5" />
                      </button>
                    </>
                  )}
                  <button
                    onClick={handleBulkDelete}
                    className="p-2.5 text-red-600 bg-red-50 rounded-lg active:scale-95 transition-transform"
                    aria-label="Delete selected"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </>
          )}
        </header>

        {preferenceFilter && (
          <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-blue-800">
            <span className="font-semibold">
              Showing {preferenceFilter === "liked" ? "liked" : "disliked"}{" "}
              artworks only.
            </span>
            <button
              type="button"
              onClick={clearPreferenceFilter}
              className="inline-flex items-center gap-1 rounded-full border border-blue-200 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
            >
              <X className="h-3.5 w-3.5" />
              Clear filter
            </button>
          </div>
        )}

        {/* Gallery grid */}
        {authLoading || queryLoading ? (
          <AppLoadingState
            message={authLoading ? "Authenticating..." : "Loading artworks..."}
          />
        ) : error ? (
          <div className="catalog-error" role="alert">
            <p>Error loading artworks: {error.message}</p>
            <button
              onClick={() =>
                queryClient.invalidateQueries({
                  queryKey: ["artworks", effectiveDomainId],
                })
              }
              className="catalog-retry-button"
            >
              Retry
            </button>
          </div>
        ) : filteredArtworks.length === 0 ? (
          <div className="catalog-empty" role="status">
            <p>
              No artworks found{searchQuery ? " matching your search" : ""}.{" "}
              {!searchQuery && "Start by uploading some!"}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-10">
              {filteredArtworks.map((artwork) => {
                const isSelected = selectedArtworks.has(artwork.id);
                const isDeleting = deletingArtworks.has(artwork.id);
                const auctionEnded = isAuctionEnded(artwork);
                const isRecent = isArtworkNew(artwork);
                const hasUserAction =
                  artwork.likedStatus === "Liked" ||
                  artwork.likedStatus === "Disliked";
                const isViewed = viewedArtworks.has(artwork.id);
                const showNewTag = isRecent && !hasUserAction && !isViewed;

                return (
                  <article
                    key={artwork.id}
                    className={`flex flex-col gap-3 group transition-opacity duration-300 ${isDeleting ? "opacity-0 scale-95" : "opacity-100"} ${auctionEnded ? "opacity-60" : ""}`}
                  >
                    {/* Image Container */}
                    <div className="relative w-full min-h-[220px] max-h-[320px] overflow-hidden rounded-2xl bg-gray-50 border border-gray-200 shadow-sm transition-all duration-300 group-hover:shadow-md flex items-center justify-center">
                      {/* Select checkbox - visible on hover or if selected, top-left */}
                      {user?.role !== "customer" && (
                        <button
                          type="button"
                          onClick={() =>
                            handleSelectArtwork(artwork.id, !isSelected)
                          }
                          className={`absolute top-3 left-3 z-20 p-1 bg-white/90 backdrop-blur-sm rounded-full shadow-sm transition-opacity ${isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                          aria-label={
                            isSelected ? "Deselect artwork" : "Select artwork"
                          }
                        >
                          {isSelected ? (
                            <CheckSquare className="w-5 h-5 text-blue-600" />
                          ) : (
                            <Square className="w-5 h-5 text-gray-600" />
                          )}
                        </button>
                      )}

                      <button
                        type="button"
                        className="absolute inset-0 z-0 w-full h-full cursor-pointer focus:outline-none flex items-center justify-center"
                        onClick={() => handleArtworkClick(artwork)}
                        aria-label={`View details for ${artwork.title}`}
                      >
                        {artwork.filename ? (
                          <img
                            src={artwork.filename}
                            alt={artwork.title}
                            className="max-h-full max-w-full object-contain transition-transform duration-500 group-hover:scale-105"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-gray-400">
                            No Image
                          </div>
                        )}
                      </button>

                      {/* Price + New badge */}
                      <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-2">
                        {auctionEnded && (
                          <span className="inline-flex items-center gap-1.5 bg-gray-800/80 text-white text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm">
                            Auction ended
                          </span>
                        )}
                        {artwork.price !== undefined &&
                          (user?.role !== "customer" ||
                            (artwork.shouldDisplayPrice ?? true)) && (
                            <div className="bg-white/90 backdrop-blur-sm text-gray-900 text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm">
                              {formatPriceRangeForViewer(
                                artwork.price,
                                artwork.isAuction
                                  ? artwork.maxPrice
                                  : undefined,
                                currency,
                              )}
                            </div>
                          )}
                        {showNewTag && (
                          <div className="bg-sky-200/90 backdrop-blur-sm text-sky-900 text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm">
                            New
                          </div>
                        )}
                      </div>

                      {(artwork.isAuction || artwork.useForTaster) && (
                        <div className="absolute bottom-3 left-3 z-10 flex flex-col items-start gap-2">
                          {artwork.isAuction && (
                            <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-900/90 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
                              <Gavel className="w-3.5 h-3.5" />
                              Auction
                            </div>
                          )}
                          {artwork.useForTaster && (
                            <div className="inline-flex items-center gap-1 rounded-full bg-purple-600/90 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
                              <Sparkles className="w-4 h-4" />
                              Taster
                            </div>
                          )}
                        </div>
                      )}
                      {artwork.isPrivate && (
                        <div className="absolute bottom-3 right-3 z-10 inline-flex items-center gap-1 rounded-full bg-gray-900/80 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
                          <Lock className="w-3.5 h-3.5" />
                          Private
                        </div>
                      )}
                    </div>

                    {/* Info & Actions Footer */}
                    <div className="flex items-start justify-between gap-4 px-1">
                      <div className="min-w-0 flex-1">
                        <h3
                          className="font-semibold text-gray-900 truncate leading-tight"
                          title={artwork.title}
                        >
                          {artwork.title}
                        </h3>
                        <p
                          className="text-sm text-gray-500 truncate mt-0.5"
                          title={artwork.artist}
                        >
                          {artwork.artist}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        {user?.role === "customer" ? (
                          <>
                            <button
                              type="button"
                              onClick={(e) =>
                                handlePreferenceClick(artwork.id, true, e)
                              }
                              className={`p-2 rounded-full transition-colors ${
                                artwork.likedStatus === "Liked"
                                  ? "bg-green-100 text-green-600"
                                  : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                              }`}
                              aria-label="Like"
                            >
                              <ThumbsUp className="w-5 h-5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) =>
                                handlePreferenceClick(artwork.id, false, e)
                              }
                              className={`p-2 rounded-full transition-colors ${
                                artwork.likedStatus === "Disliked"
                                  ? "bg-red-100 text-red-600"
                                  : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                              }`}
                              aria-label="Dislike"
                            >
                              <ThumbsDown className="w-5 h-5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={(e) => handleEditClick(artwork, e)}
                              className="p-2 rounded-full text-gray-400 hover:bg-gray-100 hover:text-blue-600 transition-colors"
                              aria-label="Edit"
                            >
                              <Edit className="w-5 h-5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteClick(artwork, e)}
                              className="p-2 rounded-full text-gray-400 hover:bg-gray-100 hover:text-red-600 transition-colors"
                              aria-label="Delete"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            {/* Load more button */}
            {hasNextPage && !searchQuery && (
              <div className="catalog-load-more">
                <button
                  type="button"
                  className="catalog-load-more__button"
                  onClick={handleLoadMore}
                  disabled={isFetchingNextPage}
                  aria-label="Load more artworks"
                >
                  {isFetchingNextPage ? "Loading..." : "Load More"}
                </button>
              </div>
            )}
            <div ref={loadMoreRef} aria-hidden="true" />
          </>
        )}

        {/* Redesigned Full-size modal */}
        {selectedArtwork && (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black bg-opacity-50 p-3 sm:p-4"
            style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onClick={handleCloseModal}
          >
            <div
              className="relative bg-white rounded-lg shadow-lg w-full max-w-4xl p-5 sm:p-6 md:p-8 max-h-[90dvh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close Button */}
              <button
                type="button"
                className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
                onClick={handleCloseModal}
                aria-label="Close modal"
              >
                <X className="w-6 h-6" />
              </button>

              {hasPrev && (
                <button
                  type="button"
                  className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/90 shadow-lg border border-gray-200 p-2 hover:bg-white"
                  onClick={handlePrevArtwork}
                  aria-label="Previous artwork"
                >
                  <ChevronLeft className="w-5 h-5 text-gray-700" />
                </button>
              )}
              {hasNext && (
                <button
                  type="button"
                  className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/90 shadow-lg border border-gray-200 p-2 hover:bg-white"
                  onClick={handleNextArtwork}
                  aria-label="Next artwork"
                >
                  <ChevronRight className="w-5 h-5 text-gray-700" />
                </button>
              )}

              <div className="flex flex-col md:flex-row gap-6">
                {/* Artwork Image */}
                <div className="flex-shrink-0 w-full md:w-1/2">
                  <div className="bg-gray-50 rounded-lg border border-gray-100 overflow-hidden flex items-center justify-center">
                    <img
                      src={
                        selectedArtwork.thumbnails?.[2]?.url ||
                        selectedArtwork.filename
                      }
                      alt={selectedArtwork.title}
                      className="w-full h-full max-h-[24rem] object-contain"
                    />
                  </div>
                </div>

                {/* Artwork Details */}
                <div className="flex-1 flex flex-col">
                  <h2
                    id="modal-title"
                    className="text-2xl font-bold text-gray-900 mb-2"
                  >
                    {selectedArtwork.title}
                  </h2>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="text-sm text-gray-500">
                      {selectedArtwork.artist}
                    </div>
                    {selectedArtwork.date && (
                      <div className="text-sm text-gray-400">
                        • {selectedArtwork.date}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    {selectedArtwork.isAuction && (
                      <span className="inline-flex items-center gap-2 rounded-full bg-blue-900 px-3 py-1 text-sm font-semibold text-white">
                        <Gavel className="w-4 h-4" />
                        Auction{" "}
                        {selectedArtwork.endDate
                          ? `(ends ${new Date(selectedArtwork.endDate).toLocaleString()})`
                          : ""}
                      </span>
                    )}
                    {selectedArtwork.price !== undefined &&
                      (user?.role !== "customer" ||
                        (selectedArtwork.shouldDisplayPrice ?? true)) && (
                        <div className="text-2xl text-green-700 font-semibold">
                          {formatPriceRangeForViewer(
                            selectedArtwork.price,
                            selectedArtwork.isAuction
                              ? selectedArtwork.maxPrice
                              : undefined,
                            currency,
                          )}
                        </div>
                      )}
                  </div>

                  {selectedArtwork.useForTaster && (
                    <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-purple-50 px-3 py-1 text-sm font-semibold text-purple-700">
                      <Sparkles className="w-4 h-4" />
                      Enabled for Taster
                    </div>
                  )}
                  {selectedArtwork.isPrivate && (
                    <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-gray-900 text-white px-3 py-1 text-sm font-semibold">
                      <Lock className="w-4 h-4" />
                      Private artwork
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-x-4 gap-y-4 mb-6 text-sm border-t border-b border-gray-100 py-4">
                    <div>
                      <span className="block text-gray-500 text-xs uppercase tracking-wider mb-1">
                        Medium
                      </span>
                      <span className="text-gray-900 font-medium">
                        {selectedArtwork.medium || "—"}
                      </span>
                    </div>
                    <div>
                      <span className="block text-gray-500 text-xs uppercase tracking-wider mb-1">
                        Dimensions
                      </span>
                      <span className="text-gray-900 font-medium">
                        {formatDimensionsForViewer(
                          selectedArtwork.width,
                          selectedArtwork.height,
                          selectedArtwork.depth,
                          dimensionUnit,
                        )}
                      </span>
                    </div>
                    <div>
                      <span className="block text-gray-500 text-xs uppercase tracking-wider mb-1">
                        Signature
                      </span>
                      <span className="text-gray-900 font-medium">
                        {selectedArtwork.signature || "—"}
                      </span>
                    </div>
                    <div>
                      <span className="block text-gray-500 text-xs uppercase tracking-wider mb-1">
                        Date
                      </span>
                      <span className="text-gray-900 font-medium">
                        {selectedArtwork.date || "—"}
                      </span>
                    </div>
                  </div>

                  {selectedArtwork.description && (
                    <p className="text-sm text-gray-600 mb-6 leading-relaxed">
                      {selectedArtwork.description}
                    </p>
                  )}

                  {selectedArtwork.tags && selectedArtwork.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-6">
                      {selectedArtwork.tags.map((t) => (
                        <span
                          key={t}
                          className="px-2.5 py-0.5 bg-gray-50 text-gray-600 rounded text-xs font-medium border border-gray-200"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-auto flex items-center gap-4">
                    {user?.role === "customer" ? (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            handlePreferenceClick(selectedArtwork.id, true)
                          }
                          aria-label="Like artwork"
                          className={`p-2 rounded-full ${selectedArtwork.likedStatus === "Liked" ? "hover:bg-green-300" : "hover:bg-green-200"}`}
                          disabled={savePreferenceMutation.isPending}
                        >
                          <ThumbsUp
                            className={`w-6 h-6 ${
                              selectedArtwork.likedStatus === "Liked"
                                ? "text-green-500"
                                : "text-gray-400"
                            }`}
                          />
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handlePreferenceClick(selectedArtwork.id, false)
                          }
                          aria-label="Dislike artwork"
                          className={`p-2 rounded-full ${selectedArtwork.likedStatus === "Disliked" ? "hover:bg-red-300" : "hover:bg-red-200"}`}
                          disabled={savePreferenceMutation.isPending}
                        >
                          <ThumbsDown
                            className={`w-6 h-6 hover:text-red-500 ${
                              selectedArtwork.likedStatus === "Disliked"
                                ? "text-red-500"
                                : "text-gray-400"
                            }`}
                          />
                        </button>
                      </>
                    ) : (
                      <div className="flex items-center gap-4">
                        <button
                          type="button"
                          onClick={(e) => handleEditClick(selectedArtwork, e)}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                          aria-label="Edit artwork"
                        >
                          <Edit className="w-5 h-5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteClick(selectedArtwork, e)}
                          className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                          aria-label="Delete artwork"
                        >
                          <Trash2 className="w-5 h-5" />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {canViewFeedback && (
                <div className="mt-8 border-t border-gray-100 pt-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Customers Feedback
                    </h3>
                    {feedbackQuery.isLoading && (
                      <span className="text-xs text-gray-500">
                        Loading feedback...
                      </span>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {["preferences", "comments", "proposals"].map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() =>
                          setFeedbackTab(
                            tab as "preferences" | "comments" | "proposals",
                          )
                        }
                        className={`px-3 py-1.5 text-sm rounded-full border ${
                          feedbackTab === tab
                            ? "bg-gray-900 text-white border-gray-900"
                            : "bg-white text-gray-600 border-gray-200"
                        }`}
                      >
                        {tab === "preferences"
                          ? "Preferences"
                          : tab === "comments"
                            ? "Comments"
                            : "Proposals"}
                      </button>
                    ))}
                  </div>

                  {feedbackQuery.isError && (
                    <div className="mt-4 text-sm text-red-600">
                      Failed to load feedback.
                    </div>
                  )}

                  {!feedbackQuery.isLoading && feedbackData && (
                    <div className="mt-6 space-y-6">
                      {feedbackTab === "preferences" && (
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="rounded-lg border border-gray-100 p-3">
                              <div className="text-xs text-gray-500">
                                Total
                              </div>
                              <div className="text-lg font-semibold text-gray-900">
                                {feedbackData.preferences.total}
                              </div>
                            </div>
                            <div className="rounded-lg border border-gray-100 p-3">
                              <div className="text-xs text-gray-500">Likes</div>
                              <div className="text-lg font-semibold text-green-600">
                                {feedbackData.preferences.likes}
                              </div>
                            </div>
                            <div className="rounded-lg border border-gray-100 p-3">
                              <div className="text-xs text-gray-500">
                                Dislikes
                              </div>
                              <div className="text-lg font-semibold text-red-600">
                                {feedbackData.preferences.dislikes}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-sm">
                            <label className="text-gray-500">Sort</label>
                            <select
                              value={preferenceSort.field}
                              onChange={(e) =>
                                setPreferenceSort((prev) => ({
                                  ...prev,
                                  field: e.target.value as "status" | "timestamp",
                                }))
                              }
                              className="rounded-md border border-gray-200 px-2 py-1"
                            >
                              <option value="timestamp">Timestamp</option>
                              <option value="status">Status</option>
                            </select>
                            <select
                              value={preferenceSort.direction}
                              onChange={(e) =>
                                setPreferenceSort((prev) => ({
                                  ...prev,
                                  direction: e.target.value as "asc" | "desc",
                                }))
                              }
                              className="rounded-md border border-gray-200 px-2 py-1"
                            >
                              <option value="desc">Desc</option>
                              <option value="asc">Asc</option>
                            </select>
                          </div>

                          <div className="space-y-2">
                            {sortedPreferences.length === 0 && (
                              <div className="text-sm text-gray-500">
                                No preferences yet.
                              </div>
                            )}
                            {sortedPreferences.map((pref) => (
                              <div
                                key={`${pref.userId}-${pref.createdAt}`}
                                className="rounded-lg border border-gray-100 p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                              >
                                <div className="flex items-center gap-2">
                                  <User className="w-4 h-4 text-gray-400" />
                                  <span className="text-sm font-medium text-gray-900">
                                    {pref.userName || pref.userEmail || pref.userId}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 text-sm text-gray-500">
                                  <span className="inline-flex items-center gap-1">
                                    {pref.liked === true ? (
                                      <ThumbsUp className="w-4 h-4 text-green-500" />
                                    ) : pref.liked === false ? (
                                      <ThumbsDown className="w-4 h-4 text-red-500" />
                                    ) : (
                                      <span className="text-gray-400">—</span>
                                    )}
                                    {pref.liked === true
                                      ? "Liked"
                                      : pref.liked === false
                                        ? "Disliked"
                                        : "Unknown"}
                                  </span>
                                  <span>
                                    {new Date(
                                      pref.updatedAt ?? pref.createdAt,
                                    ).toLocaleString()}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {feedbackTab === "comments" && (
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="rounded-lg border border-gray-100 p-3">
                              <div className="text-xs text-gray-500">
                                Users
                              </div>
                              <div className="text-lg font-semibold text-gray-900">
                                {feedbackData.comments.totalUsers}
                              </div>
                            </div>
                            <div className="rounded-lg border border-gray-100 p-3">
                              <div className="text-xs text-gray-500">
                                Comments
                              </div>
                              <div className="text-lg font-semibold text-gray-900">
                                {feedbackData.comments.totalComments}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-sm">
                            <label className="text-gray-500">Sort</label>
                            <select
                              value={commentSort.field}
                              onChange={(e) =>
                                setCommentSort((prev) => ({
                                  ...prev,
                                  field: e.target.value as "timestamp" | "username",
                                }))
                              }
                              className="rounded-md border border-gray-200 px-2 py-1"
                            >
                              <option value="timestamp">Timestamp</option>
                              <option value="username">Username</option>
                            </select>
                            <select
                              value={commentSort.direction}
                              onChange={(e) =>
                                setCommentSort((prev) => ({
                                  ...prev,
                                  direction: e.target.value as "asc" | "desc",
                                }))
                              }
                              className="rounded-md border border-gray-200 px-2 py-1"
                            >
                              <option value="desc">Desc</option>
                              <option value="asc">Asc</option>
                            </select>
                          </div>

                          <div className="space-y-3">
                            {sortedComments.length === 0 && (
                              <div className="text-sm text-gray-500">
                                No comments yet.
                              </div>
                            )}
                            {sortedComments.map((comment, idx) => (
                              <div
                                key={`${comment.userId}-${comment.createdAt}-${idx}`}
                                className="rounded-lg border border-gray-100 p-3 space-y-2"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <MessageSquare className="w-4 h-4 text-gray-400" />
                                    <span className="text-sm font-medium text-gray-900">
                                      {comment.userName ||
                                        comment.userEmail ||
                                        comment.userId}
                                    </span>
                                  </div>
                                  <span className="text-xs text-gray-500">
                                    #{idx + 1} •{" "}
                                    {new Date(comment.createdAt).toLocaleString()}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-700">
                                  {comment.comment.text}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {feedbackTab === "proposals" && (
                        <div className="space-y-4">
                          <div className="rounded-lg border border-gray-100 p-3">
                            <div className="text-xs text-gray-500">
                              Active proposals
                            </div>
                            <div className="text-lg font-semibold text-gray-900">
                              {feedbackData.proposals.totalActive}
                            </div>
                          </div>

                          <div className="space-y-3">
                            {feedbackData.proposals.items.length === 0 && (
                              <div className="text-sm text-gray-500">
                                No active proposals.
                              </div>
                            )}
                            {feedbackData.proposals.items.map((proposal) => (
                              <div
                                key={`${proposal.proposal.id}-${proposal.userId}`}
                                className="rounded-lg border border-gray-100 p-3 space-y-2"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <User className="w-4 h-4 text-gray-400" />
                                    <span className="text-sm font-medium text-gray-900">
                                      {proposal.userName || proposal.userId}
                                    </span>
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    Proposal {proposal.proposal.status} •{" "}
                                    {new Date(
                                      proposal.proposal.updatedAt ??
                                        proposal.proposal.createdAt,
                                    ).toLocaleString()}
                                  </div>
                                </div>
                                <div className="text-sm text-gray-600">
                                  Item status:{" "}
                                  <span className="font-medium text-gray-900">
                                    {proposal.item.status}
                                  </span>
                                </div>
                                {proposal.item.comments?.length > 0 && (
                                  <div className="space-y-2 pt-2">
                                    {proposal.item.comments.map((c, idx) => (
                                      <div
                                        key={`${proposal.proposal.id}-c-${idx}`}
                                        className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700"
                                      >
                                        <span className="font-medium">
                                          {c.author}
                                        </span>
                                        <span className="text-gray-400">
                                          {" "}
                                          •{" "}
                                          {new Date(c.createdAt).toLocaleString()}
                                        </span>
                                        <div>{c.text}</div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Edit modal */}
        {editingArtwork && (
          <EditArtworkModal
            artwork={editingArtwork}
            onClose={() => setEditingArtwork(null)}
            onSave={(updatedArtwork) => {
              setEditingArtwork(null);
              // Update selectedArtwork if it's the same artwork
              if (selectedArtwork && selectedArtwork.id === updatedArtwork.id) {
                setSelectedArtwork(updatedArtwork);
              }
              queryClient.invalidateQueries({
                queryKey: ["artworks", effectiveDomainId],
              });
            }}
          />
        )}
      </div>
    </div>
  );
}
