'use client';

import { ActionIcon, Button, Card, Group, Menu, Progress, Stack, Text } from '@mantine/core';
import Link from 'next/link';
import { useMemo } from 'react';
import {
  IconCheck,
  IconCopy,
  IconDotsVertical,
  IconPlaylist,
  IconPlayerPause,
  IconPlayerPlay,
  IconTrash,
} from '@tabler/icons-react';

type TrackShape = {
  id: string;
  title: string;
  artist: string | null;
  s3Url: string;
  duration: number | null;
  thumbnail: string | null;
  uploaderName: string | null;
  canDelete?: boolean;
  youtubeUrl?: string;
  // Optional: used by some pages (library) but not required for row rendering.
  uploaderId?: string | null;
  createdAt?: Date;
};

type TrackRowProps<TTrack extends TrackShape = TrackShape> = {
  track: TTrack;
  trackHref: string;
  currentTrackId: string | null;
  isPlaying: boolean;
  progressRatio: number;
  onTogglePlay: (args: { trackId: string; src: string }) => void;
  onCopy: (s3Url: string, trackId: string) => void;
  copiedTrackId: string | null;
  onOpenAddToPlaylistMenu?: (track: TTrack) => void | Promise<void>;
  onDeleteTrack: (track: TTrack) => void | Promise<void>;
  actionsLoading?: boolean;
  deleting?: boolean;
  canShowDelete?: boolean;
  showAddToPlaylist?: boolean;
  removeActionLabel?: string;
};

function formatDuration(s: number | null) {
  if (!s) return '—';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function TrackRow<TTrack extends TrackShape>({
  track,
  trackHref,
  currentTrackId,
  isPlaying,
  progressRatio,
  onTogglePlay,
  onCopy,
  copiedTrackId,
  onOpenAddToPlaylistMenu,
  onDeleteTrack,
  actionsLoading,
  deleting,
  canShowDelete = true,
  showAddToPlaylist = true,
  removeActionLabel = 'Supprimer',
}: TrackRowProps<TTrack>) {
  const isActive = currentTrackId === track.id;
  const showProgress = isActive;
  const progressValue = useMemo(() => (showProgress ? progressRatio * 100 : 0), [progressRatio, showProgress]);

  return (
    <Card
      withBorder
      radius="md"
      p="sm"
    >
      <Group align="flex-start" justify="space-between" wrap="nowrap" gap="md">
        <Group align="center" gap="md" style={{ minWidth: 0, flex: 1 }}>
          {/* Thumbnail */}
          {track.thumbnail ? (
            <Link href={trackHref} style={{ textDecoration: 'none' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={track.thumbnail}
                alt={track.title}
                width={100}
                style={{ borderRadius: 10, objectFit: 'cover' }}
              />
            </Link>
          ) : (
            <Link href={trackHref} style={{ textDecoration: 'none' }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.08)',
                }}
              />
            </Link>
          )}

          {/* Text */}
          <Stack gap={2} style={{ minWidth: 0 }}>
            <Link href={trackHref} style={{ textDecoration: 'none' }}>
              <Text fw={700} lineClamp={1}>
                {track.title}
              </Text>
            </Link>

            <Text size="sm" c="dimmed" lineClamp={1}>
              {track.artist && <>{track.artist} · </>}
              {formatDuration(track.duration)}
            </Text>

            <Text size="xs" c="dimmed" lineClamp={1}>
              Ajoutée par {track.uploaderName ?? 'Inconnu'}
            </Text>
          </Stack>
        </Group>

        {/* Actions */}
        <Stack align="flex-end" gap={6} style={{ width: 240, maxWidth: '40vw' }}>
          <Group gap="xs" wrap="nowrap" justify="flex-end">
            <ActionIcon
              variant={isActive && isPlaying ? 'filled' : 'default'}
              color="green"
              size="lg"
              onClick={() => onTogglePlay({ trackId: track.id, src: track.s3Url })}
              aria-label={isActive && isPlaying ? 'Pause' : 'Lecture'}
            >
              {isActive && isPlaying ? <IconPlayerPause size={18} /> : <IconPlayerPlay size={18} />}
            </ActionIcon>

            <Button
              size="xs"
              variant={copiedTrackId === track.id ? 'light' : 'default'}
              color={copiedTrackId === track.id ? 'green' : undefined}
              leftSection={copiedTrackId === track.id ? <IconCheck size={14} /> : <IconCopy size={14} />}
              onClick={() => onCopy(track.s3Url, track.id)}
            >
              {copiedTrackId === track.id ? 'Copié' : 'Copier'}
            </Button>

            <Menu withinPortal>
              <Menu.Target>
                <Button size="xs" variant="subtle" px="xs" loading={actionsLoading} disabled={actionsLoading} aria-label="Actions">
                  <IconDotsVertical size={16} />
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>Actions</Menu.Label>
                {showAddToPlaylist && onOpenAddToPlaylistMenu && (
                  <Menu.Item
                    onClick={() => onOpenAddToPlaylistMenu(track)}
                    leftSection={<IconPlaylist size={16} />}
                  >
                    Ajouter à une playlist
                  </Menu.Item>
                )}
                {canShowDelete && track.canDelete && (
                  <Menu.Item
                    color="red"
                    disabled={deleting}
                    onClick={() => onDeleteTrack(track)}
                    leftSection={<IconTrash size={16} />}
                  >
                    {deleting ? `${removeActionLabel}...` : removeActionLabel}
                  </Menu.Item>
                )}
              </Menu.Dropdown>
            </Menu>
          </Group>

          <Progress value={progressValue} size="xs" radius="xl" color="green" />
        </Stack>
      </Group>
    </Card>
  );
}

