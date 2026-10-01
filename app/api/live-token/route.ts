import { GoogleGenAI, Modality } from "@google/genai";
import { NextResponse } from "next/server";
import { getVoiceInstructions } from "@/lib/voice-instructions";
import { VOICE_OPTIONS, type VoiceOptionId } from "@/app/voice-options";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "gemini-3.8-live";
const VOICE = "Kore";

function isVoiceOption(value: unknown): value is VoiceOptionId {
  return (
    typeof value === "string" &&
    VOICE_OPTIONS.some((option) => option.id === value)
  );
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const requestHost = forwardedHost ?? request.headers.get("host") ?? new URL(request.url).host;
    return new URL(origin).host === requestHost;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Request not allowed." }, { status: 403 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Add GEMINI_API_KEY to your server environment to start the voice demo." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const option = (body as { option?: unknown } | null)?.option;
  if (!isVoiceOption(option)) {
    return NextResponse.json({ error: "Choose a supported speaking style." }, { status: 400 });
  }

  try {
    const client = new GoogleGenAI({
      apiKey,
      httpOptions: { apiVersion: "v1beta" },
    });
    const now = Date.now();
    const token = await client.authTokens.create({
      config: {
        uses: 1,
        newSessionExpireTime: new Date(now + 60_000).toISOString(),
        expireTime: new Date(now + 30 * 60_000).toISOString(),
        liveConnectConstraints: {
          model: MODEL,
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: VOICE },
              },
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            systemInstruction: {
              parts: [{ text: getVoiceInstructions(option) }],
            },
          },
        },
      },
    });

    if (!token.name) {
      throw new Error("Gemini did not return a session token.");
    }

    return NextResponse.json(
      { token: token.name },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  } catch (error) {
    console.error("Gemini Live token request failed:", error);
    return NextResponse.json(
      { error: "Could not connect to Gemini. Check the API key and try again." },
      { status: 502 },
    );
  }
}
