import type { ChatSession } from "./chat-storage";

export type ChatBeautyPreset = "classic" | "glass";
/** Preserve existing classic/glass settings; unsupported imports use the legacy flag. */
export function resolveChatBeautyPreset(session: Pick<ChatSession, "beautyPreset" | "glassBubblesEnabled">): ChatBeautyPreset {
    return session.beautyPreset === "glass" || session.beautyPreset === "classic"
        ? session.beautyPreset : session.glassBubblesEnabled ? "glass" : "classic";
}
