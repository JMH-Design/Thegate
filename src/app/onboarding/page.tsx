"use client";

import { useRef, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ChatMessage } from "@/components/session/chat-message";
import { ChatInput } from "@/components/session/chat-input";

export default function OnboardingPage() {
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [extracting, setExtracting] = useState(false);
  const [input, setInput] = useState("");

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/onboarding",
    }),
  });

  const isStreaming = status === "streaming" || status === "submitted";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const userMessageCount = messages.filter((m) => m.role === "user").length;

  function handleSend() {
    if (!input.trim() || isStreaming) return;
    sendMessage({ text: input });
    setInput("");
  }

  async function handleExtractAndContinue() {
    setExtracting(true);

    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content:
            m.parts
              ?.filter(
                (p): p is { type: "text"; text: string } => p.type === "text"
              )
              .map((p) => p.text)
              .join("") || "",
          parts: m.parts,
        })),
        action: "extract_profile",
      }),
    });

    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      setExtracting(false);
    }
  }

  function getMessageText(m: (typeof messages)[0]): string {
    return (
      m.parts
        ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("") || ""
    );
  }

  const showFinish = userMessageCount >= 5 && !isStreaming;

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      <header className="border-b border-border-subtle">
        <div className="max-w-2xl mx-auto px-6 py-4">
          <h1 className="text-lg font-semibold text-text-primary tracking-tight">
            THE GATE
          </h1>
        </div>
      </header>

      <div className="flex-1 max-w-2xl mx-auto w-full px-6 py-8 space-y-6 overflow-y-auto">
        {messages.length === 0 && !isStreaming && (
          <div className="text-center py-16">
            <p className="text-xs text-text-dim uppercase tracking-widest mb-4">
              The Gate
            </p>
            <p className="text-xl text-text-primary-soft font-medium max-w-md mx-auto leading-relaxed">
              &ldquo;What do you do for a living?&rdquo;
            </p>
          </div>
        )}

        {messages.map((m, i) => (
          <ChatMessage
            key={m.id}
            role={m.role as "user" | "assistant"}
            content={getMessageText(m)}
            isStreaming={
              isStreaming &&
              i === messages.length - 1 &&
              m.role === "assistant"
            }
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="sticky bottom-0 bg-bg-primary border-t border-border-subtle">
        <div className="max-w-2xl mx-auto px-6 py-4">
          <ChatInput
            value={input}
            onChange={setInput}
            onSubmit={handleSend}
            disabled={isStreaming || extracting}
            placeholder={
              messages.length === 0
                ? "Tell me about yourself..."
                : "Type your answer..."
            }
          />
          {showFinish && (
            <button
              onClick={handleExtractAndContinue}
              disabled={extracting}
              className="mt-3 w-full text-center text-sm text-gold hover:text-gold-focus transition-colors disabled:opacity-50"
            >
              {extracting
                ? "Setting up your map..."
                : "Continue to The Gate \u2192"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
