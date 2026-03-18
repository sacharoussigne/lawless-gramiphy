import { SuspenseLoader } from '@/app/_components/SuspenseLoader/SuspenseLoader';
import { getPlaylist } from '@/app/_actions/playlists';
import { getDataOrThrow } from '@/lib/response';
import PlaylistDetailsPageClient from './PlaylistDetailsPageClient';

interface PlaylistDetailsPageProps {
  params: Promise<{ id: string }>;
}

async function PlaylistDetailsContent(props: PlaylistDetailsPageProps) {
  const params = await props.params;
  const playlistResult = await getPlaylist(params.id);
  const playlist = getDataOrThrow(playlistResult, 'Erreur lors du chargement de la playlist');

  return <PlaylistDetailsPageClient playlist={playlist} />;
}

export default function PlaylistDetailsPage(props: PlaylistDetailsPageProps) {
  return (
    <SuspenseLoader>
      <PlaylistDetailsContent {...props} />
    </SuspenseLoader>
  );
}

