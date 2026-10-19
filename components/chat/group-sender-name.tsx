"use client";

import { useEffect, useState, type ReactNode, type CSSProperties } from "react";
import { DEFAULT_AVATAR_NAME_COLOR, extractAvatarNameColor } from "@/lib/avatar-name-color";

export function GroupSenderName({ avatar, children }: { avatar?: string | null; children: ReactNode }) {
    const [sample, setSample] = useState({ src: "", color: DEFAULT_AVATAR_NAME_COLOR });
    useEffect(() => {
        let active = true;
        if (avatar) void extractAvatarNameColor(avatar).then(color => {
            if (active) setSample({ src: avatar, color });
        });
        return () => { active = false; };
    }, [avatar]);
    // Never show the previous avatar's color while the new one is loading.
    const color = avatar && sample.src === avatar ? sample.color : DEFAULT_AVATAR_NAME_COLOR;
    return <span className="chat-group-sender-name" style={{ "--chat-name-color": color, color: "var(--chat-name-color)" } as CSSProperties}>{children}</span>;
}
