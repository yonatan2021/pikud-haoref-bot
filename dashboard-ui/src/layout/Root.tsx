import { Outlet } from 'react-router-dom';
import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { StatusStrip } from './StatusStrip';
import { CommandPalette } from './CommandPalette';
import { RestartBanner } from '../components/configuration/RestartBanner';

export function Root() {
  const [uptime, setUptime] = useState(0);
  return (
    <div className="flex h-screen overflow-hidden bg-base text-text-primary">
      <CommandPalette />
      <Sidebar uptime={uptime} />
      <main className="flex-1 flex flex-col overflow-hidden min-w-0 relative z-10">
        <StatusStrip onUptime={setUptime} />
        <RestartBanner />
        <div className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
