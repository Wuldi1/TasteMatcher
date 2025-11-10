import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ProtectedRoute from './ProtectedRoute';
import { AuthPage } from '../pages/Auth/AuthPage';
import { HomePage } from '../pages/Home/HomePage';
import { MainLayout } from '../components/Layout/MainLayout'; // Import the layout
import { TasterPage } from '../pages/Taster/TasterPage';
import { CatalogPage } from '../pages/Catalog/CatalogPage';
import { UploadPage } from '../pages/Upload/UploadPage';

/**
 * Central component for defining application routes.
 * It uses the authentication state to correctly render public or protected routes.
 */
export const AppRoutes = () => {
    const { isAuthenticated, isInitializing } = useAuth();

    // While the authentication state is being determined, show a global loading indicator.
    // This prevents rendering the wrong route on initial load.
    if (isInitializing) {
        return (
            <div className="flex h-screen w-screen items-center justify-center bg-gray-50">
                <p className="text-lg text-gray-500 animate-pulse">Initializing Session...</p>
            </div>
        );
    }

    return (
        <Routes>
            {/* Public route for authentication. If the user is already authenticated, redirect to /home. */}
            <Route
                path="/auth"
                element={isAuthenticated ? <Navigate to="/home" replace /> : <AuthPage />}
            />

            {/* Protected routes are wrapped by the ProtectedRoute component. */}
            <Route element={<ProtectedRoute />}>
                {/* All routes inside here will first be checked for auth, then rendered inside MainLayout */}
                <Route element={<MainLayout />}>
                    <Route path="/home" element={<HomePage />} />
                    {/* Add all other pages that need the menu here. For example: */}
                    <Route path="/taster" element={<TasterPage />} />
                    <Route path="/catalog" element={<CatalogPage />} />
                    <Route path="/upload" element={<UploadPage />} />
                </Route>
            </Route>

            {/* Redirect from the root path. If authenticated, go to /home, otherwise to /auth. */}
            <Route
                path="/"
                element={<Navigate to={isAuthenticated ? "/home" : "/auth"} replace />}
            />

            {/* Optional: A catch-all 404 Not Found page. */}
            <Route path="*" element={<div>404 Not Found</div>} />
        </Routes>
    );
};
