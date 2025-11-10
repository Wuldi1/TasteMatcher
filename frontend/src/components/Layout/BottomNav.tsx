import { NavLink } from 'react-router-dom';
import { Home, Compass, Upload, LayoutGrid } from 'lucide-react';

const navLinks = [
  { name: 'Home', href: '/home', icon: Home },
  { name: 'Taster', href: '/taster', icon: Compass },
  { name: 'Catalog', href: '/catalog', icon: LayoutGrid },
  { name: 'Upload', href: '/upload', icon: Upload },
];

export const BottomNav = () => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around h-16">
      {navLinks.map((link) => (
        <NavLink
          key={link.name}
          to={link.href}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center w-full text-xs transition-colors ${
              isActive ? 'text-blue-600' : 'text-gray-500 hover:text-blue-600'
            }`
          }
        >
          <link.icon className="w-6 h-6 mb-1" strokeWidth={2} />
          <span>{link.name}</span>
        </NavLink>
      ))}
    </nav>
  );
};
