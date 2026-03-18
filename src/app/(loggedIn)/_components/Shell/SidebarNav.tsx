'use client';

import { Stack, NavLink, ScrollArea, Divider, Text } from '@mantine/core';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IconMusic, IconPlaylist, IconSettings, IconUsers } from '@tabler/icons-react';
import { routes } from '@/types/routes';
import { usePermissions } from '@/app/_contexts/PermissionsContext';
import { checkRolePermission, hasRole } from '@/lib/auth/permissions';
import { Role } from '@/types/enum/roles';

type SidebarNavProps = {
  onNavigate?: () => void;
};

export default function SidebarNav({ onNavigate }: SidebarNavProps) {
  const pathname = usePathname();
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
    { href: routes.settings.index, label: 'Paramètres', icon: IconSettings },
  ];

  const showAdmin = hasRole(userRole, Role.ADMIN);

  return (
    <ScrollArea type="never" style={{ height: '100%' }}>
      <Stack gap="sm" p="md">
        <Text
          size="xs"
          c="green.4"
          fw={600}
          tt="uppercase"
          style={{ letterSpacing: 0.6 }}
        >
          Menu
        </Text>

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
            <Divider my="sm" />
            <Text size="xs" c="green.4" fw={600} tt="uppercase" style={{ letterSpacing: 0.6 }}>
              Admin
            </Text>
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
  );
}

