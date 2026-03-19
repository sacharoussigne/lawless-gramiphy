'use client';

import {
  Stack,
  NavLink,
  ScrollArea,
  Divider,
  Text,
  Avatar,
  Button,
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

type SidebarNavProps = {
  session: AuthSession | null;
  onNavigate?: () => void;
};

export default function SidebarNav({ session, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { userRole } = usePermissions();

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
                label={label}
                leftSection={<Icon size={18} stroke={1.6} />}
                active={isActive(href)}
                onClick={onNavigate}
              />
            ))}
          </Stack>

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
                <Text size="sm" fw={600} truncate>
                  {session.user.name ?? 'Compte'}
                </Text>
              }
              description={
                <Text size="xs" c="dimmed" truncate>
                  {session.user.email}
                </Text>
              }
            />
            <Button
              variant="subtle"
              color="red"
              leftSection={<IconLogout size={16} stroke={1.7} />}
              onClick={handleLogout}
              justify="flex-start"
            >
              Déconnexion
            </Button>
          </Stack>
        </>
      )}
    </Stack>
  );
}

