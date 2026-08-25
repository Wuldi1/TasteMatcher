import type {
  Artwork,
  Comment,
  Proposal,
  ProposalItem,
} from "@tastematcher/common";
import {
  AlertTriangle,
  Bell,
  CheckCircle,
  Clock,
  Download,
  Gavel,
  MessageSquare,
  Save,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import React, { useEffect, useState } from "react";
import { useViewerPreferences } from "../contexts/ViewerPreferencesContext";
import { apiClient } from "../utils/api";
import { isArtworkNew } from "../utils/general";
import {
  formatDimensionsForViewer,
  formatPriceForViewer,
  formatPriceRangeForViewer,
} from "../utils/viewFormatting";

// Helper component for price input with comma formatting
const FormattedPriceInput = ({
  value,
  onChange,
  hasError,
  disabled = false,
}: {
  value?: number;
  onChange: (val?: number) => void;
  hasError?: boolean;
  disabled?: boolean;
}) => {
  const [displayValue, setDisplayValue] = useState(
    value?.toLocaleString() ?? "",
  );

  useEffect(() => {
    // Sync with prop value if it differs from current parsed input (e.g. external update)
    const currentParsed = parseFloat(displayValue.replace(/,/g, ""));
    if (value !== undefined && value !== currentParsed) {
      setDisplayValue(value.toLocaleString());
    } else if (value === undefined && displayValue !== "") {
      setDisplayValue("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Allow digits, commas, and one decimal point
    if (!/^[\d,]*\.?\d*$/.test(raw)) return;

    setDisplayValue(raw);

    const clean = raw.replace(/,/g, "");
    const num = parseFloat(clean);
    onChange(isNaN(num) ? undefined : num);
  };

  const handleBlur = () => {
    const clean = displayValue.replace(/,/g, "");
    const num = parseFloat(clean);
    if (!isNaN(num)) {
      setDisplayValue(num.toLocaleString());
    }
  };

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
        $
      </span>
      <input
        type="text"
        className={`w-full pl-7 pr-3 py-2 border rounded-lg text-sm outline-none transition-colors ${
          hasError
            ? "border-red-300 focus:border-red-500 focus:ring-1 focus:ring-red-500 bg-red-50"
            : "border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        } disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-500`}
        placeholder="0.00"
        value={displayValue}
        onChange={handleChange}
        onBlur={handleBlur}
        disabled={disabled}
      />
    </div>
  );
};

export default function SaleProposal({
  dealerEmail,
  domainId,
  userId,
  userName,
  draftItems = [],
  onDraftChange,
  proposalId,
  onProposalSave,
  onProposalDelete,
  proposalMetadata,
}: {
  dealerEmail?: string;
  domainId: string;
  userId: string;
  userName?: string;
  draftItems?: ProposalItem[];
  onDraftChange?: (items: ProposalItem[]) => void;
  proposalId?: string;
  onProposalSave?: (proposal: Proposal) => void;
  onProposalDelete?: () => void;
  proposalMetadata?: Proposal["metadata"];
}) {
  const { currency, dimensionUnit } = useViewerPreferences();
  // Use the passed draftItems as the source of truth; keep local copy for editing convenience
  const [items, setItems] = useState<ProposalItem[]>(draftItems ?? []);
  const [generalComments, setGeneralComments] = useState<Comment[]>([]);
  const [proposalStatus, setProposalStatus] = useState<string | undefined>(
    undefined,
  );
  const [isDirty, setIsDirty] = useState(false);
  const isLocalChangeRef = React.useRef<boolean>(false);
  const [saving, setSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});

  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveMode, setSaveMode] = useState<"draft" | "publish">("draft");
  const [newGeneralComment, setNewGeneralComment] = useState("");
  const [artworkDataById, setArtworkDataById] = useState<
    Record<string, Artwork>
  >({});
  const [domainName, setDomainName] = useState<string | undefined>(undefined);

  // Modal states
  const [alertState, setAlertState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
  } | null>(null);
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const showAlert = (title: string, message: string) =>
    setAlertState({ isOpen: true, title, message });
  const showConfirm = (title: string, message: string, onConfirm: () => void) =>
    setConfirmState({ isOpen: true, title, message, onConfirm });

  // Track new comments for each artworkId
  const [newComments, setNewComments] = useState<Record<string, string>>({});
  const isReadOnly =
    proposalStatus === "accepted" || proposalStatus === "rejected";
  const normalizedDealerEmail = (dealerEmail ?? "").trim().toLowerCase();
  const normalizedCustomerName = (userName ?? "").trim().toLowerCase();

  const isDealerAuthor = (author: string) => {
    const normalizedAuthor = (author ?? "").trim().toLowerCase();
    return (
      normalizedAuthor === normalizedDealerEmail ||
      normalizedAuthor === "specialist"
    );
  };

  const getDisplayAuthor = (author: string) => {
    const normalizedAuthor = (author ?? "").trim().toLowerCase();
    if (author && isDealerAuthor(author)) return "You";
    if (
      normalizedAuthor === "customer" ||
      (normalizedCustomerName && normalizedAuthor === normalizedCustomerName)
    ) {
      return userName ?? "Customer";
    }
    return author || "Unknown";
  };

  const getPdfAuthor = (author: string) => {
    const normalizedAuthor = (author ?? "").trim().toLowerCase();
    if (author && isDealerAuthor(author)) {
      return dealerEmail ?? author;
    }
    if (
      normalizedAuthor === "customer" ||
      (normalizedCustomerName && normalizedAuthor === normalizedCustomerName)
    ) {
      return userName ?? "Customer";
    }
    return author || "Unknown";
  };

  // Sync incoming draft changes
  useEffect(() => {
    const normalizedDraft = (draftItems ?? []).map((item) => ({
      ...item,
      askedPrice: item.askedPrice ?? 0,
      askedMaxPrice: item.askedMaxPrice,
    }));
    setItems(normalizedDraft);
    if (proposalId) {
      setIsDirty(true);
    } else {
      setProposalStatus(undefined);
    }
  }, [draftItems, proposalId]);

  useEffect(() => {
    if (!domainId) {
      setDomainName(undefined);
      return;
    }
    (async () => {
      try {
        const domain = await apiClient.getDomainById(domainId);
        setDomainName(domain.name ?? domain.id);
      } catch (err) {
        console.error("Failed to load domain for PDF export", err);
        setDomainName(undefined);
      }
    })();
  }, [domainId]);

  // Notify parent when items change (only when change originated locally)
  useEffect(() => {
    if (onDraftChange && isLocalChangeRef.current) {
      isLocalChangeRef.current = false;
      onDraftChange(items);
    }
  }, [items, onDraftChange]);

  // Load existing proposal if proposalId provided
  useEffect(() => {
    if (!proposalId) {
      setProposalStatus(undefined);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const fetched = await apiClient.getProposal(domainId, proposalId);
        if (!mounted) return;
        // normalize items if necessary (assume API returns items array of { artworkId, comments, status })
        const normalized: ProposalItem[] = (fetched.items ?? []).map(
          (item: any) => ({
            artworkId: item.artworkId,
            comments: item.comments ?? [],
            status: (item.status as ProposalItem["status"]) ?? "pending",
            taggedAt: item.taggedAt ?? Date.now(),
            title: item.title,
            filename: item.filename,
            askedPrice: item.askedPrice ?? 0,
            askedMaxPrice: item.askedMaxPrice,
          }),
        );
        setItems(normalized);
        setGeneralComments(fetched.generalComments || []);
        setProposalStatus(fetched.status);
        setIsDirty(false);
      } catch (err) {
        console.error("Failed to load proposal", err);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [proposalId, domainId]);

  // Load customer email for comment-author detection (so we can know if customer responded)
  useEffect(() => {
    if (!userId || !domainId) return;
    let mounted = true;
    (async () => {
      try {
        await apiClient.getUser(userId, domainId);
        if (!mounted) return;
      } catch (err) {
        console.error("Failed to fetch customer email", err);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [userId, domainId]);

  // Fetch artwork data for each artworkId in the proposal
  useEffect(() => {
    const fetchArtworkData = async () => {
      const artworkIds = draftItems.map((item) => item.artworkId);
      const fetchedData: Record<string, Artwork> = {};

      await Promise.all(
        artworkIds.map(async (artworkId) => {
          try {
            const artwork = await apiClient.getArtwork(domainId, artworkId);
            fetchedData[artworkId] = artwork;
          } catch (err) {
            console.error(
              `Failed to fetch artwork data for ID: ${artworkId}`,
              err,
            );
          }
        }),
      );

      setArtworkDataById(fetchedData);
    };

    if (draftItems.length > 0) {
      fetchArtworkData();
    }
  }, [draftItems, domainId]);

  const handlePriceChange = (artworkId: string, price?: number) => {
    if (isReadOnly) return;
    setItems((prev) =>
      prev.map((item) =>
        item.artworkId === artworkId
          ? { ...item, askedPrice: price ?? 0 }
          : item,
      ),
    );
    isLocalChangeRef.current = true;
    setIsDirty(true);

    // Clear error if exists
    if (validationErrors[artworkId]) {
      setValidationErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[artworkId];
        return newErrors;
      });
    }
  };

  const handleMaxPriceChange = (artworkId: string, price?: number) => {
    if (isReadOnly) return;
    setItems((prev) =>
      prev.map((item) =>
        item.artworkId === artworkId
          ? { ...item, askedMaxPrice: price ?? undefined }
          : item,
      ),
    );
    isLocalChangeRef.current = true;
    setIsDirty(true);

    if (validationErrors[artworkId]) {
      setValidationErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[artworkId];
        return newErrors;
      });
    }
  };

  function validateProposalForPublish(): boolean {
    if (!userId) {
      showAlert("Missing User", "Select a user first");
      return false;
    }
    if (items.length === 0) {
      showAlert("Empty Proposal", "Tag at least one artwork before publishing");
      return false;
    }

    const errors: Record<string, string> = {};
    let hasError = false;
    items.forEach((item) => {
      if (item.askedPrice !== undefined && item.askedPrice < 0) {
        errors[item.artworkId] = "Price cannot be negative";
        hasError = true;
      }
      const artwork = artworkDataById[item.artworkId];
      const isAuction = artwork?.isAuction;
      if (
        isAuction &&
        item.askedMaxPrice !== undefined &&
        item.askedMaxPrice < (item.askedPrice ?? 0)
      ) {
        errors[item.artworkId] =
          "High price must be greater than or equal to low price";
        hasError = true;
      }
    });

    if (hasError) {
      setValidationErrors(errors);
      showAlert("Validation Error", "Please fill in all required fields.");
      return false;
    }

    return true;
  }

  function handleSaveDraftClick() {
    if (isReadOnly) {
      showAlert(
        "Proposal Locked",
        "This proposal has already been accepted or rejected and is now read-only.",
      );
      return;
    }
    if (!userId) {
      showAlert("Missing User", "Select a user first");
      return;
    }
    if (items.length === 0) {
      showAlert("Empty Proposal", "Tag at least one artwork before saving");
      return;
    }
    setSaveMode("draft");
    setNewGeneralComment("");
    setIsSaveModalOpen(true);
  }

  function handlePublishClick() {
    if (isReadOnly) {
      showAlert(
        "Proposal Locked",
        "This proposal has already been accepted or rejected and is now read-only.",
      );
      return;
    }
    if (!validateProposalForPublish()) return;
    setSaveMode("publish");
    setNewGeneralComment("");
    setIsSaveModalOpen(true);
  }

  async function confirmSaveProposal() {
    if (isReadOnly) return;
    setSaving(true);
    setIsSaveModalOpen(false);

    try {
      const updatedGeneralComments = [...generalComments];
      if (newGeneralComment.trim()) {
        updatedGeneralComments.push({
          author: dealerEmail ?? "Specialist",
          text: newGeneralComment.trim(),
          createdAt: Date.now(),
        });
      }

      const payload: Partial<Proposal> = {
        userId,
        items: items.map((item) => ({
          artworkId: item.artworkId,
          comments: item.comments,
          status: item.status,
          askedPrice: item.askedPrice,
          askedMaxPrice: item.askedMaxPrice,
        })) as any,
        generalComments: updatedGeneralComments,
        metadata: proposalMetadata,
        status: saveMode === "publish" ? "submitted" : "draft",
      };

      let data;
      if (proposalId) {
        // Update existing proposal
        data = await apiClient.updateProposal(domainId, proposalId, payload);
      } else {
        // Create new proposal
        data = await apiClient.createProposal(domainId, payload);
      }

      // Update local state with the saved proposal data
      setItems(data.items || []);
      setGeneralComments(data.generalComments || []);
      setProposalStatus(data.status);
      setIsDirty(false);

      console.log("Proposal saved", data);

      // Notify parent of the saved proposal (so buttons enable immediately)
      if (onProposalSave) {
        onProposalSave(data);
      }

      showProposalSummaryAlert(
        saveMode === "publish"
          ? proposalId
            ? "Proposal published"
            : "Proposal created and published"
          : proposalId
            ? "Draft updated"
            : "Draft created",
        data,
      );
    } catch (err) {
      console.error("Failed to save proposal", err);
      showAlert("Error", "Failed to save proposal");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteProposal() {
    if (!proposalId) {
      showAlert("Error", "No saved proposal to delete");
      return;
    }

    showConfirm(
      "Delete Proposal",
      "Are you sure you want to delete this proposal?",
      async () => {
        try {
          await apiClient.deleteProposal(domainId, proposalId);
          showAlert("Success", "Proposal deleted");

          // Clear items and general comments, and notify parent
          isLocalChangeRef.current = true;
          setItems([]);
          setGeneralComments([]); // Clear general comments after deletion
          setProposalStatus(undefined);
          if (onDraftChange) onDraftChange([]);
          if (onProposalDelete) onProposalDelete();
        } catch (err) {
          console.error("Failed to delete proposal", err);
          showAlert("Error", "Failed to delete proposal");
        }
      },
    );
  }

  async function handlePingProposal() {
    if (!proposalId) {
      showAlert("Error", "No saved proposal to ping");
      return;
    }
    try {
      await apiClient.pingProposal(domainId, proposalId);
      showAlert("Success", "Customer pinged");
    } catch (err) {
      console.error("Failed to ping customer", err);
      showAlert("Error", "Failed to ping customer");
    }
  }

  // Helper to show a summary alert for a proposal
  function showProposalSummaryAlert(title: string, proposal: Proposal) {
    const summary = [
      `Status: ${proposal.status}`,
      `Number of artworks: ${proposal.items?.length ?? 0}`,
    ].join("\n");
    showAlert(title, summary);
  }

  // Handler to add a comment to an item
  function handleAddComment(artworkId: string) {
    if (isReadOnly) return;
    const commentText = (newComments[artworkId] || "").trim();
    if (!commentText) return;
    isLocalChangeRef.current = true;
    setIsDirty(true);
    setItems((prev) =>
      prev.map((item) =>
        item.artworkId === artworkId
          ? {
              ...item,
              comments: [
                ...(item.comments || []),
                {
                  author: dealerEmail ?? "Specialist",
                  text: commentText,
                  createdAt: Date.now(),
                },
              ],
            }
          : item,
      ),
    );
    setNewComments((prev) => ({ ...prev, [artworkId]: "" }));
  }

  // Handler to delete an artwork from the proposal
  function handleDeleteArtwork(artworkId: string) {
    if (isReadOnly) {
      showAlert(
        "Proposal Locked",
        "Accepted or rejected proposals are read-only.",
      );
      return;
    }
    showConfirm("Remove Item", "Remove this artwork from the proposal?", () => {
      isLocalChangeRef.current = true;
      setIsDirty(true);
      setItems((prev) => prev.filter((item) => item.artworkId !== artworkId));
      // Note: We use the filtered result directly to ensure sync
      const newItems = items.filter((item) => item.artworkId !== artworkId);
      if (onDraftChange) onDraftChange(newItems);
    });
  }

  const formatCurrency = (value?: number) => {
    return formatPriceForViewer(value, currency);
  };

  const nonEmptyComments = (comments: Comment[]) =>
    (comments || []).filter((comment) => comment.text?.trim().length > 0);

  const downloadPdf = (bytes: Uint8Array, filename: string) => {
    const buffer = bytes.slice().buffer;
    const blob = new Blob([buffer], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const fetchImageBytes = async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  };

  const fontEncodableCache = new WeakMap<object, Map<string, boolean>>();
  const sanitizeForPdfText = (text: string, font: any, fontSize: number) => {
    const normalized = text.normalize("NFC");
    const fontObj = font as object;
    let charCache = fontEncodableCache.get(fontObj);
    if (!charCache) {
      charCache = new Map<string, boolean>();
      fontEncodableCache.set(fontObj, charCache);
    }

    let result = "";
    for (const char of Array.from(normalized)) {
      if (char === "\n" || char === "\r" || char === "\t") {
        result += " ";
        continue;
      }

      const cached = charCache.get(char);
      if (cached !== undefined) {
        result += cached ? char : "?";
        continue;
      }

      let canEncode = true;
      try {
        font.widthOfTextAtSize(char, fontSize);
      } catch {
        canEncode = false;
      }
      charCache.set(char, canEncode);
      result += canEncode ? char : "?";
    }

    return result;
  };

  const wrapText = (
    text: string,
    maxWidth: number,
    font: any,
    fontSize: number,
  ) => {
    const normalized = sanitizeForPdfText(text, font, fontSize)
      .replace(/\s+/g, " ")
      .trim();
    const words = normalized.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      const width = font.widthOfTextAtSize(next, fontSize);
      if (width <= maxWidth) {
        current = next;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [""];
  };

  async function handleExportPdf() {
    if (items.length === 0) return;

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const pageSize: [number, number] = [612, 792]; // letter
    const margin = 40;
    const contentWidth = pageSize[0] - margin * 2;

    let page = pdfDoc.addPage(pageSize);
    let cursorY = pageSize[1] - margin;

    const ensureSpace = (height: number) => {
      if (cursorY - height < margin) {
        page = pdfDoc.addPage(pageSize);
        cursorY = pageSize[1] - margin;
      }
    };

    const drawText = (
      text: string,
      size: number,
      options: {
        bold?: boolean;
        color?: { r: number; g: number; b: number };
      } = {},
    ) => {
      const usedFont = options.bold ? fontBold : font;
      const color = options.color
        ? rgb(options.color.r, options.color.g, options.color.b)
        : rgb(0.1, 0.1, 0.1);
      const lines = wrapText(text, contentWidth, usedFont, size);
      lines.forEach((line) => {
        ensureSpace(size + 6);
        page.drawText(line, {
          x: margin,
          y: cursorY - size,
          size,
          font: usedFont,
          color,
        });
        cursorY -= size + 6;
      });
    };

    const drawHeader = (includeGeneralComments: boolean) => {
      drawText(domainName ?? "Gallery", 12, { bold: true });
      if (dealerEmail) {
        drawText(`Seller: ${dealerEmail}`, 10, {
          color: { r: 0.35, g: 0.35, b: 0.4 },
        });
      }
      drawText("Sale Proposal", 18, { bold: true });
      drawText(`Generated: ${new Date().toLocaleString()}`, 10, {
        color: { r: 0.4, g: 0.4, b: 0.45 },
      });
      if (proposalStatus) {
        drawText(`Status: ${proposalStatus}`, 11, { bold: true });
      }
      cursorY -= 8;

      if (!includeGeneralComments) return;

      const generalText = generalComments
        .filter((comment) => comment.text?.trim().length > 0)
        .map(
          (comment) =>
            `${getPdfAuthor(comment.author)} • ${new Date(
              comment.createdAt,
            ).toLocaleDateString()} — ${comment.text.trim()}`,
        );
      if (generalText.length > 0) {
        drawText("General Comments", 12, { bold: true });
        generalText.forEach((line) => drawText(line, 10));
        cursorY -= 6;
      }
    };

    for (const [index, item] of items.entries()) {
      if (index > 0) {
        page = pdfDoc.addPage(pageSize);
        cursorY = pageSize[1] - margin;
      }
      drawHeader(index === 0);
      const artwork = artworkDataById[item.artworkId];
      ensureSpace(200);

      const blockPadding = 18;
      const blockGap = 22;
      const dividerHeight = 1;
      const titleSize = 13;
      const titleGap = 8;
      const maxImageWidth = contentWidth * 0.4;
      const maxImageHeight = 220;
      // const detailsStartXBase = margin + maxImageWidth + blockGap;
      const detailsWidthBase = contentWidth - maxImageWidth - blockGap;
      const startY = cursorY;
      const artistSize = 10;
      const titleLines = wrapText(
        artwork?.title ?? "Untitled",
        contentWidth,
        fontBold,
        titleSize,
      );
      const titleHeight = titleLines.length * (titleSize + 4);
      const artistHeight = artwork?.artist ? artistSize + 6 : 0;
      const headerHeight = titleHeight + titleGap + artistHeight;
      let detailsY = startY - dividerHeight - headerHeight - blockPadding;

      let embeddedImage;
      if (artwork?.filename) {
        try {
          const imageBytes = await fetchImageBytes(artwork.filename);
          if (artwork.filename.toLowerCase().includes(".png")) {
            embeddedImage = await pdfDoc.embedPng(imageBytes);
          } else {
            embeddedImage = await pdfDoc.embedJpg(imageBytes);
          }
        } catch (err) {
          embeddedImage = undefined;
        }
      }

      const metaLines: string[] = [];
      if (artwork?.medium) metaLines.push(`Medium: ${artwork.medium}`);
      metaLines.push(
        `Size: ${formatDimensionsForViewer(artwork?.width, artwork?.height, artwork?.depth, dimensionUnit)}`,
      );
      if (artwork?.date) metaLines.push(`Date: ${artwork.date}`);

      const detailSections: Array<{
        text: string;
        size: number;
        bold?: boolean;
      }> = [];
      detailSections.push({ text: `Item Status: ${item.status}`, size: 10 });
      if (artwork?.isAuction) {
        detailSections.push({ text: "Auction: Yes", size: 10 });
        if (artwork.endDate) {
          detailSections.push({
            text: `Auction Ends: ${new Date(artwork.endDate).toLocaleString()}`,
            size: 10,
          });
        }
      }
      if (
        artwork?.isAuction &&
        item.askedPrice !== undefined &&
        item.askedMaxPrice !== undefined
      ) {
        detailSections.push({
          text: `Asked Price Range: ${formatCurrency(item.askedPrice)} – ${formatCurrency(
            item.askedMaxPrice,
          )}`,
          size: 11,
          bold: true,
        });
      } else {
        detailSections.push({
          text: `Asked Price: ${formatCurrency(item.askedPrice)}`,
          size: 11,
          bold: true,
        });
        if (item.askedMaxPrice !== undefined) {
          detailSections.push({
            text: `High Asked Price: ${formatCurrency(item.askedMaxPrice)}`,
            size: 11,
          });
        }
      }
      metaLines.forEach((line) =>
        detailSections.push({ text: line, size: 10 }),
      );

      const detailLineHeights = detailSections.map((section) => {
        const usedFont = section.bold ? fontBold : font;
        const lines = wrapText(
          section.text,
          detailsWidthBase,
          usedFont,
          section.size,
        );
        return lines.length * (section.size + 6);
      });
      const detailsHeight = detailLineHeights.reduce((sum, h) => sum + h, 0);

      let imageRenderWidth = maxImageWidth;
      let imageHeight = 140;
      if (embeddedImage) {
        const scale = Math.min(
          maxImageWidth / embeddedImage.width,
          maxImageHeight / embeddedImage.height,
        );
        imageRenderWidth = embeddedImage.width * scale;
        imageHeight = embeddedImage.height * scale;
      }

      const detailsStartX = margin + imageRenderWidth + blockGap * 1.5;
      const detailsWidth = contentWidth - imageRenderWidth - blockGap * 1.5;

      const itemComments = nonEmptyComments(item.comments);
      const commentLines = itemComments.flatMap((comment) => {
        const summary = `${getPdfAuthor(comment.author)} • ${new Date(
          comment.createdAt,
        ).toLocaleDateString()} — ${comment.text.trim()}`;
        return wrapText(summary, contentWidth - blockPadding * 2, font, 10);
      });
      const commentsHeight =
        itemComments.length > 0 ? 20 + commentLines.length * 14 : 0;

      const blockHeight =
        dividerHeight +
        titleGap +
        titleSize +
        blockPadding +
        Math.max(detailsHeight, imageHeight) +
        commentsHeight +
        blockPadding;

      ensureSpace(blockHeight + blockGap);

      page.drawLine({
        start: { x: margin, y: startY - dividerHeight },
        end: { x: margin + contentWidth, y: startY - dividerHeight },
        thickness: dividerHeight,
        color: rgb(0, 0, 0),
      });

      let titleY = startY - dividerHeight - titleGap;
      for (const line of titleLines) {
        page.drawText(line, {
          x: margin,
          y: titleY - titleSize,
          size: titleSize,
          font: fontBold,
          color: rgb(0.1, 0.1, 0.1),
        });
        titleY -= titleSize + 4;
      }
      if (artwork?.artist) {
        page.drawText(sanitizeForPdfText(artwork.artist, font, artistSize), {
          x: margin,
          y: titleY - artistSize,
          size: artistSize,
          font,
          color: rgb(0.35, 0.35, 0.4),
        });
      }

      if (embeddedImage) {
        page.drawImage(embeddedImage, {
          x: margin + blockPadding,
          y: startY - dividerHeight - headerHeight - blockPadding - imageHeight,
          width: imageRenderWidth,
          height: imageHeight,
        });
      } else {
        page.drawRectangle({
          x: margin + blockPadding,
          y: startY - dividerHeight - headerHeight - blockPadding - imageHeight,
          width: imageRenderWidth,
          height: imageHeight,
          borderColor: rgb(0.85, 0.85, 0.88),
          borderWidth: 1,
          color: rgb(0.97, 0.97, 0.98),
        });
        page.drawText("Image unavailable", {
          x: margin + blockPadding + 8,
          y: startY - dividerHeight - headerHeight - blockPadding - 20,
          size: 9,
          font,
          color: rgb(0.6, 0.2, 0.2),
        });
      }

      for (const section of detailSections) {
        const usedFont = section.bold ? fontBold : font;
        const lines = wrapText(
          section.text,
          detailsWidth,
          usedFont,
          section.size,
        );
        for (const line of lines) {
          page.drawText(line, {
            x: detailsStartX,
            y: detailsY - section.size,
            size: section.size,
            font: usedFont,
            color: rgb(0.1, 0.1, 0.1),
          });
          detailsY -= section.size + 6;
        }
      }

      if (itemComments.length > 0) {
        let commentsY =
          startY -
          dividerHeight -
          headerHeight -
          blockPadding -
          Math.max(detailsHeight, imageHeight) -
          8;
        page.drawText("Artwork Comments", {
          x: margin + blockPadding,
          y: commentsY,
          size: 10,
          font: fontBold,
          color: rgb(0.2, 0.2, 0.25),
        });
        commentsY -= 12;
        for (const line of commentLines) {
          page.drawText(line, {
            x: margin + blockPadding,
            y: commentsY,
            size: 10,
            font,
            color: rgb(0.25, 0.25, 0.3),
          });
          commentsY -= 14;
        }
      }

      cursorY = startY - blockHeight - blockGap;
    }

    const pdfBytes = await pdfDoc.save();
    const filename = `proposal-${proposalId ?? "draft"}.pdf`;
    downloadPdf(pdfBytes, filename);
  }

  return (
    <div className="space-y-8">
      {proposalId &&
        proposalStatus &&
        (() => {
          const statusStyles: Record<
            string,
            { bg: string; text: string; border: string; label: string }
          > = {
            accepted: {
              bg: "bg-green-50",
              text: "text-green-700",
              border: "border-green-200",
              label: "Accepted",
            },
            rejected: {
              bg: "bg-red-50",
              text: "text-red-700",
              border: "border-red-200",
              label: "Rejected",
            },
            submitted: {
              bg: "bg-gray-100",
              text: "text-gray-700",
              border: "border-gray-200",
              label: "Submitted",
            },
            draft: {
              bg: "bg-gray-100",
              text: "text-gray-700",
              border: "border-gray-200",
              label: "Draft",
            },
            pending: {
              bg: "bg-gray-100",
              text: "text-gray-700",
              border: "border-gray-200",
              label: "Pending",
            },
          };
          const normalizedStatus = proposalStatus.toLowerCase();
          const statusStyle =
            statusStyles[normalizedStatus] ?? statusStyles.pending;

          return (
            <div
              className={`bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center`}
            >
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  Proposal Items
                </h2>
                <p className="text-sm text-gray-500">
                  {items.length} artworks selected
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleExportPdf}
                  className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  disabled={items.length === 0}
                >
                  <Download className="w-3.5 h-3.5" />
                  Export PDF
                </button>
                <div
                  className={`px-3 py-1 rounded-full text-sm font-medium capitalize flex items-center gap-1.5 border ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}
                >
                  Status: {statusStyle.label}
                </div>
              </div>
            </div>
          );
        })()}
      {(!proposalId || !proposalStatus) && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Proposal Items</h2>
            <p className="text-sm text-gray-500">
              {items.length} artworks selected
            </p>
          </div>
        </div>
      )}

      {/* General Comments Section */}
      {generalComments.length > 0 && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="w-5 h-5 text-gray-500" />
            <h3 className="text-lg font-bold text-gray-900">
              General Comments
            </h3>
          </div>
          <div className="space-y-3">
            {generalComments.map((comment, index) => (
              <div
                key={index}
                className="bg-gray-50 p-3 rounded-lg border border-gray-100"
              >
                <div className="flex justify-between items-baseline mb-1">
                  <span className="font-semibold text-sm text-gray-700">
                    {getDisplayAuthor(comment.author)}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(comment.createdAt).toLocaleDateString()}{" "}
                    {new Date(comment.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="text-gray-700 text-sm whitespace-pre-wrap">
                  {comment.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-6">
        {items.length === 0 ? (
          <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
            No items tagged yet. Add artworks from the catalog.
          </div>
        ) : (
          items.map((item: ProposalItem) => {
            const artwork = artworkDataById[item.artworkId];

            const statusConfig = {
              pending: {
                color: "bg-gray-100 text-gray-600",
                text: "Pending",
                icon: <Clock className="w-4 h-4" />,
                borderColor: "border-gray-200",
              },
              approved: {
                color: "bg-green-50 text-green-700",
                text: "Accepted",
                icon: <CheckCircle className="w-4 h-4" />,
                borderColor: "border-green-200",
              },
              rejected: {
                color: "bg-red-50 text-red-700",
                text: "Rejected",
                icon: <XCircle className="w-4 h-4" />,
                borderColor: "border-red-200",
              },
            };

            const { color, text, icon, borderColor } =
              statusConfig[item.status] ?? statusConfig.pending;
            const showNewTag = artwork ? isArtworkNew(artwork) : false;

            return (
              <article
                key={item.artworkId}
                className={`bg-white border ${borderColor} rounded-2xl overflow-hidden shadow-sm transition-shadow hover:shadow-md flex flex-col lg:flex-row`}
              >
                {/* Image Section */}
                <div className="lg:w-1/4 bg-gray-50 relative">
                  {artwork?.filename ? (
                    <div className="aspect-[4/3] lg:aspect-auto lg:h-full w-full">
                      <img
                        src={artwork.filename}
                        alt={item.artworkId}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="w-full h-64 lg:h-full bg-gray-100 flex items-center justify-center text-sm text-gray-400">
                      No image
                    </div>
                  )}
                  {showNewTag && (
                    <div className="absolute top-3 right-3 bg-sky-200/90 backdrop-blur-sm text-sky-900 text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm">
                      New
                    </div>
                  )}
                </div>

                {/* Content Section */}
                <div className="flex-1 p-6 flex flex-col">
                  <div className="flex justify-between items-start gap-4 mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">
                        {artwork?.title ?? "Untitled"}
                      </h3>
                      <p className="text-gray-600 text-sm">
                        {artwork?.artist ?? "Unknown Artist"}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {artwork?.isAuction && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-900 text-white">
                          <Gavel className="w-3.5 h-3.5" />
                          Auction
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold rounded-full ${color}`}
                      >
                        {icon}
                        {text}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm text-gray-600 mb-6">
                    <div>
                      <span className="text-gray-400 text-xs uppercase mr-2">
                        Medium:
                      </span>{" "}
                      {artwork?.medium ?? "—"}
                    </div>
                    <div>
                      <span className="text-gray-400 text-xs uppercase mr-2">
                        Size:
                      </span>{" "}
                      {formatDimensionsForViewer(
                        artwork?.width,
                        artwork?.height,
                        artwork?.depth,
                        dimensionUnit,
                      )}
                    </div>
                    {!artwork?.isAuction && (
                      <div>
                        <span className="text-gray-400 text-xs uppercase mr-2">
                          List Price:
                        </span>{" "}
                        {formatPriceForViewer(artwork?.price, currency)}
                      </div>
                    )}
                    {artwork?.isAuction && (
                      <div>
                        <span className="text-gray-400 text-xs uppercase mr-2">
                          Price Range:
                        </span>{" "}
                        {formatPriceRangeForViewer(
                          artwork?.price,
                          artwork?.maxPrice,
                          currency,
                        )}
                      </div>
                    )}

                    {/* Displayed Price Input */}
                    <div className="col-span-2 mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                          Low Asking Price
                        </label>
                        <FormattedPriceInput
                          value={item.askedPrice}
                          onChange={(val) =>
                            handlePriceChange(item.artworkId, val)
                          }
                          hasError={!!validationErrors[item.artworkId]}
                          disabled={isReadOnly}
                        />
                        {artwork?.price !== undefined &&
                          item.askedPrice !== undefined &&
                          item.askedPrice < artwork.price && (
                            <p className="text-xs text-yellow-600 mt-1 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              Asked price is lower than list price (
                              {formatPriceForViewer(artwork.price, currency)})
                            </p>
                          )}
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                          High Asking Price
                        </label>
                        <FormattedPriceInput
                          value={item.askedMaxPrice}
                          onChange={(val) =>
                            handleMaxPriceChange(item.artworkId, val)
                          }
                          hasError={!!validationErrors[item.artworkId]}
                          disabled={isReadOnly}
                        />
                      </div>
                      {validationErrors[item.artworkId] && (
                        <p className="text-xs text-red-600 mt-1 md:col-span-2">
                          {validationErrors[item.artworkId]}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-auto pt-4 border-t border-gray-100 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleDeleteArtwork(item.artworkId)}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Remove artwork from proposal"
                      disabled={isReadOnly}
                    >
                      <Trash2 className="w-4 h-4" />
                      Remove Item
                    </button>
                  </div>
                </div>

                {/* Comments Section */}
                <div className="lg:w-72 border-t lg:border-t-0 lg:border-l border-gray-100 bg-gray-50/50 p-4 flex flex-col">
                  <div className="flex items-center gap-2 mb-3 text-xs font-bold text-gray-500 uppercase tracking-wider">
                    <MessageSquare className="w-3 h-3" />
                    Comments
                  </div>

                  <div className="flex-1 space-y-3 overflow-y-auto max-h-48 lg:max-h-none mb-3 pr-1 custom-scrollbar">
                    {item.comments.length === 0 ? (
                      <div className="text-xs text-gray-400 italic text-center py-2">
                        No comments
                      </div>
                    ) : (
                      item.comments.map((comment: Comment, index: number) => (
                        <div
                          key={index}
                          className={`p-2.5 rounded-lg text-sm ${isDealerAuthor(comment.author) ? "bg-white border border-gray-200 mr-2" : "bg-blue-50 border border-blue-100 ml-2"}`}
                        >
                          <div className="flex justify-between items-baseline mb-1">
                            <span className="font-semibold text-xs text-gray-700">
                              {getDisplayAuthor(comment.author)}
                            </span>
                            <span className="text-[10px] text-gray-400">
                              {new Date(comment.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-gray-700 text-xs">
                            {comment.text}
                          </p>
                        </div>
                      ))
                    )}
                  </div>

                  <form
                    className="mt-auto relative"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (isReadOnly) return;
                      handleAddComment(item.artworkId);
                    }}
                  >
                    <input
                      type="text"
                      className="w-full border border-gray-300 rounded-md pl-2 pr-8 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      placeholder="Add note..."
                      value={newComments[item.artworkId] || ""}
                      onChange={(e) =>
                        setNewComments((prev) => ({
                          ...prev,
                          [item.artworkId]: e.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          if (isReadOnly) return;
                          handleAddComment(item.artworkId);
                        }
                      }}
                      disabled={isReadOnly}
                    />
                    <button
                      type="submit"
                      className="absolute right-1 top-1 p-1 text-blue-600 hover:bg-blue-50 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={
                        !newComments[item.artworkId]?.trim() || isReadOnly
                      }
                    >
                      <Send className="w-3 h-3" />
                    </button>
                  </form>
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* Sticky Bottom Actions — stays within the page container */}
      <div className="sticky bottom-0 bg-white/90 backdrop-blur-md border-t border-gray-200 p-4 z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <div className="max-w-7xl mx-auto flex flex-wrap justify-end gap-3">
          <button
            onClick={handleDeleteProposal}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-red-200 text-red-700 rounded-xl font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
            disabled={!proposalId}
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
          <button
            onClick={handlePingProposal}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-yellow-200 text-yellow-700 rounded-xl font-medium hover:bg-yellow-50 transition-colors disabled:opacity-50"
            disabled={!proposalId || isReadOnly || proposalStatus === "draft"}
          >
            <Bell className="w-4 h-4" />
            Ping
          </button>
          <button
            onClick={handleSaveDraftClick}
            className="flex items-center gap-2 px-6 py-2 bg-gray-700 text-white rounded-xl font-medium shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-800"
            title="In Draft mode, this proposal is not visible to the customer."
            disabled={
              saving ||
              isReadOnly ||
              (proposalId ? !isDirty : items.length === 0)
            }
          >
            <Save className="w-4 h-4" />
            {proposalStatus === "submitted" ? "Change to Draft" : "Save Draft"}
          </button>
          <button
            onClick={handlePublishClick}
            className={`flex items-center gap-2 px-6 py-2 text-white rounded-xl font-medium shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              proposalId
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-green-600 hover:bg-green-700"
            }`}
            disabled={saving || isReadOnly || items.length === 0}
          >
            {proposalId ? (
              <Save className="w-4 h-4" />
            ) : (
              <CheckCircle className="w-4 h-4" />
            )}
            {proposalId ? "Publish Changes" : "Create & Publish"}
          </button>
        </div>
      </div>

      {/* Save Proposal Modal */}
      {isSaveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black bg-opacity-50 p-3 sm:items-center sm:p-4">
          <div className="flex w-full max-w-lg flex-col rounded-lg bg-white p-6 shadow-lg max-h-[calc(100dvh-1.5rem)] sm:max-w-[32rem] sm:max-h-[90dvh]">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              {saveMode === "publish"
                ? proposalId
                  ? "Publish Proposal Changes"
                  : "Create and Publish Proposal"
                : proposalId
                  ? "Save Draft Changes"
                  : "Create Draft"}
            </h2>

            <div className="flex-1 overflow-y-auto mb-4">
              {generalComments.length > 0 && (
                <div className="mb-4 space-y-2">
                  <p className="text-sm font-medium text-gray-700">
                    Previous comments:
                  </p>
                  {generalComments.map((comment, index) => (
                    <div
                      key={index}
                      className="bg-gray-50 p-2 rounded text-sm text-gray-600"
                    >
                      <span className="font-semibold">
                        {getDisplayAuthor(comment.author)}:
                      </span>{" "}
                      {comment.text}
                    </div>
                  ))}
                </div>
              )}

              <label className="block text-sm font-medium text-gray-700 mb-2">
                Add a general comment (optional)
              </label>
              <textarea
                className="w-full border border-gray-300 rounded-md p-3 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                rows={4}
                placeholder="e.g. Here is a selection of artworks I think you will love..."
                value={newGeneralComment}
                onChange={(e) => setNewGeneralComment(e.target.value)}
                autoFocus
              />
            </div>

            <div
              className="flex justify-end gap-3 border-t border-gray-100 pt-2"
              style={{
                paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
              }}
            >
              <button
                onClick={() => setIsSaveModalOpen(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmSaveProposal}
                className={`px-4 py-2 text-white rounded-lg font-medium shadow-sm transition-colors ${
                  saveMode === "publish"
                    ? proposalId
                      ? "bg-blue-600 hover:bg-blue-700"
                      : "bg-green-600 hover:bg-green-700"
                    : "bg-gray-700 hover:bg-gray-800"
                }`}
              >
                {saveMode === "publish"
                  ? proposalId
                    ? "Publish Changes"
                    : "Create & Publish"
                  : proposalId
                    ? "Save Draft"
                    : "Create Draft"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alert Modal */}
      {alertState && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black bg-opacity-50 p-3 sm:items-center sm:p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-gray-800 mb-2">
              {alertState.title}
            </h2>
            <p className="text-sm text-gray-600 whitespace-pre-line">
              {alertState.message}
            </p>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setAlertState(null)}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {confirmState && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black bg-opacity-50 p-3 sm:items-center sm:p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-gray-800 mb-2">
              {confirmState.title}
            </h2>
            <p className="text-sm text-gray-600">{confirmState.message}</p>
            <div className="mt-6 flex justify-end gap-4">
              <button
                onClick={() => setConfirmState(null)}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  confirmState.onConfirm();
                  setConfirmState(null);
                }}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
