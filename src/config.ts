// Numbers v2 depends on. There are no styling rules here on purpose: what to wear is the stylist agent's
// judgement (src/agents/stylist.ts), and the engine (src/engine/) only knows facts about the catalogue.

/** Dimensions of the OpenAI text vectors (catalogue captions and queries). */
export const EMBEDDING_DIM = 256;
/** Dimensions of the FashionCLIP photo vectors. */
export const IMAGE_EMBEDDING_DIM = 512;

export const LIMITS = {
  maxBodyBytes: 200_000,
  maxSentenceChars: 300,
};

/**
 * Models a tester may switch to from the page (the header's model menu); anything else falls back to
 * OPENAI_MODEL. Kept to one family so the stylist and critic prompts behave alike; ordered fastest first.
 */
export const MODELS = ["gpt-5.4-nano", "gpt-5.6-luna", "gpt-5.4-mini", "gpt-5.4", "gpt-5.5"] as const;

/** The same Env with the model a request asked for, when it is one of MODELS. */
export function withModel(env: Env, asked: unknown): Env {
  return typeof asked === "string" && (MODELS as readonly string[]).includes(asked) ? ({ ...env, OPENAI_MODEL: asked } as Env) : env;
}
