// Turns Gemini's token counts into money. Prices are US dollars per million
// tokens, from Google's pricing page (October 2026). Thinking tokens are
// charged as output. Update these when Google changes its prices, or set
// AI_PRICE_INPUT_PER_M and AI_PRICE_OUTPUT_PER_M.
const PRICES = {
  'gemini-3.8-flash': [0.75, 3.75],
  'gemini-3.5-flash-lite': [0.3, 2.5],
  'gemini-3.1-flash-lite': [0.25, 1.5],
  'gemini-2.5-flash-lite': [0.1, 0.4],
  'gemini-2.5-flash': [0.3, 2.5],
};
const FALLBACK = PRICES['gemini-3.5-flash-lite'];

export function pricesFor(model) {
  const input = Number(process.env.AI_PRICE_INPUT_PER_M);
  const output = Number(process.env.AI_PRICE_OUTPUT_PER_M);
  if (input > 0 && output > 0) return [input, output];
  // Model names can carry suffixes ("-preview-10-2026"): use the longest known prefix.
  const name = String(model).replace(/^models\//, '');
  const key = Object.keys(PRICES)
    .filter((k) => name.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return key ? PRICES[key] : FALLBACK;
}

export function summarizeUsage(model, usage = {}) {
  const inputTokens = usage.promptTokenCount ?? 0;
  const outputTokens = (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0);
  const [inputPrice, outputPrice] = pricesFor(model);
  const costUsd = (inputTokens * inputPrice + outputTokens * outputPrice) / 1e6;
  return { inputTokens, outputTokens, thinkingTokens: usage.thoughtsTokenCount ?? 0, costUsd };
}

export function addUsage(total = {}, more = {}) {
  return {
    inputTokens: (total.inputTokens ?? 0) + (more.inputTokens ?? 0),
    outputTokens: (total.outputTokens ?? 0) + (more.outputTokens ?? 0),
    thinkingTokens: (total.thinkingTokens ?? 0) + (more.thinkingTokens ?? 0),
    costUsd: (total.costUsd ?? 0) + (more.costUsd ?? 0),
  };
}
