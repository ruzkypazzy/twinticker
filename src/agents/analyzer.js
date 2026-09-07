// Analyzer agent — takes the Reader's data and produces a verdict card.
// Verdict logic is deterministic; the LLM is used to write a short rationale
// that judges can read in the demo.

import OpenAI from 'openai';

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

function getClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

// Compute the verdict deterministically. We treat the US stock price as the
// reference (fair value) and the on-chain token price as observed. The on-chain
// price comes from the binance-tokenized-securities-info skill in production;
// in demo mode the Reader applies a deterministic spread so the verdict logic
// is observable.
function computeVerdict(reader) {
  const ref = reader.usStock?.price;
  const obs = reader.onchain?.observedPrice ?? null;
  const mult = reader.multiplier || 1;

  if (ref == null || obs == null) {
    return {
      verdict: 'NO_DATA',
      divergenceBps: null,
      fairValue: null,
      confidence: 'low',
      rationale: 'Missing price data for one or both tickers — cannot compute divergence.',
    };
  }

  const referencePrice = ref / mult;
  const divergenceBps = ((obs - referencePrice) / referencePrice) * 10000;
  const absDiv = Math.abs(divergenceBps);

  let verdict, action, confidence, rationaleHint;
  if (absDiv < 50) {
    verdict = 'FAIR_VALUE';
    action = 'PASS';
    confidence = 'high';
    rationaleHint = 'On-chain token tracks the underlying within 50 bps. No action recommended.';
  } else if (divergenceBps < -50) {
    verdict = 'UNDERVALUED';
    action = 'BUY';
    confidence = absDiv > 200 ? 'high' : 'medium';
    rationaleHint = `On-chain token is ${absDiv.toFixed(0)} bps below the underlying — discount detected.`;
  } else {
    verdict = 'OVERVALUED';
    action = 'SELL_OR_PASS';
    confidence = absDiv > 200 ? 'high' : 'medium';
    rationaleHint = `On-chain token is ${absDiv.toFixed(0)} bps above the underlying — premium detected.`;
  }

  return {
    verdict,
    action,
    divergenceBps: Number(divergenceBps.toFixed(2)),
    fairValue: Number(referencePrice.toFixed(2)),
    observedPrice: Number(obs.toFixed(2)),
    referencePrice: Number(referencePrice.toFixed(2)),
    multiplier: mult,
    confidence,
    rationaleHint,
  };
}

async function writeRationale(reader, verdict) {
  const client = getClient();
  if (!client) {
    return verdict.rationaleHint + ' [LLM disabled — set OPENAI_API_KEY for richer rationale]';
  }
  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 180,
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content:
            'You are TWINTICKER, an AI agent on Binance Agent OS that watches Ondo tokenized US stocks ' +
            'on BNB Chain and compares them to the underlying US equity. You write short, sharp ' +
            'verdict rationales. Be factual, no hype, no advice. 1-2 sentences max.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            symbol: reader.symbol,
            name: reader.name,
            verdict: verdict.verdict,
            action: verdict.action,
            divergenceBps: verdict.divergenceBps,
            fairValue: verdict.fairValue,
            observed: verdict.observedPrice,
            multiplier: verdict.multiplier,
            chain: reader.chain,
            usSource: reader.usStock?.source,
            onchainSource: reader.onchain?.source,
            onchainSpreadBps: reader.onchain?.spreadBps,
          }),
        },
      ],
    });
    return completion.choices?.[0]?.message?.content?.trim() || verdict.rationaleHint;
  } catch (err) {
    return verdict.rationaleHint + ` [LLM error: ${err.message}]`;
  }
}

export async function runAnalyzer(reader) {
  const verdict = computeVerdict(reader);
  const rationale = await writeRationale(reader, verdict);
  return { ...verdict, rationale };
}
