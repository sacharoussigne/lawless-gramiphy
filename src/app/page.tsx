import { getAuthSession } from '@/lib/auth';
import { routes } from '@/types/routes';
import { redirect } from 'next/navigation';
import { checkRolePermission } from '@/lib/auth/permissions';

export default async function Home() {
  const session = await getAuthSession();
  if (!session) {
      redirect(routes.auth.login)
  } else {
      const role = session.user.role ?? null;
      const canAccessGramophone = checkRolePermission(role, 'gramophone', 'access');

      if (canAccessGramophone) {
        redirect(routes.library.index);
      }

      redirect(routes.settings.index);
  }
}
