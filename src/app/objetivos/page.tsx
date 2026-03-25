import { ObjetivosClient } from './objetivos-client';

export default async function ObjetivosPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const validTabs = ['metas', 'presupuestos', 'inversiones'];
  const initialTab = validTabs.includes(tab ?? '') ? (tab as 'metas' | 'presupuestos' | 'inversiones') : 'metas';
  return <ObjetivosClient initialTab={initialTab} />;
}
