'use client';

import { ActionIcon, Avatar, Group, Menu, Text, UnstyledButton } from '@mantine/core';
import { IconLogout, IconMenu2, IconSettings } from '@tabler/icons-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/client';
import { routes } from '@/types/routes';
import type { AuthSession } from '@/types/session';
import { usePermissions } from '@/app/_contexts/PermissionsContext';
import { hasRole } from '@/lib/auth/permissions';
import { Role } from '@/types/enum/roles';

type TopBarProps = {
  session: AuthSession | null;
  opened: boolean;
  toggle: () => void;
};

export default function TopBar({ session, opened, toggle }: TopBarProps) {
  const router = useRouter();
  const [userMenuOpened, setUserMenuOpened] = useState(false);
  const { userRole } = usePermissions();

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
    <Group h="100%" px="md" justify="space-between" wrap="nowrap">
      <Group gap="sm" wrap="nowrap">
        <ActionIcon
          variant="subtle"
          size="lg"
          onClick={toggle}
          aria-label={opened ? 'Fermer le menu' : 'Ouvrir le menu'}
        >
          <IconMenu2 size={20} stroke={1.8} />
        </ActionIcon>

        <Link
          href={routes.library.index}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            textDecoration: 'none',
          }}
        >
          <Image
            src="/logo_gramiphy.png"
            alt="Gramiphy"
            width={28}
            height={28}
            style={{ borderRadius: 6 }}
          />
          <Text fw={700} size="sm">
            Gramiphy
          </Text>
        </Link>
      </Group>

      <Group gap="xs" wrap="nowrap">
        {session && (
          <Menu
            width={260}
            position="bottom-end"
            transitionProps={{ transition: 'pop-top-right' }}
            onClose={() => setUserMenuOpened(false)}
            onOpen={() => setUserMenuOpened(true)}
            withinPortal
          >
            <Menu.Target>
              <UnstyledButton
                aria-label="Menu utilisateur"
                style={{
                  borderRadius: 999,
                  padding: 2,
                  outline: userMenuOpened ? '2px solid var(--mantine-color-green-6)' : 'none',
                  outlineOffset: 2,
                }}
              >
                <Avatar
                  alt={session.user.name}
                  radius="xl"
                  size={34}
                  src={session.user.image ?? null}
                />
              </UnstyledButton>
            </Menu.Target>

            <Menu.Dropdown>
              {hasRole(userRole, Role.ADMIN) && (
                <>
                  <Menu.Label>Admin</Menu.Label>
                  <Link href={routes.admin.users} style={{ textDecoration: 'none' }}>
                    <Menu.Item>Gestion Utilisateur</Menu.Item>
                  </Link>
                  <Menu.Divider />
                </>
              )}

              <Link href={routes.settings.index} style={{ textDecoration: 'none' }}>
                <Menu.Item leftSection={<IconSettings size={16} stroke={1.5} />}>
                  Paramètres
                </Menu.Item>
              </Link>

              <Menu.Item
                leftSection={<IconLogout size={16} stroke={1.5} />}
                onClick={handleLogout}
              >
                Déconnexion
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        )}
      </Group>
    </Group>
  );
}

