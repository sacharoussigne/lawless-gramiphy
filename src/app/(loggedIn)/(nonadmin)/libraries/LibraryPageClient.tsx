'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Stack,
  Card,
  TextInput,
  Button,
  Text,
  Group,
  Alert,
  Title,
  Select,
  Group as MantineGroup,
  Modal,
  ScrollArea,
} from '@mantine/core';
import {
  IconMusic,
  IconAlertCircle,
  IconPlaylist,
  IconPlus,
} from '@tabler/icons-react';
import TrackRow from '../../_components/Tracks/TrackRow';
import useSingleAudioPlayer from '../../_components/Tracks/useSingleAudioPlayer';
import { downloadTrack, deleteTrack } from '@/app/_actions/tracks';
import { addTrackToPlaylist, getPlaylists } from '@/app/_actions/playlists';
import { handleAction } from '@/lib/action';
import { notifications } from '@mantine/notifications';
import Link from 'next/link';
import { routes } from '@/types/routes';

type Track = {
  id: string;
  title: string;
  artist: string | null;
  youtubeUrl: string;
  s3Url: string;
  duration: number | null;
  thumbnail: string | null;
  uploaderId: string | null;
  uploaderName: string | null;
  canDelete: boolean;
  createdAt: Date;
};

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

interface LibraryPageClientProps {
  initialTracks: Track[];
}

