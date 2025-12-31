import { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, ChevronsLeft, ChevronsRight, User as UserIcon, X, Lock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useWelcomeTour } from '../../hooks/useWelcomeTour';
import { NAVIGATION_LINKS } from '../../constants/navigation';
import { getAIRecommendationsEligibility } from '../../utils/recommendations';
import { useProposalData } from '../../hooks/useProposalData';

export const Sidebar = () => {
  const { user, refreshUser, logout, stats } = useAuth();
  const location = useLocation(); // Get the current route
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { currentStep, isTourActive, previousStep, nextStep, skipTour } = useWelcomeTour(); // Hook to start the onboarding guide
  const navigate = useNavigate();
  const [bubblePosition, setBubblePosition] = useState<number | null>(null);

  // Filter links based on user role
  const filteredLinks = NAVIGATION_LINKS.filter((link) => link.roles.includes(user?.role || ''));

  // Fetch if the user has a submitted proposal
  const { hasSubmittedProposal } = useProposalData(user?.domainId, user?.id);

  // run refreshUser() once on mount to ensure we have the latest user data
  useEffect(() => {
    refreshUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isTourActive && currentStep) {
      const activeLink = document.querySelector(`[data-id="${currentStep}"]`);
      if (activeLink) {
        const rect = activeLink.getBoundingClientRect();
        setBubblePosition(rect.top + rect.height / 2); // Center the bubble vertically with the link
      }
    }
  }, [currentStep, isTourActive]);

  return (
    <aside
      className={`h-screen flex-shrink-0 bg-white text-gray-800 flex flex-col transition-all duration-300 ease-in-out border-r border-gray-200 ${isCollapsed ? 'w-20' : 'w-64'
        }`}
    >
      <div className="flex items-center justify-center h-20 border-b border-gray-200 relative flex-shrink-0">
        {!isCollapsed && (
          <div className="flex items-center gap-3">
            <img
              src={`${process.env.PUBLIC_URL}/tastematcher_icon_icon_64.png`}
              alt="TasteMatcher logo"
              className="h-8 w-8"
            />
            <h1 className="text-2xl font-bold tracking-wider text-gray-800">TasteMatcher</h1>
          </div>
        )}
        {isCollapsed && (
          <img
            src={`${process.env.PUBLIC_URL}/tastematcher_icon_icon_64.png`}
            alt="TasteMatcher logo"
            className="h-8 w-8"
          />
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-6 bg-white border border-gray-200 text-gray-500 hover:bg-blue-50 hover:text-blue-600 rounded-full p-1.5 transition-colors"
        >
          {isCollapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        </button>
      </div>

      <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
        {filteredLinks.map((link) => {
          // Add dynamic check for submitted proposals
          if (link.id === 'buying-proposal' && !hasSubmittedProposal) {
            return null;
          }

          // Lock AI Suggestions for customers that are NOT yet eligible
          // Create a temporary user object with the latest stats to ensure immediate UI update
          const effectiveUser = user ? { ...user, swipeCount: stats?.totalSwiped ?? user.swipeCount } : null;
          const isLocked = link.id === 'ai-suggestions' && user?.role === 'customer' && effectiveUser && !getAIRecommendationsEligibility(effectiveUser as any).isEligible;
          
          const isActive = location.pathname === link.href || location.pathname.startsWith(`${link.href}/`); // Custom isActive logic
          const isActiveBubble = isTourActive && currentStep === link.id;

          return (
            <div key={link.id} className="relative group">
              <NavLink
                to={isLocked ? '#' : link.href}
                data-id={link.id}
                aria-label={link.ariaLabel}
                className={() =>
                  `flex items-center px-4 py-2.5 rounded-lg transition-colors duration-200 ease-in-out font-medium ${isActiveBubble
                    ? 'bg-purple-50 text-purple-600 border-l-4 border-purple-500'
                    : isActive
                      ? 'bg-blue-50 text-blue-600 border-l-4 border-blue-500'
                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                  } ${isCollapsed ? 'justify-center' : ''}`
                }
                aria-disabled={!!isLocked}
                onClick={(event) => {
                  if (isLocked) {
                    event.preventDefault();
                  }
                }}
              >
                <link.icon className={`w-5 h-5 ${!isCollapsed ? 'mr-4' : ''}`} strokeWidth={2} />
                {!isCollapsed && <span>{link.name}</span>}
                {isLocked && <Lock className="ml-auto h-4 w-4 text-gray-500" />}
              </NavLink>

              {isActiveBubble && bubblePosition !== null && (
                <div
                  className="fixed z-50 bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg rounded-lg p-4 w-64"
                  style={{
                    top: `${bubblePosition}px`, // Dynamically position the bubble
                    left: isCollapsed ? '5rem' : '16rem', // Adjust based on sidebar width
                    transform: 'translateY(-50%)',
                  }}
                >
                  {/* X Button */}
                  <button
                    onClick={skipTour}
                    className="absolute top-2 right-2 text-sm text-red-300 hover:text-red-200"
                    aria-label="Close tour"
                  >
                    <X className="w-5 h-5" />
                  </button>

                  {/* Bubble Text */}
                  <p className="text-sm">{link.id === currentStep ? link.bubbleText : ''}</p>

                  <div className="flex justify-between mt-6">
                    {/* Back Button */}
                    <button
                      onClick={previousStep}
                      className="text-sm text-gray-200 hover:text-gray-100"
                      disabled={currentStep === filteredLinks[0].id} // Disable "Back" on the first step
                    >
                      Back
                    </button>

                    {/* Next Button */}
                    <button
                      onClick={nextStep}
                      className="text-sm text-yellow-300 hover:text-yellow-200"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="p-4 border-t border-gray-200 flex-shrink-0">
        <div
          className={`relative flex items-center mb-4 ${isCollapsed ? 'justify-center' : ''} ${user && user.role === 'customer' ? 'cursor-pointer' : ''
            } group`}
          onClick={() => {
            if (user?.role === 'customer') {
              navigate('/onboarding', { replace: true });
            }
          }}
          role={user?.role === 'customer' ? 'button' : undefined}
          tabIndex={user?.role === 'customer' ? 0 : undefined}
          aria-label={user?.role === 'customer' ? 'Reopen onboarding guide' : undefined}
        >
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mr-3 flex-shrink-0">
            <UserIcon className="w-5 h-5 text-blue-600" />
          </div>
          {!isCollapsed && (
            <div className="overflow-hidden flex-1">
              <p className="text-sm font-semibold text-gray-800 truncate">{user?.name || user?.email}</p>
              <p className="text-xs text-gray-500 truncate">{user?.email}</p>
              <p className="text-xs text-gray-400 capitalize mt-0.5">{user?.role}</p>
            </div>
          )}
          {user && user.role === 'customer' && (
            <div
              className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 rounded-md bg-purple-700 text-white px-4 py-2 text-xs shadow opacity-0 scale-95 transform transition-all duration-150 ease-out group-hover:opacity-100 group-hover:scale-100"
              role="tooltip"
              style={{ width: '190px', textAlign: 'center', whiteSpace: 'normal' }}>
              Do you want to re-live the onboarding experience? ✨
            </div>
          )}
        </div>

        <button
          onClick={logout}
          className={`flex items-center w-full px-4 py-2.5 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors duration-200 font-medium ${isCollapsed ? 'justify-center' : ''
            }`}
          title={isCollapsed ? 'Logout' : undefined}
        >
          <LogOut className={`w-5 h-5 ${!isCollapsed ? 'mr-3' : ''}`} />
          {!isCollapsed && <span>Logout</span>}
        </button>
      </div>
    </aside >
  );
};
