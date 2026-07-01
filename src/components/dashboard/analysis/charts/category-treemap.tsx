'use client';

import { useState } from 'react';
import { Treemap, ResponsiveContainer } from 'recharts';
import { useFinanceStore } from '@/lib/store/financeStore';
import { formatCompact } from '@/lib/utils';

const COLORS = ['#2E7D5B', '#3B6EA5', '#C6893F', '#B5544E', '#6B5CA5', '#8A8272'];

interface TreemapNodeProps {
  x?: number; y?: number; width?: number; height?: number; index?: number;
  depth?: number; name?: string; value?: number;
  activeIndex?: number | null;
  onHover?: (index: number | null) => void;
}

function TreemapNode({
  x = 0, y = 0, width = 0, height = 0, index = 0, depth = 0, name = '', value = 0,
  activeIndex = null, onHover,
}: TreemapNodeProps) {
  // Recharts renderiza también el nodo raíz (depth 0) cubriendo toda el área,
  // con name vacío y value = total. Lo salteamos para no pintar encima de las hojas.
  if (depth === 0) return <g />;

  const color = COLORS[index % COLORS.length];
  const showName = width > 50 && height > 30;
  const showValue = width > 40 && height > (showName ? 44 : 22);

  const isActive = activeIndex === index;
  const showRing = width > 12 && height > 12;

  return (
    <g
      className="cursor-pointer"
      onMouseEnter={() => onHover?.(index)}
      onMouseLeave={() => onHover?.(null)}
    >
      <rect
        x={x} y={y} width={width} height={height} rx={8}
        fill={color}
        stroke="var(--bg)"
        strokeWidth={2}
        className="transition-[filter] duration-200 motion-reduce:transition-none"
        style={{ filter: isActive ? 'brightness(1.16) saturate(1.08)' : 'none' }}
      />
      {/* Anillo interior de resaltado en hover, contenido dentro de la caja (sin desborde) */}
      {showRing && (
        <rect
          x={x + 2.5} y={y + 2.5} width={width - 5} height={height - 5} rx={6}
          fill="none" stroke="#fff" strokeWidth={2}
          strokeOpacity={isActive ? 0.95 : 0}
          pointerEvents="none"
          className="transition-[stroke-opacity] duration-200 motion-reduce:transition-none"
        />
      )}
      {showName && (
        <text x={x + 8} y={y + 18} fill="#fff" fontSize={11} fontWeight={700} pointerEvents="none">{name}</text>
      )}
      {showValue && (
        <text x={x + 8} y={showName ? y + 34 : y + 18} fill="#fff" fontSize={12} fontWeight={800} pointerEvents="none">${formatCompact(value)}</text>
      )}
    </g>
  );
}

export function CategoryTreemap({
  scope = 'current_month',
  onSelect,
}: {
  scope?: 'global' | 'current_month';
  onSelect?: (name: string) => void;
}) {
  const { getCategoryBreakdown, toDisplay } = useFinanceStore();
  const [hovered, setHovered] = useState<number | null>(null);
  const breakdown = getCategoryBreakdown(scope);
  const data = breakdown.items.map((i) => ({ name: i.name, value: toDisplay(i.value) }));

  if (data.length === 0) {
    const emptyCopy = scope === 'global' ? 'Sin gastos registrados' : 'Sin gastos este mes';
    return <div className="h-[340px] flex items-center justify-center text-xs text-muted italic">{emptyCopy}</div>;
  }

  return (
    <div
      role="img"
      aria-label="Distribución del gasto por categoría"
      className="h-[340px] w-full"
      onMouseLeave={() => setHovered(null)}
    >
      <ResponsiveContainer width="100%" height="100%">
        <Treemap
          data={data}
          dataKey="value"
          content={<TreemapNode activeIndex={hovered} onHover={setHovered} />}
          isAnimationActive
          animationDuration={600}
          onClick={(node: { name?: string }) => node?.name && onSelect?.(node.name)}
        />
      </ResponsiveContainer>
    </div>
  );
}
