// src/app/layout.tsx
// Root layout — loads fonts via <link> and applies CSS variables.
import type { Metadata } from 'next';
import './globals.css';
import '../styles/outcome-tokens.css';

export const metadata: Metadata = {
  title:       'Pour Advice CRM',
  description: 'Wine sales relationship management',
  // Enables full-screen standalone mode when added to iOS Home Screen
  appleWebApp: {
    capable:        true,
    statusBarStyle: 'default',
    title:          'Pour Advice',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Google Fonts — loaded at runtime; globals.css fallback stacks cover offline */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=DM+Sans:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
