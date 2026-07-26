import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/classnames";

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  tone?: "primary" | "secondary" | "quiet" | "danger";
  fullWidth?: boolean;
  size?: "default" | "compact";
};

const tones = {
  primary:
    "bg-primary text-white shadow-card hover:bg-primary-strong active:translate-y-px",
  secondary:
    "border border-primary/30 bg-transparent text-primary hover:bg-primary-faint",
  quiet: "bg-transparent text-ink-muted hover:bg-surface-muted",
  danger: "bg-danger text-white hover:bg-red-800",
};

const sizes = {
  default: "min-h-14 px-6",
  compact: "min-h-11 px-4",
};

export function ActionButton({
  children,
  className,
  tone = "primary",
  fullWidth = true,
  size = "default",
  type = "button",
  ...props
}: ActionButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-full text-sm font-semibold tracking-wide transition disabled:pointer-events-none disabled:opacity-55",
        sizes[size],
        tones[tone],
        fullWidth && "w-full",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