function formatDuration(s: number | null) {
  if (!s) return '—';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function LibraryPageClient({ initialTracks }: LibraryPageClientProps) {
  const router = useRouter();
  const audioPlayer = useSingleAudioPlayer();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addModalOpened, setAddModalOpened] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [uploaderFilter, setUploaderFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'title' | 'artist'>('date_desc');
  const [addingToPlaylistId, setAddingToPlaylistId] = useState<string | null>(null);
  const [availablePlaylists, setAvailablePlaylists] = useState<PlaylistSummary[] | null>(null);
  const [addToPlaylistTrack, setAddToPlaylistTrack] = useState<Track | null>(null);
  const [playlistSearch, setPlaylistSearch] = useState('');

  const uploaders = useMemo(() => {
    const map = new Map<string, string>();
    initialTracks.forEach((t) => {
      if (t.uploaderId && t.uploaderName) {
        map.set(t.uploaderId, t.uploaderName);
      }
    });
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [initialTracks]);

  const filteredTracks = useMemo(() => {
    let list = [...initialTracks];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((t) => {
        const inTitle = t.title.toLowerCase().includes(q);
        const inArtist = t.artist?.toLowerCase().includes(q) ?? false;
        const inUploader = t.uploaderName?.toLowerCase().includes(q) ?? false;
        return inTitle || inArtist || inUploader;
      });
    }

    if (uploaderFilter) {
      list = list.filter((t) => t.uploaderId === uploaderFilter);
    }

    list.sort((a, b) => {
      switch (sortBy) {
        case 'title':
          return a.title.localeCompare(b.title);
        case 'artist':
          return (a.artist ?? '').localeCompare(b.artist ?? '');
        case 'date_asc':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'date_desc':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    return list;
  }, [initialTracks, search, uploaderFilter, sortBy]);

  const filteredPlaylists = useMemo(() => {
    if (!availablePlaylists) return [];
    if (!playlistSearch.trim()) return availablePlaylists;
    const q = playlistSearch.toLowerCase();
    return availablePlaylists.filter((pl) => {
      const inName = pl.name.toLowerCase().includes(q);
      const inOwner = pl.ownerName?.toLowerCase().includes(q) ?? false;
      return inName || inOwner;
    });
  }, [availablePlaylists, playlistSearch]);

  const handleDownload = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const result = await downloadTrack(url.trim());
      const data = handleAction(result);

      if (data) {
        setUrl('');
        setAddModalOpened(false);
        notifications.show({
          title: 'Succès',
          message: data.cached ? 'Cette musique était déjà téléchargée' : 'Musique téléchargée avec succès',
          color: 'green',
        });
        router.refresh();
      }
    } catch (e: any) {
      const errorMessage = e.message || 'Erreur inconnue';
      setError(errorMessage);
      notifications.show({
        title: 'Erreur',
        message: errorMessage,
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const openAddToPlaylistMenu = async (track: Track) => {
    setAddingToPlaylistId(track.id);
    setAddToPlaylistTrack(track);
    try {
      if (!availablePlaylists) {
        const result = await getPlaylists();
        const data = handleAction(result) as PlaylistSummary[] | undefined;
        if (data) {
          setAvailablePlaylists(data);
        }
      }
    } catch (e: any) {
      const message = e.message || 'Erreur inconnue';
      notifications.show({
        title: 'Erreur',
        message,
        color: 'red',
      });
    } finally {
      setAddingToPlaylistId(null);
    }
  };

  const handleAddToPlaylist = async (playlistId: string, track: Track) => {
    try {
      const result = await addTrackToPlaylist(playlistId, track.id);
      handleAction(result);
      notifications.show({
        title: 'Ajoutée à la playlist',
        message: 'La musique a été ajoutée à la playlist',
        color: 'green',
      });
      setAddToPlaylistTrack(null);
      setPlaylistSearch('');
    } catch (e: any) {
      const message = e.message || 'Erreur inconnue';
      notifications.show({
        title: 'Erreur',
        message,
        color: 'red',
      });
    }
  };

  const copyLink = (s3Url: string, id: string) => {
    navigator.clipboard.writeText(s3Url);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
    notifications.show({
      title: 'Copié',
      message: 'Lien copié dans le presse-papiers',
      color: 'blue',
    });
  };

  const handleDelete = async (track: Track) => {
    if (!track.canDelete) {
      return;
    }

    setDeletingId(track.id);
    try {
      const result = await deleteTrack(track.id);
      handleAction(result);
      notifications.show({
        title: 'Supprimée',
        message: 'La musique a été supprimée de la bibliothèque',
        color: 'green',
      });
      router.refresh();
    } catch (e: any) {
      const errorMessage = e.message || 'Erreur inconnue';
      notifications.show({
        title: 'Erreur',
        message: errorMessage,
        color: 'red',
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Stack gap="xl">
        <Group justify="space-between" align="flex-start">
          <Stack gap={4}>
            <Group gap="sm">
              <IconMusic size={40} stroke={1.5} />
              <div>
                <Title order={1}>Bibliothèque</Title>
                <Text c="dimmed" size="sm" tt="uppercase" fw={300} lts={2}>
                  Ajoute des musiques et organise-les en playlists
                </Text>
              </div>
            </Group>
          </Stack>
          <Button
            size="sm"
            variant="filled"
            leftSection={<IconPlaylist size={16} />}
            component={Link}
            href={routes.playlists.index}
          >
            Playlists
          </Button>
        </Group>

        <Card withBorder p="lg" radius="md" shadow="sm">
          <Group justify="space-between" align="center" wrap="nowrap">
            <Stack gap={2} style={{ minWidth: 0 }}>
              <Text fw={600}>Ajouter une musique</Text>
              <Text size="xs" c="dimmed" lineClamp={2}>
                Colle une URL YouTube pour convertir la vidéo en MP3 et l&apos;ajouter à ta bibliothèque.
              </Text>
            </Stack>
            <Button
              size="sm"
              onClick={() => {
                setAddModalOpened(true);
                setError(null);
              }}
              leftSection={<IconPlus size={16} />}
              disabled={loading}
            >
              Ajouter
            </Button>
          </Group>
        </Card>

        <Stack gap="md">
          <Group justify="space-between" align="flex-end">
            <Title order={2}>Musiques ({filteredTracks.length})</Title>
          </Group>

          <Card withBorder radius="md" p="sm">
            <MantineGroup gap="sm" grow>
              <TextInput
                placeholder="Rechercher (titre, artiste, uploader)"
                value={search}
                onChange={(e) => setSearch(e.currentTarget.value)}
                size="sm"
              />
              <Select
                placeholder="Uploader"
                data={uploaders}
                value={uploaderFilter}
                onChange={setUploaderFilter}
                clearable
                size="sm"
              />
              <Select
                placeholder="Tri"
                value={sortBy}
                onChange={(value) => setSortBy((value as any) ?? 'date_desc')}
                data={[
                  { value: 'date_desc', label: 'Plus récentes' },
                  { value: 'date_asc', label: 'Plus anciennes' },
                  { value: 'title', label: 'Titre' },
                  { value: 'artist', label: 'Artiste' },
                ]}
                size="sm"
              />
            </MantineGroup>
          </Card>

          {filteredTracks.length === 0 ? (
            <Stack gap="xs" align="center" py="xl">
              <Text c="dimmed" ta="center">
                Ta bibliothèque est vide pour le moment.
              </Text>
              <Text c="dimmed" size="sm" ta="center">
                Colle une URL YouTube ci-dessus, ou crée une playlist pour organiser tes musiques.
              </Text>
              <Group gap="xs">
                <Button
                  component={Link}
                  href={routes.playlists.index}
                  variant="light"
                  leftSection={<IconPlaylist size={16} />}
                >
                  Voir les playlists
                </Button>
              </Group>
            </Stack>
          ) : (
            <Stack gap="sm">
              {filteredTracks.map((track) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  trackHref={`/tracks/${track.id}`}
                  currentTrackId={audioPlayer.currentTrackId}
                  isPlaying={audioPlayer.isPlaying}
                  progressRatio={audioPlayer.progressRatio}
                  onTogglePlay={(args) => audioPlayer.togglePlay(args)}
                  onCopy={copyLink}
                  copiedTrackId={copied}
                  onOpenAddToPlaylistMenu={(t) => void openAddToPlaylistMenu(t as any)}
                  onDeleteTrack={(t) => void handleDelete(t as any)}
                  actionsLoading={addingToPlaylistId === track.id}
                  deleting={deletingId === track.id}
                />
              ))}
            </Stack>
          )}
        </Stack>

        <Modal
          opened={addModalOpened}
          onClose={() => {
            setAddModalOpened(false);
            setUrl('');
            setError(null);
          }}
          title="Ajouter à la bibliothèque"
          size="sm"
        >
          <Stack gap="sm">
            <TextInput
              label="URL YouTube"
              placeholder="https://www.youtube.com/watch?v=..."
              value={url}
              onChange={(e) => setUrl(e.currentTarget.value)}
              onKeyDown={(e) => e.key === 'Enter' && !loading && url.trim() && handleDownload()}
              disabled={loading}
              autoFocus
            />

            {loading ? (
              <Text size="sm" c="dimmed">
                Conversion en cours… cela peut prendre 30–60 secondes.
              </Text>
            ) : (
              <Text size="xs" c="dimmed">
                Le téléchargement peut prendre 30–60 secondes.
              </Text>
            )}

            {error && (
              <Alert icon={<IconAlertCircle size={16} />} title="Erreur" color="red">
                {error}
              </Alert>
            )}

            <Group justify="flex-end" mt="md">
              <Button
                variant="default"
                onClick={() => {
                  setAddModalOpened(false);
                  setUrl('');
                  setError(null);
                }}
                disabled={loading}
              >
                Annuler
              </Button>
              <Button
                onClick={handleDownload}
                disabled={loading || !url.trim()}
                loading={loading}
              >
                Ajouter
              </Button>
            </Group>
          </Stack>
        </Modal>

        <Modal
          opened={!!addToPlaylistTrack}
          onClose={() => {
            setAddToPlaylistTrack(null);
            setPlaylistSearch('');
          }}
          title={addToPlaylistTrack ? `Ajouter \"${addToPlaylistTrack.title}\" à une playlist` : ''}
          size="lg"
        >
          <Stack gap="sm">
            <TextInput
              placeholder="Rechercher une playlist (nom ou propriétaire)"
              value={playlistSearch}
              onChange={(event) => setPlaylistSearch(event.currentTarget.value)}
            />
            {!availablePlaylists || availablePlaylists.length === 0 ? (
              <Text c="dimmed" size="sm">
                Aucune playlist disponible pour le moment.
              </Text>
            ) : filteredPlaylists.length === 0 ? (
              <Text c="dimmed" size="sm">
                Aucune playlist ne correspond à la recherche.
              </Text>
            ) : (
              <ScrollArea.Autosize mah={300}>
                <Stack gap="xs">
                  {filteredPlaylists.map((pl) => (
                    <Group key={pl.id} justify="space-between" align="center">
                      <div>
                        <Text size="sm" fw={500}>
                          {pl.name}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {pl.tracksCount} piste{pl.tracksCount > 1 ? 's' : ''} · Propriétaire {pl.ownerName ?? 'Inconnu'}
                        </Text>
                      </div>
                      <Button
                        size="xs"
                        onClick={() => addToPlaylistTrack && handleAddToPlaylist(pl.id, addToPlaylistTrack)}
                      >
                        Ajouter
                      </Button>
                    </Group>
                  ))}
                </Stack>
              </ScrollArea.Autosize>
            )}
          </Stack>
        </Modal>
    </Stack>
  );
}

