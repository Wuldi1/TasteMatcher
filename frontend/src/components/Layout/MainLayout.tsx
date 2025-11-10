import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';

/**
 * Main application layout for authenticated users.
 * It includes a responsive navigation system (sidebar for desktop, bottom nav for mobile)
 * and a main content area where pages are rendered via <Outlet>.
 */
export const MainLayout = () => {
  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar for medium screens and up */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {/* Main content area */}
      <main className="flex-1 overflow-y-auto pb-16 md:pb-0 p-8">
        <Outlet /> {/* Child routes like /home, /catalog, etc., will render here */}
      </main>

      {/* Bottom navigation for small screens */}
      <div className="md:hidden">
        <BottomNav />
      </div>
    </div>
  );
};
