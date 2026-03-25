'use client';

import { useMemo, useState, type MouseEvent } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconCheck, IconCopy, IconSearch, IconTrash } from '@tabler/icons-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { deleteMix, type MixSummary } from '@/app/_actions/mixes';
import { handleAction } from '@/lib/action';
import { routes } from '@/types/routes';

interface MixesPageClientProps {
  initialMixes: MixSummary[];
}

type MixScopeFilter = 'all' | 'temp' | 'persistent';

export default function MixesPageClient({ initialMixes }: MixesPageClientProps) {
  const router = useRouter();
  const [scope, setScope] = useState<MixScopeFilter>('all');
  const [query, setQuery] = useState('');
  const [mixes, setMixes] = useState(initialMixes);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = mixes;
    if (scope === 'temp') {
      list = list.filter((m) => m.expiresAt != null);
    } else if (scope === 'persistent') {
      list = list.filter((m) => m.expiresAt == null);
    }

    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((m) => {
      const creator = (m.creatorName ?? '').toLowerCase();
      const mixName = m.name.toLowerCase();
      return m.id.toLowerCase().includes(q) || creator.includes(q) || mixName.includes(q);
    });
  }, [mixes, query, scope]);

  const handleCopyMixLink = (e: MouseEvent<HTMLButtonElement>, m: MixSummary) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(m.s3Url);
    setCopiedId(m.id);
    setTimeout(() => setCopiedId(null), 2000);
    notifications.show({
      title: 'Copié',
      message: 'Lien du mix copié dans le presse-papiers',
      color: 'blue',
    });
  };

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
            Tous les mixes, du plus récent au plus ancien
          </Text>
        </Stack>

        <Group gap="sm" wrap="wrap" align="flex-end">
          <SegmentedControl
            value={scope}
            onChange={(v) => setScope(v as MixScopeFilter)}
            data={[
              { label: 'Tous', value: 'all' },
              { label: 'Temporaires', value: 'temp' },
              { label: 'Persistants', value: 'persistent' },
            ]}
          />
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            leftSection={<IconSearch size={16} />}
            placeholder="Rechercher…"
            w={320}
          />
        </Group>
      </Group>

      {filtered.length === 0 ? (
        <Alert icon={<IconAlertCircle size={16} />} title="Aucun mix" color="gray">
          Aucun mix à afficher.
        </Alert>
      ) : (
        <Stack gap="sm">
          {filtered.map((m) => (
            <Card
              key={m.id}
              withBorder
              radius="md"
              p="md"
              component={Link}
              href={`${routes.mixes.index}/${m.id}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <Group justify="space-between" align="center" wrap="wrap">
                <Stack gap={2}>
                  <Group gap="xs" wrap="wrap">
                    <Text fw={600}>{m.name}</Text>
                    {m.expiresAt == null ? <Badge color="green">Persistent</Badge> : <Badge color="gray">Temp</Badge>}
                  </Group>
                  <Text c="dimmed" size="sm">
                    Par {m.creatorName ?? 'Inconnu'} · {m.tracksCount} piste(s) · {Math.round(m.totalDurationSeconds / 60)}{' '}
                    min · {m.fileSizeMb.toFixed(2)} MB
                  </Text>
                </Stack>

                <Group gap="xs">
                  <ActionIcon
                    size="lg"
                    variant="light"
                    color={copiedId === m.id ? 'green' : undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleCopyMixLink(e, m)
                    }}
                  >
                    <IconCopy size={16} />
                  </ActionIcon>
                  {m.canDelete && (
                    <ActionIcon
                      size="lg"
                      variant="light"
                      color="red"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDeleteId(m.id)
                      }}
                      aria-label="Supprimer le mix"
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  )}
                </Group>
              </Group>
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

