import { CompromisosClient } from './compromisos-client';

export default async function CompromisosPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const initialTab = tab === 'Mensualidades' ? 'Mensualidades' : 'cuotas';
  return <CompromisosClient initialTab={initialTab} />;
}
