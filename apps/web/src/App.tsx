import { Routes, Route, Navigate } from "react-router-dom";
import LibraryPage from "./pages/LibraryPage";
import ReaderPage from "./pages/ReaderPage";
import LoginPage from "./pages/LoginPage";
import { AuthProvider, useAuth } from "./hooks/useAuth";

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="page">Loading...</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={(
            <RequireAuth>
              <LibraryPage />
            </RequireAuth>
          )}
        />
        <Route
          path="/book/:id"
          element={(
            <RequireAuth>
              <ReaderPage />
            </RequireAuth>
          )}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
