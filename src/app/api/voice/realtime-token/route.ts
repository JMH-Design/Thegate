export const maxDuration = 30;

function sanitizeRealtimeError(raw: string): string {
  if (/failed to fetch|network|timeout/i.test(raw)) {
    return "Connection failed. Check your internet and try again.";
  }
  if (/unauthorized|401|invalid.*token/i.test(raw)) {
    return "Voice service authentication failed.";
  }
  if (/rate limit|429/i.test(raw)) {
    return "Voice service is busy. Try again shortly.";
  }
  return "Voice service is temporarily unavailable.";
}

export async function POST() {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("[realtime-token] OPENAI_API_KEY not configured");
      return new Response("Voice service not configured", { status: 500 });
    }

    const response = await fetch(
      "https://api.openai.com/v1/realtime/client_secrets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session: {
            type: "transcription",
            audio: {
              input: {
                transcription: {
                  model: "gpt-4o-transcribe",
                  language: "en",
                },
                turn_detection: {
                  type: "server_vad",
                  threshold: 0.5,
                  prefix_padding_ms: 300,
                  silence_duration_ms: 500,
                },
              },
            },
          },
          expires_after: {
            anchor: "created_at",
            seconds: 600,
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("[realtime-token] OpenAI API error", {
        status: response.status,
        statusText: response.statusText,
        body: errText,
      });
      const sanitized = sanitizeRealtimeError(errText);
      return new Response(`Token failed: ${sanitized}`, {
        status: response.status,
      });
    }

    const data = (await response.json()) as {
      value?: string;
      expires_at?: number;
    };

    if (!data.value) {
      console.error("[realtime-token] No client secret in response", { data });
      return new Response("Voice service returned invalid response", {
        status: 500,
      });
    }

    return Response.json({
      token: data.value,
      expires_at: data.expires_at,
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Realtime token failed";
    console.error("[realtime-token] Unexpected error", {
      message: raw,
      stack: err instanceof Error ? err.stack : undefined,
    });
    const sanitized = sanitizeRealtimeError(raw);
    return new Response(`Token failed: ${sanitized}`, { status: 500 });
  }
}
