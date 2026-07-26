import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand-mark";

export function ParticipantHeader({ trailing }: { trailing?: ReactNode }) {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/70 bg-white">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
        <BrandMark />
        {trailing ?? (
          <span className="rounded-full bg-primary-faint px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            Shared gathering
          </span>
        )}
      </div>
    </header>
  );
}
