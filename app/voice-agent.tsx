"use client";

import { GoogleGenAI, Modality } from "@google/genai";
import type { LiveServerMessage } from "@google/genai";
import { useCallback, useEffect, useRef, useState } from "react";
import { VOICE_OPTIONS, type VoiceOptionId } from "@/app/voice-options";

type Status = "idle" | "connecting" | "listening" | "speaking";
type TranscriptMessage = { role: "you" | "sawt"; text: string };
type AudioResources = {
  stream: MediaStream;
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: AudioWorkletNode;
};

const LIVE_MODEL = "gemini-3.8-live";
const STARTER_PROMPT =
  "Please greet me now in the speaking style selected for this conversation. Introduce yourself as Sawt in one brief, friendly sentence, then ask what I would like to talk about.";

function audioToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function getStartErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "Allow microphone access in your browser, then try again.";
    }
    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return "No microphone was found. Connect a microphone and try again.";
    }
    if (error.name === "NotReadableError" || error.name === "TrackStartError") {
      return "Your microphone is being used by another app. Close it and try again.";
    }
    return "Your browser could not start audio. Try again on localhost or an HTTPS page.";
  }

  if (error instanceof Error) return error.message;
  return "Something went wrong while starting the voice agent. Please try again.";
}

export default function VoiceAgent() {
  const [selectedOption, setSelectedOption] = useState<VoiceOptionId>("gulf");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);

  const sessionRef = useRef<Awaited<ReturnType<GoogleGenAI["live"]["connect"]>> | null>(null);
  const resourcesRef = useRef<AudioResources | null>(null);
  const playbackSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextPlaybackTimeRef = useRef(0);
  const statusRef = useRef<Status>("idle");

  const updateStatus = useCallback((nextStatus: Status) => {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
  }, []);

  const stopAgent = useCallback(() => {
    const session = sessionRef.current;
    sessionRef.current = null;

    if (session) {
      try {
        session.sendRealtimeInput({ audioStreamEnd: true });
      } catch {
        // The connection may already be closed.
      }
      session.close();
    }

    const resources = resourcesRef.current;
    resourcesRef.current = null;
    if (resources) {
      resources.processor.port.onmessage = null;
      resources.processor.port.close();
      resources.source.disconnect();
      resources.processor.disconnect();
      resources.stream.getTracks().forEach((track) => track.stop());
      void resources.context.close().catch(() => undefined);
    }

    playbackSourcesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch {
        // The source may already have stopped.
      }
    });
    playbackSourcesRef.current.clear();
    nextPlaybackTimeRef.current = 0;
    updateStatus("idle");
  }, [updateStatus]);

  useEffect(() => () => stopAgent(), [stopAgent]);

  const addTranscript = useCallback((role: TranscriptMessage["role"], text: string) => {
    const cleaned = text.trim();
    if (!cleaned) return;

    setMessages((current) => {
      const last = current[current.length - 1];
      if (last?.role === role) {
        return [...current.slice(0, -1), { ...last, text: `${last.text} ${cleaned}` }].slice(-8);
      }
      return [...current, { role, text: cleaned }].slice(-8);
    });
  }, []);

  const playAudio = useCallback((base64: string) => {
    const context = resourcesRef.current?.context;
    if (!context) return;

    const binary = atob(base64);
    const samples = new Int16Array(binary.length / 2);
    for (let index = 0; index < samples.length; index += 1) {
      const low = binary.charCodeAt(index * 2);
      const high = binary.charCodeAt(index * 2 + 1);
      samples[index] = (high << 8) | low;
    }

    const audioBuffer = context.createBuffer(1, samples.length, 24000);
    const channel = audioBuffer.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) {
      channel[index] = samples[index] / 32768;
    }

    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(context.destination);
    source.onended = () => playbackSourcesRef.current.delete(source);

    const startAt = Math.max(context.currentTime + 0.015, nextPlaybackTimeRef.current);
    nextPlaybackTimeRef.current = startAt + audioBuffer.duration;
    playbackSourcesRef.current.add(source);
    source.start(startAt);
  }, []);

  const startAgent = useCallback(async () => {
    if (statusRef.current !== "idle") return;

    setError("");
    setMessages([]);
    updateStatus("connecting");

    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone access needs a secure connection. Open this page on localhost or HTTPS.");
      }

      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      try {
        context = new AudioContext({ sampleRate: 16000 });
      } catch {
        context = new AudioContext();
      }
      await context.resume();
      await context.audioWorklet.addModule("/pcm-capture.worklet.js");

      const source = context.createMediaStreamSource(stream);
      const processor = new AudioWorkletNode(context, "pcm-capture", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });

      const response = await fetch("/api/live-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ option: selectedOption }),
        cache: "no-store",
      });
      const tokenResponse = (await response.json()) as { token?: string; error?: string };
      if (!response.ok || !tokenResponse.token) {
        throw new Error(tokenResponse.error ?? "Could not prepare a secure Gemini session.");
      }

      const ai = new GoogleGenAI({
        apiKey: tokenResponse.token,
        httpOptions: { apiVersion: "v1beta" },
      });
      const session = await ai.live.connect({
        model: LIVE_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            const serverContent = message.serverContent;
            if (!serverContent) return;

            if (serverContent.interrupted) {
              playbackSourcesRef.current.forEach((audioSource) => {
                try {
                  audioSource.stop();
                } catch {
                  // An already-ended source needs no action.
                }
              });
              playbackSourcesRef.current.clear();
              nextPlaybackTimeRef.current = resourcesRef.current?.context.currentTime ?? 0;
              updateStatus("listening");
            }

            const inputText = serverContent.inputTranscription?.text;
            if (inputText) addTranscript("you", inputText);

            const outputText = serverContent.outputTranscription?.text;
            if (outputText) addTranscript("sawt", outputText);

            const parts = serverContent.modelTurn?.parts ?? [];
            for (const part of parts) {
              if (part.inlineData?.data && part.inlineData.mimeType?.startsWith("audio/pcm")) {
                playAudio(part.inlineData.data);
                updateStatus("speaking");
              }
            }

            if (serverContent.turnComplete && statusRef.current !== "idle") {
              updateStatus("listening");
            }
          },
          onerror: () => {
            setError("The live connection ended unexpectedly. Please try starting again.");
            stopAgent();
          },
          onclose: () => {
            if (statusRef.current !== "idle") {
              setError("The live connection closed. Start a new conversation to reconnect.");
              stopAgent();
            }
          },
        },
      });

      sessionRef.current = session;
      resourcesRef.current = { stream, context, source, processor };

      processor.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        const activeSession = sessionRef.current;
        if (!activeSession) return;
        try {
          activeSession.sendRealtimeInput({
            audio: {
              data: audioToBase64(event.data),
              mimeType: "audio/pcm;rate=16000",
            },
          });
        } catch {
          // Ignore the final buffered microphone frame while the session closes.
        }
      };
      source.connect(processor);
      processor.connect(context.destination);

      updateStatus("listening");
      session.sendClientContent({
        turns: [{ role: "user", parts: [{ text: STARTER_PROMPT }] }],
      });
    } catch (startError) {
      if (!resourcesRef.current) {
        stream?.getTracks().forEach((track) => track.stop());
        if (context && context.state !== "closed") {
          await context.close().catch(() => undefined);
        }
      }
      stopAgent();
      setError(getStartErrorMessage(startError));
    }
  }, [addTranscript, playAudio, selectedOption, stopAgent, updateStatus]);

  const active = status === "listening" || status === "speaking";

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="#home" aria-label="Sawt voice demo home">
          <span className="brand-mark" aria-hidden="true">ص</span>
          <span>sawt</span>
        </a>
        <span className="topbar-note"><span className="topbar-dot" /> Gemini Live demo</span>
      </header>

      <section className="agent-panel" id="home" aria-labelledby="page-title">
        <p className="eyebrow">A voice agent for real conversation</p>
        <h1 id="page-title">Arabic, the way it&apos;s spoken.</h1>
        <p className="intro-copy">
          Try a familiar local dialect, or switch to clear American English. Say hello and Sawt will speak first.
        </p>

        <label className="field-label" htmlFor="voice-style">Speaking style</label>
        <div className="select-wrap">
          <select
            id="voice-style"
            value={selectedOption}
            onChange={(event) => setSelectedOption(event.target.value as VoiceOptionId)}
            disabled={status !== "idle"}
          >
            {VOICE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label} · {option.nativeLabel}
              </option>
            ))}
          </select>
          <span className="select-chevron" aria-hidden="true">⌄</span>
        </div>

        <button
          className={`start-button${active ? " start-button-active" : ""}`}
          type="button"
          onClick={active ? stopAgent : startAgent}
          disabled={status === "connecting"}
        >
          {status === "connecting" ? (
            <span className="spinner" aria-hidden="true" />
          ) : active ? (
            <span className="stop-icon" aria-hidden="true" />
          ) : (
            <svg aria-hidden="true" viewBox="0 0 20 20" className="mic-icon">
              <path d="M10 12.7a3 3 0 0 0 3-3V5.3a3 3 0 1 0-6 0v4.4a3 3 0 0 0 3 3Z" />
              <path d="M4.5 9.8a5.5 5.5 0 0 0 11 0M10 15.3v2.2m-2.5 0h5" />
            </svg>
          )}
          <span>{status === "connecting" ? "Connecting…" : active ? "End conversation" : "Start talking"}</span>
        </button>

        <div className="status-row" aria-live="polite" aria-atomic="true">
          <span className={`status-indicator status-${status}`} />
          <span>
            {status === "connecting" && "Getting your voice session ready…"}
            {status === "listening" && "Sawt is ready to speak with you"}
            {status === "speaking" && "Sawt is speaking · you can interrupt anytime"}
            {status === "idle" && "Your microphone is only used during a conversation"}
          </span>
        </div>

        {error && <p className="error-message" role="alert">{error}</p>}

        {messages.length > 0 && (
          <div className="transcript" aria-label="Conversation transcript" aria-live="polite">
            {messages.map((message, index) => (
              <p className="transcript-line" key={`${message.role}-${index}`}>
                <span className="transcript-speaker">{message.role === "you" ? "You" : "Sawt"}</span>
                <span dir="auto">{message.text}</span>
              </p>
            ))}
          </div>
        )}

        <p className="privacy-note">Your audio streams directly to Gemini and isn&apos;t stored by this demo.</p>
      </section>

      <footer className="footer-note">
        <span>Gulf · Egyptian · Levantine · Iraqi · Moroccan</span>
        <span>Built with Gemini Live</span>
      </footer>
    </main>
  );
}
