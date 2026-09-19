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
