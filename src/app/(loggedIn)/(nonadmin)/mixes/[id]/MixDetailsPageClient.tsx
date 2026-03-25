'use client';

import { ActionIcon, Alert, Badge, Button, Group, Modal, Stack, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconCheck, IconCopy, IconPencil, IconTrash } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteMix, updateMixName, type MixWithTracks } from '@/app/_actions/mixes';
import { handleAction } from '@/lib/action';
import { routes } from '@/types/routes';
import TrackRow from '../../../_components/Tracks/TrackRow';
import useSingleAudioPlayer from '../../../_components/Tracks/useSingleAudioPlayer';

interface MixDetailsPageClientProps {
  mix: MixWithTracks;
}

export default function MixDetailsPageClient({ mix }: MixDetailsPageClientProps) {
  const router = useRouter();
  const audioPlayer = useSingleAudioPlayer();
  const [copiedTrackId, setCopiedTrackId] = useState<string | null>(null);
  const [copiedMix, setCopiedMix] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(mix.name);
  const [nameSaving, setNameSaving] = useState(false);

  useEffect(() => {
    setNameDraft(mix.name);
  }, [mix.id, mix.name]);

  const nameDirty = nameDraft.trim() !== mix.name;
  const nameValid = nameDraft.trim().length > 0;

  const creatorLabel = mix.creatorName ?? 'Inconnu';

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

  const openRenameModal = () => {
    setNameDraft(mix.name);
    setRenameOpen(true);
  };

  const handleSaveName = async () => {
    const next = nameDraft.trim();
    if (!next || next === mix.name) {
      setRenameOpen(false);
      return;
    }
    setNameSaving(true);
    try {
      const result = await updateMixName(mix.id, nameDraft);
      handleAction(result);
      notifications.show({ title: 'Enregistré', message: 'Nom du mix mis à jour', color: 'green' });
      setRenameOpen(false);
      router.refresh();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Erreur inconnue';
      notifications.show({ title: 'Erreur', message, color: 'red' });
    } finally {
      setNameSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    setDeleting(true);
    try {
      const result = await deleteMix(mix.id);
      handleAction(result);
      notifications.show({ title: 'Supprimé', message: 'Le mix a été supprimé', color: 'green' });
      setDeleteOpen(false);
      router.push(routes.mixes.index);
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
        opened={renameOpen}
        onClose={() => !nameSaving && setRenameOpen(false)}
        title="Renommer le mix"
        centered
      >
        <TextInput
          label="Nom"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleSaveName();
          }}
          mb="md"
          autoFocus
        />
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={() => setRenameOpen(false)} disabled={nameSaving}>
            Annuler
          </Button>
          <Button loading={nameSaving} disabled={!nameValid || !nameDirty} onClick={() => void handleSaveName()}>
            Enregistrer
          </Button>
        </Group>
      </Modal>

      <Modal opened={deleteOpen} onClose={() => !deleting && setDeleteOpen(false)} title="Supprimer ce mix ?" centered>
        <Text size="sm" c="dimmed" mb="md">
          Cette action supprime le fichier sur le stockage et retire le mix de la liste. Elle est irréversible.
        </Text>
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={() => setDeleteOpen(false)} disabled={deleting}>
            Annuler
          </Button>
          <Button color="red" loading={deleting} onClick={() => void handleConfirmDelete()}>
            Supprimer
          </Button>
        </Group>
      </Modal>

      <Group justify="space-between" wrap="wrap" align="flex-end">
        <Stack gap={2}>
          <Group gap="xs" wrap="wrap" align="flex-end">
            <Title order={2}>{mix.name}</Title>
            {mix.expiresAt == null ? <Badge color="green">Persistent</Badge> : <Badge color="gray">Temp</Badge>}
          </Group>
          <Text c="dimmed" size="sm">
            Par {creatorLabel} · {mix.tracks.length} piste(s) · {Math.round(mix.totalDurationSeconds / 60)} min ·{' '}
            {mix.fileSizeMb.toFixed(2)} MB
          </Text>
        </Stack>

        <Group gap="xs">
          <Button
            onClick={handleCopyMix}
            leftSection={copiedMix ? <IconCheck size={16} /> : <IconCopy size={16} />}
            color={copiedMix ? 'green' : undefined}
            variant="subtle"
          >
            {copiedMix ? 'Copié' : 'Copier le lien'}
          </Button>
          {mix.canDelete && (
            <>
              <ActionIcon
                variant="light"
                color="orange"
                size="lg"
                onClick={openRenameModal}
                aria-label="Renommer le mix"
              >
                <IconPencil size={16} />
              </ActionIcon>
              <ActionIcon
                variant="light"
                color="red"
                size="lg"
                onClick={() => setDeleteOpen(true)}
                aria-label="Supprimer le mix"
              >
                <IconTrash size={16} />
              </ActionIcon>
            </>
          )}

        </Group>
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
              onDeleteTrack={() => { }}
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

