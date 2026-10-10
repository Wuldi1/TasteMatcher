import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { NAVIGATION_LINKS } from "../../constants/navigation";
import {
  ChevronRight,
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
    "automatic-uploads": "Intake",
    management: "Manage",
    "buying-proposal": "Proposal",
  };

  const tabBaseClasses =
    "relative flex h-[64px] min-w-0 flex-col items-center justify-center gap-1 px-1 text-[10px] font-medium leading-none transition-colors";

  const preferredPrimaryIds =
    user?.role === "customer"
      ? ["home", "taster", "ai-suggestions", "buying-proposal"]
      : user?.role === "domain_owner" || user?.role === "global_admin"
        ? ["home", "catalog", "automatic-uploads", "sales"]
        : ["home", "catalog", "upload", "sales"];
  const availableLinks = filteredLinks.filter(
    (link) => link.id !== "buying-proposal" || hasSubmittedProposal,
  );
  const primaryLinks = preferredPrimaryIds
    .map((id) => availableLinks.find((link) => link.id === id))
    .filter((link): link is (typeof availableLinks)[number] => Boolean(link));
  const secondaryLinks = availableLinks.filter(
    (link) => !primaryLinks.some((primary) => primary.id === link.id),
  );
  const workspaceLinks = secondaryLinks.filter(
    (link) => link.id !== "settings",
  );
  const settingsLink = secondaryLinks.find((link) => link.id === "settings");
  const isMoreActive = secondaryLinks.some(
    (link) =>
      location.pathname === link.href ||
      location.pathname.startsWith(`${link.href}/`),
  );

  return (
    <>
      <nav
        className="premium-mobile-nav fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white md:hidden"
        aria-label="Primary navigation"
      >
        <div
          className="premium-mobile-nav__bar grid h-[68px] px-1"
          style={{
            gridTemplateColumns: `repeat(${primaryLinks.length + 1}, minmax(0, 1fr))`,
          }}
        >
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
              <NavLink
                key={link.id}
                to={isLocked ? "#" : link.href}
                aria-label={link.ariaLabel}
                className={() =>
                  `${tabBaseClasses} ${
                    isActive
                      ? "text-[#344d40]"
                      : "text-gray-500 hover:text-gray-800"
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
                {isActive && (
                  <span
                    className="absolute inset-x-3 top-0 h-0.5 bg-[#8a6c3e]"
                    aria-hidden="true"
                  />
                )}
                <div className="relative">
                  <link.icon className="h-[21px] w-[21px]" strokeWidth={1.8} />
                  {isLocked && (
                    <Lock
                      className="absolute -right-1.5 -top-1.5 h-3 w-3 text-gray-500"
                      aria-hidden="true"
                    />
                  )}
                </div>
                <span className="max-w-full truncate">
                  {mobileLabelById[link.id] ?? link.name}
                </span>
              </NavLink>
            );
          })}
          <button
            type="button"
            onClick={() => setIsMoreModalOpen(true)}
            className={`${tabBaseClasses} ${
              isMoreActive ? "text-[#344d40]" : "text-gray-500"
            } hover:text-gray-800`}
            aria-label="Open more navigation"
          >
            {isMoreActive && (
              <span
                className="absolute inset-x-3 top-0 h-0.5 bg-[#8a6c3e]"
                aria-hidden="true"
              />
            )}
            <MoreHorizontal className="h-[21px] w-[21px]" strokeWidth={1.8} />
            <span>More</span>
          </button>
        </div>
      </nav>

      {isMoreModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/45 md:hidden"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsMoreModalOpen(false);
          }}
        >
          <div
            ref={activeDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-more-title"
            tabIndex={-1}
            className="mobile-navigation-sheet max-h-[88dvh] w-full overflow-y-auto border-t border-gray-200 bg-white pb-[calc(1rem+env(safe-area-inset-bottom,0px))] shadow-xl"
          >
            <div
              className="mx-auto mt-2 h-1 w-10 bg-gray-300"
              aria-hidden="true"
            />
            <header className="flex items-center justify-between border-b border-gray-200 px-5 pb-4 pt-3">
              <div className="flex min-w-0 items-center gap-3">
                <img
                  src={`${process.env.PUBLIC_URL}/tastematcher_icon_icon_64.png`}
                  alt=""
                  className="h-10 w-10 flex-none"
                />
                <div className="min-w-0">
                  <h2
                    id="mobile-more-title"
                    className="text-lg font-semibold text-gray-900"
                  >
                    Navigation
                  </h2>
                  <p className="truncate text-xs text-gray-500">
                    {user?.name || user?.email}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMoreModalOpen(false)}
                className="flex h-11 w-11 flex-none items-center justify-center border border-gray-200 text-gray-600"
                aria-label="Close more navigation"
                data-modal-initial-focus
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            {workspaceLinks.length > 0 && (
              <section
                className="px-5 py-4"
                aria-labelledby="mobile-workspace-title"
              >
                <h3
                  id="mobile-workspace-title"
                  className="mb-2 text-xs font-semibold uppercase text-gray-500"
                >
                  Workspace
                </h3>
                <div className="divide-y divide-gray-200 border-y border-gray-200">
                  {workspaceLinks.map((link) => (
                    <NavLink
                      key={link.id}
                      to={link.href}
                      onClick={() => setIsMoreModalOpen(false)}
                      className="flex min-h-14 items-center gap-3 py-2 text-sm font-medium text-gray-800"
                    >
                      <link.icon
                        className="h-5 w-5 text-[#344d40]"
                        strokeWidth={1.8}
                      />
                      <span className="flex-1">{link.name}</span>
                      <ChevronRight
                        className="h-4 w-4 text-gray-400"
                        aria-hidden="true"
                      />
                    </NavLink>
                  ))}
                </div>
              </section>
            )}

            <section
              className="px-5 pb-2"
              aria-labelledby="mobile-account-title"
            >
              <h3
                id="mobile-account-title"
                className="mb-2 text-xs font-semibold uppercase text-gray-500"
              >
                Account & support
              </h3>
              <div className="divide-y divide-gray-200 border-y border-gray-200">
                {settingsLink && (
                  <NavLink
                    to={settingsLink.href}
                    onClick={() => setIsMoreModalOpen(false)}
                    className="flex min-h-14 items-center gap-3 py-2 text-sm text-gray-700"
                  >
                    <settingsLink.icon
                      className="h-5 w-5 text-[#344d40]"
                      strokeWidth={1.8}
                    />
                    <span className="flex-1">Settings</span>
                    <ChevronRight
                      className="h-4 w-4 text-gray-400"
                      aria-hidden="true"
                    />
                  </NavLink>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setIsMoreModalOpen(false);
                    setIsDisplayModalOpen(true);
                  }}
                  className="flex min-h-14 w-full items-center gap-3 py-2 text-left text-sm text-gray-700"
                >
                  <SlidersHorizontal
                    className="h-5 w-5 text-[#344d40]"
                    strokeWidth={1.8}
                  />
                  <span className="flex-1">Display settings</span>
                  <ChevronRight
                    className="h-4 w-4 text-gray-400"
                    aria-hidden="true"
                  />
                </button>
                <a
                  href="mailto:admin@tastematcher.com"
                  className="flex min-h-14 items-center gap-3 py-2 text-sm text-gray-700"
                >
                  <HelpCircle
                    className="h-5 w-5 text-[#344d40]"
                    strokeWidth={1.8}
                  />
                  <span className="flex-1">Support</span>
                  <ChevronRight
                    className="h-4 w-4 text-gray-400"
                    aria-hidden="true"
                  />
                </a>
                <Link
                  to="/privacy-policy"
                  onClick={() => setIsMoreModalOpen(false)}
                  className="flex min-h-14 items-center gap-3 py-2 text-sm text-gray-700"
                >
                  <ShieldCheck
                    className="h-5 w-5 text-[#344d40]"
                    strokeWidth={1.8}
                  />
                  <span className="flex-1">Privacy</span>
                  <ChevronRight
                    className="h-4 w-4 text-gray-400"
                    aria-hidden="true"
                  />
                </Link>
                <Link
                  to="/terms-of-service"
                  onClick={() => setIsMoreModalOpen(false)}
                  className="flex min-h-14 items-center gap-3 py-2 text-sm text-gray-700"
                >
                  <FileText
                    className="h-5 w-5 text-[#344d40]"
                    strokeWidth={1.8}
                  />
                  <span className="flex-1">Terms</span>
                  <ChevronRight
                    className="h-4 w-4 text-gray-400"
                    aria-hidden="true"
                  />
                </Link>
              </div>
              <button
                type="button"
                onClick={logout}
                className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700"
              >
                <LogOut className="h-5 w-5" />
                <span>Log out</span>
              </button>
            </section>
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
