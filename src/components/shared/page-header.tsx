import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
  containerClassName?: string;
}

export function PageHeader({ title, icon, children, className, containerClassName }: PageHeaderProps) {
  return (
    <header className={`sticky top-0 z-10 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md ${className}`}>
      <div className={`mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-3 ${containerClassName || 'max-w-2xl'}`}>
        <div className="flex items-center gap-3">
          {icon && (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
              {icon}
            </div>
          )}
          <h1 className="text-lg font-bold tracking-tight text-slate-100">{title}</h1>
        </div>
        {children && <div className="flex items-center gap-2">{children}</div>}
      </div>
    </header>
  );
}
