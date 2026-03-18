import { SuspenseLoader } from '@/app/_components/SuspenseLoader/SuspenseLoader';
import { getPlaylists } from '@/app/_actions/playlists';
import { getDataOrThrow } from '@/lib/response';
import PlaylistsPageClient from './PlaylistsPageClient';

async function PlaylistsContent() {
  const playlistsResult = await getPlaylists();
  const playlists = getDataOrThrow(playlistsResult, 'Erreur lors du chargement des playlists');

  return <PlaylistsPageClient initialPlaylists={playlists} />;
}

export default function PlaylistsPage() {
  return (
    <SuspenseLoader>
      <PlaylistsContent />
    </SuspenseLoader>
  );
}

