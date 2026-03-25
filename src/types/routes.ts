import { NextRequest, NextResponse } from 'next/server';

export const routes = {
  admin: {
    index: '/admin',
    users: '/admin/users',
  },
  api: {},
  settings: {
    index: '/settings',
  },
  library: {
    index: '/libraries',
  },
  playlists: {
    index: '/playlists',
  },
  mixes: {
    index: '/mixes',
  },
  auth: {
    index: '/auth',
    login: '/auth/login',
    logout: '/auth/logout',
    register: '/auth/register',
    resetPassword: '/auth/reset-password',
    verifyEmail: '/auth/verify-email',
    noAccess: '/auth/no-access',
    limitedAccess: '/auth/limited-access',
  },
  redirect: (request: NextRequest, route: string) => {
    return NextResponse.redirect(new URL(route, request.url));
  },
};
