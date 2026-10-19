const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const css = fs.readFileSync(path.join(root, "styles/imessage26.css"), "utf8");
const room = fs.readFileSync(path.join(root, "components/chat/chat-room.tsx"), "utf8");

assert.doesNotMatch(css, /--im26-composer-divider:\s*linear-gradient/, "composer divider must keep crisp ends");
assert.match(css, /data-glass-bubbles\][\s\S]*?\.chat-input-bar\[data-imessage-private\]::after\s*\{\s*content:\s*none;/, "raised glass rim overlays must stay disabled");
assert.doesNotMatch(css, /--im26-glass-rim:/, "glass controls must not use a separate raised rim token");
assert.match(css, /data-glass-bubbles\] \.chat-voice-message-btn\s*\{[\s\S]*?color:\s*color-mix/, "glass voice glyph owns a glass-aware color");
assert.match(room, /M12 3\.25a\.75\.75 0 0 1 \.75\.75v16/, "composer uses the supplied five-bar voice glyph");
assert.match(css, /--im26-control-surface:\s*linear-gradient\(180deg,[^;]+;/, "controls retain restrained surface light without fixed blue tint");
assert.match(css, /--im26-control-filter:\s*blur\(6px\)\s+saturate\(120%\)/, "glass preserves the local wallpaper without excess contrast");
assert.match(css, /background:\s*var\(--im26-control-surface\);[\s\S]*?box-shadow:\s*var\(--im26-control-shadow\);/, "glass controls must use their clear surface material");
assert.match(css, /chat-msg-wrapper\[data-imessage-tail\][\s\S]*?> \.imessage-bubble-surface\s*\{[\s\S]*?filter:\s*none;/, "glass bubble tails must not carry a glow halo");
assert.match(css, /chat-bubble-role-user\[data-media-type="text"\][\s\S]*?box-shadow:\s*0 2px 6px rgba\(0,46,98,\.065\);/, "user glass bubbles use a flat surface with only a soft cast shadow");
assert.match(css, /chat-bubble-role-assistant\[data-media-type="text"\][\s\S]*?box-shadow:\s*0 2px 6px rgba\(8,20,31,\.07\);/, "assistant glass bubbles use a flat surface with only a soft cast shadow");
assert.match(css, /data-glass-bubbles\] \.chat-send-btn\s*\{[\s\S]*?blur\(3\.5px\)\s+saturate\(164%\)\s+contrast\(1\.11\)/, "glass send control must stay clear and directional");
const charTextSurface = css.match(/data-glass-bubbles\] :is\(\.chat-bubble-role-assistant\[data-media-type="text"\], \.chat-stream-bubble\) > \.imessage-bubble-surface\s*\{([\s\S]*?)\n\}/)?.[1] || "";
assert.ok(charTextSurface, "Char text glass surface rule exists");
assert.doesNotMatch(charTextSurface, /linear-gradient/, "Char bubble base must not expose a directional color band");
assert.match(charTextSurface, /background:\s*var\(--im26-char-bubble-fill\)/, "Char bubble uses one even translucent fill");
assert.match(css, /--im26-char-bubble-fill:\s*rgba\(66,72,81,\.38\)/, "Char fill is neutral and less opaque");
assert.match(css, /--im26-char-bubble-outline:\s*rgba\(227,234,242,\.28\)/, "Char bubbles own a restrained neutral contour token");
assert.doesNotMatch(css, /drop-shadow\([^)]*--im26-char-bubble-outline/, "the contour no longer stacks alpha shadows");
assert.match(css, /-webkit-mask-box-image: url\("\/chat-bubble-contour-left.svg"\) 20 20 18 25/, "one SVG outline includes the tail");
assert.match(room, /!renderMsg\.mediaType \|\| String\(renderMsg\.mediaType\) === "text" \|\| renderMsg\.mediaType === "audio"/, "legacy explicit text messages receive the same composited glass surface");
assert.match(css, /data-glass-bubbles\][\s\S]*?\.chat-plus-menu-label[\s\S]*?color:\s*rgba\(248,251,255,\.96\)/, "glass plus-menu labels use light ink");
assert.match(css, /data-glass-bubbles\][\s\S]*?\.imessage-context-index[\s\S]*?\.ctx-menu-btn:not\(\.ctx-menu-btn-danger\)[\s\S]*?color:\s*rgba\(248,251,255,\.96\)/, "glass message submenus use light ink while danger actions remain red");
assert.match(css.slice(css.indexOf('/* Native-reference glass v22.')), /blur\(6px\) saturate\(112%\)/, "Char material avoids excess saturation/contrast");
assert.match(room, /useGlassContrast\(wrapperRef, bgImageResolved, !!session.glassBubblesEnabled/, "local contrast is glass-only");

console.log("Passed: clear glass controls, even Char bubble fill and hard contour, crisp composer divider, and five-bar voice glyph.");
