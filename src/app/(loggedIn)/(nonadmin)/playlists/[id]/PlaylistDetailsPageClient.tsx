'use client';

import {
  Alert,
  Avatar,
  Button,
  Group,
  Stack,
  Text,
  Title,
  TextInput,
  Slider,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconCheck,
  IconCopy,
  IconMusic,
  IconPlayerPlay,
  IconPlaylist,
  IconPin,
  IconPinnedOff,
} from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import {
  removeTrackFromPlaylist,
  togglePinnedPlaylist,
  updatePlaylist,
} from '@/app/_actions/playlists';
import { handleAction } from '@/lib/action';
import { notifications } from '@mantine/notifications';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { routes } from '@/types/routes';
import CollaboratorsModal from './_components/CollaboratorsModal';
import TrackRow from '../../../_components/Tracks/TrackRow';
import useSingleAudioPlayer from '../../../_components/Tracks/useSingleAudioPlayer';
import PlaylistFormModal from '../_components/PlaylistFormModal';
import { PINNED_PLAYLISTS_UPDATED_EVENT } from '@/constants/events';

type PlaylistTrack = {
  id: string;
  title: string;
  artist: string | null;
  duration: number | null;
  thumbnail: string | null;
  s3Url: string;
  position: number;
  uploaderName: string | null;
};

type PlaylistWithTracks = {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  ownerId: string;
  ownerName: string | null;
  ownerEmail?: string | null;
  createdAt: Date;
  updatedAt: Date;
  canEdit: boolean;
  isOwner: boolean;
  isAdminOrDj: boolean;
  isPinned: boolean;
  collaborators: {
    id: string;
    name: string | null;
    email: string | null;
  }[];
  tracks: PlaylistTrack[];
};

interface PlaylistDetailsPageClientProps {
  playlist: PlaylistWithTracks;
}

