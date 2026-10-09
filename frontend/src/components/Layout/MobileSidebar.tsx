import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { NAVIGATION_LINKS } from "../../constants/navigation";
import {
  FileText,
  HelpCircle,
  Lock,
  LogOut,
  MoreHorizontal,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { getAIRecommendationsEligibility } from "../../utils/general";
import { useProposalData } from "../../hooks/useProposalData";
import { ViewerPreferencesControls } from "./ViewerPreferencesControls";

export const MobileSidebar = () => {
  const { user, stats, refreshUser, logout } = useAuth();
  const location = useLocation(); // Get the current route
  const [isModalOpen, setIsModalOpen] = useState(false); // State to manage modal visibility
  const [isDisplayModalOpen, setIsDisplayModalOpen] = useState(false);
  const [isMoreModalOpen, setIsMoreModalOpen] = useState(false);
  const activeDialogRef = useRef<HTMLDivElement | null>(null);

  // Filter links based on user role
  const filteredLinks = NAVIGATION_LINKS.filter((link) =>
    link.roles.includes(user?.role || ""),
  );

  // Fetch if the user has a submitted proposal
  const { hasSubmittedProposal } = useProposalData(user?.domainId, user?.id);

  // run refreshUser() once on mount to ensure we have the latest user data
  useEffect(() => {
    refreshUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isModalOpen && !isDisplayModalOpen && !isMoreModalOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = activeDialogRef.current;
    const focusableSelector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusableElements = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
      );
    const closeActiveDialog = () => {
      if (isDisplayModalOpen) setIsDisplayModalOpen(false);
      else if (isMoreModalOpen) setIsMoreModalOpen(false);
      else setIsModalOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeActiveDialog();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusableElements();
      if (elements.length === 0) {
        event.preventDefault();
        dialog?.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => {
      const initialFocus = dialog?.querySelector<HTMLElement>(
        "[data-modal-initial-focus]",
      );
      (initialFocus ?? focusableElements()[0] ?? dialog)?.focus();
    });

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
      previouslyFocused?.focus();
    };
  }, [isDisplayModalOpen, isModalOpen, isMoreModalOpen]);

  const handleLockedClick = () => {
    setIsModalOpen(true);
  };

  const mobileLabelById: Partial<Record<string, string>> = {
    "ai-suggestions": "AI",
    "automatic-uploads": "Auto Upload",
    management: "Manage",
    "buying-proposal": "Proposal",
  };

  const tabBaseClasses =
    "flex h-[62px] min-w-0 flex-1 flex-col items-center justify-center rounded-xl px-1 text-[11px] leading-tight transition-colors";

  const preferredPrimaryIds =
    user?.role === "customer"
      ? ["home", "taster", "ai-suggestions", "buying-proposal"]
      : ["home", "catalog", "sales", "management"];
  const availableLinks = filteredLinks.filter(
    (link) => link.id !== "buying-proposal" || hasSubmittedProposal,
  );
  const primaryLinks = preferredPrimaryIds
    .map((id) => availableLinks.find((link) => link.id === id))
    .filter((link): link is (typeof availableLinks)[number] => Boolean(link));
  const secondaryLinks = availableLinks.filter(
    (link) => !primaryLinks.some((primary) => primary.id === link.id),
  );

  return (
    <>
      <nav
        className="premium-mobile-nav fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white md:hidden"
        aria-label="Primary navigation"
      >
        <div className="premium-mobile-nav__scroll relative h-[74px] px-2">
          <div className="flex w-full items-center gap-1 py-1.5">
            {primaryLinks.map((link) => {
              const isLocked =
                link.id === "ai-suggestions" &&
                user?.role === "customer" &&
                !getAIRecommendationsEligibility({
                  swipeCount: stats?.totalSwiped ?? user?.swipeCount,
                  onboardingStatus: user?.onboardingStatus,
                }).isEligible;
              const isActive =
                location.pathname === link.href ||
                location.pathname.startsWith(`${link.href}/`);

              return (
                <div key={link.id} className="relative">
                  <NavLink
                    to={isLocked ? "#" : link.href}
                    aria-label={link.ariaLabel}
                    className={() =>
                      `${tabBaseClasses} ${
                        isActive
                          ? "bg-blue-50 text-blue-600"
                          : "text-gray-500 hover:bg-gray-100 hover:text-blue-600"
                      }`
                    }
                    aria-disabled={isLocked}
                    onClick={(event) => {
                      if (isLocked) {
                        event.preventDefault();
                        handleLockedClick();
                      }
                    }}
                  >
                    <div className="relative">
                      <link.icon className="mb-1 h-5 w-5" strokeWidth={2} />
                      {isLocked && (
                        <Lock
                          className="absolute -right-1 -top-1 h-3 w-3 text-gray-500"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <span className="whitespace-nowrap">
                      {mobileLabelById[link.id] ?? link.name}
                    </span>
                  </NavLink>
                </div>
              );
            })}
            <button
              type="button"
              onClick={() => setIsMoreModalOpen(true)}
              className={`${tabBaseClasses} text-gray-500 hover:bg-gray-100 hover:text-blue-600`}
              aria-label="Open more navigation"
            >
              <MoreHorizontal className="mb-1 h-5 w-5" strokeWidth={2} />
              <span className="whitespace-nowrap">More</span>
            </button>
          </div>
        </div>
      </nav>

      {isMoreModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/45 md:hidden">
          <div
            ref={activeDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-more-title"
            tabIndex={-1}
            className="max-h-[88dvh] w-full overflow-y-auto border-t border-gray-200 bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">
                  TasteMatcher
                </p>
                <h2
                  id="mobile-more-title"
                  className="mt-1 text-2xl font-normal"
                >
                  More
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsMoreModalOpen(false)}
                className="flex h-11 w-11 items-center justify-center border border-gray-200"
                aria-label="Close more navigation"
                data-modal-initial-focus
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {secondaryLinks.map((link) => (
                <NavLink
                  key={link.id}
                  to={link.href}
                  onClick={() => setIsMoreModalOpen(false)}
                  className="flex min-h-14 items-center gap-3 border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                >
                  <link.icon className="h-5 w-5 text-green-700" />
                  <span>{mobileLabelById[link.id] ?? link.name}</span>
                </NavLink>
              ))}
              <button
                type="button"
                onClick={() => {
                  setIsMoreModalOpen(false);
                  setIsDisplayModalOpen(true);
                }}
                className="flex min-h-14 items-center gap-3 border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-700"
              >
                <SlidersHorizontal className="h-5 w-5 text-green-700" />
                <span>Display settings</span>
              </button>
              <a
                href="mailto:admin@tastematcher.com"
                className="flex min-h-14 items-center gap-3 border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
              >
                <HelpCircle className="h-5 w-5 text-green-700" />
                <span>Support</span>
              </a>
              <Link
                to="/privacy-policy"
                onClick={() => setIsMoreModalOpen(false)}
                className="flex min-h-14 items-center gap-3 border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
              >
                <ShieldCheck className="h-5 w-5 text-green-700" />
                <span>Privacy</span>
              </Link>
              <Link
                to="/terms-of-service"
                onClick={() => setIsMoreModalOpen(false)}
                className="flex min-h-14 items-center gap-3 border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
              >
                <FileText className="h-5 w-5 text-green-700" />
                <span>Terms</span>
              </Link>
              <button
                type="button"
                onClick={logout}
                className="flex min-h-14 items-center gap-3 border border-red-200 bg-white px-3 py-2 text-left text-sm text-red-700"
              >
                <LogOut className="h-5 w-5" />
                <span>Log out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black bg-opacity-50 p-3 sm:items-center sm:p-4">
          <div
            ref={activeDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-access-denied-title"
            tabIndex={-1}
            className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg"
          >
            <h2
              id="mobile-access-denied-title"
              className="text-lg font-semibold text-gray-800 mb-4"
            >
              Access Denied
            </h2>
            <p className="text-sm text-gray-600">
              {getAIRecommendationsEligibility({
                swipeCount: stats?.totalSwiped ?? user?.swipeCount,
                onboardingStatus: user?.onboardingStatus,
              }).reasons.join(". ")}
            </p>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded hover:bg-blue-600"
                data-modal-initial-focus
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {isDisplayModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black bg-opacity-50 p-3 sm:items-center sm:p-4">
          <div
            ref={activeDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-display-settings-title"
            tabIndex={-1}
            className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg"
          >
            <h2
              id="mobile-display-settings-title"
              className="text-lg font-semibold text-gray-800 mb-3"
            >
              Display Settings
            </h2>
            <ViewerPreferencesControls defaultExpanded />
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setIsDisplayModalOpen(false)}
                className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded hover:bg-blue-600"
                data-modal-initial-focus
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
