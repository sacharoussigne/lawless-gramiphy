'use client';

import {
  Alert,
  Button,
  Card,
  Container,
  Group,
  Stack,
  Text,
  Title,
  SimpleGrid,
  TextInput,
  Divider,
} from '@mantine/core';
import { IconAlertCircle, IconMusic, IconTrash, IconCopy, IconCheck, IconPlayerPlay, IconPlaylist } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { addCollaborator, removeCollaborator, removeTrackFromPlaylist } from '@/app/_actions/playlists';
import { handleAction } from '@/lib/action';
import { notifications } from '@mantine/notifications';
import { useMemo, useState } from 'react';
import { Image } from '@mantine/core';
import Link from 'next/link';
import { routes } from '@/types/routes';

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
  ownerId: string;
  ownerName: string | null;
  ownerEmail?: string | null;
  createdAt: Date;
  updatedAt: Date;
  canEdit: boolean;
  isOwner: boolean;
  isAdminOrDj: boolean;
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

function formatDuration(s: number | null) {
  if (!s) return '—';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function PlaylistDetailsPageClient({
  playlist,
}: PlaylistDetailsPageClientProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [collaboratorEmail, setCollaboratorEmail] = useState('');
  const [savingCollaborator, setSavingCollaborator] = useState(false);
  const [removingCollaboratorId, setRemovingCollaboratorId] = useState<string | null>(null);

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

  const handleCopy = (track: PlaylistTrack) => {
    navigator.clipboard.writeText(track.s3Url);
    setCopiedId(track.id);
    setTimeout(() => setCopiedId(null), 2000);
    notifications.show({
      title: 'Copié',
      message: 'Lien copié dans le presse-papiers',
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

  const canManageCollaborators = playlist.isOwner || playlist.isAdminOrDj;

  const handleAddCollaborator = async () => {
    const email = collaboratorEmail.trim();
    if (!email) return;
    setSavingCollaborator(true);
    setError(null);
    try {
      const result = await addCollaborator(playlist.id, email);
      handleAction(result);
      notifications.show({
        title: 'Collaborateur ajouté',
        message: 'Cet utilisateur peut maintenant gérer la playlist.',
        color: 'green',
      });
      setCollaboratorEmail('');
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
      setSavingCollaborator(false);
    }
  };

  const handleRemoveCollaborator = async (userId: string) => {
    setRemovingCollaboratorId(userId);
    setError(null);
    try {
      const result = await removeCollaborator(playlist.id, userId);
      handleAction(result);
      notifications.show({
        title: 'Collaborateur retiré',
        message: 'Cet utilisateur ne peut plus gérer la playlist.',
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
      setRemovingCollaboratorId(null);
    }
  };

  return (
    <Container size="xl" py="xl">
      <Stack gap="xl">
        <Group justify="space-between" align="flex-start">
          <Stack gap="xs">
            <Group gap="sm">
              <IconMusic size={40} stroke={1.5} />
              <div>
                <Title order={1}>{playlist.name}</Title>
                {playlist.description && (
                  <Text c="dimmed" size="sm">
                    {playlist.description}
                  </Text>
                )}
                <Text c="dimmed" size="xs">
                  Créée par {playlist.ownerName ?? 'Inconnu'} ·{' '}
                  {playlist.tracks.length} piste{playlist.tracks.length > 1 ? 's' : ''}
                </Text>
              </div>
            </Group>
          </Stack>
          <Group gap="xs">
            <Button
              size="xs"
              variant="subtle"
              leftSection={<IconPlaylist size={14} />}
              component={Link}
              href={routes.gramophone.playlists}
            >
              Toutes les playlists
            </Button>
            <Button
              size="xs"
              variant="subtle"
              leftSection={<IconPlayerPlay size={14} />}
              component={Link}
              href={routes.gramophone.index}
            >
              Gramophone
            </Button>
          </Group>
        </Group>

        {error && (
          <Alert icon={<IconAlertCircle size={16} />} color="red">
            {error}
          </Alert>
        )}

        {(playlist.collaborators.length > 0 || canManageCollaborators) && (
          <Card withBorder radius="md" p="md">
            <Stack gap="sm">
              <Group justify="space-between" align="center">
                <Text fw={500}>Collaborateurs</Text>
                <Text size="xs" c="dimmed">
                  Propriétaire : {playlist.ownerName ?? 'Inconnu'}
                  {playlist.ownerEmail && ` (${playlist.ownerEmail})`}
                </Text>
              </Group>
              {playlist.collaborators.length === 0 ? (
                <Text size="sm" c="dimmed">
                  Aucun collaborateur pour le moment.
                </Text>
              ) : (
                <Stack gap={4}>
                  {playlist.collaborators.map((user) => (
                    <Group key={user.id} justify="space-between">
                      <div>
                        <Text size="sm">{user.name ?? user.email ?? 'Utilisateur'}</Text>
                        {user.email && (
                          <Text size="xs" c="dimmed">
                            {user.email}
                          </Text>
                        )}
                      </div>
                      {canManageCollaborators && (
                        <Button
                          size="xs"
                          variant="subtle"
                          color="red"
                          loading={removingCollaboratorId === user.id}
                          onClick={() => handleRemoveCollaborator(user.id)}
                        >
                          Retirer
                        </Button>
                      )}
                    </Group>
                  ))}
                </Stack>
              )}

              {canManageCollaborators && (
                <>
                  <Divider my="sm" />
                  <Group align="flex-end" gap="sm">
                    <TextInput
                      label="Ajouter un collaborateur"
                      placeholder="Email de l'utilisateur"
                      value={collaboratorEmail}
                      onChange={(event) => setCollaboratorEmail(event.currentTarget.value)}
                      style={{ flex: 1 }}
                    />
                    <Button
                      onClick={handleAddCollaborator}
                      loading={savingCollaborator}
                      disabled={!collaboratorEmail.trim()}
                    >
                      Ajouter
                    </Button>
                  </Group>
                </>
              )}
            </Stack>
          </Card>
        )}

        <Stack gap="md">
          <TextInput
            placeholder="Rechercher dans la playlist (titre, artiste, uploader)"
            value={search}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              setSearch(event.currentTarget.value)
            }
            size="xs"
          />

          {filteredTracks.length === 0 ? (
            <Text c="dimmed" ta="center" py="xl">
              Aucune musique ne correspond à la recherche.
            </Text>
          ) : (
            <SimpleGrid cols={3} spacing="md">
              {filteredTracks.map((track) => (
                <Card key={track.id} withBorder radius="md" p="md">
                  <Group gap="md" align="flex-start" wrap="nowrap">
                    {track.thumbnail && (
                      <Image
                        src={track.thumbnail}
                        alt={track.title}
                        w={72}
                        h={72}
                        fit="cover"
                        radius="sm"
                        style={{ flexShrink: 0 }}
                        fallbackSrc="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='72' height='72'%3E%3Crect fill='%23ddd' width='72' height='72'/%3E%3C/svg%3E"
                      />
                    )}
                    <Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
                      <Text fw={500}>{track.title}</Text>
                      <Text size="sm" c="dimmed">
                        {track.artist && <>{track.artist} · </>}
                        {formatDuration(track.duration)}
                      </Text>
                      <Text size="xs" c="dimmed">
                        Ajoutée par {track.uploaderName ?? 'Inconnu'}
                      </Text>
                      <Group gap="xs" wrap="nowrap" align="center">
                        <Text
                          size="xs"
                          c="dimmed"
                          ff="monospace"
                          style={{ flex: 1, minWidth: 0 }}
                          lineClamp={1}
                          title={track.s3Url}
                        >
                          {track.s3Url}
                        </Text>
                        <Button
                          size="xs"
                          variant={copiedId === track.id ? 'light' : 'default'}
                          color={copiedId === track.id ? 'green' : undefined}
                          leftSection={
                            copiedId === track.id ? (
                              <IconCheck size={14} />
                            ) : (
                              <IconCopy size={14} />
                            )
                          }
                          onClick={() => handleCopy(track)}
                        >
                          {copiedId === track.id ? 'Copié' : 'Copier'}
                        </Button>
                        {playlist.canEdit && (
                          <Button
                            size="xs"
                            color="red"
                            variant="light"
                            leftSection={<IconTrash size={14} />}
                            loading={removingId === track.id}
                            onClick={() => handleRemove(track)}
                          >
                            Retirer
                          </Button>
                        )}
                      </Group>
                      <audio
                        controls
                        src={track.s3Url}
                        style={{ width: '100%', marginTop: '0.5rem' }}
                      />
                    </Stack>
                  </Group>
                </Card>
              ))}
            </SimpleGrid>
          )}
        </Stack>
      </Stack>
    </Container>
  );
}

