import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

// Session restoration: while the stored token is being verified we render
// a neutral loading screen — never a redirect — so a refresh on
// /app/c/<id> doesn't bounce through the login page or the homepage. If
// there really is no session, the intended URL is passed along so login
// can return the person to the exact chat they were opening.
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="h-screen-safe flex items-center justify-center bg-bg text-muted" role="status">
        Loading Velora…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return children;
};

export default ProtectedRoute;
