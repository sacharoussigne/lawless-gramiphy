'use client';

import {
  Stack,
  NavLink,
  ScrollArea,
  Divider,
  Text,
  Avatar,
  Button,
  Tooltip,
  Group,
} from '@mantine/core';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { IconMusic, IconPlaylist, IconUsers, IconLogout } from '@tabler/icons-react';
import { routes } from '@/types/routes';
import { usePermissions } from '@/app/_contexts/PermissionsContext';
import { checkRolePermission, hasRole } from '@/lib/auth/permissions';
import { Role } from '@/types/enum/roles';
import type { AuthSession } from '@/types/session';
import { authClient } from '@/lib/client';
import { getPinnedPlaylists } from '@/app/_actions/playlists';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PINNED_PLAYLISTS_UPDATED_EVENT } from '@/constants/events';

type SidebarNavProps = {
  session: AuthSession | null;
  onNavigate?: () => void;
  collapsed?: boolean;
};

type PinnedPlaylistSummary = {
  playlistId: string;
  name: string;
  image: string | null;
  createdAt: Date;
};

export default function SidebarNav({ session, onNavigate, collapsed }: SidebarNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { userRole } = usePermissions();
  const [pinned, setPinned] = useState<PinnedPlaylistSummary[]>([]);
  const userId = session?.user?.id ?? null;

  const canAccessGramophone = useMemo(
    () => checkRolePermission(userRole, 'gramophone', 'access'),
    [userRole],
  );

  const isActive = (href: string) =>
    pathname === href || (pathname?.startsWith(`${href}/`) ?? false);

  const items = [
    ...(checkRolePermission(userRole, 'gramophone', 'access')
      ? [
          {
            href: routes.library.index,
            label: 'Bibliothèque',
            icon: IconMusic,
          },
          {
            href: routes.playlists.index,
            label: 'Playlists',
            icon: IconPlaylist,
          },
        ]
      : []),
  ];

  const showAdmin = hasRole(userRole, Role.ADMIN);

  const handleLogout = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.refresh();
        },
      },
    });
  };

  const loadPinned = useCallback(async () => {
    if (!userId || !canAccessGramophone) {
      setPinned([]);
      return;
    }

    const result = await getPinnedPlaylists();

    if (result.status === 200) {
      const next = (result as any).data ?? [];
      setPinned((prev) => {
        const prevKey = prev.map((item) => `${item.playlistId}:${item.createdAt}`).join('|');
        const nextKey = next.map((item: PinnedPlaylistSummary) => `${item.playlistId}:${item.createdAt}`).join('|');
        return prevKey === nextKey ? prev : next;
      });
      return;
    }

    setPinned([]);
  }, [userId, canAccessGramophone]);

  useEffect(() => {
    let cancelled = false;
    void loadPinned().finally(() => {
      if (cancelled) return;
    });

    return () => {
      cancelled = true;
    };
  }, [loadPinned]);

  useEffect(() => {
    const handlePinnedUpdate = () => {
      void loadPinned();
    };

    window.addEventListener(PINNED_PLAYLISTS_UPDATED_EVENT, handlePinnedUpdate);
    return () => {
      window.removeEventListener(PINNED_PLAYLISTS_UPDATED_EVENT, handlePinnedUpdate);
    };
  }, [loadPinned]);

  return (
    <Stack h="100%" gap={0}>
      <ScrollArea type="never" style={{ flex: 1 }}>
        <Stack gap="sm" p="md">
          <Stack gap={4}>
            {items.map(({ href, label, icon: Icon }) => (
              <NavLink
                key={href}
                component={Link}
                href={href}
                label={collapsed ? undefined : label}
                leftSection={<Icon size={18} stroke={1.6} />}
                active={isActive(href)}
                onClick={onNavigate}
              />
            ))}
          </Stack>

          {pinned.length > 0 && (
            <>
              <Divider my="sm" mx="-md" color="var(--mantine-color-dark-7)" />
              <Stack gap={4}>
                {pinned.map((pl) => {
                  const href = `${routes.playlists.index}/${pl.playlistId}`;
                  const link = (
                    <NavLink
                      key={pl.playlistId}
                      component={Link}
                      href={href}
                      label={collapsed ? undefined : pl.name}
                      leftSection={
                        <Avatar src={pl.image} radius="sm" size={22}>
                          {pl.name.slice(0, 1).toUpperCase()}
                        </Avatar>
                      }
                      active={isActive(href)}
                      onClick={onNavigate}
                    />
                  );

                  if (!collapsed) return link;

                  return (
                    <Tooltip key={pl.playlistId} label={pl.name} position="right" withArrow>
                      <div>{link}</div>
                    </Tooltip>
                  );
                })}
              </Stack>
            </>
          )}

          {showAdmin && (
            <>
              <Divider my="sm" mx="-md" color="var(--mantine-color-dark-7)" />
              <NavLink
                component={Link}
                href={routes.admin.users}
                label="Gestion utilisateurs"
                leftSection={<IconUsers size={18} stroke={1.6} />}
                active={isActive(routes.admin.users)}
                onClick={onNavigate}
              />
            </>
          )}
        </Stack>
      </ScrollArea>

      {session?.user && (
        <>
          <Divider color="var(--mantine-color-dark-7)" />
          <Stack gap="xs" p="md">
            <NavLink
              py={8}
              px={8}
              component={Link}
              href={routes.settings.index}
              onClick={onNavigate}
              active={isActive(routes.settings.index)}
              leftSection={
                <Avatar
                  alt={session.user.name}
                  radius="xl"
                  size={34}
                  src={session.user.image ?? null}
                />
              }
              label={
                collapsed ? (
                  <Group gap={0} />
                ) : (
                  <Text size="sm" fw={600} truncate>
                    {session.user.name ?? 'Compte'}
                  </Text>
                )
              }
              description={
                collapsed ? undefined : (
                  <Text size="xs" c="dimmed" truncate>
                    {session.user.email}
                  </Text>
                )
              }
            />
            <Button
              variant="subtle"
              color="red"
              leftSection={<IconLogout size={16} stroke={1.7} />}
              onClick={handleLogout}
              justify="flex-start"
            >
              {collapsed ? null : 'Déconnexion'}
            </Button>
          </Stack>
        </>
      )}
    </Stack>
  );
}

