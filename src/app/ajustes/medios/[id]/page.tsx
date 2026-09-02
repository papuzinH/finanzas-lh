import { DetalleClient } from './detalle-client';

// Next 16: los params de un segmento dinamico llegan como Promise.
// Ver node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DetalleClient methodId={id} />;
}
