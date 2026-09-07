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

// Compute the verdict deterministically. The on-chain price comes from the
// binance-tokenized-securities-info API (vendored skill) — the same data the
// official Binance skill exposes. The US equity price comes from the
// `stockInfo.price` field of the same RWA API (Binance's official US-equity
// feed) when available, falling back to Yahoo / Stooq / curated.
function computeVerdict(reader) {
  // Prefer the RWA API's own stockInfo.price — it's the official Binance-
  // sourced US equity price, same data the binance-tokenized-securities-info
  // skill returns. Fall back to the external feed only if it's missing.
  const rwaStockPrice = reader.onchain?.stockInfo?.price;
  const rwaPriceNum = rwaStockPrice != null ? Number(rwaStockPrice) : null;
  const externalPrice = reader.usStock?.price;
  const ref = rwaPriceNum != null && rwaPriceNum > 0 ? rwaPriceNum : externalPrice;
  const obs = reader.onchain?.observedPrice ?? null;
  const mult = reader.multiplier || 1;

  // Detect a halted asset. The Ondo RWA API returns statusInfo with
  // `reasonCode` like 'EARNINGS_HALT', 'DIVIDEND_HALT', 'SPLIT_HALT',
  // 'MERGER_HALT', 'MAINTENANCE_HALT' for actual halts. Offhours is NOT
  // a halt — the token just trades around the last equity close.
  const status = reader.onchain?.statusInfo;
  const reason = (status?.reasonCode || status?.reasonMsg || '').toString().toUpperCase();
  const isActualHalt = reason && /HALT|PAUSE|MAINTENANCE/.test(reason) && reason !== 'TRADING';
  if (isActualHalt) {
    return {
      verdict: 'HALTED',
      action: 'PASS',
      divergenceBps: null,
      fairValue: ref,
      observedPrice: obs,
      referencePrice: ref != null ? ref * mult : null,
      multiplier: mult,
      confidence: 'high',
      rationaleHint: `Underlying stock is in corporate action / maintenance: ${status.reasonCode}${status.reasonMsg ? ' — ' + status.reasonMsg : ''}. On-chain token keeps trading but the reference price is stale.`,
      haltReason: status.reasonCode,
    };
  }

  if (ref == null || obs == null) {
    return {
      verdict: 'NO_DATA',
      divergenceBps: null,
      fairValue: null,
      observedPrice: obs,
      referencePrice: ref != null ? ref * mult : null,
      multiplier: mult,
      confidence: 'low',
      rationaleHint: obs == null
        ? 'On-chain token price unavailable from binance-tokenized-securities-info.'
        : 'US equity price unavailable from any live source.',
    };
  }

  // Per the official SKILL.md:
  //   referencePrice = tokenInfo.price ÷ sharesMultiplier
  // i.e. fair token price = share price × sharesMultiplier
  const referencePrice = ref * mult;
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
            contractAddress: reader.contractAddress,
            usSource: reader.usStock?.source,
            onchainSource: reader.onchain?.source,
            onchainHolders: reader.onchain?.totalHolders,
            onchainMcap: reader.onchain?.marketCap,
            haltReason: verdict.haltReason,
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
