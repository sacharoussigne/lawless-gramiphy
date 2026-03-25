'use client';

import { Alert, Badge, Button, Group, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconCheck, IconCopy, IconMusic } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import type { MixWithTracks } from '@/app/_actions/mixes';
import TrackRow from '../../../_components/Tracks/TrackRow';
import useSingleAudioPlayer from '../../../_components/Tracks/useSingleAudioPlayer';

interface MixDetailsPageClientProps {
  mix: MixWithTracks;
}

export default function MixDetailsPageClient({ mix }: MixDetailsPageClientProps) {
  const audioPlayer = useSingleAudioPlayer();
  const [copiedTrackId, setCopiedTrackId] = useState<string | null>(null);
  const [copiedMix, setCopiedMix] = useState(false);

  const title = useMemo(() => 'Mix', []);

  const handleCopyTrack = (s3Url: string, id: string) => {
    navigator.clipboard.writeText(s3Url);
    setCopiedTrackId(id);
    setTimeout(() => setCopiedTrackId(null), 2000);
    notifications.show({ title: 'Copié', message: 'Lien copié dans le presse-papiers', color: 'blue' });
  };

  const handleCopyMix = () => {
    navigator.clipboard.writeText(mix.s3Url);
    setCopiedMix(true);
    setTimeout(() => setCopiedMix(false), 2000);
    notifications.show({ title: 'Copié', message: 'Lien du mix copié dans le presse-papiers', color: 'blue' });
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="wrap" align="flex-end">
        <Stack gap={2}>
          <Group gap="xs" wrap="wrap">
            <Title order={2}>{title}</Title>
            {mix.isPersistent ? <Badge color="green">Persistent</Badge> : <Badge color="gray">Temp</Badge>}
          </Group>
          <Text c="dimmed" size="sm">
            {mix.tracks.length} piste(s) · {Math.round(mix.totalDurationSeconds / 60)} min · {mix.fileSizeMb.toFixed(2)} MB
          </Text>
        </Stack>

        <Button
          onClick={handleCopyMix}
          leftSection={copiedMix ? <IconCheck size={16} /> : <IconCopy size={16} />}
          color={copiedMix ? 'green' : undefined}
          variant="default"
        >
          {copiedMix ? 'Copié' : 'Copier le lien'}
        </Button>
      </Group>

      {mix.tracks.length === 0 ? (
        <Alert icon={<IconAlertCircle size={16} />} title="Mix vide" color="gray">
          Ce mix ne contient aucune piste.
        </Alert>
      ) : (
        <Stack gap="sm">
          {mix.tracks.map((t) => (
            <TrackRow
              key={t.id}
              track={t}
              trackHref={`/tracks/${t.id}`}
              currentTrackId={audioPlayer.currentTrackId}
              isPlaying={audioPlayer.isPlaying}
              progressRatio={audioPlayer.progressRatio}
              onTogglePlay={(args) => audioPlayer.togglePlay(args)}
              onCopy={handleCopyTrack}
              copiedTrackId={copiedTrackId}
              onDeleteTrack={() => {}}
              canShowDelete={false}
              showAddToPlaylist={false}
              removeActionLabel="Retirer"
              actionsLoading={false}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

