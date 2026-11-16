import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { tarotDeckMap } from '../src/tarot/tarotDeck.js';
import { buildInterpretationCacheKey } from './_cacheKey.js';
import { validatePublicSession, type PublicCard, type Spread } from './_publicSession.js';

const PROVIDER = 'deepseek';
const MODEL = 'deepseek-flash';
const PROMPT_VERSION = 'anonymous-overall-deepseek-v1';
const DEFAULT_DAILY_LIMIT = 200;
const MAX_OUTPUT_TOKENS = 500;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface ApiRequest {
  method?: string;
  query: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
}

type AdminClient = ReturnType<typeof createClient<any, 'public'>>;

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: '不支持此请求方式。' });
  }

  const id = req.method === 'GET'
    ? typeof req.query.sessionId === 'string' ? req.query.sessionId : null
    : readSessionId(req.body);
  if (!id || !UUID_PATTERN.test(id)) {
    return res.status(400).json({ error: '无效的牌阵记录 ID。' });
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) {
    return res.status(503).json({ error: '云端解读尚未配置。' });
  }
  const db = createClient<any, 'public'>(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  try {
    if (req.method === 'GET') return await getInterpretation(db, id, res);
    return await createInterpretation(db, id, res);
  } catch (error) {
    console.error('Interpretation request failed:', error);
    return res.status(502).json({ error: '解读服务暂时不可用，请稍后重试。' });
  }
}

function readSessionId(body: unknown): string | null {
  try {
    const value = typeof body === 'string' ? JSON.parse(body) : body;
    return value && typeof value === 'object' && 'sessionId' in value &&
      typeof value.sessionId === 'string' ? value.sessionId : null;
  } catch {
    return null;
  }
}

async function getInterpretation(db: AdminClient, sessionId: string, res: ApiResponse) {
  const { data: link, error: linkError } = await db.from('anonymous_interpretation_sessions')
    .select('cache_key').eq('session_id', sessionId).maybeSingle();
  if (linkError) throw linkError;
  if (!link) return res.status(404).json({ error: '这次牌阵还没有 AI 解读。' });
  const cached = await readCache(db, link.cache_key);
  if (!cached) return res.status(404).json({ error: '这次牌阵还没有 AI 解读。' });
  return res.status(200).json({ overall: cached.overall, key: link.cache_key, cached: true });
}

async function createInterpretation(db: AdminClient, sessionId: string, res: ApiResponse) {
  const { data: row, error: sessionError } = await db.from('spread_sessions')
    .select('payload').eq('id', sessionId).maybeSingle();
  if (sessionError) throw sessionError;
  if (!row) return res.status(404).json({ error: '请先将抽牌结果保存到云端。' });

  const validated = validatePublicSession(row.payload, sessionId);
  if (!validated) return res.status(422).json({ error: '这次牌阵记录不完整，无法安全解读。' });
  const { spread, cards } = validated;
  const key = buildInterpretationCacheKey({
    promptVersion: PROMPT_VERSION,
    provider: PROVIDER,
    model: MODEL,
    spreadId: spread.id,
    meaningVersion: spread.meaningVersion,
    cards
  });

  const owner = randomUUID();
  const { data: claim, error: claimError } = await db.rpc('claim_anonymous_interpretation', {
    p_cache_key: key, p_model: MODEL, p_owner_token: owner
  });
  if (claimError) throw claimError;
  if (claim === 'cached') {
    const cached = await readCache(db, key);
    if (!cached) throw new Error('Claim returned cached without a complete record');
    await linkSession(db, sessionId, key);
    return res.status(200).json({ overall: cached.overall, key, cached: true });
  }
  if (claim === 'pending') {
    res.setHeader('Retry-After', '3');
    return res.status(202).json({ pending: true });
  }
  if (claim !== 'claimed') throw new Error(`Unexpected cache claim: ${claim}`);

  try {
    const apiKey = process.env.DEEPSEEK_API_KEY || process.env.api_ds;
    if (!apiKey) {
      return res.status(503).json({ error: 'DeepSeek API 密钥尚未配置。' });
    }
    const rawLimit = Number(process.env.AI_DAILY_GENERATION_LIMIT);
    const dailyLimit = Number.isInteger(rawLimit) && rawLimit >= 1 && rawLimit <= 10000
      ? rawLimit : DEFAULT_DAILY_LIMIT;
    const { data: reserved, error: quotaError } = await db.rpc('reserve_anonymous_interpretation', {
      p_limit: dailyLimit
    });
    if (quotaError) throw quotaError;
    if (!reserved) return res.status(429).json({ error: '今日 AI 解读额度已用完，请明天再试。' });

    const generated = await generateOverall(spread, cards, apiKey);
    const { data: completed, error: completeError } = await db.from('anonymous_interpretation_cache')
      .update({
        status: 'complete', overall: generated.overall,
        input_tokens: generated.inputTokens, output_tokens: generated.outputTokens,
        completed_at: new Date().toISOString(), owner_token: null, lease_until: null
      })
      .eq('cache_key', key).eq('owner_token', owner)
      .select('cache_key').maybeSingle();
    if (completeError) throw completeError;
    if (!completed) throw new Error('Cache lease expired before completion');
    await linkSession(db, sessionId, key);
    return res.status(200).json({ overall: generated.overall, key, cached: false });
  } finally {
    // A failed or unconfigured request should not block the same combination
    // until its lease expires. Completed rows have a null owner and survive.
    const { error } = await db.from('anonymous_interpretation_cache')
      .delete().eq('cache_key', key).eq('owner_token', owner);
    if (error) console.error('Failed to release interpretation claim:', error);
  }
}

