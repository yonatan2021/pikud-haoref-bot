import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { Root } from './layout/Root';
import { Login } from './pages/Login';
import { Overview } from './pages/Overview';
import { Alerts } from './pages/Alerts';
import { Subscribers } from './pages/Subscribers';
import { Operations } from './pages/Operations';
import { Settings } from './pages/Settings';
import { LandingPage } from './pages/LandingPage';
import { Messages } from './pages/Messages';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Root />}>
            <Route index element={<Navigate to="/overview" replace />} />
            <Route path="overview" element={<Overview />} />
            <Route path="alerts" element={<Alerts />} />
            <Route path="subscribers" element={<Subscribers />} />
            <Route path="operations" element={<Operations />} />
            <Route path="settings" element={<Settings />} />
            <Route path="landing" element={<LandingPage />} />
            <Route path="messages" element={<Messages />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster
        position="bottom-left"
        toastOptions={{
          style: {
            background: '#161b22',
            color: '#f0f6fc',
            border: '1px solid #21262d',
            direction: 'rtl',
          },
        }}
      />
    </QueryClientProvider>
  );
}
