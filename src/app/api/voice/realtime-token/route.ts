export const maxDuration = 30;

export async function POST() {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response("OPENAI_API_KEY not configured", { status: 500 });
    }

    const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview",
        voice: "alloy",
        input_audio_transcription: {
          model: "gpt-4o-transcribe",
          language: "en",
        },
        modalities: ["text"],
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(`OpenAI Realtime API error: ${errText}`, {
        status: response.status,
      });
    }

    const data = (await response.json()) as {
      client_secret?: { value: string; expires_at: number };
    };

    if (!data.client_secret?.value) {
      return new Response("No client secret in response", { status: 500 });
    }

    return Response.json({
      token: data.client_secret.value,
      expires_at: data.client_secret.expires_at,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Realtime token failed";
    return new Response(message, { status: 500 });
  }
}
