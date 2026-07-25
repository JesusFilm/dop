import { Star } from "lucide-react";
import { cx } from "@/lib/classnames";

type AvatarProps = {
  name: string;
  highlighted?: boolean;
  size?: "sm" | "md";
};

export function Avatar({
  name,
  highlighted = false,
  size = "md",
}: AvatarProps) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <span
      aria-hidden="true"
      className={cx(
        "relative grid shrink-0 place-items-center rounded-full font-serif font-semibold",
        size === "md" ? "size-12 text-xl" : "size-10 text-lg",
        highlighted
          ? "bg-primary text-white"
          : "bg-surface-muted text-ink-muted",
      )}
    >
      {initial}
      {highlighted ? (
        <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-white text-primary shadow-sm">
          <Star className="size-3 fill-current" />
        </span>
      ) : null}
    </span>
  );
}
