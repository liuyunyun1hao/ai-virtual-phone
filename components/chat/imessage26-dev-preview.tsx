"use client";

import { useEffect, useState } from "react";

import { ChatRoom } from "@/components/chat/chat-room";
import { loadCharacters, saveCharacters } from "@/lib/character-storage";
import {
  hydrateChatStorage,
  loadChatContacts,
  loadChatMessages,
  loadChatSessions,
  pushChatMessage,
  saveChatContacts,
  saveChatSessions,
  type ChatSession,
} from "@/lib/chat-storage";
import { hydrateKvDb } from "@/lib/kv-db";

const PREVIEW_CHARACTER_ID = "dev_imessage26_dad";
const PREVIEW_CONTACT_ID = "dev_imessage26_contact";
const PREVIEW_SESSION_ID = "dev_imessage26_private";

const AVATAR_DATA_URL =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#c9cdd6"/><stop offset="1" stop-color="#8e96a6"/></linearGradient></defs><rect width="128" height="128" rx="64" fill="url(#g)"/><circle cx="64" cy="43" r="20" fill="white"/><path d="M25 112c3-27 18-43 39-43s36 16 39 43" fill="white"/></svg>`);

const previewSession: ChatSession = {
  id: PREVIEW_SESSION_ID,
  contactId: PREVIEW_CHARACTER_ID,
  unreadCount: 0,
  updatedAt: "2026-08-30T13:49:00.000Z",
  isPinned: false,
  bilingualTranslationEnabled: true,
  collapseBilingualTranslation: true,
};

function seedPreviewMessages() {
  if (loadChatMessages(PREVIEW_SESSION_ID).length > 0) return;

  pushChatMessage({
    sessionId: PREVIEW_SESSION_ID,
    role: "user",
    content: "今晚想听你说说话。",
    status: "read",
    createdAt: "2026-08-30T13:45:00.000Z",
  });
  pushChatMessage({
    sessionId: PREVIEW_SESSION_ID,
    role: "assistant",
    content: "I’m here. Tell me everything, slowly. | 我在。慢慢说给我听。",
    status: "read",
    createdAt: "2026-08-30T13:46:00.000Z",
  });
  pushChatMessage({
    sessionId: PREVIEW_SESSION_ID,
    role: "assistant",
    content: "不用急，我会一直听着。",
    status: "read",
    createdAt: "2026-08-30T13:46:20.000Z",
  });
  pushChatMessage({
    sessionId: PREVIEW_SESSION_ID,
    role: "user",
    content: "那就从今天最想念你的那一刻开始。",
    status: "read",
    createdAt: "2026-08-30T13:48:00.000Z",
    mediaType: "quote",
    mediaData: {
      quotePreview: "不用急，我会一直听着。",
      quoteRole: "assistant",
    },
  });
  pushChatMessage({
    sessionId: PREVIEW_SESSION_ID,
    role: "assistant",
    content: "好。",
    status: "read",
    createdAt: "2026-08-30T13:49:00.000Z",
  });
}

export function IMessage26DevPreview() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function prepare() {
      await hydrateKvDb();
      await hydrateChatStorage();

      const now = new Date().toISOString();
      const characters = loadCharacters();
      if (!characters.some((item) => item.id === PREVIEW_CHARACTER_ID)) {
        saveCharacters([
          ...characters,
          {
            id: PREVIEW_CHARACTER_ID,
            name: "Dad",
            avatar: AVATAR_DATA_URL,
            persona: "Local iMessage 26 preview character",
            wechatID: "+86 188 0000 0026",
            tags: ["preview"],
            createdAt: now,
            updatedAt: now,
          },
        ]);
      }

      const contacts = loadChatContacts();
      if (!contacts.some((item) => item.id === PREVIEW_CONTACT_ID)) {
        saveChatContacts([
          ...contacts,
          {
            id: PREVIEW_CONTACT_ID,
            characterId: PREVIEW_CHARACTER_ID,
            nickname: "Dad",
            addedAt: now,
          },
        ]);
      }

      const sessions = loadChatSessions();
      if (!sessions.some((item) => item.id === PREVIEW_SESSION_ID)) {
        saveChatSessions([previewSession, ...sessions]);
      }

      seedPreviewMessages();
      if (!cancelled) setReady(true);
    }

    void prepare();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return <div className="imessage26-dev-loading">Preparing real ChatRoom…</div>;
  }

  return (
    <main className="imessage26-dev-shell">
      <style jsx global>{`
        nextjs-portal {
          display: none !important;
        }
      `}</style>
      <div className="chat-app" data-room-active="">
        <div className="chat-room-layer">
          <ChatRoom session={previewSession} onBack={() => undefined} />
        </div>
      </div>
    </main>
  );
}
