import { ObjetivosClient } from './objetivos-client';

export default async function ObjetivosPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const validTabs = ['metas', 'presupuestos'];
  const initialTab = validTabs.includes(tab ?? '') ? (tab as 'metas' | 'presupuestos') : 'metas';
  return <ObjetivosClient initialTab={initialTab} />;
}
