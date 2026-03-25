import { SuspenseLoader } from '@/app/_components/SuspenseLoader/SuspenseLoader';
import { getMix } from '@/app/_actions/mixes';
import { getDataOrThrow } from '@/lib/response';
import MixDetailsPageClient from './MixDetailsPageClient';

interface MixDetailsPageProps {
  params: Promise<{ id: string }>;
}

async function MixDetailsContent(props: MixDetailsPageProps) {
  const params = await props.params;
  const mixResult = await getMix(params.id);
  const mix = getDataOrThrow(mixResult, 'Erreur lors du chargement du mix');

  return <MixDetailsPageClient mix={mix} />;
}

export default function MixDetailsPage(props: MixDetailsPageProps) {
  return (
    <SuspenseLoader>
      <MixDetailsContent {...props} />
    </SuspenseLoader>
  );
}

