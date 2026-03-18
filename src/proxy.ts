import { NextRequest, NextResponse } from 'next/server';
import { routes } from './types/routes';
import { auth } from './lib/auth';
import { hasToBeLoggedOutMiddleware } from './middlewares/hasToBeLoggedOutMiddleware';
import { hasToBeLoggedInMiddleware } from './middlewares/hasToBeLoggedInMiddleware';
import { hasAdminRoleMiddleware } from './middlewares/hasAdminRoleMiddleware';
import { hasGramophoneAccessMiddleware } from './middlewares/hasGramophoneAccessMiddleware';
import { hasSettingsAccessMiddleware } from './middlewares/hasSettingsAccessMiddleware';
import { chain } from './middlewares/chain';

async function getSessionFromRequest(req: NextRequest) {
  try {
    return await auth.api.getSession({
      headers: req.headers,
    });
  } catch {
    return null;
  }
}

export async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Bypass proxy for Next internals, API routes, and static assets.
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/favicon.ico' ||
    /\.[a-z0-9]+$/i.test(pathname)
  ) {
    return NextResponse.next();
  }

  // Route selection (matcher-like): only protect the routes we care about.
  const shouldProxy =
    pathname === '/' ||
    pathname.startsWith(routes.auth.index) ||
    pathname.startsWith(routes.settings.index) ||
    pathname.startsWith(routes.admin.index) ||
    pathname.startsWith(routes.library.index) ||
    pathname.startsWith(routes.playlists.index);

  if (!shouldProxy) {
    return NextResponse.next();
  }

  const session = await getSessionFromRequest(req);

  const middlewares = [];

  if (pathname.startsWith(routes.auth.index)) {
    if (pathname !== routes.auth.noAccess && pathname !== routes.auth.limitedAccess) {
      middlewares.push(hasToBeLoggedOutMiddleware);
    }
  } else if (pathname.startsWith(routes.admin.index)) {
    middlewares.push(hasToBeLoggedInMiddleware);
    if (pathname === routes.admin.users) {
      middlewares.push(hasAdminRoleMiddleware);
    }
  } else if (pathname.startsWith(routes.library.index)) {
    middlewares.push(hasToBeLoggedInMiddleware);
    middlewares.push(hasGramophoneAccessMiddleware);
  } else if (pathname.startsWith(routes.playlists.index)) {
    middlewares.push(hasToBeLoggedInMiddleware);
    middlewares.push(hasGramophoneAccessMiddleware);
  } else if (pathname.startsWith(routes.settings.index)) {
    middlewares.push(hasToBeLoggedInMiddleware);
    middlewares.push(hasSettingsAccessMiddleware);
  } else {
    middlewares.push(hasToBeLoggedInMiddleware);
  }

  return chain(...middlewares)(req, session);
}

export default proxy;

