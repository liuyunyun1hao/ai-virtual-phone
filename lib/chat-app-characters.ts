import { loadInteractableCharacters } from "./character-storage";
import { withChatCharacterAvatar } from "./chat-session-avatar";

/** Chat app presentation only; character profiles and other apps keep their own avatars. */
export function loadChatAppCharacters() {
    return loadInteractableCharacters().map(character => withChatCharacterAvatar(null, character));
}
