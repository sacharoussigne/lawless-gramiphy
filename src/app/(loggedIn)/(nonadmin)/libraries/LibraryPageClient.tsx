'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Stack,
  Card,
  TextInput,
  Button,
  ActionIcon,
  Text,
  Group,
  Alert,
  Title,
  Select,
  Modal,
  Slider,
  Loader,
} from '@mantine/core';
import {
  IconMusic,
  IconAlertCircle,
  IconPlaylist,
  IconPlus,
  IconSearch,
  IconCheck,
  IconSquare,
} from '@tabler/icons-react';
import TrackRow from '../../_components/Tracks/TrackRow';
import AddToPlaylistModal from '../../_components/Tracks/AddToPlaylistModal';
import useSingleAudioPlayer from '../../_components/Tracks/useSingleAudioPlayer';
import { deleteTrack } from '@/app/_actions/tracks';
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
  const [spotlightOpened, setSpotlightOpened] = useState(false);
  const [spotlightExpanded, setSpotlightExpanded] = useState(false);
  const [downloadJobId, setDownloadJobId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [uploaderFilter, setUploaderFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'title' | 'artist'>('date_desc');
  const [addToPlaylistTrack, setAddToPlaylistTrack] = useState<Track | null>(null);
  const urlInputRef = useRef<HTMLInputElement | null>(null);

  const openSpotlight = () => {
    if (loading) return;
    setSpotlightOpened(true);
    setSpotlightExpanded(false);
    setDownloadJobId(null);
    setUrl('');
    setError(null);
  };

  const closeSpotlight = () => {
    if (loading) return;
    setSpotlightOpened(false);
    setSpotlightExpanded(false);
    setDownloadJobId(null);
    setUrl('');
    setError(null);
  };

  useEffect(() => {
    if (!spotlightOpened) return;
    urlInputRef.current?.focus();
  }, [spotlightOpened]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isEditable =
        tag === 'input' || tag === 'textarea' || (target as any)?.isContentEditable === true;

      if (isEditable) return;

      if (e.repeat) return;
      const key = e.key.toLowerCase();

      if ((e.ctrlKey || e.metaKey) && key === 'k') {
        e.preventDefault();
        if (!loading) {
          setSpotlightOpened(true);
          setUrl('');
          setError(null);
        }
        return;
      }

      if (!e.ctrlKey && !e.metaKey && e.key === '/') {
        e.preventDefault();
        if (!loading) {
          setSpotlightOpened(true);
          setSpotlightExpanded(false);
          setUrl('');
          setError(null);
        }
        return;
      }

      if (key === 'escape') {
        if (loading) return;
        if (spotlightOpened) {
          e.preventDefault();
          setSpotlightOpened(false);
          setSpotlightExpanded(false);
          setUrl('');
          setError(null);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [loading, spotlightOpened]);

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

  const handleDownload = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setSpotlightExpanded(false);

    const rawUrl = url.trim();
    setUrl('');

    try {
      const res = await fetch('/api/tracks/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: rawUrl }),
      });
      const payload = await res.json();

      // cached track (already exists)
      if (payload?.data?.cached) {
        setLoading(false);
        setSpotlightOpened(false);
        setSpotlightExpanded(false);
        notifications.show({
          title: 'Déjà présent',
          message: 'Cette musique est déjà dans la bibliothèque',
          color: 'green',
        });
        router.refresh();
        return;
      }

      const jobId = payload?.data?.jobId as string | undefined;
      if (!jobId) {
        throw new Error(payload?.error || 'Impossible de démarrer le téléchargement');
      }

      setDownloadJobId(jobId);
    } catch (e: any) {
      const errorMessage = e.message || 'Erreur inconnue';
      setError(errorMessage);
      notifications.show({
        title: 'Erreur',
        message: errorMessage,
        color: 'red',
      });
      setLoading(false);
    }
  };

  const stopDownload = async () => {
    if (!downloadJobId) return;
    try {
      await fetch(`/api/tracks/download?jobId=${encodeURIComponent(downloadJobId)}`, {
        method: 'DELETE',
      });
      notifications.show({
        title: 'Téléchargement annulé',
        message: 'Le téléchargement a été stoppé',
        color: 'yellow',
      });
    } finally {
      setLoading(false);
      setDownloadJobId(null);
      setSpotlightExpanded(false);
    }
  };

  useEffect(() => {
    if (!downloadJobId) return;

    let cancelled = false;
    const interval = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/tracks/download?jobId=${encodeURIComponent(downloadJobId)}`);
        const payload = await res.json();
        const data = payload?.data;
        if (!data || cancelled) return;

        if (data.status === 'done') {
          window.clearInterval(interval);
          setLoading(false);
          setDownloadJobId(null);
          notifications.show({
            title: 'Succès',
            message: 'Musique téléchargée avec succès',
            color: 'green',
          });
          router.refresh();
          setTimeout(() => {
            if (cancelled) return;
            setSpotlightOpened(false);
            setSpotlightExpanded(false);
            setError(null);
          }, 900);
        } else if (data.status === 'error') {
          window.clearInterval(interval);
          setLoading(false);
          setDownloadJobId(null);
          setError(data.message ?? 'Erreur');
          setSpotlightExpanded(true);
        } else if (data.status === 'canceled') {
          window.clearInterval(interval);
          setLoading(false);
          setDownloadJobId(null);
          setSpotlightExpanded(false);
        } else {
          // keep expanded while running
          setSpotlightExpanded(false);
        }
      } catch {
        // ignore transient polling errors
      }
    }, 700);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [downloadJobId, router]);

  const openAddToPlaylistMenu = (track: Track) => {
    setAddToPlaylistTrack(track);
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
          <Group gap="xs" align="center">
            <Button
              size="sm"
              variant="filled"
              leftSection={<IconPlaylist size={16} />}
              component={Link}
              href={routes.playlists.index}
            >
              Playlists
            </Button>
            <Button
              size="sm"
              variant="light"
              leftSection={<IconPlus size={16} />}
              onClick={openSpotlight}
              disabled={loading}
            >
              Ajouter
            </Button>
          </Group>
        </Group>

        <Stack gap="md">
          <Group justify="space-between" align="center" wrap="nowrap" gap="md">
            <Title order={2}>Musiques ({filteredTracks.length})</Title>
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

          <Card withBorder radius="md" p="sm">
            <Group gap="sm" align="flex-end" wrap="wrap">
              <TextInput
                placeholder="Rechercher (titre, artiste, ajouté par)"
                value={search}
                onChange={(e) => setSearch(e.currentTarget.value)}
                size="sm"
                style={{ flex: 1, minWidth: 220 }}
              />
              <Group gap="sm" align="flex-end" wrap="wrap" style={{ marginLeft: 'auto' }}>
                <Select
                  placeholder="Ajouté par"
                  data={uploaders}
                  value={uploaderFilter}
                  onChange={setUploaderFilter}
                  clearable
                  size="sm"
                  style={{ width: 200 }}
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
                  style={{ width: 200 }}
                />
              </Group>
            </Group>
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
                  deleting={deletingId === track.id}
                />
              ))}
            </Stack>
          )}
        </Stack>

        <Modal
          opened={spotlightOpened}
          onClose={closeSpotlight}
          withCloseButton={false}
          closeOnClickOutside={!loading}
          closeOnEscape={!loading}
          centered={false}
          yOffset={70}
          size="lg"
          title=""
          styles={{
            header: { display: 'none' },
            content: {
              padding: 0,
              overflow: 'visible',
              background: 'transparent',
              boxShadow: 'none',
              border: 'none',
            },
            body: { padding: 0, background: 'transparent' },
          }}
        >
          <div style={{ width: 'min(760px, 92vw)', margin: '0 auto', padding: '10px 14px' }}>
            <div
              style={{
                borderRadius: 22,
                // background: 'rgba(255,255,255,0.07)',
                background: 'rgba(255,255,255,0.12)',
                boxShadow: '0 14px 36px rgba(0,0,0,0.35)',
                backdropFilter: 'blur(14px)',
                WebkitBackdropFilter: 'blur(14px)',
                padding: '10px 12px',
              }}
            >
              <Group gap="xs" align="center" wrap="nowrap">
                <div
                  style={{
                    paddingLeft: 4,
                    opacity: 0.9,
                    width: 18,
                    height: 18,
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  {loading ? <Loader size={18} type="oval" /> : <IconSearch size={18} />}
                </div>
                <TextInput
                  ref={urlInputRef}
                  placeholder={
                    loading ? 'Téléchargement en cours…' : 'URL YouTube (ex: https://www.youtube.com/watch?v=...)'
                  }
                  value={loading ? '' : url}
                  onChange={(e) => setUrl(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !loading && url.trim()) handleDownload();
                    if (e.key === 'Escape') {
                      if (loading) return;
                      e.preventDefault();
                      closeSpotlight();
                    }
                  }}
                  disabled={loading}
                  styles={{
                    root: { flex: 1 },
                    input: {
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      fontSize: 16,
                      height: 34,
                      paddingLeft: 2,
                    },
                  }}
                />
                {loading ? (
                  <ActionIcon
                    variant="subtle"
                    size="lg"
                    radius="xl"
                    color="red"
                    onClick={stopDownload}
                    aria-label="Stopper le téléchargement"
                  >
                    <IconSquare size={18} />
                  </ActionIcon>
                ) : (
                  <ActionIcon
                    variant="subtle"
                    size="lg"
                    radius="xl"
                    disabled={!url.trim()}
                    onClick={() => url.trim() && handleDownload()}
                    aria-label="Valider l’URL"
                  >
                    <IconCheck size={18} />
                  </ActionIcon>
                )}
              </Group>

              {(spotlightExpanded || error) && (
                <Stack gap={6} style={{ paddingTop: 10, paddingLeft: 6, paddingRight: 6, paddingBottom: 2 }}>
                  {error && (
                    <Alert icon={<IconAlertCircle size={16} />} title="Erreur" color="red">
                      {error}
                    </Alert>
                  )}
                </Stack>
              )}
            </div>
          </div>
        </Modal>

        <AddToPlaylistModal
          opened={!!addToPlaylistTrack}
          track={addToPlaylistTrack ? { id: addToPlaylistTrack.id, title: addToPlaylistTrack.title } : null}
          onClose={() => setAddToPlaylistTrack(null)}
        />
    </Stack>
  );
}

