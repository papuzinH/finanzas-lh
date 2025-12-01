import { Wallet } from 'lucide-react';

export default function Loading() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 animate-pulse">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-900 border border-slate-800">
          <Wallet className="h-8 w-8 text-slate-700" />
        </div>
        <div className="h-4 w-32 rounded bg-slate-900"></div>
      </div>
    </div>
  );
}
