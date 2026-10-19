"use client";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { extractAvatarNameColor, DEFAULT_AVATAR_NAME_COLOR } from "@/lib/avatar-name-color";
import { loadChatSessions } from "@/lib/chat-storage";
import { loadBubbleColors } from "@/lib/chat-bubble-color-store";
import { BUBBLE_COLORS_EVENT, resolveBubbleColors, type BubbleColors } from "@/lib/chat-bubble-colors";
import { type ChatBeautyPreset } from "@/lib/chat-beauty-preset";
export function useGroupBubbleTint(characters: readonly { id: string; avatar?: string | null }[], sessionId: string, dark: boolean, preset?: ChatBeautyPreset) {
    const [config,setConfig]=useState<BubbleColors>(() => loadBubbleColors(sessionId, loadChatSessions().find(s=>s.id===sessionId)?.bubbleColors));
    const [samples,setSamples]=useState<Record<string,{src:string;color:string}>>({});
    useEffect(() => {
        const refresh=()=>setConfig(loadBubbleColors(sessionId, loadChatSessions().find(s=>s.id===sessionId)?.bubbleColors));
        refresh(); window.addEventListener(BUBBLE_COLORS_EVENT,refresh);
        return ()=>window.removeEventListener(BUBBLE_COLORS_EVENT,refresh);
    },[sessionId]);
    useEffect(() => {
        let active=true;
        if(config.charMode==="auto") void Promise.all(characters.filter(c=>c.avatar).map(async c=>{
            const src=c.avatar!;
            return [c.id,{src,color:await extractAvatarNameColor(src,true)}] as const;
        })).then(entries=>{if(active)setSamples(Object.fromEntries(entries));});
        return ()=>{active=false;};
    },[characters,config.charMode]);
    return useCallback((id?:string,user=false):CSSProperties=>{
        const sample = id ? samples[id] : undefined;
        const currentSample = sample && sample.src === characters.find(c => c.id === id)?.avatar && sample.color !== DEFAULT_AVATAR_NAME_COLOR ? sample.color : undefined;
        const colors = resolveBubbleColors(config, dark, user, currentSample);
        return {
            [user ? "--im26-base-blue" : "--im26-base-incoming"]: colors.background,
            "--bubble-text-ink": colors.text,
            "--voice-ink": colors.voice,
            "--bubble-surface-color": colors.surface,
            "--bubble-surface-opacity": colors.opacity,
            ...(user ? { "--chat-send-surface": colors.background, "--chat-send-ink": colors.text } : {}),
        } as CSSProperties;
    },[characters,config,dark,samples,preset]);
}
