'use client';

import { AppShell, Container } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { AuthSession } from '@/types/session';
import TopBar from './TopBar';
import SidebarNav from './SidebarNav';

type LoggedInShellProps = {
  session: AuthSession | null;
  children: React.ReactNode;
};

export default function LoggedInShell({ session, children }: LoggedInShellProps) {
  const [collapsed, { toggle: toggleCollapsed }] = useDisclosure(false);

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: collapsed ? 84 : 280,
        breakpoint: 'sm',
      }}
      padding="md"
    >
      <AppShell.Header>
        <TopBar collapsed={collapsed} toggleCollapsed={toggleCollapsed} />
      </AppShell.Header>

      <AppShell.Navbar>
        <SidebarNav session={session} collapsed={collapsed} />
      </AppShell.Navbar>

      <AppShell.Main>
        <Container size="xl" py="md">
          {children}
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}

