// ④ The analyst agent: runs AFTER the looks are on screen, one call per look, so it can take its time. It looks
// at the finished outfit's photos against the person's own words and this week's fashion media, and writes a
// short analysis for the person, streamed as it is written. Nothing it says changes the looks.
import type { Item } from "../contracts";
import { type Content, streamText } from "../lib/openai";
import { describePerson, type Person } from "../person";

export interface LookToAnalyse {
  title: string;
  idea: string;
  items: Item[];
}

const INSTRUCTIONS = `You are a senior fashion stylist writing a short analysis of ONE finished outfit for a client.
You get the client's own words, the outfit (a photo and product facts for each garment) and a list of what fashion
media are writing about this week. Look at the photos carefully; trust them over product names.

Write in the client's language (usually Traditional Chinese), plain text, exactly these four parts, each starting
on its own line with the heading in brackets and 1–2 sentences after it:
【對上你的需求】how this outfit answers what they said — point to specific garments. If you are told about them
  (style memory, body), say how it suits THEM, e.g. their shape or a colour they love.
【要注意】the one thing that might not work (fit for the occasion, weather, fabric, colours, comfort). If nothing, say so.
【流行趨勢】how it relates to the trends listed, naming the source (e.g. Vogue Taiwan). Only use the trends given;
  if none relate or none are given, say that plainly. Never invent a trend or a source.
【小調整】one concrete change that would make it better, or how to wear it.
In English, use the headings [Fits your request], [Watch out], [Trends], [One tweak].
At most 220 characters in total. No markdown, no lists.`;

/** Streams the analysis through `onDelta`; resolves with the whole text. */
export function analyse(
  env: Env, sentence: string, look: LookToAnalyse, trends: string, lang: string, onDelta: (t: string) => void, person?: Person,
): Promise<string> {
  const about = person ? describePerson(person) : "";
  const content: Content[] = [
    ...(about ? [{ type: "input_text" as const, text: about }] : []),
    { type: "input_text", text: `Client language: ${lang === "en" ? "English" : "Traditional Chinese"}\nThe client said: 「${sentence}」` },
    { type: "input_text", text: `Outfit 「${look.title}」 — the stylist's idea: ${look.idea}` },
  ];
  look.items.forEach((item, k) => {
    content.push({ type: "input_text", text: `Garment ${k + 1} (${item.slot}): ${item.name}, ${item.type}, ${item.colour}, ${item.pattern}, NT$${item.price}. ${item.description.slice(0, 200)}` });
    content.push({ type: "input_image", image_url: `${env.IMAGE_ORIGIN}${item.image}`, detail: "low" });
  });
  content.push({ type: "input_text", text: trends || "No trend data is available right now." });
  return streamText(env, { name: "look_analysis", instructions: INSTRUCTIONS, input: [{ role: "user", content }], effort: "medium", onDelta });
}
