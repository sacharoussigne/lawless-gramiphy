'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ActionIcon,
  Alert,
  Button,
  Card,
  Group,
  Slider,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconCopy, IconPlayerPause, IconPlayerPlay, IconTrash, IconPlaylist, IconMusic } from '@tabler/icons-react';
import { deleteTrack } from '@/app/_actions/tracks';
import { handleAction } from '@/lib/action';
import useSingleAudioPlayer from './useSingleAudioPlayer';
import AddToPlaylistModal from './AddToPlaylistModal';
import { routes } from '@/types/routes';

type Track = {
  id: string;
  title: string;
  artist: string | null;
  youtubeUrl: string;
  s3Url: string;
  fileSizeMb: number | null;
  duration: number | null;
  thumbnail: string | null;
  uploaderId: string | null;
  uploaderName: string | null;
  canDelete: boolean;
  createdAt: Date;
};

function formatDuration(s: number) {
  if (!Number.isFinite(s) || s < 0) return '—';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function formatStoredMb(mb: number | null) {
  if (mb == null || !Number.isFinite(mb) || mb < 0) return null;
  return `${mb.toFixed(2)} Mo`;
}

export default function TrackDetailsPageClient({ track }: { track: Track }) {
  const router = useRouter();
  const audioPlayer = useSingleAudioPlayer();

  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);

  const [addToPlaylistOpened, setAddToPlaylistOpened] = useState(false);

  const fileSizeLabel = formatStoredMb(track.fileSizeMb);

  const active = audioPlayer.currentTrackId === track.id;
  const durationSeconds = active ? audioPlayer.duration || track.duration || 0 : track.duration || audioPlayer.duration || 0;
  const positionSeconds = active ? audioPlayer.position : 0;
  const progressPct = durationSeconds ? (positionSeconds / durationSeconds) * 100 : 0;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(track.s3Url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      notifications.show({
        title: 'Copié',
        message: 'Lien copié dans le presse-papiers',
        color: 'blue',
      });
    } catch {
      setError('Impossible de copier le lien');
    }
  };

  const handleDelete = async () => {
    if (!track.canDelete) return;
    setDeleting(true);
    setError(null);
    try {
      const result = await deleteTrack(track.id);
      handleAction(result);
      notifications.show({
        title: 'Supprimée',
        message: 'La musique a été supprimée de la bibliothèque',
        color: 'green',
      });
      router.push(routes.library.index);
    } catch (e: any) {
      const message = e.message || 'Erreur inconnue';
      setError(message);
      notifications.show({
        title: 'Erreur',
        message,
        color: 'red',
      });
    } finally {
      setDeleting(false);
    }
  };

  const openAddToPlaylistModal = () => {
    setAddToPlaylistOpened(true);
    setError(null);
  };

  return (
    <Stack gap="xl">
      <Group justify="space-between" align="flex-start">
        <Stack gap={4}>
          <Group gap="sm">
            <IconMusic size={40} stroke={1.5} />
            <div>
              <Title order={1}>{track.title}</Title>
              {track.artist && <Text c="dimmed" size="sm">{track.artist}</Text>}
              <Text c="dimmed" size="xs">
                Ajoutée par {track.uploaderName ?? 'Inconnu'} · {formatDuration(track.duration ?? 0)}
                {fileSizeLabel ? ` · ${fileSizeLabel}` : ''}
              </Text>
            </div>
          </Group>
        </Stack>

        <Group gap="xs">
          <Button size="sm" variant="subtle" component={Link} href={routes.library.index}>
            Bibliothèque
          </Button>
          <ActionIcon
            size="lg"
            variant="light"
            onClick={openAddToPlaylistModal}
            aria-label="Ajouter à une playlist"
          >
            <IconPlaylist size={18} />
          </ActionIcon>
          {track.canDelete && (
            <Button size="sm" color="red" variant="light" leftSection={<IconTrash size={14} />} loading={deleting} onClick={handleDelete}>
              Supprimer
            </Button>
          )}
        </Group>
      </Group>

      {error && (
        <Alert icon={<IconAlertCircle size={16} />} title="Erreur" color="red">
          {error}
        </Alert>
      )}

      <Card withBorder radius="md" p="lg">
        <Stack gap="md">
          <Group align="center" justify="space-between" wrap="nowrap">
            <Group align="center" gap="md" style={{ flex: 1, minWidth: 0 }}>
              {track.thumbnail ? (
                <img
                  src={track.thumbnail}
                  alt={track.title}
                  width={72}
                  height={72}
                  style={{ borderRadius: 14, objectFit: 'cover' }}
                />
              ) : (
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 14,
                    background: 'rgba(255,255,255,0.08)',
                  }}
                />
              )}

              <Stack gap={2} style={{ minWidth: 0 }}>
                <Text fw={700} lineClamp={1}>
                  {track.title}
                </Text>
                {track.artist && (
                  <Text size="sm" c="dimmed" lineClamp={1}>
                    {track.artist}
                  </Text>
                )}
              </Stack>
            </Group>

            <Button
              size="lg"
              variant="filled"
              color="green"
              leftSection={active && audioPlayer.isPlaying ? <IconPlayerPause size={18} /> : <IconPlayerPlay size={18} />}
              onClick={() => audioPlayer.togglePlay({ trackId: track.id, src: track.s3Url })}
            >
              {active && audioPlayer.isPlaying ? 'Pause' : 'Lecture'}
            </Button>
          </Group>

          <Stack gap={8}>
            <div
              role="slider"
              aria-label="Progression lecture"
              tabIndex={0}
              style={{
                height: 10,
                borderRadius: 999,
                background: 'rgba(255,255,255,0.08)',
                position: 'relative',
                cursor: durationSeconds ? 'pointer' : 'not-allowed',
                overflow: 'hidden',
              }}
              onClick={(e) => {
                if (!durationSeconds) return;
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
                audioPlayer.seekTo(ratio * durationSeconds);
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${progressPct}%`,
                  background: 'var(--mantine-color-green-6)',
                }}
              />
            </div>
            <Group justify="space-between">
              <Text size="xs" c="dimmed">
                {formatDuration(positionSeconds)}
              </Text>
              <Text size="xs" c="dimmed">
                {formatDuration(durationSeconds)}
              </Text>
            </Group>
          </Stack>

          <Group justify="flex-end" align="center" gap="xs">
            <Text size="xs" c="dimmed">
              Volume
            </Text>
            <div style={{ width: 190 }}>
              <Slider
                value={Math.round((audioPlayer.volume ?? 1) * 100)}
                min={0}
                max={100}
                step={1}
                onChange={(v) => audioPlayer.setVolume((v as number) / 100)}
                size="xs"
              />
            </div>
          </Group>

          <Group justify="space-between" wrap="nowrap">
            <Button variant="default" leftSection={<IconCopy size={14} />} onClick={handleCopy}>
              {copied ? 'Copié' : 'Copier'}
            </Button>
            <ActionIcon
              variant="subtle"
              size="lg"
              onClick={openAddToPlaylistModal}
              aria-label="Playlists"
            >
              <IconPlaylist size={18} />
            </ActionIcon>
          </Group>
        </Stack>
      </Card>

      <AddToPlaylistModal
        opened={addToPlaylistOpened}
        trackIds={[track.id]}
        trackTitle={track.title}
        onClose={() => setAddToPlaylistOpened(false)}
      />
    </Stack>
  );
}

