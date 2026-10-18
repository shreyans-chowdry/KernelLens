import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/schibsted-grotesk';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './globals.css';
import TopBar from '@/components/TopBar';

export const metadata: Metadata = {
  title: 'KernelLens',
  description:
    'Root-cause analysis for Linux kernel logs: ML anomaly filtering, semantic-temporal correlation and LLM diagnosis with cited evidence.',
};

export const viewport: Viewport = {
  themeColor: '#F6F5F1',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        <TopBar />
        <main id="main">{children}</main>
      </body>
    </html>
  );
}
