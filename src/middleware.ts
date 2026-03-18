import { NextRequest } from 'next/server';
import { routes } from './types/routes';
import { getAuthSession } from './lib/auth';
import { hasToBeLoggedOutMiddleware } from './middlewares/hasToBeLoggedOutMiddleware';
import { hasToBeLoggedInMiddleware } from './middlewares/hasToBeLoggedInMiddleware';
import { hasAdminRoleMiddleware } from './middlewares/hasAdminRoleMiddleware';
import { hasGramophoneAccessMiddleware } from './middlewares/hasGramophoneAccessMiddleware';
import { hasSettingsAccessMiddleware } from './middlewares/hasSettingsAccessMiddleware';
import { chain } from './middlewares/chain';

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  const session = await getAuthSession();

  const middlewares = [];

  if (pathname.startsWith(routes.auth.index)) {
    // For auth routes, only check if user should be logged out
    // Except for informational pages which should be accessible even if logged in
    if (pathname !== routes.auth.noAccess && pathname !== routes.auth.limitedAccess) {
      middlewares.push(hasToBeLoggedOutMiddleware);
    }
  } else if (pathname.startsWith(routes.admin.index)) {
    // For admin routes, check login, then admin role
    middlewares.push(hasToBeLoggedInMiddleware);

    // Only admin should access admin pages
    if (pathname === routes.admin.users) {
      middlewares.push(hasAdminRoleMiddleware);
    }
  } else if (pathname.startsWith(routes.gramophone.index)) {
    // For gramophone routes, check login, then gramophone access
    middlewares.push(hasToBeLoggedInMiddleware);
    middlewares.push(hasGramophoneAccessMiddleware);
  } else if (pathname.startsWith(routes.settings.index)) {
    // For settings routes, check login, then settings access
    middlewares.push(hasToBeLoggedInMiddleware);
    middlewares.push(hasSettingsAccessMiddleware);
  } else {
    // For other routes, just require login
    middlewares.push(hasToBeLoggedInMiddleware);
  }

  return chain(...middlewares)(req, session);
}

export const config = {
  runtime: 'nodejs',
  matcher: [
    '/',
    '/auth/:path*',
    '/settings/:path*',
    '/admin/:path*',
    '/gramophone/:path*',
  ],
};
