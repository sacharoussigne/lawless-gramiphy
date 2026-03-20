'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Button,
  Card,
  Group,
  Stack,
  Text,
  Select,
  SegmentedControl,
  TextInput,
  Title,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import { IconAlertCircle, IconMusic, IconPlayerPlay, IconPin, IconPinnedOff } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { createPlaylist, deletePlaylist, togglePinnedPlaylist } from '@/app/_actions/playlists';
import { handleAction } from '@/lib/action';
import { notifications } from '@mantine/notifications';
import Link from 'next/link';
import { routes } from '@/types/routes';
import PlaylistFormModal from './_components/PlaylistFormModal';
import { PINNED_PLAYLISTS_UPDATED_EVENT } from '@/constants/events';

type PlaylistScope = 'all' | 'mine' | 'shared';
type PlaylistSort = 'date_desc' | 'date_asc' | 'name' | 'tracks';

type PlaylistSummary = {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  ownerId: string;
  ownerName: string | null;
  tracksCount: number;
  createdAt: Date;
  updatedAt: Date;
  canEdit: boolean;
  isCollaborator: boolean;
  isPinned: boolean;
};

interface PlaylistsPageClientProps {
  initialPlaylists: PlaylistSummary[];
  currentUserId: string | null;
}

export default function PlaylistsPageClient({
  initialPlaylists,
  currentUserId,
}: PlaylistsPageClientProps) {
  const router = useRouter();
  const [playlists, setPlaylists] = useState(initialPlaylists);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pinLoadingId, setPinLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<PlaylistScope>('all');
  const [sortBy, setSortBy] = useState<PlaylistSort>('date_desc');

  useEffect(() => {
    setPlaylists(initialPlaylists);
  }, [initialPlaylists]);

  const filteredPlaylists = useMemo(() => {
    let list = [...playlists];

    if (scope === 'mine') {
      list = list.filter((pl) => pl.ownerId === currentUserId);
    }

    if (scope === 'shared') {
      list = list.filter((pl) => pl.isCollaborator && pl.ownerId !== currentUserId);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((pl) => {
        const inName = pl.name.toLowerCase().includes(q);
        const inOwner = pl.ownerName?.toLowerCase().includes(q) ?? false;
        return inName || inOwner;
      });
    }

    list.sort((a, b) => {
      const byName = a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
      const byCreatedAt = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      const byCreatedAtDesc = -byCreatedAt;
      switch (sortBy) {
        case 'name':
          return byName || byCreatedAtDesc;
        case 'tracks':
          return b.tracksCount - a.tracksCount || byName || byCreatedAtDesc;
        case 'date_asc':
          return byCreatedAt || byName;
        case 'date_desc':
        default:
          return byCreatedAtDesc || byName;
      }
    });

    return list;
  }, [playlists, currentUserId, scope, search, sortBy]);

  const handleCreate = async (values: { name: string; description?: string; image?: string | null }) => {
    setError(null);
    try {
      const result = await createPlaylist(values.name, values.description, values.image);
      handleAction(result);
      const created = (result as any).data as PlaylistSummary | undefined;
      if (created) {
        setPlaylists((prev) => [created, ...prev]);
      }
      notifications.show({
        title: 'Playlist créée',
        message: 'La playlist a été créée avec succès',
        color: 'green',
      });
    } catch (e: any) {
      const message = e.message || 'Erreur inconnue';
      setError(message);
      throw e;
    }
  };

  const handleDelete = async (pl: PlaylistSummary) => {
    if (!pl.canEdit) return;
    setDeletingId(pl.id);
    try {
      const result = await deletePlaylist(pl.id);
      handleAction(result);
      setPlaylists((prev) => prev.filter((item) => item.id !== pl.id));
      notifications.show({
        title: 'Playlist supprimée',
        message: 'La playlist a été supprimée',
        color: 'green',
      });
    } catch (e: any) {
      const message = e.message || 'Erreur inconnue';
      notifications.show({
        title: 'Erreur',
        message,
        color: 'red',
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleTogglePin = async (pl: PlaylistSummary) => {
    setPinLoadingId(pl.id);
    try {
      const result = await togglePinnedPlaylist(pl.id);
      handleAction(result);
      const pinned = (result as any).data?.pinned ?? false;
      setPlaylists((prev) =>
        prev.map((item) => (item.id === pl.id ? { ...item, isPinned: pinned } : item)),
      );
      notifications.show({
        title: pinned ? 'Épinglée' : 'Désépinglée',
        message: pinned
          ? 'La playlist a été ajoutée à la sidebar.'
          : 'La playlist a été retirée de la sidebar.',
        color: pinned ? 'blue' : 'gray',
      });
      window.dispatchEvent(new CustomEvent(PINNED_PLAYLISTS_UPDATED_EVENT));
      router.refresh();
    } catch (e: any) {
      const message = e.message || 'Erreur inconnue';
      notifications.show({
        title: 'Erreur',
        message,
        color: 'red',
      });
    } finally {
      setPinLoadingId(null);
    }
  };

  return (
    <Stack gap="xl">
        <Group justify="space-between" align="flex-start">
          <Stack gap={4}>
            <Group gap="sm">
              <IconMusic size={40} stroke={1.5} />
              <div>
                <Title order={1}>Playlists</Title>
                <Text c="dimmed" size="sm">
                  Organisez les musiques de la bibliothèque en listes.
                </Text>
              </div>
            </Group>
          </Stack>
          <Group gap="xs">
            <Button
              size="sm"
              variant="subtle"
              leftSection={<IconPlayerPlay size={14} />}
              component={Link}
              href={routes.library.index}
            >
              Revenir à la bibliothèque
            </Button>
            <Button size="sm" onClick={() => setCreateModalOpen(true)}>
              Nouvelle playlist
            </Button>
          </Group>
        </Group>

        <Card withBorder radius="md" p="sm">
          <Stack gap="sm">
            <Group justify="space-between" align="center">
              <Text c="dimmed" size="sm">
                {filteredPlaylists.length} playlist{filteredPlaylists.length > 1 ? 's' : ''}
              </Text>
            </Group>
            <Group gap="sm">
              <TextInput
                placeholder="Rechercher (nom ou propriétaire)"
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                size="sm"
                style={{ flex: 1, minWidth: 220 }}
              />
              <SegmentedControl
                style={{ flex: 1, minWidth: 200 }}
                value={scope}
                onChange={(value) => setScope(value as PlaylistScope)}
                data={[
                  { label: 'Toutes', value: 'all' },
                  { label: 'Mes playlists', value: 'mine' },
                  { label: 'Partagées', value: 'shared' },
                ]}
              />
              <Select
                style={{ maxWidth: 160 }}
                value={sortBy}
                onChange={(value) => setSortBy((value as PlaylistSort) ?? 'date_desc')}
                data={[
                  { value: 'date_desc', label: 'Plus récentes' },
                  { value: 'date_asc', label: 'Plus anciennes' },
                  { value: 'name', label: 'Nom' },
                  { value: 'tracks', label: 'Nombre de pistes' },
                ]}
              />
            </Group>
          </Stack>
        </Card>

        {error && (
          <Alert icon={<IconAlertCircle size={16} />} color="red">
            {error}
          </Alert>
        )}

        {filteredPlaylists.length === 0 ? (
          <Stack gap="xs" align="center" py="xl">
            <Text c="dimmed" ta="center">
              Aucune playlist pour le moment.
            </Text>
            <Text c="dimmed" size="sm" ta="center">
              Crée ta première playlist pour regrouper des musiques rapidement.
            </Text>
            <Button onClick={() => setCreateModalOpen(true)} variant="light">
              Créer une playlist
            </Button>
          </Stack>
        ) : (
          <Stack gap="md">
            {filteredPlaylists.map((pl) => (
              <Card
                key={pl.id}
                withBorder
                radius="md"
                p="md"
                component={Link}
                href={`${routes.playlists.index}/${pl.id}`}
                style={{ textDecoration: 'none' }}
              >
                <Group justify="space-between" align="flex-start">
                  <Group gap="sm" align="flex-start" wrap="nowrap">
                    <Avatar src={pl.image} radius="md" size={56}>
                      {pl.name.slice(0, 1).toUpperCase()}
                    </Avatar>
                    <Stack gap={4}>
                      <Text fw={500}>{pl.name}</Text>
                      {pl.description && (
                        <Text size="sm" c="dimmed">
                          {pl.description}
                        </Text>
                      )}
                      <Text size="xs" c="dimmed">
                        {pl.tracksCount} piste{pl.tracksCount > 1 ? 's' : ''} · Créée par {pl.ownerName ?? 'Inconnu'}
                      </Text>
                    </Stack>
                  </Group>
                  <Group gap="xs" justify="flex-end">
                    <Tooltip label={pl.isPinned ? 'Désépingler' : 'Épingler'} withArrow>
                      <ActionIcon
                        variant={pl.isPinned ? 'filled' : 'subtle'}
                        color={pl.isPinned ? 'green' : 'gray'}
                        loading={pinLoadingId === pl.id}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void handleTogglePin(pl);
                        }}
                        aria-label={pl.isPinned ? 'Désépingler la playlist' : 'Épingler la playlist'}
                      >
                        {pl.isPinned ? <IconPinnedOff size={16} stroke={1.8} /> : <IconPin size={16} stroke={1.8} />}
                      </ActionIcon>
                    </Tooltip>
                    {pl.canEdit && (
                      <Button
                        size="xs"
                        color="red"
                        variant="light"
                        loading={deletingId === pl.id}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          handleDelete(pl);
                        }}
                      >
                        Supprimer
                      </Button>
                    )}
                  </Group>
                </Group>
              </Card>
            ))}
          </Stack>
        )}

      <PlaylistFormModal
        opened={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Nouvelle playlist"
        submitLabel="Créer"
        onSubmit={handleCreate}
      />
    </Stack>
  );
}

