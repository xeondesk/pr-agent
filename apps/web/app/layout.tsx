import type { Metadata } from 'next';
import './globals.css';
import React from 'react';
import { AuthProvider } from '@/providers/AuthProvider';
import { Sidebar } from './components/Sidebar';
import { Navbar } from './components/Navbar';

export const metadata: Metadata = {
  title: 'CodeReview - AI PR Analysis Platform',
  description: 'Intelligent pull request analysis and code review platform powered by AI',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-text-primary">
        <AuthProvider>
          <div className="flex">
            <Sidebar />
            <div className="flex-1 flex flex-col md:ml-0">
              <Navbar />
              <main className="flex-1 overflow-auto bg-background">
                {children}
              </main>
            </div>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
