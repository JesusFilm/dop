import Link from "next/link";
import { HeartHandshake } from "lucide-react";

type BrandMarkProps = {
  href?: string;
  compact?: boolean;
};

export function BrandMark({ href = "/", compact = false }: BrandMarkProps) {
  return (
    <Link
      href={href}
      aria-label="Day of Prayer home"
      className="inline-flex items-center gap-3 text-primary"
    >
      <span className="grid size-11 place-items-center rounded-2xl bg-primary text-white shadow-card">
        <HeartHandshake aria-hidden="true" className="size-6" />
      </span>
      {!compact && (
        <span className="font-serif text-2xl font-bold">Day of Prayer</span>
      )}
    </Link>
  );
}
