/* eslint-disable react/jsx-no-useless-fragment */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, ActionIcon, Group, Loader, Modal, ScrollArea, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconCheck, IconPlus } from '@tabler/icons-react';
import { addTracksToPlaylist, getManageablePlaylistsForTracks } from '@/app/_actions/playlists';
import { handleAction } from '@/lib/action';

type AddToPlaylistModalProps = {
  opened: boolean;
  onClose: () => void;
  trackIds: string[];
  trackTitle?: string | null;
};

type PlaylistManageableSummaryForTracks = {
  id: string;
  name: string;
  ownerName: string | null;
  tracksCount: number;
  alreadyInCount: number;
};

export default function AddToPlaylistModal({ opened, onClose, trackIds, trackTitle }: AddToPlaylistModalProps) {
  const [loading, setLoading] = useState(false);
  const selectedCount = trackIds.length;
  const trackIdsKey = useMemo(() => trackIds.join(','), [trackIds]);

  const [playlists, setPlaylists] = useState<PlaylistManageableSummaryForTracks[]>([]);
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
    if (!opened || trackIds.length === 0) return;

    let cancelled = false;
    setError(null);
    setPlaylistSearch('');
    setPlaylists([]);
    setLoading(true);

    (async () => {
      try {
        const result = await getManageablePlaylistsForTracks(trackIds);
        const data = handleAction(result) as PlaylistManageableSummaryForTracks[] | undefined;
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
  }, [opened, trackIdsKey]);

  const handleAddToPlaylist = async (playlistId: string) => {
    setAddingToPlaylistId(playlistId);

    try {
      const result = await addTracksToPlaylist(playlistId, trackIds);
      const data = handleAction(result) as { addedCount: number; skippedCount: number };

      notifications.show({
        title: data.addedCount > 0 ? 'Ajouté à la playlist' : 'Rien à ajouter',
        message:
          selectedCount === 1
            ? 'La musique a été ajoutée à la playlist.'
            : `${data.addedCount} ajoutée${data.addedCount > 1 ? 's' : ''}${data.skippedCount > 0 ? `, ${data.skippedCount} déjà présente${data.skippedCount > 1 ? 's' : ''}` : ''} à la playlist.`,
        color: data.addedCount > 0 ? 'green' : 'yellow',
      });

      onClose();
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

  const titleText = selectedCount === 1 && trackTitle ? `Ajouter "${trackTitle}" à une playlist` : 'Ajouter à une playlist';
  const subtitleText =
    selectedCount === 1 ? 'Choisir une playlist' : `${selectedCount} musiques sélectionnées`;

  return (
    <Modal
      opened={opened}
      onClose={() => {
        setError(null);
        setPlaylistSearch('');
        onClose();
      }}
      centered
      size={460}
      withCloseButton={false}
      overlayProps={{ opacity: 0.2, blur: 2 }}
      title=""
      styles={{
        content: {
          background: '#1f1f1f',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8,
        },
        body: {
          padding: 10,
        },
        header: { display: 'none' },
      }}
    >
      <Stack gap={8}>
        <Stack gap={2} px={4} pt={2}>
          <Text size="sm" fw={700}>
            {titleText}
          </Text>
          <Text size="xs" c="dimmed">
            {subtitleText}
          </Text>
        </Stack>

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

        <ScrollArea.Autosize mah={340} offsetScrollbars>
          <Stack gap="xs">
            {loading ? (
              <Text c="dimmed" size="sm">
                Chargement…
              </Text>
            ) : filteredPlaylists.length === 0 ? (
              <Text c="dimmed" size="sm">
                {playlists.length === 0 ? 'Aucune playlist disponible à gérer.' : 'Aucune playlist ne correspond à la recherche.'}
              </Text>
            ) : (
              filteredPlaylists.map((pl) => (
                <Group
                  key={pl.id}
                  justify="space-between"
                  align="center"
                  wrap="nowrap"
                  px={8}
                  py={6}
                  style={{
                    borderRadius: 6,
                    background: 'rgba(255,255,255,0.02)',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <Text size="sm" fw={600} lineClamp={1}>
                      {pl.name}
                    </Text>
                    <Text size="xs" c="dimmed" lineClamp={1}>
                      {pl.tracksCount} piste{pl.tracksCount > 1 ? 's' : ''} · Propriétaire {pl.ownerName ?? 'Inconnu'}
                    </Text>
                    {selectedCount > 1 && (
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {pl.alreadyInCount} déjà présente{pl.alreadyInCount > 1 ? 's' : ''} · +{Math.max(0, selectedCount - pl.alreadyInCount)} à ajouter
                      </Text>
                    )}
                  </div>

                  {(() => {
                    const addableCount = Math.max(0, selectedCount - pl.alreadyInCount);
                    const isDisabled = addableCount === 0;
                    const isLoading = addingToPlaylistId === pl.id;

                    return (
                      <ActionIcon
                        variant={isDisabled ? 'transparent' : 'subtle'}
                        color={isDisabled ? 'gray' : 'green'}
                        size="md"
                        disabled={isDisabled || (addingToPlaylistId !== null && addingToPlaylistId !== pl.id)}
                        onClick={() => handleAddToPlaylist(pl.id)}
                        aria-label={isDisabled ? 'Déjà ajouté' : 'Ajouter à la playlist'}
                      >
                        {isLoading ? <Loader size={16} color="green" /> : isDisabled ? <IconCheck size={16} /> : <IconPlus size={16} />}
                      </ActionIcon>
                    );
                  })()}
                </Group>
              ))
            )}
          </Stack>
        </ScrollArea.Autosize>
      </Stack>
    </Modal>
  );
}

