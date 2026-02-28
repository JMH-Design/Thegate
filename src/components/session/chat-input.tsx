"use client";

import { useRef, useEffect, KeyboardEvent } from "react";
import { ArrowUp } from "lucide-react";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder = "Type your answer...",
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [value]);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled) onSubmit();
    }
  }

  return (
    <div className="relative flex items-end gap-2 bg-surface border border-border rounded-[--radius-input] px-4 py-3 focus-within:border-gold focus-within:ring-1 focus-within:ring-gold/30 transition-all duration-fast">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        rows={1}
        className="flex-1 bg-transparent text-[15px] text-text-primary-soft placeholder:text-text-muted resize-none focus:outline-none disabled:opacity-50 leading-relaxed"
      />
      <button
        onClick={onSubmit}
        disabled={!value.trim() || disabled}
        className="flex-shrink-0 w-[34px] h-[34px] rounded-full bg-gold text-bg-primary flex items-center justify-center transition-all duration-fast hover:bg-gold-hover disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
        aria-label="Send"
      >
        <ArrowUp size={16} strokeWidth={2.5} />
      </button>
    </div>
  );
}
