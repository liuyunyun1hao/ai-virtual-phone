"use client";

// components/chat-plugin-bootstrap.tsx
// 聊天插件运行时启动引导：应用挂载后加载全部启用插件。
// 放在根布局，保证插件的 hook 在用户进入聊天前就已注册。

import { useEffect } from "react";
import { getChatPluginRuntime } from "@/lib/chat-plugin-runtime";

export function ChatPluginBootstrap() {
    useEffect(() => {
        const runtime = getChatPluginRuntime();
        const silence = () => runtime.silence();
        window.addEventListener("float-identity-silenced", silence);
        void runtime.ensureStarted();
        return () => window.removeEventListener("float-identity-silenced", silence);
    }, []);
    return null;
}
