import { SuspenseLoader } from '@/app/_components/SuspenseLoader/SuspenseLoader';
import { getPlaylists } from '@/app/_actions/playlists';
import { getDataOrThrow } from '@/lib/response';
import { getAuthSession } from '@/lib/auth';
import PlaylistsPageClient from './PlaylistsPageClient';

async function PlaylistsContent() {
  const session = await getAuthSession();
  const playlistsResult = await getPlaylists();
  const playlists = getDataOrThrow(playlistsResult, 'Erreur lors du chargement des playlists');

  return <PlaylistsPageClient initialPlaylists={playlists} currentUserId={session?.user.id ?? null} />;
}

export default function PlaylistsPage() {
  return (
    <SuspenseLoader>
      <PlaylistsContent />
    </SuspenseLoader>
  );
}

