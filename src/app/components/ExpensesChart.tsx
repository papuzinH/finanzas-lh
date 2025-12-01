'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface ChartData {
  name: string;
  value: number;
  color: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface ExpensesChartProps {
  data: ChartData[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/90 p-2 shadow-xl backdrop-blur-md">
        <p className="text-xs font-medium text-slate-300">{payload[0].name}</p>
        <p className="font-mono text-sm font-bold text-white">
          {new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          }).format(payload[0].value)}
        </p>
      </div>
    );
  }
  return null;
};

export default function ExpensesChart({ data }: ExpensesChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-[300px] w-full items-center justify-center rounded-xl border border-slate-800 bg-slate-900/50 text-slate-500">
        <p className="text-sm">No hay datos de gastos</p>
      </div>
    );
  }

  return (
    <div className="h-[300px] w-full rounded-xl border border-slate-800 bg-slate-900/50 p-4 shadow-sm">
      <h3 className="mb-4 text-sm font-medium text-slate-400">Gastos por Categoría</h3>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={5}
            dataKey="value"
            stroke="none"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend 
            verticalAlign="bottom" 
            height={36} 
            iconType="circle"
            formatter={(value) => <span className="text-xs text-slate-400 ml-1">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
