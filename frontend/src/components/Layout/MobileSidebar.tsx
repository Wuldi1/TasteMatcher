import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { NAVIGATION_LINKS } from "../../constants/navigation";
import { Lock } from "lucide-react";
import { useState, useEffect } from "react";
import { getAIRecommendationsEligibility } from "../../utils/general";
import { useProposalData } from "../../hooks/useProposalData";

export const MobileSidebar = () => {
  const { user, refreshUser } = useAuth();
  const location = useLocation(); // Get the current route
  const [isModalOpen, setIsModalOpen] = useState(false); // State to manage modal visibility

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

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around items-center h-16 z-50 md:hidden">
        {filteredLinks.map((link) => {
          // Add dynamic check for submitted proposals
          if (link.id === "buying-proposal" && !hasSubmittedProposal) {
            return null;
          }

          const isLocked =
            link.id === "ai-suggestions" &&
            user?.role === "customer" &&
            !getAIRecommendationsEligibility(user!).isEligible;
          const isActive =
            location.pathname === link.href ||
            location.pathname.startsWith(`${link.href}/`); // Custom isActive logic

          return (
            <div key={link.id} className="relative group flex-1">
              <NavLink
                to={isLocked ? "#" : link.href}
                aria-label={link.ariaLabel}
                className={() =>
                  `flex flex-col items-center justify-center h-full w-full text-xs transition-colors ${
                    isActive
                        ? "text-blue-600 bg-blue-50 border-t-4 border-blue-500"
                        : "text-gray-500 hover:text-blue-600"
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
                  <link.icon className="mb-1 h-6 w-6" strokeWidth={2} />
                  {isLocked && (
                    <Lock
                      className="absolute -right-1 -top-1 h-3 w-3 text-gray-500"
                      aria-hidden="true"
                    />
                  )}
                </div>
                <span>{link.name}</span>
              </NavLink>
            </div>
          );
        })}
      </nav>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-80">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              Access Denied
            </h2>
            <p className="text-sm text-gray-600">
              {getAIRecommendationsEligibility(user!).reasons.join(". ")}
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
    </>
  );
};
