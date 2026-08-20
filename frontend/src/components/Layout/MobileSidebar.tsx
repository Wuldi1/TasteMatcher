import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { NAVIGATION_LINKS } from "../../constants/navigation";
import { ChevronRight, Lock, SlidersHorizontal } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { getAIRecommendationsEligibility } from "../../utils/general";
import { useProposalData } from "../../hooks/useProposalData";
import { ViewerPreferencesControls } from "./ViewerPreferencesControls";

export const MobileSidebar = () => {
  const { user, stats, refreshUser } = useAuth();
  const location = useLocation(); // Get the current route
  const [isModalOpen, setIsModalOpen] = useState(false); // State to manage modal visibility
  const [isDisplayModalOpen, setIsDisplayModalOpen] = useState(false);
  const [showSwipeHint, setShowSwipeHint] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

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
    "flex h-[62px] w-[72px] flex-none flex-col items-center justify-center rounded-xl px-1 text-[11px] leading-tight transition-colors";

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem("tm.mobileNavHintDismissed.v1");
      if (dismissed === "1") {
        setShowSwipeHint(false);
      }
    } catch {
      // ignore storage read failures
    }
  }, []);

  useEffect(() => {
    const element = scrollContainerRef.current;
    if (!element || !showSwipeHint) {
      return;
    }

    const dismissHint = () => {
      if (element.scrollLeft > 4) {
        setShowSwipeHint(false);
        try {
          localStorage.setItem("tm.mobileNavHintDismissed.v1", "1");
        } catch {
          // ignore storage write failures
        }
      }
    };

    const evaluateOverflow = () => {
      const hasOverflow = element.scrollWidth > element.clientWidth + 4;
      if (!hasOverflow) {
        setShowSwipeHint(false);
      }
    };

    evaluateOverflow();
    element.addEventListener("scroll", dismissHint, { passive: true });
    window.addEventListener("resize", evaluateOverflow);

    return () => {
      element.removeEventListener("scroll", dismissHint);
      window.removeEventListener("resize", evaluateOverflow);
    };
  }, [showSwipeHint]);

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white md:hidden">
        <div
          ref={scrollContainerRef}
          className="relative h-[74px] overflow-x-auto px-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="flex min-w-max items-center gap-1 py-1.5">
            {filteredLinks.map((link) => {
              // Add dynamic check for submitted proposals
              if (link.id === "buying-proposal" && !hasSubmittedProposal) {
                return null;
              }

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
              onClick={() => setIsDisplayModalOpen(true)}
              className={`${tabBaseClasses} text-gray-500 hover:bg-gray-100 hover:text-blue-600`}
              aria-label="Open display settings"
            >
              <SlidersHorizontal className="mb-1 h-5 w-5" strokeWidth={2} />
              <span className="whitespace-nowrap">Display</span>
            </button>
          </div>
          {showSwipeHint && (
            <>
              <div className="pointer-events-none absolute right-0 top-0 h-full w-14 bg-gradient-to-l from-white to-transparent" />
              <div className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 rounded-full border border-gray-200 bg-white/95 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 shadow-sm">
                <span className="inline-flex items-center gap-0.5">
                  Swipe <ChevronRight className="h-3 w-3" />
                </span>
              </div>
            </>
          )}
        </div>
      </nav>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black bg-opacity-50 p-3 sm:items-center sm:p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
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
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {isDisplayModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black bg-opacity-50 p-3 sm:items-center sm:p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg">
            <h2 className="text-lg font-semibold text-gray-800 mb-3">
              Display Settings
            </h2>
            <ViewerPreferencesControls defaultExpanded />
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setIsDisplayModalOpen(false)}
                className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded hover:bg-blue-600"
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
