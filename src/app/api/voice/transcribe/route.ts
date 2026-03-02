import OpenAI from "openai";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;

    if (!audioFile) {
      return new Response("No audio file provided", { status: 400 });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const transcription = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file: audioFile,
      language: "en",
    });

    return Response.json({ text: transcription.text });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Transcription failed";
    return new Response(message, { status: 500 });
  }
}
