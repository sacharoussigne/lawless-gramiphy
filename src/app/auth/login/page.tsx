import Login from '@/app/pages/login';
import { getAuthSession } from '@/lib/auth';
import { routes } from '@/types/routes';
import { checkRolePermission } from '@/lib/auth/permissions';
import { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Connexion',
};

export default async function LoginPage() {
  const session = await getAuthSession();

  if (session) {
    const role = session.user.role ?? null;
    const canAccessGramophone = checkRolePermission(role, 'gramophone', 'access');
    redirect(canAccessGramophone ? routes.gramophone.index : routes.settings.index);
  }
  return <Login />;
}
