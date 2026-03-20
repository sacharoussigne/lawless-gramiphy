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
  IconStack2,
} from '@tabler/icons-react';
import TrackRow from '../../_components/Tracks/TrackRow';
import AddToPlaylistModal from '../../_components/Tracks/AddToPlaylistModal';
import useSingleAudioPlayer from '../../_components/Tracks/useSingleAudioPlayer';
import { deleteTrack } from '@/app/_actions/tracks';
import { handleAction } from '@/lib/action';
import { notifications } from '@mantine/notifications';
import Link from 'next/link';
import { routes } from '@/types/routes';
import { MAX_MIX_DURATION_SECONDS, MIN_MIX_TRACK_COUNT } from '@/constants/mix';

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
  const [playlistAddSelectionMode, setPlaylistAddSelectionMode] = useState(false);
  const [playlistAddSelectedTrackIds, setPlaylistAddSelectedTrackIds] = useState<string[]>([]);
  const playlistAddSelectedTrackIdSet = useMemo(() => new Set(playlistAddSelectedTrackIds), [playlistAddSelectedTrackIds]);

  const [addToPlaylistOpened, setAddToPlaylistOpened] = useState(false);
  const [addToPlaylistTrackIds, setAddToPlaylistTrackIds] = useState<string[]>([]);
  const [addToPlaylistTrackTitle, setAddToPlaylistTrackTitle] = useState<string | null>(null);
  const [addToPlaylistFromSelection, setAddToPlaylistFromSelection] = useState(false);
  const [mixTrackIds, setMixTrackIds] = useState<string[]>([]);
  const [mixJobId, setMixJobId] = useState<string | null>(null);
  const [mixBusy, setMixBusy] = useState(false);
  const [lastMixUrl, setLastMixUrl] = useState<string | null>(null);
  const [mixMode, setMixMode] = useState(false);
  const urlInputRef = useRef<HTMLInputElement | null>(null);

  const libraryTrackById = useMemo(() => new Map(initialTracks.map((t) => [t.id, t])), [initialTracks]);

  const mixTotalSeconds = useMemo(() => {
    return mixTrackIds.reduce((acc, id) => acc + (libraryTrackById.get(id)?.duration ?? 0), 0);
  }, [mixTrackIds, libraryTrackById]);

  const hasUnknownMixDuration = useMemo(
    () => mixTrackIds.some((id) => libraryTrackById.get(id)?.duration == null),
    [mixTrackIds, libraryTrackById],
  );

  const mixOverLimit = mixTotalSeconds > MAX_MIX_DURATION_SECONDS;
  const mixTrackIdSet = useMemo(() => new Set(mixTrackIds), [mixTrackIds]);

  const handleMixSelectChange = (trackId: string, selected: boolean) => {
    setMixTrackIds((prev) => {
      if (selected) {
        if (prev.includes(trackId)) return prev;
        return [...prev, trackId];
      }
      return prev.filter((id) => id !== trackId);
    });
  };

  const clearMixTracks = () => setMixTrackIds([]);

  const exitMixMode = () => {
    setMixMode(false);
    setMixTrackIds([]);
  };

  useEffect(() => {
    if (!mixMode) return;
    setPlaylistAddSelectionMode(false);
    setPlaylistAddSelectedTrackIds([]);
  }, [mixMode]);

  const handleBuildMix = async () => {
    if (mixTrackIds.length < MIN_MIX_TRACK_COUNT) return;
    setMixBusy(true);
    setLastMixUrl(null);
    try {
      const res = await fetch('/api/mixes/build', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackIds: mixTrackIds }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json?.error === 'string' ? json.error : 'Impossible de créer le mix');
      }
      const jobId = json?.data?.jobId as string | undefined;
      if (!jobId) throw new Error('Réponse serveur invalide');
      setMixJobId(jobId);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Erreur inconnue';
      notifications.show({ title: 'Erreur', message, color: 'red' });
      setMixBusy(false);
    }
  };

  useEffect(() => {
    if (!mixJobId) return;

    let cancelled = false;
    const interval = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/mixes/build?jobId=${encodeURIComponent(mixJobId)}`, {
          credentials: 'include',
        });
        const json = await res.json().catch(() => ({}));
        const data = json?.data;
        if (!data || cancelled) return;

        if (data.status === 'done' && data.s3Url) {
          window.clearInterval(interval);
          setMixBusy(false);
          setMixJobId(null);
          setLastMixUrl(data.s3Url);
          await navigator.clipboard.writeText(data.s3Url);
          notifications.show({
            title: 'Mix prêt',
            message: 'Lien du mix copié dans le presse-papiers',
            color: 'green',
          });
        } else if (data.status === 'error') {
          window.clearInterval(interval);
          setMixBusy(false);
          setMixJobId(null);
          notifications.show({
            title: 'Erreur',
            message: data.error || data.message || 'Échec du mix',
            color: 'red',
          });
        }
      } catch {
        // ignore
      }
    }, 800);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [mixJobId]);

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

  const selectFilteredForMix = () => setMixTrackIds(filteredTracks.map((t) => t.id));

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

  const handlePlaylistAddSelectChange = (trackId: string, selected: boolean) => {
    setPlaylistAddSelectedTrackIds((prev) => {
      if (selected) {
        if (prev.includes(trackId)) return prev;
        return [...prev, trackId];
      }
      return prev.filter((id) => id !== trackId);
    });
  };

  const closeAddToPlaylistPanel = () => {
    const shouldClearSelection = addToPlaylistFromSelection;
    setAddToPlaylistOpened(false);
    setAddToPlaylistTrackIds([]);
    setAddToPlaylistTrackTitle(null);
    setAddToPlaylistFromSelection(false);

    if (shouldClearSelection) {
      setPlaylistAddSelectionMode(false);
      setPlaylistAddSelectedTrackIds([]);
    }
  };

  const openAddSelectedTracksToPlaylist = () => {
    if (playlistAddSelectedTrackIds.length === 0) return;

    setAddToPlaylistFromSelection(true);
    setAddToPlaylistTrackIds(playlistAddSelectedTrackIds);
    setAddToPlaylistTrackTitle(
      playlistAddSelectedTrackIds.length === 1 ? libraryTrackById.get(playlistAddSelectedTrackIds[0])?.title ?? null : null,
    );

    setPlaylistAddSelectionMode(false);
    setAddToPlaylistOpened(true);
  };

  const openAddToPlaylistMenu = (track: Track) => {
    setAddToPlaylistFromSelection(false);
    setAddToPlaylistTrackIds([track.id]);
    setAddToPlaylistTrackTitle(track.title);
    setAddToPlaylistOpened(true);
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
            {!mixMode && (
              <Button
                size="sm"
                variant="light"
                leftSection={<IconPlaylist size={16} />}
                color={playlistAddSelectionMode ? 'gray' : undefined}
                onClick={() => {
                  if (playlistAddSelectionMode) {
                    setPlaylistAddSelectionMode(false);
                    setPlaylistAddSelectedTrackIds([]);
                  } else {
                    setPlaylistAddSelectionMode(true);
                    setPlaylistAddSelectedTrackIds([]);
                  }
                }}
              >
                {playlistAddSelectionMode ? 'Annuler' : 'Ajouter à une playlist'}
              </Button>
            )}
            {(mixMode || filteredTracks.length >= MIN_MIX_TRACK_COUNT) && (
              <Button
                size="sm"
                variant="light"
                color="green"
                leftSection={<IconStack2 size={16} />}
                onClick={() => (mixMode ? exitMixMode() : setMixMode(true))}
              >
                {mixMode ? 'Annuler' : 'Créer un mix'}
              </Button>
            )}
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

          {!mixMode && playlistAddSelectionMode && playlistAddSelectedTrackIds.length === 0 && (
            <Text size="xs" c="dimmed" tt="uppercase" fw={300} lts={1}>
              Survole les musiques pour les sélectionner
            </Text>
          )}

          {!mixMode && playlistAddSelectedTrackIds.length > 0 && (
            <Group justify="space-between" align="center" wrap="nowrap" gap="sm">
              <Text size="sm" c="dimmed">
                Sélection : {playlistAddSelectedTrackIds.length}
              </Text>
              <Group gap="xs" align="center" wrap="nowrap">
                <Button
                  size="xs"
                  color="green"
                  leftSection={<IconPlaylist size={14} />}
                  onClick={openAddSelectedTracksToPlaylist}
                >
                  Ajouter à une playlist ({playlistAddSelectedTrackIds.length})
                </Button>
                <Button
                  size="xs"
                  variant="light"
                  onClick={() => setPlaylistAddSelectedTrackIds([])}
                >
                  Effacer
                </Button>
              </Group>
            </Group>
          )}

          {mixMode && initialTracks.length >= MIN_MIX_TRACK_COUNT && (
            <Alert variant="light" color="green" icon={<IconStack2 size={18} />} title="Mode mix">
              <Stack gap="sm">
                {filteredTracks.length === 0 ? (
                  <Group justify="space-between" wrap="wrap" gap="sm">
                    <Text size="sm" c="dimmed">
                      Aucune musique ne correspond aux filtres. Ajuste la recherche ou quitte le mode mix.
                    </Text>
                    <Button size="xs" variant="subtle" color="gray" onClick={exitMixMode}>
                      Quitter
                    </Button>
                  </Group>
                ) : filteredTracks.length < MIN_MIX_TRACK_COUNT ? (
                  <Group justify="space-between" wrap="wrap" gap="sm">
                    <Text size="sm" c="dimmed">
                      Il faut au moins {MIN_MIX_TRACK_COUNT} musiques dans la liste affichée pour un mix. Élargis les
                      filtres ou quitte le mode mix.
                    </Text>
                    <Button size="xs" variant="subtle" color="gray" onClick={exitMixMode}>
                      Quitter
                    </Button>
                  </Group>
                ) : (
                  <>
                    <Group justify="space-between" align="center" wrap="wrap" gap="sm">
                      <Text size="xs" c="dimmed">
                        Sélectionne au moins {MIN_MIX_TRACK_COUNT} musiques. Ordre = ordre de sélection. Max{' '}
                        {Math.floor(MAX_MIX_DURATION_SECONDS / 60)} min.
                      </Text>
                      <Group gap="xs" justify="flex-end" wrap="wrap" align="center">
                        <Button size="xs" variant="subtle" color="gray" onClick={selectFilteredForMix}>
                          Tout sélectionner
                        </Button>
                        {mixTrackIds.length > 0 && (
                          <Button size="xs" variant="subtle" color="gray" onClick={clearMixTracks}>
                            Effacer
                          </Button>
                        )}
                        <Button size="xs" variant="subtle" color="gray" onClick={exitMixMode}>
                          Quitter
                        </Button>
                      </Group>
                    </Group>
                    <Group gap="md" align="center" wrap="wrap">
                      <Text size="sm">
                        Sélection : {mixTrackIds.length} · Durée estimée :{' '}
                        <Text span fw={600}>
                          {Math.floor(mixTotalSeconds / 60)}:{(mixTotalSeconds % 60).toString().padStart(2, '0')}
                        </Text>
                        {mixOverLimit && (
                          <Text span c="red" ml="xs">
                            (dépasse la limite)
                          </Text>
                        )}
                      </Text>
                      {mixTrackIds.length > 0 && mixTrackIds.length < MIN_MIX_TRACK_COUNT && (
                        <Text size="xs" c="orange">
                          Sélectionne encore des musiques : il en faut au moins {MIN_MIX_TRACK_COUNT}.
                        </Text>
                      )}
                      {hasUnknownMixDuration && (
                        <Text size="xs" c="orange">
                          Durée inconnue sur au moins une piste : la génération peut échouer.
                        </Text>
                      )}
                    </Group>
                    <Group gap="xs" align="center">
                      <Button
                        size="sm"
                        color="green"
                        onClick={() => void handleBuildMix()}
                        disabled={
                          mixBusy ||
                          mixTrackIds.length < MIN_MIX_TRACK_COUNT ||
                          mixOverLimit ||
                          hasUnknownMixDuration
                        }
                        leftSection={mixBusy ? <Loader size={14} color="white" /> : undefined}
                      >
                        {mixBusy ? 'Génération…' : 'Générer et copier le lien'}
                      </Button>
                    </Group>
                  </>
                )}
              </Stack>
            </Alert>
          )}

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
                  playlistSelectEnabled={!mixMode && playlistAddSelectionMode}
                  playlistSelected={playlistAddSelectedTrackIdSet.has(track.id)}
                  onPlaylistSelectChange={handlePlaylistAddSelectChange}
                  mixSelectMode={mixMode}
                  mixSelected={mixTrackIdSet.has(track.id)}
                  onMixSelectChange={handleMixSelectChange}
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
          opened={addToPlaylistOpened}
          trackIds={addToPlaylistTrackIds}
          trackTitle={addToPlaylistTrackTitle}
          onClose={closeAddToPlaylistPanel}
        />
    </Stack>
  );
}

