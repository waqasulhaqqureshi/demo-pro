# Sawt — Arabic voice agent

A minimal, real-time voice demo built with Next.js and Gemini Live. Choose Gulf, Egyptian, Levantine, Iraqi, or Moroccan Arabic, or neutral US English. Sawt greets you first, then listens for an interruption or reply.

## Run locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and set `GEMINI_API_KEY` to a Gemini API key. The key is used only by the server to mint a short-lived, single-use Live API token; it is never sent to the browser.
3. Run `npm run dev` and open the local URL. Allow microphone access when prompted. Microphone access requires localhost or HTTPS.

The browser connects directly to Gemini Live over a WebSocket after receiving its ephemeral token. This avoids relaying the live audio through the Next.js server and helps keep round-trip latency low. Audio is captured as mono PCM at 16 kHz and model audio is played as 24 kHz PCM.

## Deploy to Vercel

- Add `GEMINI_API_KEY` as a **server-side** environment variable in the Vercel project settings (do not use a `NEXT_PUBLIC_` prefix).
- Run `npm run build` to check the production build before deployment.
- The `/api/live-token` route validates the requested speaking profile and same-origin requests. The returned token is restricted to the selected server-side instructions, the Live model, and one session.
- Before making a public launch, add persistent rate limiting or an authenticated access gate to `/api/live-token` and set Gemini usage / billing limits. Same-origin checks and single-use tokens are not a substitute for production abuse controls.

## Voice and language notes

The system instructions favor conversational local phrasing, Arabic script, and staying within the selected dialect instead of slipping into formal Arabic or another region's vocabulary. The English profile uses a neutral General American style. Live audio uses the Gemini voice `Kore`; the model selects language from the conversation. Arabic output quality can vary by topic and should be tested with native speakers from each target region.

The original request mentioned a PDF with additional Arabic speaking guidance, but no PDF was included in the repository. The dialect instructions here are a fresh starting point and can be adapted when that document is available.
