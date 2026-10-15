import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@form-config/react/styles.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'form-config playground',
  description: 'Schema-driven forms rendered with Base UI and react-hook-form.',
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="pg-header">
          <strong>form-config</strong>
          <nav aria-label="Playground">
            <a href="/">Examples</a>
            <a href="/editor">Editor</a>
            <a href="/custom">Custom components</a>
            <a href="/embedded">Embedded</a>
            <a href="/large?fields=500">Large form</a>
          </nav>
        </header>
        <main className="pg-main">{children}</main>
      </body>
    </html>
  );
}
