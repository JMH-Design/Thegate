interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

export function ChatMessage({ role, content, isStreaming }: ChatMessageProps) {
  const isCoach = role === "assistant";

  return (
    <div
      className={`flex ${isCoach ? "justify-start" : "justify-end"} animate-[slide-up_200ms_ease-out]`}
    >
      <div
        className={`max-w-[85%] ${
          isCoach
            ? "text-text-primary-soft"
            : "bg-surface rounded-2xl rounded-br-md px-4 py-3 text-text-primary-soft"
        }`}
      >
        {isCoach && (
          <span className="text-[11px] font-semibold text-gold uppercase tracking-widest mb-2 block">
            Coach
          </span>
        )}
        <div className="text-[15px] leading-relaxed whitespace-pre-wrap">
          {content}
          {isStreaming && (
            <span className="inline-block w-0.5 h-4 bg-gold ml-0.5 animate-pulse align-text-bottom" />
          )}
        </div>
      </div>
    </div>
  );
}
