"use client";
import { useCallback, useSyncExternalStore } from "react";
import { CHARACTERS_UPDATED_EVENT, loadInteractableCharacters as loadCharacters } from "@/lib/character-storage";

function subscribe(onChange: () => void) {
    window.addEventListener(CHARACTERS_UPDATED_EVENT, onChange);
    window.addEventListener("focus", onChange);
    return () => {
        window.removeEventListener(CHARACTERS_UPDATED_EVENT, onChange);
        window.removeEventListener("focus", onChange);
    };
}
const serverSnapshot = () => null;

/** Read the store on render AND after subscribing, avoiding a stale mount-time copy. */
export function useChatCharacter(characterId: string) {
    const getSnapshot = useCallback(() => loadCharacters().find(c => c.id === characterId) || null, [characterId]);
    return useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
}
