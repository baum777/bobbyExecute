import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/providers/theme-provider';
import { QueryProvider } from '@/providers/query-provider';
import { Shell } from '@/components/layout/shell';

export const metadata: Metadata = {
  title: 'BobbyExecution - Trading Ops Console',
  description: 'Governance-first trading operations dashboard',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <QueryProvider>
          <ThemeProvider>
            <Shell>{children}</Shell>
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
