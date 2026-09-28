// Developer-only catalog maintenance. Never reads player storage or sends text online.
// Existing IDs stay stable. New source strings append to the catalog.
import { parse } from "@babel/parser";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";

const output = new URL("../src/i18n/messages.json", import.meta.url);
const messages = existsSync(output) ? JSON.parse(readFileSync(output, "utf8")) : {};
const seen = new Set(Object.values(messages));
const han = /\p{Script=Han}/u;
function add(value) {
  const text = value.replace(/\s+/g, " ").trim();
  if (!han.test(text) || seen.has(text)) return;
  const id = createHash("sha256").update(text).digest("hex").slice(0, 10);
  if (messages[id] && messages[id] !== text) throw new Error("Message ID collision");
  messages[id] = text;
  seen.add(text);
}
function walk(node) {
  if (!node || typeof node !== "object") return;
  if (["StringLiteral", "JSXText"].includes(node.type)) add(node.value);
  if (node.type === "TemplateLiteral") add(node.quasis.map((q, i) => q.value.cooked + (i < node.expressions.length ? `{${i}}` : "")).join(""));
  for (const [key, value] of Object.entries(node)) {
    if (["loc", "comments", "leadingComments", "trailingComments", "innerComments"].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") walk(value);
  }
}
for (const directory of ["app", "content", "core", "persistence"]) {
  const root = new URL(`../src/${directory}/`, import.meta.url);
  for (const file of readdirSync(root, { recursive: true }).filter((f) => /\.tsx?$/.test(f)).sort()) {
    walk(parse(readFileSync(new URL(file, root), "utf8"), { sourceType: "module", plugins: ["typescript", "jsx"] }));
  }
}
writeFileSync(output, JSON.stringify(messages, null, 2) + "\n");
console.log(`${Object.keys(messages).length} stable messages in src/i18n/messages.json`);
