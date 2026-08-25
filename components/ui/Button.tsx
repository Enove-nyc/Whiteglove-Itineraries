import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

const sizes: Record<Size, string> = {
  md: "min-h-[2.75rem] px-5 text-sm",
  sm: "min-h-[2.5rem] px-4 text-sm",
};

const variants: Record<Variant, string> = {
  // The one dominant action on a screen. Only one of these should appear
  // per page — see AGENTS.md "one primary action per screen".
  primary: "bg-[var(--navy)] text-white hover:opacity-90",
  secondary: "border border-[var(--navy)] text-[var(--navy)] bg-transparent hover:bg-[var(--navy)]/5",
  ghost: "text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2 hover:opacity-80",
};

type CommonProps = {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
  className?: string;
};

type ButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ variant = "primary", size = "md", children, className = "", ...rest }: ButtonProps) {
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

type LinkButtonProps = CommonProps & {
  href: string;
  prefetch?: boolean;
};

export function LinkButton({ variant = "primary", size = "md", children, className = "", href, prefetch }: LinkButtonProps) {
  return (
    <Link href={href} prefetch={prefetch} className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}>
      {children}
    </Link>
  );
}
