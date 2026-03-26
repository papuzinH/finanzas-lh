import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
  containerClassName?: string;
}

export function PageHeader({ title, subtitle, icon, children, className, containerClassName }: PageHeaderProps) {
  return (
    <header className={`sticky top-0 z-10 border-b border-slate-800 bg-surface/80 backdrop-blur-md ${className}`}>
      <div className={`mx-auto pl-4 pr-4 md:pl-6 md:pr-6 py-3 md:py-4 flex items-center justify-between gap-3 ${containerClassName || 'max-w-2xl'}`}>
        <div className="flex items-center gap-3">
          {icon && (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
              {icon}
            </div>
          )}
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-100">{title}</h1>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {children && <div className="flex items-center gap-2">{children}</div>}
      </div>
    </header>
  );
}
