import { ButtonHTMLAttributes, forwardRef } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-gold text-bg-primary hover:bg-gold-hover focus:ring-2 focus:ring-gold/40 active:scale-[0.98]",
  secondary:
    "bg-surface text-text-primary-soft border border-border hover:bg-surface-hover hover:border-[#4A4A4A] focus:ring-2 focus:ring-gold-focus/30",
  ghost:
    "bg-transparent text-text-tertiary hover:bg-surface-hover hover:text-text-primary-soft",
  danger:
    "bg-danger text-white hover:bg-red-700 focus:ring-2 focus:ring-red-500/40",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", className = "", children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={`inline-flex items-center justify-center h-10 px-4 rounded-[--radius-button] text-sm font-medium transition-all duration-fast ease-[--ease-perplexity] disabled:opacity-40 disabled:cursor-not-allowed ${variantStyles[variant]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
