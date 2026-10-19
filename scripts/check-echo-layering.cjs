const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const css = fs.readFileSync(path.join(root, "styles/imessage26.css"), "utf8");

const field = css.match(/\.echo-live-field\s*\{([^}]*)\}/)?.[1] || "";
const original = css.match(/\.echo-live-original\s*\{([^}]*)\}/)?.[1] || "";
const skip = css.match(/\.echo-live-skip\s*\{([^}]*)\}/)?.[1] || "";

assert.match(field, /z-index:\s*2;/, "orbiting Echo copies must sit above the fixed source clone");
assert.match(original, /z-index:\s*1;/, "the fixed Echo source clone must sit below the swarm");
assert.match(skip, /z-index:\s*3;/, "the skip control must remain above the animation");
assert.match(css, /\.echo-live\s*\{[^}]*z-index:\s*201;/, "the complete Echo overlay must stay above the chat surface");

console.log("Passed: Echo layer order is dimmer -> source clone -> swarm -> skip control.");
