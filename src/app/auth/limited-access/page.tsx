import { Metadata } from 'next';
import { Container, Title, Text, Button, Group } from '@mantine/core';
import { routes } from '@/types/routes';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Accès limité',
};

export default async function LimitedAccessPage() {
  return (
    <Container size="sm" style={{ marginTop: '10vh' }}>
      <div style={{ textAlign: 'center' }}>
        <Title order={1} size="h1" mb="md">
          Accès limité
        </Title>
        <Text size="lg" mb="xl" c="dimmed">
          Ton compte n&apos;a pas accès à cette section. Tu peux accéder aux paramètres, mais pas au reste de l&apos;application.
        </Text>
        <Group justify="center" gap="md">
          <Link href={routes.settings.index}>
            <Button variant="light">
              Aller aux paramètres
            </Button>
          </Link>
        </Group>
      </div>
    </Container>
  );
}

