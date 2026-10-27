import { NextResponse } from "next/server";
import { proxyFetch } from "@/lib/proxy-fetch";

export const runtime = "nodejs";
export const maxDuration = 20;

const DEFAULT_BASE_URL = "https://api.elevenlabs.io/v1";

function normalizeBaseUrl(value: unknown): string {
    const raw = typeof value === "string" && value.trim() ? value.trim() : DEFAULT_BASE_URL;
    return raw.replace(/\/$/, "");
}

function getRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export async function POST(request: Request) {
    try {
        return await handleListVoices(request);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: "list_voices_failed", message: message.slice(0, 400) }, { status: 502 });
    }
}

async function handleListVoices(request: Request) {
    const body = await request.json().catch(() => ({}));
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    const baseUrl = normalizeBaseUrl(body.baseUrl);

    if (!apiKey) return NextResponse.json({ error: "missing_api_key" }, { status: 400 });

    const response = await proxyFetch(`${baseUrl}/voices?page_size=100`, {
        method: "GET",
        headers: {
            "xi-api-key": apiKey,
            Accept: "application/json",
        },
    });

    const text = await response.text();
    let data: unknown = null;
    try {
        data = JSON.parse(text);
    } catch {
        return NextResponse.json({ error: "upstream_not_json", message: text.slice(0, 300) }, { status: 502 });
    }

    if (!response.ok) {
        const root = getRecord(data);
        const detail = root.detail;
        const detailRecord = getRecord(detail);
        const message = typeof detail === "string"
            ? detail
            : String(detailRecord.message || root.message || text || `HTTP ${response.status}`);
        return NextResponse.json({ error: "list_voices_failed", message: message.slice(0, 400) }, { status: 502 });
    }

    const list = Array.isArray(getRecord(data).voices) ? getRecord(data).voices as unknown[] : [];
    const voices = list.flatMap(item => {
        const record = getRecord(item);
        const id = typeof record.voice_id === "string" ? record.voice_id.trim() : "";
        if (!id) return [];
        const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : id;
        return [{ id, name }];
    });

    return NextResponse.json({ ok: true, voices });
}
