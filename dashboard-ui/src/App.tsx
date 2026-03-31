import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { Root } from './layout/Root';
import { Skeleton } from './components/Skeleton';
import { ErrorBoundary } from './components/ErrorBoundary';

const Login            = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const Overview         = lazy(() => import('./pages/Overview').then(m => ({ default: m.Overview })));
const Alerts           = lazy(() => import('./pages/Alerts').then(m => ({ default: m.Alerts })));
const Subscribers      = lazy(() => import('./pages/Subscribers').then(m => ({ default: m.Subscribers })));
const Operations       = lazy(() => import('./pages/Operations').then(m => ({ default: m.Operations })));
const Settings         = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const LandingPage      = lazy(() => import('./pages/LandingPage').then(m => ({ default: m.LandingPage })));
const Messages         = lazy(() => import('./pages/Messages'));
const WhatsApp         = lazy(() => import('./pages/WhatsApp').then(m => ({ default: m.WhatsApp })));
const WhatsAppListeners = lazy(() => import('./pages/WhatsAppListeners').then(m => ({ default: m.WhatsAppListeners })));

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });

const PageFallback = () => <Skeleton className="h-full min-h-screen" />;

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorBoundary>
        <Suspense fallback={<PageFallback />}>
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
              <Route path="whatsapp" element={<WhatsApp />} />
              <Route path="whatsapp-listeners" element={<WhatsAppListeners />} />
            </Route>
          </Routes>
        </Suspense>
        </ErrorBoundary>
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
