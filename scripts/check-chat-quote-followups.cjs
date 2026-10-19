const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const loadTs = (relativePath, dependencies = {}) => {
  const exportsObject = {};
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports: exportsObject,
    require: name => dependencies[name] || require(name),
    Intl,
    Number,
    String,
    Set,
    AbortSignal,
    fetch: async () => { throw new Error("network disabled in quote regression"); },
  });
  return exportsObject;
};

const bilingual = loadTs("lib/bilingual-text.ts");
const exchange = loadTs("lib/exchange-rates.ts");
const quote = loadTs("lib/chat-quote-preview.ts", {
  "./bilingual-text": bilingual,
  "./exchange-rates": exchange,
  "./chat-storage": {},
});

const base = { id: "m1", sessionId: "s1", role: "assistant", createdAt: Date.now(), status: "sent" };
assert.strictEqual(
  quote.getQuotePreview({ ...base, content: "Do you miss me? | 你想我了吗？" }),
  "Do you miss me?",
  "a quote must not retain the bilingual protocol or translated half",
);
assert.strictEqual(
  quote.normalizeQuotePreviewText("Bonsoir | 晚上好"),
  "Bonsoir",
  "stored legacy quote previews are normalized on render",
);
assert.strictEqual(
  quote.getQuotePreview({ ...base, content: "", mediaType: "transfer", mediaData: { amount: 128.5, currency: "USD", label: "coffee" } }),
  "转账：$128.50 · coffee",
  "foreign transfer quotes must preserve their actual currency",
);

const room = fs.readFileSync(path.join(root, "components/chat/chat-room.tsx"), "utf8");
assert.match(room, /querySelector<HTMLElement>\("\.chat-bilingual-section"\)/, "quote capture reads the visible bilingual section");
assert.match(room, /quotePreview:\s*getQuotePreview\(quotingMessage \|\| quoteStored\)/, "quote payload freezes the visible preview");

const settings = fs.readFileSync(path.join(root, "components/chat/chat-settings-panel.tsx"), "utf8");
const backgroundBlock = settings.match(/const announceBackgroundChange[\s\S]*?\n\s*};/)?.[0] || "";
assert.ok(backgroundBlock, "background change handler exists");
assert.doesNotMatch(backgroundBlock, /CHAT_REQUEST_REPLY_EVENT/, "background changes must not request an immediate model reply");

const css = fs.readFileSync(path.join(root, "styles/imessage26.css"), "utf8");
assert.match(css, /data-glass-bubbles\] \.chat-send-btn[\s\S]*?linear-gradient\(rgba\(5,113,221,\.86\)/, "glass send button owns a fixed glass material");
assert.match(css, /chat-quote-message-assistant \.chat-quote-reply \{[\s\S]*?align-items:\s*center/, "Char quote reply content is vertically centered");
assert.match(css, /\.imessage-quote-compose-close \{\s*position:\s*fixed;/, "quote close button keeps its viewport anchor");
const glassRelativeControls = css.match(/data-glass-bubbles\] :is\(\s*\.imessage-contact-name,\s*\.chat-monologue-heart\s*\) \{\s*position:\s*relative;\s*\}/)?.[0] || "";
assert.ok(glassRelativeControls, "glass relative-control rule exists");
assert.doesNotMatch(glassRelativeControls, /imessage-quote-compose-close/, "glass material must not pull the quote close button into document flow");

console.log("Passed: visible-language quotes, foreign-currency quote summaries, delayed background response, Char quote alignment, glass send material, and fixed glass quote close positioning.");
