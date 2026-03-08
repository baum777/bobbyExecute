import { Topbar } from './topbar';
import { Navigation } from './navigation';

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg-primary text-text-primary retro-scanlines">
      <Topbar />
      <div className="flex">
        <Navigation />
        <main className="flex-1 p-4 lg:p-6 pb-20 lg:pb-6 min-h-[calc(100vh-3.5rem)] overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
