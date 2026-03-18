import { getTrackById } from '@/app/_actions/tracks';
import { SuspenseLoader } from '@/app/_components/SuspenseLoader/SuspenseLoader';
import { getDataOrThrow } from '@/lib/response';
import TrackDetailsPageClient from '../../../_components/Tracks/TrackDetailsPageClient';

async function TrackDetailsContent({ id }: { id: string }) {
  const trackResult = await getTrackById(id);
  const track = getDataOrThrow(trackResult, 'Erreur lors du chargement de la track');
  return <TrackDetailsPageClient track={track} />;
}

export default async function TrackDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <SuspenseLoader>
      <TrackDetailsContent id={id} />
    </SuspenseLoader>
  );
}

