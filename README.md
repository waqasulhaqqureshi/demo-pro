# Sawt — Arabic voice agent

A minimal, real-time voice demo built with Next.js and Gemini Live. In its default auto mode, Sawt follows the language and Arabic dialect it hears, switching between Arabic and American English as the speaker switches. You can optionally choose Gulf, Egyptian, Levantine, Iraqi, Moroccan Darija, or US English as a preference. Sawt greets you first.

## Run locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and replace the placeholder with a Gemini API key. Keep it server-side—never prefix it with `NEXT_PUBLIC_` or commit `.env.local`.
3. Run `npm run dev` and open the local URL. Allow microphone access when prompted. Microphone access requires localhost or HTTPS.

The browser connects directly to Gemini Live over a WebSocket after receiving its ephemeral token. This avoids relaying live audio through the Next.js server and helps keep round-trip latency low. Audio is captured as mono PCM at 16 kHz and model audio is played as 24 kHz PCM.

### Windows PowerShell key setup

```powershell
Copy-Item .env.example .env.local
notepad .env.local
```

In Notepad, replace the placeholder value with a newly generated Gemini key, save, then restart `npm run dev`. `.env.local` is intentionally ignored by Git and will not arrive through `git fetch`.

## Deploy to Vercel

- Add `GEMINI_API_KEY` as a **server-side** environment variable in Vercel project settings (do not use a `NEXT_PUBLIC_` prefix).
- Run `npm run build` to check the production build before deployment.
- The `/api/live-token` route validates the requested speaking mode and same-origin requests. The returned token is restricted to server-side instructions, the Live model, and one session.
- Before a public launch, add persistent rate limiting or an authenticated access gate to `/api/live-token` and set Gemini usage / billing limits. Same-origin checks and single-use tokens are not a substitute for production abuse controls.

## Voice and language notes

The default instructions ask Gemini to follow the spoken language and mirror clear dialect cues from the audio, including Gulf, Egyptian, Levantine, Iraqi, and Moroccan Darija. If dialect cues are unclear, it should avoid claiming certainty. The English profile uses a neutral General American style. Live audio uses the Gemini voice `Kore`; the model chooses language from the conversation. Arabic output quality can vary by topic and should be tested with native speakers from each target region.

A receptionist PDF was attached in the chat, but it is not available in the repository workspace for inspection yet. The current dialect instructions are a general starting point; Sawt can be aligned more closely once the PDF is accessible.