async function readCache(db: AdminClient, key: string) {
  const { data, error } = await db.from('anonymous_interpretation_cache')
    .select('overall').eq('cache_key', key).eq('status', 'complete').maybeSingle();
  if (error) throw error;
  return data && typeof data.overall === 'string' ? { overall: data.overall } : null;
}

async function linkSession(db: AdminClient, sessionId: string, key: string) {
  const { error } = await db.from('anonymous_interpretation_sessions')
    .upsert({ session_id: sessionId, cache_key: key }, { onConflict: 'session_id' });
  if (error) throw error;
}

async function generateOverall(spread: Spread, cards: PublicCard[], apiKey: string) {
  const positions = cards.map((card, index) => {
    const slot = spread.slots[index];
    const name = tarotDeckMap.get(card.cardId)!.label;
    return `${index + 1}. ${slot.label}（${slot.description}）：${name}，${card.isReversed ? '逆位' : '正位'}`;
  }).join('\n');
  const response = await fetch('https://api.deepseek.com/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: MODEL,
      reasoning: { effort: 'none' },
      max_output_tokens: MAX_OUTPUT_TOKENS,
      text: {
        format: {
          type: 'json_schema', name: 'tarot_overall',
          schema: {
            type: 'object', additionalProperties: false,
            properties: { overall: { type: 'string' } }, required: ['overall']
          }
        }
      },
      instructions: '你是温和、审慎的塔罗解读者。用简体中文，根据每张牌与其确切牌位综合写一段约 140-200 字的「整体讯息」，适合留学生阅读，但不要假定用户一定在留学。它是反思性提示，不是事实预测；不得保证录取、毕业、工作、健康等结果。指出可能的张力和一两项可执行的下一步。不要编造用户背景，不要输出牌位定义之外的内容。只返回指定 JSON。',
      input: `牌阵：${spread.label}\n${positions}`
    }),
    signal: AbortSignal.timeout(45000)
  });
  if (!response.ok) {
    console.error('DeepSeek request failed:', response.status, await response.text());
    throw new Error(`DeepSeek returned ${response.status}`);
  }
  const data = await response.json() as {
    status?: string;
    output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const outputText = data.output?.filter((item) => item.type === 'message')
    .flatMap((item) => item.content ?? []).find((item) => item.type === 'output_text')?.text;
  if (data.status !== 'completed' || !outputText) throw new Error('DeepSeek returned no complete output');
  const parsed = JSON.parse(outputText) as { overall?: unknown };
  if (typeof parsed.overall !== 'string' || parsed.overall.trim().length < 30 ||
      parsed.overall.length > 1200) throw new Error('DeepSeek returned an invalid interpretation');
  return {
    overall: parsed.overall.trim(),
    inputTokens: data.usage?.input_tokens ?? null,
    outputTokens: data.usage?.output_tokens ?? null
  };
}
