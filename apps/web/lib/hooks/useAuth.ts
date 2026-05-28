'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

export interface User {
  id: string;
  email: string;
  emailConfirmed: boolean;
  metadata?: Record<string, any>;
}

export function useAuth() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch user profile on mount
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        if (!token) {
          setUser(null);
          setLoading(false);
          return;
        }

        const response = await fetch('/api/auth/profile', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          if (response.status === 401) {
            // Token expired
            localStorage.removeItem('auth_token');
            setUser(null);
          } else {
            throw new Error('Failed to fetch user');
          }
        } else {
          const data = await response.json();
          setUser(data);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, []);

  const logout = useCallback(async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      }
      localStorage.removeItem('auth_token');
      setUser(null);
      router.push('/auth/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Logout failed');
    }
  }, [router]);

  const updateProfile = useCallback(
    async (updates: Partial<User>) => {
      try {
        const token = localStorage.getItem('auth_token');
        if (!token) {
          throw new Error('Not authenticated');
        }

        const response = await fetch('/api/auth/profile', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(updates),
        });

        if (!response.ok) {
          throw new Error('Failed to update profile');
        }

        const data = await response.json();
        setUser(data);
        return data;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Update failed');
        throw err;
      }
    },
    []
  );

  return {
    user,
    loading,
    error,
    logout,
    updateProfile,
    isAuthenticated: !!user,
  };
}
