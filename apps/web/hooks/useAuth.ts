'use client';

import { useAuth as useAuthContext } from '@/providers/AuthProvider';

export function useAuth() {
  return useAuthContext();
}

export function useRequireAuth() {
  const { user, loading } = useAuthContext();

  return {
    user,
    loading,
    isAuthenticated: !!user,
  };
}
