import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import useStore from './store';
import { disconnectSocket } from './hooks/useSocket';
import Layout from './components/Layout';
import Home from './pages/Home';
import Auth from './pages/Auth';
import Stocks from './pages/Stocks';
import Portfolio from './pages/Portfolio';
import Forum from './pages/Forum';
import ForumDetail from './pages/ForumDetail';
import Tribe from './pages/Tribe';
import Hindsight from './pages/Hindsight';
import Profile from './pages/Profile';
import apiClient from './api/client';
import { APP_BASE } from './constants/routes';


const Landing = lazy(() => import('./pages/Landing'));

const ProtectedRoute = ({ children }) => {
  const isAuthenticated = useStore((state) => state.isAuthenticated);
  return isAuthenticated ? children : <Navigate to="/auth" />;
};

function App() {
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const setUnreadCount = useStore((s) => s.setUnreadCount);

  useEffect(() => {
    if (isAuthenticated) {
      apiClient.get('/notifications/unread-count')
        .then((r) => setUnreadCount(r.data.count || 0))
        .catch(() => {});
    } else {
      disconnectSocket();
    }
  }, [isAuthenticated, setUnreadCount]);

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={(
            <Suspense fallback={<div className="page" style={{ padding: 48, color: '#64748b', textAlign: 'center' }}>Loading…</div>}>
              <Landing />
            </Suspense>
          )}
        />
        <Route path="/auth" element={<Auth />} />

        <Route
          path={APP_BASE}
          element={(
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          )}
        >
          <Route index element={<Home />} />
          <Route path="stocks" element={<Stocks />} />
          <Route path="portfolio" element={<Portfolio />} />
          <Route path="forum" element={<Forum />} />
          <Route path="forum/:id" element={<ForumDetail />} />
          <Route path="tribe" element={<Tribe />} />
          <Route path="hindsight" element={<Hindsight />} />
          <Route path="time-machine" element={<Navigate to="hindsight" replace />} />
          <Route path="profile/:userId" element={<Profile />} />

        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
