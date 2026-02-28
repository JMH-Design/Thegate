import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`w-full h-12 bg-surface border border-border rounded-[--radius-input] px-4 text-input text-text-primary-soft placeholder:text-text-muted transition-all duration-fast ease-[--ease-perplexity] focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold/30 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";
