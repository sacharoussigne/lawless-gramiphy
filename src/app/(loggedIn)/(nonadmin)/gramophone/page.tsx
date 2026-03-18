import { getTracks } from '@/app/_actions/tracks';
import GramophonePageClient from './GramophonePageClient';
import { SuspenseLoader } from '@/app/_components/SuspenseLoader/SuspenseLoader';
import { getDataOrThrow } from '@/lib/response';

async function GramophoneContent() {
  const tracksResult = await getTracks();
  const tracks = getDataOrThrow(tracksResult, 'Erreur lors du chargement des tracks');

  return <GramophonePageClient initialTracks={tracks} />;
}

export default function GramophonePage() {
  return (
    <SuspenseLoader>
      <GramophoneContent />
    </SuspenseLoader>
  );
}