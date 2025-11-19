import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useWelcomeTour } from '../../hooks/useWelcomeTour';
import { NAVIGATION_LINKS } from '../../constants/navigation';
import { Lock, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { getAIRecommendationsEligibility } from '../../utils/recommendations';

export const BottomNav = () => {
  const { user } = useAuth();
  const location = useLocation(); // Get the current route
  const { currentStep, nextStep, skipTour, isTourActive, previousStep } = useWelcomeTour();

  const [isModalOpen, setIsModalOpen] = useState(false); // State to manage modal visibility

  // Filter links based on user role
  const filteredLinks = NAVIGATION_LINKS.filter((link) => link.roles.includes(user?.role || ''));

  const handleLockedClick = () => {
    setIsModalOpen(true);
  };

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around items-center h-16 z-50 md:hidden">
        {filteredLinks.map((link) => {
          const isLocked = link.id === 'ai-suggestions' && user?.role === 'customer' && !getAIRecommendationsEligibility(user!).isEligible;
          const isActiveBubble = isTourActive && currentStep === link.id;
          const isActive = location.pathname === link.href || location.pathname.startsWith(`${link.href}/`); // Custom isActive logic

          return (
            <div key={link.id} className="relative group flex-1">
              <NavLink
                to={isLocked ? '#' : link.href}
                aria-label={link.ariaLabel}
                className={() =>
                  `flex flex-col items-center justify-center h-full w-full text-xs transition-colors ${
                    isActiveBubble
                      ? 'text-purple-600 bg-purple-50 border-t-4 border-purple-500'
                      : isActive
                      ? 'text-blue-600 bg-blue-50 border-t-4 border-blue-500'
                      : 'text-gray-500 hover:text-blue-600'
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
                    <Lock className="absolute -right-1 -top-1 h-3 w-3 text-gray-500" aria-hidden="true" />
                  )}
                </div>
                <span>{link.name}</span>
              </NavLink>

              {/* Welcome Tour Bubble */}
              {isActiveBubble && (
                <div
                  className="absolute bottom-20 left-1/2 transform -translate-x-1/2 z-50 bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-lg rounded-lg p-4 w-24 text-center"
                >
                  {/* X Button */}
                  <button
                    onClick={skipTour}
                    className="absolute top-4 right-4 text-sm text-red-300 hover:text-red-200"
                    aria-label="Close tour"
                  >
                    <X className="w-5 h-5" />
                  </button>

                  {/* Bubble Text */}
                  <p className="text-sm font-medium mt-2">{link.bubbleText}</p>

                  <div className="flex justify-between mt-4">
                    {/* Left Arrow */}
                    <button
                      onClick={previousStep}
                      className="text-sm text-gray-200 hover:text-gray-100"
                      disabled={currentStep === filteredLinks[0].id} // Disable "Back" on the first step
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>

                    {/* Right Arrow */}
                    <button
                      onClick={nextStep}
                      className="text-sm text-yellow-300 hover:text-yellow-200"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-80">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Access Denied</h2>
            <p className="text-sm text-gray-600">{getAIRecommendationsEligibility(user!).reasons.join('. ')}</p>
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
