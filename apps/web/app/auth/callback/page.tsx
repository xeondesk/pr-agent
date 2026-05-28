'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function CallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const processCallback = async () => {
      try {
        // Get the access token from URL hash
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');

        if (accessToken) {
          // Store token in localStorage
          localStorage.setItem('auth_token', accessToken);
          // Redirect to dashboard
          router.push('/dashboard');
        } else {
          // No token found, redirect to login
          router.push('/auth/login');
        }
      } catch (error) {
        console.error('Callback error:', error);
        router.push('/auth/login');
      }
    };

    processCallback();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="text-center">
        <div className="mb-4">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
        <p className="text-slate-400">Completing your sign in...</p>
      </div>
    </div>
  );
}
