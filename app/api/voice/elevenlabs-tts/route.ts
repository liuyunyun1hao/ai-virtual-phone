import { NextResponse } from "next/server";
import { proxyFetch } from "@/lib/proxy-fetch";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_BASE_URL = "https://api.elevenlabs.io/v1";
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
const DEFAULT_MODEL_ID = "eleven_multilingual_v2";
const DEFAULT_OUTPUT_FORMAT = "mp3_44100_128";

function normalizeBaseUrl(value: unknown): string {
    const raw = typeof value === "string" && value.trim() ? value.trim() : DEFAULT_BASE_URL;
    return raw.replace(/\/$/, "");
}

function clampUnit(value: unknown, fallback: number): number {
    const n = typeof value === "number" && Number.isFinite(value) ? value : Number.NaN;
    if (Number.isNaN(n)) return fallback;
    return Math.min(1, Math.max(0, n));
}

export async function POST(request: Request) {
    try {
        return await handleSynthesize(request);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: "tts_failed", message: message.slice(0, 400) }, { status: 502 });
    }
}

async function handleSynthesize(request: Request) {
    const body = await request.json().catch(() => ({}));
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    const text = typeof body.text === "string" ? body.text : "";
    const voiceId = typeof body.voiceId === "string" && body.voiceId.trim() ? body.voiceId.trim() : DEFAULT_VOICE_ID;
    const modelId = typeof body.modelId === "string" && body.modelId.trim() ? body.modelId.trim() : DEFAULT_MODEL_ID;
    const outputFormat = typeof body.outputFormat === "string" && body.outputFormat.trim()
        ? body.outputFormat.trim()
        : DEFAULT_OUTPUT_FORMAT;
    const rawSettings = body.voiceSettings && typeof body.voiceSettings === "object"
        ? body.voiceSettings as Record<string, unknown>
        : {};

    if (!apiKey) return NextResponse.json({ error: "missing_api_key" }, { status: 400 });
    if (!text.trim()) return NextResponse.json({ error: "missing_text" }, { status: 400 });

    const voiceSettings: Record<string, unknown> = {
        stability: clampUnit(rawSettings.stability, 0.5),
        similarity_boost: clampUnit(rawSettings.similarity_boost, 0.75),
        style: clampUnit(rawSettings.style, 0),
        use_speaker_boost: rawSettings.use_speaker_boost !== false,
    };
    if (typeof rawSettings.speed === "number" && Number.isFinite(rawSettings.speed)) {
        voiceSettings.speed = Math.min(1.2, Math.max(0.7, rawSettings.speed));
    }

    const url = `${normalizeBaseUrl(body.baseUrl)}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(outputFormat)}`;
    const response = await proxyFetch(url, {
        method: "POST",
        headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
        },
        body: JSON.stringify({ text, model_id: modelId, voice_settings: voiceSettings }),
    });

    if (!response.ok) {
        const errText = await response.text().catch(() => "");
        let message = errText.slice(0, 400) || `HTTP ${response.status}`;
        try {
            const parsed = JSON.parse(errText);
            const detail = parsed?.detail;
            message = typeof detail === "string" ? detail : String(detail?.message || message);
        } catch {
            // keep raw text
        }
        return NextResponse.json({ error: "tts_failed", message }, { status: 502 });
    }

    const audio = await response.arrayBuffer();
    return new NextResponse(audio, {
        status: 200,
        headers: {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "no-store",
        },
    });
}
