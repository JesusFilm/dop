import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/classnames";

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  tone?: "primary" | "secondary" | "quiet" | "danger";
  fullWidth?: boolean;
};

const tones = {
  primary:
    "bg-primary text-white shadow-card hover:bg-primary-strong active:translate-y-px",
  secondary:
    "border border-primary/30 bg-transparent text-primary hover:bg-primary-faint",
  quiet: "bg-transparent text-ink-muted hover:bg-surface-muted",
  danger: "bg-danger text-white hover:bg-red-800",
};

export function ActionButton({
  children,
  className,
  tone = "primary",
  fullWidth = true,
  type = "button",
  ...props
}: ActionButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        "inline-flex min-h-14 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold tracking-wide transition disabled:pointer-events-none disabled:opacity-55",
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
