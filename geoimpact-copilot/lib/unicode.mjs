// Identifier and label strings are rendered inside evidence-checked claims. Invisible
// or direction-changing characters would let an exact string look like a different one.
// Reject them at the input boundary rather than trying to render them safely.
const forbiddenCharacter = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Co}\p{Cs}]|(?! )\p{Zs}/u;

const scriptTests = [
  ["Latin", /\p{Script=Latin}/u],
  ["Cyrillic", /\p{Script=Cyrillic}/u],
  ["Greek", /\p{Script=Greek}/u],
  ["Arabic", /\p{Script=Arabic}/u],
  ["Hebrew", /\p{Script=Hebrew}/u],
  ["Han", /\p{Script=Han}/u],
  ["Hiragana", /\p{Script=Hiragana}/u],
  ["Katakana", /\p{Script=Katakana}/u],
  ["Hangul", /\p{Script=Hangul}/u],
  ["Devanagari", /\p{Script=Devanagari}/u]
];

function describe(char) {
  return `U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`;
}

export function findUnsafeStrings(document) {
  const issues = [];
  const check = (text, path) => {
    const match = forbiddenCharacter.exec(text);
    if (match) issues.push(`${path || "/"}: contains control, format, private-use, or non-ASCII space character ${describe(match[0])}.`);
  };
  const visit = (value, path) => {
    if (typeof value === "string") {
      check(value, path);
    } else if (Array.isArray(value)) {
      value.forEach((child, index) => visit(child, `${path}/${index}`));
    } else if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        const escaped = key.replaceAll("~", "~0").replaceAll("/", "~1");
        check(key, `${path}/${escaped} (key)`);
        visit(child, `${path}/${escaped}`);
      }
    }
  };
  visit(document, "");
  return issues;
}

// Informational only: a decomposed or mixed-script identifier is valid data, but a
// reader should be told that it may be visually confusable with another string.
export function unicodeNotes(value) {
  if (typeof value !== "string" || /^[\x20-\x7e]*$/.test(value)) return null;
  const scripts = scriptTests.filter(([, test]) => test.test(value)).map(([name]) => name);
  return {
    non_ascii: true,
    nfc: value === value.normalize("NFC"),
    scripts,
    mixed_script: scripts.length > 1
  };
}
