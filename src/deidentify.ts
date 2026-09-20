// Removes what could identify a person from a shopping sentence before it is stored for 設計師洞察.
// What it catches: e-mail addresses, URLs, phone numbers, Taiwan ID numbers, @handles, long digit runs and
// "我叫<name>". It cannot recognise every personal name in free text; the README says so.


const SIGNALS_MAX_TEXT_CHARS = 120; // the same limit v1 stores (outfit-site src/config.ts SIGNALS.maxTextChars)

const RULES: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "［email］"],
  [/https?:\/\/\S+|www\.\S+/gi, "［網址］"],
  [/(\+?886[-\s]?|0)9\d{2}[-\s]?\d{3}[-\s]?\d{3}/g, "［電話］"], // mobile
  [/\(?0\d{1,2}\)?[-\s]?\d{3,4}[-\s]?\d{4}/g, "［電話］"], // landline
  [/\b[A-Z][12]\d{8}\b/g, "［身分證］"],
  [/@[\w.]{2,}/g, "［帳號］"],
  [/\d{6,}/g, "［號碼］"],
  [/(我叫|我的名字是|名字叫)[一-鿿]{1,3}/g, "$1［名字］"],
];

const toAsciiDigits = (text: string) => text.replace(/[０-９]/g, (d) => String(d.charCodeAt(0) - 0xff10));

/** The de-identified sentence, or null when nothing is left. */
export function deidentify(text: string): string | null {
  let out = toAsciiDigits(text);
  for (const [pattern, replacement] of RULES) out = out.replace(pattern, replacement);
  out = out.replace(/\s+/g, " ").trim().slice(0, SIGNALS_MAX_TEXT_CHARS);
  return out || null;
}
