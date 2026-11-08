import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

// Shared building blocks. Touch targets are at least 44px high.

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";
const variants = {
  primary: "bg-accent text-white hover:brightness-110",
  secondary: "border border-line bg-raised text-ink hover:bg-line/50",
  danger: "border border-red-500/50 text-red-600 hover:bg-red-500/10 dark:text-red-400",
  ghost: "text-ink hover:bg-line/50",
} as const;

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants }) {
  return <button type="button" className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function buttonClass(variant: keyof typeof variants = "secondary") {
  return `${base} ${variants[variant]}`;
}

export function Field({ label, id, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; id: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        className="min-h-11 rounded-lg border border-line bg-surface px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        {...props}
      />
    </div>
  );
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {children}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  return (
    <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
      {message}
    </p>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <p role="status" className="py-6 text-sm text-muted">
      {label}…
    </p>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-card border border-line bg-raised p-4 ${className}`}>{children}</div>;
}
