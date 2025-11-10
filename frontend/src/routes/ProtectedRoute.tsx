import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ProtectedRoute = () => {
  const { isAuthenticated } = useAuth();

  // If the user is not authenticated, redirect them to the /auth page.
  // The `replace` prop is used to replace the current entry in the history stack.
  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  // If authenticated, render the child routes.
  return <Outlet />;
};

export default ProtectedRoute;
