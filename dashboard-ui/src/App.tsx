import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });

// Lazy imports — pages will be added in later tasks
// For now, use placeholder components so the router compiles
function Placeholder({ name }: { name: string }) {
  return <div style={{ padding: 32, color: '#f0f6fc' }}>🚧 {name} — coming soon</div>;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Placeholder name="Login" />} />
          <Route path="/" element={<Placeholder name="Root" />}>
            <Route index element={<Navigate to="/overview" replace />} />
            <Route path="overview" element={<Placeholder name="Overview" />} />
            <Route path="alerts" element={<Placeholder name="Alerts" />} />
            <Route path="subscribers" element={<Placeholder name="Subscribers" />} />
            <Route path="operations" element={<Placeholder name="Operations" />} />
            <Route path="settings" element={<Placeholder name="Settings" />} />
            <Route path="landing" element={<Placeholder name="Landing" />} />
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
