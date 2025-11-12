import { NavLink } from 'react-router-dom';
import { Home, Compass, Upload, LayoutGrid, Users, Sparkles, Lock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getAIRecommendationsEligibility } from '../../utils/recommendations';
import { User } from '@tastematcher/common';

const navLinks = [
  { name: 'Home', href: '/home', icon: Home, lockReason: undefined },
  { name: 'Upload', href: '/upload', icon: Upload, lockReason: undefined },
  { name: 'Catalog', href: '/catalog', icon: LayoutGrid, lockReason: undefined },
  { name: 'Taster', href: '/taster', icon: Compass, lockReason: undefined },
];

const domainOwnerLinks = [
  { name: 'Management', href: '/management', icon: Users, lockReason: undefined },
];

export const BottomNav = () => {
  const { user } = useAuth();
  const { isEligible, reasons } = getAIRecommendationsEligibility(user as User);

  const aiLink =
    user?.role === 'domain_owner' || user?.role === 'global_admin'
      ? { name: 'AI', href: '/ai-suggestions', icon: Sparkles }
      : {
          name: 'AI',
          href: '/ai-suggestions',
          icon: Sparkles,
          locked: !isEligible,
          lockReason: reasons.join(', '),
        };

  const allLinks =
    user?.role === 'domain_owner' || user?.role === 'global_admin'
      ? [...navLinks, aiLink, ...domainOwnerLinks]
      : [...navLinks, aiLink];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around h-16 z-50 md:hidden">
      {allLinks.map((link) => {
        const isLocked = 'locked' in link && link.locked;

        return (
          <NavLink
            key={link.name}
            to={link.href}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center w-full text-xs transition-colors ${
                isActive ? 'text-blue-600' : 'text-gray-500 hover:text-blue-600'
              }`
            }
            aria-disabled={!!isLocked}
            onClick={(event) => {
              if (isLocked) {
                event.preventDefault();
              }
            }}
          >
            <div className="relative">
              <link.icon className="mb-1 h-6 w-6" strokeWidth={2} />
              {!!isLocked && (
                <Lock className="absolute -right-1 -top-1 h-3 w-3 text-gray-500" aria-hidden="true" />
              )}
            </div>
            <span>{link.name}</span>
            {isLocked && !!link.lockReason && (
              <span className="sr-only">{`Locked: ${link.lockReason}`}</span>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
};
