import { Metadata } from 'next';
import { Title, Text, Button, Group, Stack } from '@mantine/core';
import { routes } from '@/types/routes';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Accès limité',
};

export default async function LimitedAccessPage() {
  return (
    <Stack gap="xl" ta="center">
      <Title order={1}>Accès limité</Title>
      <Text size="lg" c="dimmed">
        Ton compte n&apos;a pas accès à cette section. Tu peux accéder aux
        paramètres, mais pas au reste de l&apos;application.
      </Text>
      <Group justify="center" gap="md">
        <Link href={routes.settings.index}>
          <Button variant="light">Aller aux paramètres</Button>
        </Link>
      </Group>
    </Stack>
  );
}

