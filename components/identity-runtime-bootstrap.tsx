"use client";

import { useEffect, useState } from "react";
import { ChatPluginBootstrap } from "./chat-plugin-bootstrap";
import { ChatReasoningVisibilityController } from "./chat-reasoning-visibility-controller";
import { CSSImportEnhancer } from "./css-import-enhancer";

export function IdentityRuntimeBootstrap() {
  const [retired, setRetired] = useState(false);
  useEffect(() => {
    const silence = () => setRetired(true);
    window.addEventListener("float-identity-silenced", silence);
    return () => window.removeEventListener("float-identity-silenced", silence);
  }, []);
  return retired ? null : <><CSSImportEnhancer /><ChatPluginBootstrap /><ChatReasoningVisibilityController /></>;
}
