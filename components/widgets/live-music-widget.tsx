"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Music2, Pause, Play } from "lucide-react";
import { MusicMarquee } from "@/components/widgets/music-marquee";
import { useMusicControlsOptional } from "@/lib/music-context";
import type { MusicTrack } from "@/lib/music-storage";

const paletteCache = new Map<string, string>();

/** A bounded, cover-only sample; never modifies the cover or the audio source. */
function useCoverColor(url?: string) {
  const [sample, setSample] = useState<{ url: string; color: string }>();
  useEffect(() => {
    if (!url) return;
    const cached = paletteCache.get(url);
    if (cached) { setSample({ url, color: cached }); return; }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 24;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 24, 24);
        const pixels = ctx.getImageData(0, 0, 24, 24).data;
        const buckets = new Map<string, { r: number; g: number; b: number; weight: number; count: number }>();
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i + 3] < 128) continue;
          const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]];
          const key = `${r >> 5},${g >> 5},${b >> 5}`;
          const bucket = buckets.get(key) || { r: 0, g: 0, b: 0, weight: 0, count: 0 };
          bucket.r += r; bucket.g += g; bucket.b += b; bucket.count++;
          bucket.weight += 1 + (Math.max(r, g, b) - Math.min(r, g, b)) / 128;
          buckets.set(key, bucket);
        }
        const dominant = [...buckets.values()].sort((a, b) => b.weight - a.weight)[0];
        if (!dominant || cancelled) return;
        // Darken each channel equally: retain hue, guarantee readable white text.
        const color = `rgb(${[dominant.r, dominant.g, dominant.b].map(c => Math.round(c / dominant.count * 0.3 + 12)).join(",")})`;
        if (paletteCache.size >= 64) paletteCache.delete(paletteCache.keys().next().value!);
        paletteCache.set(url, color);
        setSample({ url, color });
      } catch { /* Cross-origin covers retain the neutral fallback. */ }
    };
    img.src = url;
    return () => { cancelled = true; img.onload = null; };
  }, [url]);
  return sample && sample.url === url ? sample.color : "#252529";
}

function Cover({ track }: { track: MusicTrack | null }) {
  const [failed, setFailed] = useState<string>();
  return <span className="live-music-cover">
    {track?.coverUrl && failed !== track.coverUrl
      ? <img src={track.coverUrl} alt="" draggable={false} onError={() => setFailed(track.coverUrl)} />
      : <Music2 aria-hidden="true" />}
  </span>;
}

export function LiveMusicWidget({ wide = false, preview = false }: {
  wide?: boolean; preview?: boolean; config?: Record<string, unknown>; widgetId?: string;
  onConfigChange?: (id: string, config: Record<string, unknown>) => void;
}) {
  const player = useMusicControlsOptional();
  const track = player?.currentTrack || null;
  const color = useCoverColor(track?.coverUrl);
  const choices = (player?.queue || []).filter((item, index, list) => list.findIndex(other => other.id === item.id) === index).slice(0, 4);
  const open = () => {
    if (preview) return;
    window.dispatchEvent(new CustomEvent("open-app", { detail: { appId: "music" } }));
  };
  const toggle = () => {
    if (preview) return;
    if (track) player?.togglePlay();
    else if (choices[0]) player?.playTrack(choices[0]);
  };
  return <section className={`live-music-widget ${wide ? "live-music-wide" : "live-music-square"}`}
    data-glass-theme="auto"
    aria-label={wide ? "音乐 · 播放队列" : "音乐 · 正在播放"}
    style={{ "--live-music-bg": color } as CSSProperties}>
    <div className="live-music-top">
      <button type="button" className="live-music-open" onClick={open} disabled={preview} aria-label="打开音乐应用">
        <Cover track={track} />
        <span className="live-music-info"><strong><MusicMarquee text={track?.title || "开始听歌"} /></strong><span>{track?.artist || "打开音乐，选一首喜欢的"}</span></span>
      </button>
      <button type="button" className="live-music-toggle" onClick={toggle} disabled={preview || !player || (!track && !choices.length)}
        aria-label={player?.isPlaying ? "暂停音乐" : "播放音乐"}>
        {player?.isPlaying ? <Pause fill="currentColor" aria-hidden="true" /> : <Play fill="currentColor" aria-hidden="true" />}
      </button>
    </div>
    {wide && <div className="live-music-queue" aria-label="播放队列快捷入口">
      {choices.map(item => <button type="button" key={item.id} disabled={preview}
        aria-label={`播放：${item.title} · ${item.artist}`} aria-pressed={track?.id === item.id}
        onClick={() => { if (!preview) player?.playTrack(item); }}>
        <Cover track={item} /><span className="live-music-queue-name">{item.title}</span>
      </button>)}
      {!choices.length && <button type="button" className="live-music-empty" onClick={open} disabled={preview}>
        <Music2 aria-hidden="true" /><span>从音乐 App 添加歌曲<br /><small>播放队列会出现在这里</small></span>
      </button>}
    </div>}
  </section>;
}
