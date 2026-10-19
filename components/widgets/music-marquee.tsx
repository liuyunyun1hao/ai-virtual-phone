"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";

export function MusicMarquee({ text }: { text: string }) {
  const frame = useRef<HTMLSpanElement>(null);
  const content = useRef<HTMLSpanElement>(null);
  const [distance, setDistance] = useState(0);
  useEffect(() => {
    const measure = () => setDistance(Math.max(0, (content.current?.scrollWidth || 0) - (frame.current?.clientWidth || 0)));
    measure();
    const observer = new ResizeObserver(measure);
    if (frame.current) observer.observe(frame.current);
    if (content.current) observer.observe(content.current);
    return () => observer.disconnect();
  }, [text]);
  return <span ref={frame} className="music-marquee" title={text} data-overflow={distance > 2 || undefined}
    style={{ "--music-marquee-end": `${-distance}px`, "--music-marquee-duration": `${Math.max(7, distance / 22 + 4)}s` } as CSSProperties}>
    <span key={text} ref={content} className="music-marquee-text">{text}</span>
  </span>;
}