export default function PlaylistDetailsPageClient({ playlist }: PlaylistDetailsPageClientProps) {
  const router = useRouter();
  const audioPlayer = useSingleAudioPlayer();
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedMixMode, setCopiedMixMode] = useState<'game' | 'stream' | null>(null);
  const [collaboratorsModalOpen, setCollaboratorsModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);

  const filteredTracks = useMemo(() => {
    if (!search.trim()) return playlist.tracks;
    const q = search.toLowerCase();
    return playlist.tracks.filter((t) => {
      const inTitle = t.title.toLowerCase().includes(q);
      const inArtist = t.artist?.toLowerCase().includes(q) ?? false;
      const inUploader = t.uploaderName?.toLowerCase().includes(q) ?? false;
      return inTitle || inArtist || inUploader;
    });
  }, [playlist.tracks, search]);

  const handleCopy = (s3Url: string, id: string) => {
    navigator.clipboard.writeText(s3Url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    notifications.show({
      title: 'Copié',
      message: 'Lien copié dans le presse-papiers',
      color: 'blue',
    });
  };

  const handleCopyMixGameUrl = () => {
    const mixUrl = `${window.location.origin}/api/mixes/playlist/${playlist.id}/mix.mp3`;
    navigator.clipboard.writeText(mixUrl);
    setCopiedMixMode('game');
    setTimeout(() => setCopiedMixMode(null), 2000);
    notifications.show({
      title: 'Copié',
      message: 'Lien mix (.mp3, Content-Length) pour le jeu',
      color: 'blue',
    });
  };

  const handleCopyMixStreamUrl = () => {
    const mixUrl = `${window.location.origin}/api/mixes/playlist?playlistId=${encodeURIComponent(playlist.id)}`;
    navigator.clipboard.writeText(mixUrl);
    setCopiedMixMode('stream');
    setTimeout(() => setCopiedMixMode(null), 2000);
    notifications.show({
      title: 'Copié',
      message: 'Lien mix streaming (navigateur)',
      color: 'blue',
    });
  };

  const handleRemove = async (track: PlaylistTrack) => {
    if (!playlist.canEdit) return;
    setRemovingId(track.id);
    setError(null);
    try {
      const result = await removeTrackFromPlaylist(playlist.id, track.id);
      handleAction(result);
      notifications.show({
        title: 'Retirée',
        message: 'La musique a été retirée de la playlist',
        color: 'green',
      });
      router.refresh();
    } catch (e: any) {
      const message = e.message || 'Erreur inconnue';
      setError(message);
      notifications.show({
        title: 'Erreur',
        message,
        color: 'red',
      });
    } finally {
      setRemovingId(null);
    }
  };

  const handleTogglePin = async () => {
    setPinLoading(true);
    try {
      const result = await togglePinnedPlaylist(playlist.id);
      handleAction(result);
      const pinned = (result as any).data?.pinned ?? false;
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
      setPinLoading(false);
    }
  };

  const canManageCollaborators = playlist.isOwner || playlist.isAdminOrDj;
  const canEditMetadata = playlist.isOwner || playlist.isAdminOrDj;

  const handleUpdatePlaylist = async (values: {
    name: string;
    description?: string;
    image?: string | null;
  }) => {
    setError(null);
    try {
      const result = await updatePlaylist({
        id: playlist.id,
        name: values.name,
        description: values.description,
        image: values.image,
      });
      handleAction(result);
      notifications.show({
        title: 'Playlist mise à jour',
        message: 'Les informations de la playlist ont été modifiées',
        color: 'green',
      });
      router.refresh();
    } catch (e: any) {
      const message = e.message || 'Erreur inconnue';
      setError(message);
      throw e;
    }
  };

  return (
    <Stack gap="xl">
      <Group justify="space-between" align="flex-start">
        <Stack gap="xs">
          <Group gap="sm">
            <Avatar src={playlist.image} radius="md" size={72}>
              <IconMusic size={28} stroke={1.5} />
            </Avatar>
            <div>
              <Title order={1}>{playlist.name}</Title>
              {playlist.description && (
                <Text c="dimmed" size="sm">
                  {playlist.description}
                </Text>
              )}
              <Text c="dimmed" size="xs">
                Créée par {playlist.ownerName ?? 'Inconnu'} · {playlist.tracks.length} piste
                {playlist.tracks.length > 1 ? 's' : ''}
              </Text>
            </div>
          </Group>
        </Stack>
        <Group gap="xs">
          <Button
            size="xs"
            variant="subtle"
            color={copiedMixMode === 'game' ? 'green' : undefined}
            leftSection={copiedMixMode === 'game' ? <IconCheck size={14} /> : <IconCopy size={14} />}
            onClick={handleCopyMixGameUrl}
          >
            {copiedMixMode === 'game' ? 'Lien jeu copié' : 'Copier mix (jeu)'}
          </Button>
          <Button
            size="xs"
            variant="subtle"
            color={copiedMixMode === 'stream' ? 'green' : undefined}
            leftSection={copiedMixMode === 'stream' ? <IconCheck size={14} /> : <IconCopy size={14} />}
            onClick={handleCopyMixStreamUrl}
          >
            {copiedMixMode === 'stream' ? 'Lien stream copié' : 'Copier mix (navigateur)'}
          </Button>
          <Tooltip label={playlist.isPinned ? 'Désépingler' : 'Épingler'} withArrow>
            <ActionIcon
              size="lg"
              variant={playlist.isPinned ? 'filled' : 'subtle'}
              color={playlist.isPinned ? 'blue' : 'gray'}
              loading={pinLoading}
              onClick={() => void handleTogglePin()}
              aria-label={playlist.isPinned ? 'Désépingler la playlist' : 'Épingler la playlist'}
            >
              {playlist.isPinned ? (
                <IconPinnedOff size={18} stroke={1.8} />
              ) : (
                <IconPin size={18} stroke={1.8} />
              )}
            </ActionIcon>
          </Tooltip>
          {canEditMetadata && (
            <Button size="xs" variant="default" onClick={() => setEditModalOpen(true)}>
              Modifier la playlist
            </Button>
          )}
          {canManageCollaborators && (
            <Button
              size="xs"
              variant="default"
              onClick={() => setCollaboratorsModalOpen(true)}
            >
              Gérer les collaborateurs
            </Button>
          )}
          <Button
            size="xs"
            variant="subtle"
            leftSection={<IconPlaylist size={14} />}
            component={Link}
            href={routes.playlists.index}
          >
            Toutes les playlists
          </Button>
          <Button
            size="xs"
            variant="subtle"
            leftSection={<IconPlayerPlay size={14} />}
            component={Link}
            href={routes.library.index}
          >
            Bibliothèque
          </Button>
        </Group>
      </Group>

      {error && (
        <Alert icon={<IconAlertCircle size={16} />} color="red">
          {error}
        </Alert>
      )}

      <CollaboratorsModal
        opened={collaboratorsModalOpen}
        onClose={() => setCollaboratorsModalOpen(false)}
        playlistId={playlist.id}
        ownerLabel={`Propriétaire : ${playlist.ownerName ?? 'Inconnu'}${playlist.ownerEmail ? ` (${playlist.ownerEmail})` : ''}`}
        collaborators={playlist.collaborators}
        canManage={canManageCollaborators}
      />

      <PlaylistFormModal
        opened={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Modifier la playlist"
        submitLabel="Enregistrer"
        initialValues={{
          name: playlist.name,
          description: playlist.description,
          image: playlist.image,
        }}
        onSubmit={handleUpdatePlaylist}
      />

      <Stack gap="md">
        <Group justify="space-between" align="center" wrap="nowrap" gap="xl">
          <TextInput
            placeholder="Rechercher (titre, artiste, uploader)"
            value={search}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setSearch(event.currentTarget.value)}
            size="sm"
            style={{ flex: 1, minWidth: 220, }}
          />
          <Group gap="xs" align="center" style={{ minWidth: 240 }}>
            <Text size="xs" c="dimmed">
              Volume
            </Text>
            <div style={{ flex: 1, minWidth: 120 }}>
              <Slider
                value={Math.round((audioPlayer.volume ?? 1) * 100)}
                min={0}
                max={100}
                step={1}
                onChange={(v) => audioPlayer.setVolume((v as number) / 100)}
                size="sm"
              />
            </div>
          </Group>
        </Group>
      </Stack>

      <Stack gap="md">
        {filteredTracks.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">
            Aucune musique ne correspond à la recherche.
          </Text>
        ) : (
          <Stack gap="sm">
            {filteredTracks.map((track) => (
              <TrackRow
                key={track.id}
                track={{ ...track, canDelete: playlist.canEdit }}
                trackHref={`/tracks/${track.id}`}
                currentTrackId={audioPlayer.currentTrackId}
                isPlaying={audioPlayer.isPlaying}
                progressRatio={audioPlayer.progressRatio}
                onTogglePlay={(args) => audioPlayer.togglePlay(args)}
                onCopy={handleCopy}
                copiedTrackId={copiedId}
                onDeleteTrack={(t) => void handleRemove(t as any)}
                deleting={removingId === track.id}
                showAddToPlaylist={false}
                removeActionLabel="Retirer"
              />
            ))}
          </Stack>
        )}
      </Stack>
    </Stack>
  );
}

