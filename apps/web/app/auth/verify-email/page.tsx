'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const email = searchParams.get('email') || '';
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState('');

  useEffect(() => {
    // Check if user is already verified (would be redirected by middleware)
    const timer = setTimeout(() => {
      // Auto-check verification every 5 seconds
      const token = localStorage.getItem('auth_token');
      if (token) {
        router.push('/dashboard');
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [router]);

  const handleResendEmail = async () => {
    setResendLoading(true);
    setResendMessage('');

    try {
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (response.ok) {
        setResendMessage('Verification email sent! Check your inbox.');
      } else {
        setResendMessage('Failed to resend email. Please try again.');
      }
    } catch (err) {
      setResendMessage('An error occurred. Please try again.');
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="bg-slate-800 rounded-lg shadow-2xl p-8 border border-slate-700 text-center">
          <div className="mb-8">
            <div className="w-16 h-16 mx-auto mb-4 bg-blue-500/20 rounded-full flex items-center justify-center">
              <svg
                className="w-8 h-8 text-blue-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Verify Your Email</h1>
            <p className="text-slate-400">We&apos;ve sent a verification email to:</p>
            <p className="text-blue-400 font-semibold mt-2">{email}</p>
          </div>

          <div className="bg-slate-700/50 rounded-lg p-4 mb-8 text-left">
            <p className="text-slate-300 text-sm">
              Click the link in the email to verify your account. This link expires in 24 hours.
            </p>
          </div>

          {resendMessage && (
            <div className="mb-6 p-3 bg-green-900/20 border border-green-500/30 rounded-lg">
              <p className="text-green-200 text-sm">{resendMessage}</p>
            </div>
          )}

          <button
            onClick={handleResendEmail}
            disabled={resendLoading}
            className="w-full py-2 px-4 mb-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors disabled:cursor-not-allowed"
          >
            {resendLoading ? 'Sending...' : 'Resend Email'}
          </button>

          <div className="text-center">
            <p className="text-slate-400">
              Wrong email?{' '}
              <Link href="/auth/signup" className="text-blue-400 hover:text-blue-300 font-semibold transition-colors">
                Create new account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
