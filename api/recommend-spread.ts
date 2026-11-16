import { createClient } from '@supabase/supabase-js';
import { parseSpreadRecommendation, READING_CATEGORIES, SPREAD_IDS } from './_spreadRecommendation.js';

const MODEL = 'deepseek-flash';
const DEFAULT_DAILY_LIMIT = 200;

interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: '不支持此请求方式。' });
  }
  const question = readQuestion(req.body);
  if (!question || question.length < 8 || question.length > 300) {
    return res.status(400).json({ error: '请用 8–300 个字描述问题。' });
  }
  const authorization = req.headers.authorization;
  const token = typeof authorization === 'string' && /^Bearer\s+\S+$/i.test(authorization)
    ? authorization.replace(/^Bearer\s+/i, '') : null;
  if (!token) return res.status(401).json({ error: '请先登录。' });

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.api_ds;
  if (!url || !secret || !apiKey) {
    return res.status(503).json({ error: 'AI 选阵尚未配置。' });
  }

  try {
    const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: auth, error: authError } = await db.auth.getUser(token);
    if (authError || !auth.user) return res.status(401).json({ error: '登录已失效，请重新登录。' });

    // Routing and anonymous readings share one server-side daily AI budget.
    const rawLimit = Number(process.env.AI_DAILY_GENERATION_LIMIT);
    const dailyLimit = Number.isInteger(rawLimit) && rawLimit >= 1 && rawLimit <= 10000
      ? rawLimit : DEFAULT_DAILY_LIMIT;
    const { data: reserved, error: quotaError } = await db.rpc('reserve_anonymous_interpretation', {
      p_limit: dailyLimit
    });
    if (quotaError) throw quotaError;
    if (!reserved) return res.status(429).json({ error: '今日 AI 额度已用完。' });

    const response = await fetch('https://api.deepseek.com/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        reasoning: { effort: 'none' },
        max_output_tokens: 180,
        text: { format: { type: 'json_schema', name: 'spread_recommendation', schema: {
          type: 'object', additionalProperties: false,
          properties: {
            spreadId: { type: 'string', enum: SPREAD_IDS },
            category: { type: 'string', enum: READING_CATEGORIES },
            reason: { type: 'string' }
          }, required: ['spreadId', 'category', 'reason']
        } } },
        instructions: '你是塔罗牌阵分流助手，只判断适合的牌阵，不做预测或解读。未来十字 futureCross 适合一个具体目标；六芒星 hexagram 适合复杂选择、相互影响的因素；月度运势 monthlyFlow 仅适合询问一个月内学业事业、人际关系和自我状态等多维整体趋势。单纯提到下个月的某个目标不一定要选月度运势。category 从给定值中选。reason 用简体中文简短解释为什么，不能保证任何结果。只返回 JSON。',
        input: question
      }),
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error(`DeepSeek routing returned ${response.status}`);
    const data = await response.json() as {
      status?: string;
      output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
    };
    const output = data.output?.filter((item) => item.type === 'message')
      .flatMap((item) => item.content ?? []).find((item) => item.type === 'output_text')?.text;
    if (data.status !== 'completed' || !output) throw new Error('DeepSeek routing output incomplete');
    const recommendation = parseSpreadRecommendation(JSON.parse(output));
    if (!recommendation) throw new Error('DeepSeek routing output invalid');
    return res.status(200).json(recommendation);
  } catch {
    console.error('Spread recommendation failed');
    return res.status(502).json({ error: 'AI 选阵暂时不可用。' });
  }
}

function readQuestion(body: unknown): string | null {
  try {
    const parsed = typeof body === 'string' ? JSON.parse(body) : body;
    return parsed && typeof parsed === 'object' && 'question' in parsed &&
      typeof parsed.question === 'string' ? parsed.question.trim() : null;
  } catch { return null; }
}
