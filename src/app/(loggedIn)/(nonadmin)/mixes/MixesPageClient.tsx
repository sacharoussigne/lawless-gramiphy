'use client';

import { useMemo, useState } from 'react';
import { Alert, Card, Group, Stack, Text, TextInput, Title, Button, Badge, Modal } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconSearch, IconMusic, IconTrash } from '@tabler/icons-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { deleteMix, type MixSummary } from '@/app/_actions/mixes';
import { handleAction } from '@/lib/action';
import { routes } from '@/types/routes';

interface MixesPageClientProps {
  initialMixes: MixSummary[];
}

export default function MixesPageClient({ initialMixes }: MixesPageClientProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [mixes, setMixes] = useState(initialMixes);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return mixes;
    return mixes.filter((m) => {
      return m.id.toLowerCase().includes(q);
    });
  }, [mixes, query]);

  const handleConfirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const result = await deleteMix(deleteId);
      handleAction(result);
      setMixes((prev) => prev.filter((m) => m.id !== deleteId));
      notifications.show({ title: 'Supprimé', message: 'Le mix a été supprimé', color: 'green' });
      setDeleteId(null);
      router.refresh();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Erreur inconnue';
      notifications.show({ title: 'Erreur', message, color: 'red' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Stack gap="md">
      <Modal
        opened={deleteId != null}
        onClose={() => !deleting && setDeleteId(null)}
        title="Supprimer ce mix ?"
        centered
      >
        <Text size="sm" c="dimmed" mb="md">
          Cette action supprime le fichier sur le stockage et retire le mix de la liste.
        </Text>
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={() => setDeleteId(null)} disabled={deleting}>
            Annuler
          </Button>
          <Button color="red" loading={deleting} onClick={() => void handleConfirmDelete()}>
            Supprimer
          </Button>
        </Group>
      </Modal>

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
                    {m.expiresAt == null ? <Badge color="green">Persistent</Badge> : <Badge color="gray">Temp</Badge>}
                  </Group>
                  <Text c="dimmed" size="sm">
                    {m.tracksCount} piste(s) · {Math.round(m.totalDurationSeconds / 60)} min · {m.fileSizeMb.toFixed(2)} MB
                  </Text>
                </Stack>

                <Group gap="xs">
                  {m.canDelete && (
                    <Button
                      color="red"
                      variant="light"
                      leftSection={<IconTrash size={16} />}
                      onClick={() => setDeleteId(m.id)}
                    >
                      Supprimer
                    </Button>
                  )}
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

