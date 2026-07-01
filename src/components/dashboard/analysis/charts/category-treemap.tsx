'use client';

import { Treemap, ResponsiveContainer } from 'recharts';
import { useFinanceStore } from '@/lib/store/financeStore';
import { formatCompact } from '@/lib/utils';

const COLORS = ['#2E7D5B', '#3B6EA5', '#C6893F', '#B5544E', '#6B5CA5', '#8A8272'];

interface TreemapNodeProps {
  x?: number; y?: number; width?: number; height?: number; index?: number;
  name?: string; value?: number;
}

function TreemapNode({ x = 0, y = 0, width = 0, height = 0, index = 0, name = '', value = 0 }: TreemapNodeProps) {
  const color = COLORS[index % COLORS.length];
  const show = width > 56 && height > 34;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={8} fill={color} stroke="var(--bg)" strokeWidth={2} />
      {show && (
        <>
          <text x={x + 8} y={y + 18} fill="#fff" fontSize={11} fontWeight={700}>{name}</text>
          <text x={x + 8} y={y + 34} fill="#fff" fontSize={12} fontWeight={800}>${formatCompact(value)}</text>
        </>
      )}
    </g>
  );
}

export function CategoryTreemap({ onSelect }: { onSelect?: (name: string) => void }) {
  const { getCategoryBreakdown, toDisplay } = useFinanceStore();
  const breakdown = getCategoryBreakdown('current_month');
  const data = breakdown.items.map((i) => ({ name: i.name, value: toDisplay(i.value) }));

  if (data.length === 0) {
    return <div className="h-[180px] flex items-center justify-center text-xs text-muted italic">Sin gastos este mes</div>;
  }

  return (
    <div role="img" aria-label="Distribución del gasto por categoría" className="h-[180px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <Treemap
          data={data}
          dataKey="value"
          content={<TreemapNode />}
          isAnimationActive
          animationDuration={600}
          onClick={(node: { name?: string }) => node?.name && onSelect?.(node.name)}
        />
      </ResponsiveContainer>
    </div>
  );
}
