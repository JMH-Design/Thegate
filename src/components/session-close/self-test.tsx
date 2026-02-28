"use client";

import { useState } from "react";
import { SelfTestQuestion } from "@/lib/types";

interface SelfTestProps {
  questions: SelfTestQuestion[];
}

export function SelfTest({ questions }: SelfTestProps) {
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});

  if (questions.length === 0) return null;

  return (
    <div className="py-6">
      <h3 className="text-xs text-text-dim uppercase tracking-widest font-semibold mb-4">
        Self-Test Before Next Session
      </h3>
      <div className="space-y-4">
        {questions.map((q, i) => (
          <div key={i} className="bg-bg-secondary rounded-[--radius-card] p-4">
            <p className="text-sm text-text-primary-soft mb-2">
              <span className="text-text-dim font-medium mr-2">Q{i + 1}:</span>
              {q.question}
            </p>
            {revealed[i] ? (
              <p className="text-sm text-text-secondary italic animate-[fade-in_200ms_ease]">
                {q.answer}
              </p>
            ) : (
              <button
                onClick={() => setRevealed((r) => ({ ...r, [i]: true }))}
                className="text-xs text-gold-link hover:text-gold transition-colors"
              >
                Reveal answer
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
