import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type React from "react";

export function SectionTitle({
  children,
  action,
  href,
  onClick,
  className,
}: {
  children: React.ReactNode;
  action?: string;
  href?: string;
  onClick?: () => void;
  className?: string;
}) {
  const actionContent = action && (
    <>
      {action}
      <ChevronRight className="w-[13px] h-[13px]" strokeWidth={2.6} />
    </>
  );

  return (
    <div className={cn("flex items-center justify-between", className)}>
      <h2 className="font-poster text-text text-[15px] tracking-tight">{children}</h2>
      {action && href && (
        <Link
          href={href}
          className="flex items-center gap-1 font-sans text-[12px] font-bold text-accent-deep"
        >
          {actionContent}
        </Link>
      )}
      {action && onClick && !href && (
        <button
          type="button"
          onClick={onClick}
          className="flex items-center gap-1 font-sans text-[12px] font-bold text-accent-deep"
        >
          {actionContent}
        </button>
      )}
    </div>
  );
}
