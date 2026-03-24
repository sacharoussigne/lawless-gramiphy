'use client';

import {
  Alert,
  Avatar,
  Button,
  Group,
  Loader,
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
  IconMusic,
  IconPlayerPlay,
  IconArrowsDownUp,
  IconPlaylist,
  IconPin,
  IconPinnedOff,
  IconStack2,
} from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import {
  removeTrackFromPlaylist,
  reorderTracksInPlaylist,
  togglePinnedPlaylist,
  updatePlaylist,
} from '@/app/_actions/playlists';
import { handleAction } from '@/lib/action';
import { notifications } from '@mantine/notifications';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { routes } from '@/types/routes';
import {
  MAX_MIX_DURATION_SECONDS,
  MIN_MIX_TRACK_COUNT,
  getEffectiveMaxMixDurationSeconds,
  isMixDurationLimitDisabled,
} from '@/constants/mix';
import { DndContext, PointerSensor, useSensor, closestCenter } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
  const [mixTrackIds, setMixTrackIds] = useState<string[]>([]);
  const [mixJobId, setMixJobId] = useState<string | null>(null);
  const [mixBusy, setMixBusy] = useState(false);
  const [lastMixUrl, setLastMixUrl] = useState<string | null>(null);
  const [mixMode, setMixMode] = useState(false);
  const [collaboratorsModalOpen, setCollaboratorsModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);
  const [reorderBusy, setReorderBusy] = useState(false);

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

  const displayTracks = useMemo(() => {
    const tracks = [...filteredTracks];
    tracks.sort((a, b) => a.position - b.position);
    return tracks;
  }, [filteredTracks]);

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

  const orderedPlaylistIds = useMemo(
    () => [...playlist.tracks].sort((a, b) => a.position - b.position).map((t) => t.id),
    [playlist.tracks],
  );

  const canReorder = playlist.canEdit && !mixMode && !search.trim();
  const displayTrackIds = useMemo(() => displayTracks.map((t) => t.id), [displayTracks]);

  const trackById = useMemo(() => new Map(playlist.tracks.map((t) => [t.id, t])), [playlist.tracks]);

  const effectiveMixIds = mixTrackIds.length > 0 ? mixTrackIds : orderedPlaylistIds;

  const mixTotalSeconds = useMemo(() => {
    return effectiveMixIds.reduce((acc, id) => acc + (trackById.get(id)?.duration ?? 0), 0);
  }, [effectiveMixIds, trackById]);

  const hasUnknownMixDuration = useMemo(
    () => effectiveMixIds.some((id) => trackById.get(id)?.duration == null),
    [effectiveMixIds, trackById],
  );

  const mixOverLimit = mixTotalSeconds > getEffectiveMaxMixDurationSeconds();
  const mixEffectiveTrackCount =
    mixTrackIds.length > 0 ? mixTrackIds.length : orderedPlaylistIds.length;
  const mixTooFewTracks = mixEffectiveTrackCount < MIN_MIX_TRACK_COUNT;
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

  const selectAllMixTracks = () => setMixTrackIds(orderedPlaylistIds);
  const clearMixTracks = () => setMixTrackIds([]);

  const exitMixMode = () => {
    setMixMode(false);
    setMixTrackIds([]);
  };

  const sensors = useSensor(PointerSensor, { activationConstraint: { distance: 6 } });

  const handleBuildMix = async () => {
    if (orderedPlaylistIds.length === 0) return;
    setMixBusy(true);
    setLastMixUrl(null);
    try {
      const res = await fetch('/api/mixes/build', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playlistId: playlist.id,
          trackIds: mixTrackIds.length > 0 ? mixTrackIds : [],
        }),
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
        // ignore transient polling errors
      }
    }, 800);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [mixJobId]);

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

  const handleReorder = async (newOrderedTrackIds: string[]) => {
    if (reorderBusy) return;
    setReorderBusy(true);
    try {
      const result = await reorderTracksInPlaylist(playlist.id, newOrderedTrackIds);
      handleAction(result);
      notifications.show({
        title: 'Ordre mis à jour',
        message: 'Les musiques ont été réordonnées',
        color: 'green',
      });
      router.refresh();
    } catch (e: any) {
      const message = e.message || 'Erreur inconnue';
      notifications.show({
        title: 'Erreur',
        message,
        color: 'red',
      });
    } finally {
      setReorderBusy(false);
    }
  };

  function SortableTrackRowItem({ track }: { track: PlaylistTrack }) {
    const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable(
      {
        id: track.id,
        disabled: !canReorder || reorderBusy,
      },
    );

    const style: CSSProperties = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.6 : 1,
    };

    return (
      <div ref={setNodeRef} style={style}>
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
          <div
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            style={{
              width: 30,
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'center',
              paddingTop: 10,
              touchAction: 'none',
              cursor: canReorder ? 'grab' : 'default',
              userSelect: 'none',
            }}
            aria-label="Réordonner"
            title="Réordonner"
          >
            <IconArrowsDownUp size={16} stroke={1.8} />
          </div>
          <div style={{ flex: 1 }}>
            <TrackRow
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
              mixSelectMode={mixMode}
              mixSelected={mixTrackIdSet.has(track.id)}
              onMixSelectChange={handleMixSelectChange}
            />
          </div>
        </div>
      </div>
    );
  }

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
          <Tooltip label={playlist.isPinned ? 'Désépingler' : 'Épingler'} withArrow>
            <ActionIcon
              size="lg"
              variant={playlist.isPinned ? 'filled' : 'subtle'}
              color={playlist.isPinned ? 'green' : 'gray'}
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
          {(mixMode || playlist.tracks.length >= MIN_MIX_TRACK_COUNT) && (
            <Button
              size="xs"
              variant="light"
              color="green"
              leftSection={<IconStack2 size={14} />}
              onClick={() => (mixMode ? exitMixMode() : setMixMode(true))}
            >
              {mixMode ? 'Annuler' : 'Créer un mix'}
            </Button>
          )}
        </Group>
      </Group>

      {error && (
        <Alert icon={<IconAlertCircle size={16} />} color="red">
          {error}
        </Alert>
      )}

      {playlist.tracks.length >= MIN_MIX_TRACK_COUNT && mixMode && (
        <Alert variant="light" color="green" icon={<IconStack2 size={18} />} title="Mode mix">
          <Stack gap="sm">
            <Group justify="space-between" align="center" wrap="wrap" gap="sm">
              <Text size="xs" c="dimmed">
                Coche des pistes pour un sous-ensemble (min. 2), ou laisse tout décoché pour toute la playlist dans
                l’ordre (min. 2 musiques au total).{' '}
                {isMixDurationLimitDisabled()
                  ? 'Limite de durée désactivée (temporaire).'
                  : `Max ${Math.floor(MAX_MIX_DURATION_SECONDS / 60)} min.`}
              </Text>
              <Group gap="xs" justify="flex-end" wrap="wrap" align="center">
                <Button size="xs" variant="subtle" color="gray" onClick={selectAllMixTracks}>
                  Tout sélectionner
                </Button>
                {mixTrackIds.length > 0 && (
                  <Button size="xs" variant="subtle" color="gray" onClick={clearMixTracks}>
                    Effacer la sélection
                  </Button>
                )}
                <Button size="xs" variant="subtle" color="gray" onClick={exitMixMode}>
                  Quitter
                </Button>
              </Group>
            </Group>
            <Group gap="md" align="center" wrap="wrap">
              <Text size="sm">
                {mixTrackIds.length === 0 ? (
                  <>
                    Toute la playlist ({orderedPlaylistIds.length} piste{orderedPlaylistIds.length > 1 ? 's' : ''}) · durée
                    estimée :{' '}
                  </>
                ) : (
                  <>
                    Sélection ({mixTrackIds.length} piste{mixTrackIds.length > 1 ? 's' : ''}) · durée estimée :{' '}
                  </>
                )}
                <Text span fw={600}>
                  {Math.floor(mixTotalSeconds / 60)}:{(mixTotalSeconds % 60).toString().padStart(2, '0')}
                </Text>
                {mixOverLimit && (
                  <Text span c="red" ml="xs">
                    (dépasse la limite)
                  </Text>
                )}
              </Text>
              {mixTooFewTracks && (
                <Text size="xs" c="orange">
                  Il faut au moins {MIN_MIX_TRACK_COUNT} musiques pour un mix (sélection ou playlist entière).
                </Text>
              )}
              {hasUnknownMixDuration && (
                <Text size="xs" c="orange">
                  Certaines durées sont inconnues : la génération peut échouer.
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
                  orderedPlaylistIds.length < MIN_MIX_TRACK_COUNT ||
                  mixTooFewTracks ||
                  mixOverLimit ||
                  hasUnknownMixDuration
                }
                leftSection={mixBusy ? <Loader size={14} color="white" /> : undefined}
              >
                {mixBusy ? 'Génération…' : 'Générer et copier le lien'}
              </Button>
            </Group>
          </Stack>
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
          canReorder ? (
            <DndContext
              sensors={[sensors]}
              collisionDetection={closestCenter}
              onDragEnd={(event) => {
                const activeId = event.active.id as string;
                const overId = event.over?.id as string | undefined;

                if (!overId || activeId === overId) return;
                const oldIndex = displayTrackIds.indexOf(activeId);
                const newIndex = displayTrackIds.indexOf(overId);
                if (oldIndex < 0 || newIndex < 0) return;

                const newOrdered = arrayMove(displayTrackIds, oldIndex, newIndex);
                void handleReorder(newOrdered);
              }}
            >
              <SortableContext items={displayTrackIds} strategy={verticalListSortingStrategy}>
                <Stack gap="sm">
                  {displayTracks.map((track) => (
                    <SortableTrackRowItem key={track.id} track={track} />
                  ))}
                </Stack>
              </SortableContext>
            </DndContext>
          ) : (
            <Stack gap="sm">
              {displayTracks.map((track) => (
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
                  mixSelectMode={mixMode}
                  mixSelected={mixTrackIdSet.has(track.id)}
                  onMixSelectChange={handleMixSelectChange}
                />
              ))}
            </Stack>
          )
        )}
      </Stack>
    </Stack>
  );
}

