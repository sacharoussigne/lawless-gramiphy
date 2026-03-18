import { getAuthSession } from '@/lib/auth';
import { PermissionsProvider } from '@/app/_contexts/PermissionsContext';
import { calculatePermissions } from '@/lib/auth/calculatePermissions';
import LoggedInShell from '@/app/(loggedIn)/_components/Shell/LoggedInShell';

export default async function LanguageLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ userLanguageAlias?: string }>;
}) {
  const session = await getAuthSession();
  const role = session?.user?.role || null;
  const permissions = calculatePermissions(role);

  return (
    <PermissionsProvider initialPermissions={permissions} initialRole={role}>
      <LoggedInShell session={session as any}>{children}</LoggedInShell>
    </PermissionsProvider>
  );
}
