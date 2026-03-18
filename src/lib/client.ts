import { createAuthClient } from 'better-auth/client';
import { adminClient } from "better-auth/client/plugins"
import { ac, admin, visitor, user, dj } from './auth/permissions';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  plugins: [
    adminClient({
      ac: ac,
      roles: {
        admin,
        visitor,
        user,
        dj,
      }
    })
  ]
});

export const signInWithDiscord = async () => {
  const data = await authClient.signIn.social({
    provider: 'discord',
  });
};
