'use client';

import {
  Avatar,
  Button,
  Container,
  Group,
  Menu,
  UnstyledButton,
} from '@mantine/core';
import classes from './Header.module.scss';
import { authClient } from '@/lib/client';
import { useRouter, usePathname } from 'next/navigation';
import { useState } from 'react';
import { AuthSession } from '@/types/session';
import { routes } from '@/types/routes';
import Link from 'next/link';
import Image from 'next/image';
import { IconLogout, IconSettings } from '@tabler/icons-react';
import { usePermissions } from '@/app/_contexts/PermissionsContext';
import { hasRole, checkRolePermission } from '@/lib/auth/permissions';
import { Role } from '@/types/enum/roles';

export default function Header({
  session,
}: Readonly<{
  session: AuthSession | null;
}>) {
  const router = useRouter();
  const pathname = usePathname();
  const [userMenuOpened, setUserMenuOpened] = useState(false);
  const { permissions, userRole } = usePermissions();

  const isAdminSpace = pathname?.startsWith(routes.admin.index) || false;

  const handleLogout = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.refresh();
        },
      },
    });
  };

  // Check if a route is active
  const isRouteActive = (route: string) => {
    if (!pathname) return false;
    // Exact match
    if (pathname === route) return true;
    // Starts with route + '/' (for sub-routes)
    if (pathname.startsWith(`${route}/`)) return true;
    return false;
  };

  return (
    <header className={`${classes.header} mb-10`}>
      <Container size={'xl'}>
        <div className={'flex justify-between items-center w-full h-[60px]'}>
          <Link
            href={
              checkRolePermission(userRole, 'gramophone', 'access')
                ? routes.gramophone.index
                : routes.settings.index
            }
            className={classes.logoLink}
          >
            <Image
              src="/logo_gramiphy.png"
              alt="Gramiphy"
              width={50}
              height={50}
              className="rounded-full"
              style={{ borderRadius: '50%' }}
            />
          </Link>

          {session && <div className="flex gap-4"></div>}

          <Group>
            {session ? (
              <>
                {!isAdminSpace && checkRolePermission(userRole, 'gramophone', 'access') && (
                  <Link
                    href={routes.gramophone.index}
                    className={`${classes.link} ${isRouteActive(routes.gramophone.index) ? classes.linkActive : ''}`}
                  >
                    Gramophone
                  </Link>
                )}
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
                      className={`user ${userMenuOpened ? 'userActive' : ''}`}
                    >
                      <Group gap={7}>
                        <Avatar
                          alt={session.user.name}
                          radius="xl"
                          size={40}
                          src={session.user.image ?? null}
                        />
                      </Group>
                    </UnstyledButton>
                  </Menu.Target>
                  <Menu.Dropdown>
                    {hasRole(userRole, Role.ADMIN) && (
                      <>
                        <Menu.Label>Admin</Menu.Label>
                        <Link href={routes.admin.users}>
                          <Menu.Item>
                            Gestion Utilisateur
                          </Menu.Item>
                        </Link>
                        <Menu.Divider />
                      </>
                    )}
                    <Link href={routes.settings.index}>
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
              </>
            ) : (
              <>
                <Button variant="default" component={Link} href={routes.auth.login}>
                  Se connecter
                </Button>
                <Button component={Link} href={routes.auth.register}>
                  S'inscrire
                </Button>
              </>
            )}
          </Group>
        </div>
      </Container>
    </header>
  );
}
