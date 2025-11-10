import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Compass, Upload, LayoutGrid, LogOut, ChevronsLeft, ChevronsRight, User as UserIcon, Users } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const navLinks = [
  { name: 'Home', href: '/home', icon: Home },
  { name: 'Taster', href: '/taster', icon: Compass },
  { name: 'Catalog', href: '/catalog', icon: LayoutGrid },
  { name: 'Upload', href: '/upload', icon: Upload },
];

const domainOwnerLinks = [
  { name: 'Management', href: '/management', icon: Users },
];

export const Sidebar = () => {
  const { user, logout } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const allLinks = user?.role === 'domain_owner' 
    ? [...navLinks, ...domainOwnerLinks] 
    : navLinks;

  return (
    <aside
      className={`flex-shrink-0 bg-white text-gray-800 flex flex-col transition-all duration-300 ease-in-out border-r border-gray-200 ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      <div className="flex items-center justify-center h-20 border-b border-gray-200 relative">
        {!isCollapsed && <h1 className="text-2xl font-bold tracking-wider text-gray-800">TasteMatcher</h1>}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-6 bg-white border border-gray-200 text-gray-500 hover:bg-blue-50 hover:text-blue-600 rounded-full p-1.5 transition-colors"
        >
          {isCollapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        </button>
      </div>

      <nav className="flex-1 px-4 py-6 space-y-2">
        {allLinks.map((link) => (
          <NavLink
            key={link.name}
            to={link.href}
            className={({ isActive }) =>
              `flex items-center px-4 py-2.5 rounded-lg transition-colors duration-200 ease-in-out font-medium ${
                isActive
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
              } ${isCollapsed ? 'justify-center' : ''}`
            }
            title={isCollapsed ? link.name : undefined}
          >
            <link.icon className={`w-5 h-5 ${!isCollapsed ? 'mr-4' : ''}`} strokeWidth={2} />
            {!isCollapsed && <span>{link.name}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-200">
        {user && !isCollapsed && (
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mr-3">
              <UserIcon className="w-5 h-5 text-gray-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800 truncate">{user.name || user.email}</p>
              <p className="text-xs text-gray-500 capitalize">{user.role}</p>
            </div>
          </div>
        )}
        <button
          onClick={logout}
          className={`flex items-center w-full px-4 py-2.5 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors duration-200 ${
            isCollapsed ? 'justify-center' : ''
          }`}
          title={isCollapsed ? 'Logout' : undefined}
        >
          <LogOut className={`w-5 h-5 ${!isCollapsed ? 'mr-3' : ''}`} />
          {!isCollapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
};
