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
  const [opened, { toggle, close }] = useDisclosure();

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: 280,
        breakpoint: 'sm',
        collapsed: { mobile: !opened },
      }}
      padding="md"
    >
      <AppShell.Header>
        <TopBar session={session} opened={opened} toggle={toggle} />
      </AppShell.Header>

      <AppShell.Navbar>
        <SidebarNav onNavigate={close} />
      </AppShell.Navbar>

      <AppShell.Main>
        <Container size="xl" py="md">
          {children}
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}

