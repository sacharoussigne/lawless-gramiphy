/* eslint-disable react/jsx-no-useless-fragment */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Modal, ScrollArea, Stack, Text, TextInput, Group } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconPlayerPlay } from '@tabler/icons-react';
import { addTrackToPlaylist, getManageablePlaylistsForTrack } from '@/app/_actions/playlists';
import { handleAction } from '@/lib/action';

type PlaylistSummary = {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  ownerName: string | null;
  tracksCount: number;
  createdAt: Date;
  updatedAt: Date;
  canEdit: boolean;
};

type TrackLike = {
  id: string;
  title: string;
};

type AddToPlaylistModalProps = {
  opened: boolean;
  onClose: () => void;
  track: TrackLike | null;
};

export default function AddToPlaylistModal({ opened, onClose, track }: AddToPlaylistModalProps) {
  const [loading, setLoading] = useState(false);
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [playlistSearch, setPlaylistSearch] = useState('');
  const [addingToPlaylistId, setAddingToPlaylistId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filteredPlaylists = useMemo(() => {
    if (!playlistSearch.trim()) return playlists;
    const q = playlistSearch.toLowerCase();
    return playlists.filter((pl) => {
      const inName = pl.name.toLowerCase().includes(q);
      const inOwner = pl.ownerName?.toLowerCase().includes(q) ?? false;
      return inName || inOwner;
    });
  }, [playlists, playlistSearch]);

  useEffect(() => {
    if (!opened || !track) return;

    let cancelled = false;
    setError(null);
    setPlaylistSearch('');
    setPlaylists([]);
    setLoading(true);

    (async () => {
      try {
        const result = await getManageablePlaylistsForTrack(track.id);
        const data = handleAction(result) as PlaylistSummary[] | undefined;
        if (!cancelled && data) setPlaylists(data);
      } catch (e: any) {
        if (cancelled) return;
        const message = e?.message || 'Erreur inconnue';
        setError(message);
        notifications.show({
          title: 'Erreur',
          message,
          color: 'red',
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [opened, track?.id]);

  const handleAddToPlaylist = async (playlistId: string) => {
    if (!track) return;
    setAddingToPlaylistId(playlistId);

    try {
      const result = await addTrackToPlaylist(playlistId, track.id);
      handleAction(result);

      notifications.show({
        title: 'Ajoutée à la playlist',
        message: 'La musique a été ajoutée à la playlist',
        color: 'green',
      });

      // After successful add, refresh the list so it disappears from “already in playlist”.
      const refreshedResult = await getManageablePlaylistsForTrack(track.id);
      const refreshed = handleAction(refreshedResult) as PlaylistSummary[] | undefined;
      setPlaylists(refreshed ?? []);
      setPlaylistSearch('');
    } catch (e: any) {
      const message = e?.message || 'Erreur inconnue';
      setError(message);
      notifications.show({
        title: 'Erreur',
        message,
        color: 'red',
      });
    } finally {
      setAddingToPlaylistId(null);
    }
  };

  const title = track ? `Ajouter "${track.title}" à une playlist` : 'Ajouter à une playlist';

  return (
    <Modal
      opened={opened}
      onClose={() => {
        setError(null);
        setPlaylistSearch('');
        onClose();
      }}
      title={title}
      size="lg"
      centered
    >
      <Stack gap="sm">
        <Text size="xs" c="dimmed">
          Rechercher puis ajouter.
        </Text>

        <TextInput
          placeholder="Rechercher une playlist"
          value={playlistSearch}
          onChange={(event) => setPlaylistSearch(event.currentTarget.value)}
          disabled={loading}
          autoFocus
        />

        {error && (
          <Alert icon={<IconAlertCircle size={16} />} color="red">
            {error}
          </Alert>
        )}

        <ScrollArea.Autosize mah={320} offsetScrollbars>
          <Stack gap="xs">
            {loading ? (
              <Text c="dimmed" size="sm">
                Chargement…
              </Text>
            ) : filteredPlaylists.length === 0 ? (
              <Text c="dimmed" size="sm">
                {playlists.length === 0
                  ? 'Aucune playlist disponible à gérer (ou la musique est déjà présente).'
                  : 'Aucune playlist ne correspond à la recherche.'}
              </Text>
            ) : (
              filteredPlaylists.map((pl) => (
                <Group key={pl.id} justify="space-between" align="center" wrap="nowrap">
                  <div style={{ minWidth: 0 }}>
                    <Text size="sm" fw={600} lineClamp={1}>
                      {pl.name}
                    </Text>
                    <Text size="xs" c="dimmed" lineClamp={1}>
                      {pl.tracksCount} piste{pl.tracksCount > 1 ? 's' : ''} · Propriétaire {pl.ownerName ?? 'Inconnu'}
                    </Text>
                  </div>

                  <Button
                    size="xs"
                    variant="default"
                    leftSection={<IconPlayerPlay size={14} />}
                    loading={addingToPlaylistId === pl.id}
                    disabled={addingToPlaylistId !== null && addingToPlaylistId !== pl.id}
                    onClick={() => handleAddToPlaylist(pl.id)}
                  >
                    Ajouter
                  </Button>
                </Group>
              ))
            )}
          </Stack>
        </ScrollArea.Autosize>
      </Stack>
    </Modal>
  );
}

