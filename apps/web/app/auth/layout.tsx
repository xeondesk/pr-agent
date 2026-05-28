import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Auth - PR-Agent',
  description: 'Authentication for PR-Agent',
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
