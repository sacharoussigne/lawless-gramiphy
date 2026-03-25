import { SuspenseLoader } from '@/app/_components/SuspenseLoader/SuspenseLoader';
import { getMixes } from '@/app/_actions/mixes';
import { getDataOrThrow } from '@/lib/response';
import MixesPageClient from './MixesPageClient';

async function MixesContent() {
  const mixesResult = await getMixes();
  const mixes = getDataOrThrow(mixesResult, 'Erreur lors du chargement des mixes');

  return <MixesPageClient initialMixes={mixes} />;
}

export default function MixesPage() {
  return (
    <SuspenseLoader>
      <MixesContent />
    </SuspenseLoader>
  );
}

