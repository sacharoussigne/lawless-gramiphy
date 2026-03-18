import { getTracks } from '@/app/_actions/tracks';
import LibraryPageClient from './LibraryPageClient';
import { SuspenseLoader } from '@/app/_components/SuspenseLoader/SuspenseLoader';
import { getDataOrThrow } from '@/lib/response';

async function LibrariesContent() {
  const tracksResult = await getTracks();
  const tracks = getDataOrThrow(tracksResult, 'Erreur lors du chargement des tracks');

  return <LibraryPageClient initialTracks={tracks} />;
}

export default function LibrariesPage() {
  return (
    <SuspenseLoader>
      <LibrariesContent />
    </SuspenseLoader>
  );
}

