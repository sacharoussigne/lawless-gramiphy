'use client';

import { useMemo, useState } from 'react';
import { Alert, Card, Group, Stack, Text, TextInput, Title, Button, Badge } from '@mantine/core';
import { IconAlertCircle, IconSearch, IconMusic } from '@tabler/icons-react';
import Link from 'next/link';
import type { MixSummary } from '@/app/_actions/mixes';
import { routes } from '@/types/routes';

interface MixesPageClientProps {
  initialMixes: MixSummary[];
}

export default function MixesPageClient({ initialMixes }: MixesPageClientProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return initialMixes;
    return initialMixes.filter((m) => {
      return m.id.toLowerCase().includes(q);
    });
  }, [initialMixes, query]);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Stack gap={2}>
          <Title order={2}>Mixes</Title>
          <Text c="dimmed" size="sm">
            Tes mixes exportés
          </Text>
        </Stack>

        <TextInput
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          leftSection={<IconSearch size={16} />}
          placeholder="Rechercher…"
          w={320}
        />
      </Group>

      {filtered.length === 0 ? (
        <Alert icon={<IconAlertCircle size={16} />} title="Aucun mix" color="gray">
          Aucun mix à afficher.
        </Alert>
      ) : (
        <Stack gap="sm">
          {filtered.map((m) => (
            <Card key={m.id} withBorder radius="md" p="md">
              <Group justify="space-between" align="center" wrap="wrap">
                <Stack gap={2}>
                  <Group gap="xs" wrap="wrap">
                    <Text fw={600}>Mix</Text>
                    {m.isPersistent ? <Badge color="green">Persistent</Badge> : <Badge color="gray">Temp</Badge>}
                  </Group>
                  <Text c="dimmed" size="sm">
                    {m.tracksCount} piste(s) · {Math.round(m.totalDurationSeconds / 60)} min · {m.fileSizeMb.toFixed(2)} MB
                  </Text>
                </Stack>

                <Group gap="xs">
                  <Button
                    component={Link}
                    href={`${routes.mixes.index}/${m.id}`}
                    leftSection={<IconMusic size={16} />}
                    variant="default"
                  >
                    Détails
                  </Button>
                </Group>
              </Group>
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

