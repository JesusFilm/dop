import { BrandMark } from "@/components/brand-mark";

export function ParticipantHeader() {
  return (
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
      <BrandMark />
      <span className="rounded-full bg-primary-faint px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
        Shared gathering
      </span>
    </header>
  );
}
