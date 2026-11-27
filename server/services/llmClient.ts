import crypto from 'node:crypto';
import type { LlmRuntimeConfig } from '../types.js';

export interface LlmResolvedConfig {
  available: boolean;
  provider?: 'gemini' | 'openai';
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  label: string;
  modelExplicit?: boolean;
}

const discoveredModelCache = new Map<string, { model: string; allModels: string[]; expiresAt: number }>();

const NON_CHAT_MODEL_RE =
  /(whisper|tts|playai|guard|safeguard|embed|moderation|dall-e|sora|realtime|transcribe|orpheus|distil-whisper)/i;

const MODEL_PRIORITY_PATTERNS: RegExp[] = [
  /llama-3\.3/i,
  /llama-3\.1-70b/i,
  /llama-3\.1-8b/i,
  /llama-4/i,
  /qwen/i,
  /gpt-oss/i,
  /deepseek/i,
  /mixtral/i,
  /gemma/i,
  /gpt-4o/i,
  /gpt-4/i,
];

export function pickPreferredChatModel(modelIds: string[], excludeModel?: string): string | null {
  const candidates = modelIds
    .map((id) => id.trim())
    .filter((id) => id && id !== excludeModel && !NON_CHAT_MODEL_RE.test(id));
  if (candidates.length === 0) return null;

  for (const pat of MODEL_PRIORITY_PATTERNS) {
    const match = candidates.find((id) => pat.test(id));
    if (match) return match;
  }
  return candidates[0];
}

export async function listOpenAiCompatibleModels(
  baseUrl: string,
  apiKey: string
): Promise<string[]> {
  const cacheKey = `${baseUrl}:${crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 12)}`;
  const cached = discoveredModelCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.allModels;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${baseUrl}/models`, {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: Array<{ id?: string; active?: boolean }> };
    const allModels = (body.data ?? [])
      .filter((m) => m && typeof m.id === 'string' && m.active !== false)
      .map((m) => String(m.id))
      .filter((id) => !NON_CHAT_MODEL_RE.test(id));

    const preferred = pickPreferredChatModel(allModels) || allModels[0] || '';
    if (preferred) {
      discoveredModelCache.set(cacheKey, {
        model: preferred,
        allModels,
        expiresAt: Date.now() + 10 * 60 * 1000,
      });
    }
    return allModels;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function resolveOpenAiCompatible(
  apiKey: string,
  requestedProvider?: 'gemini' | 'groq' | 'openai',
  requestedModel?: string,
  requestedBaseUrl?: string
): LlmResolvedConfig {
  const isGroqKey = apiKey.startsWith('gsk_') || requestedProvider === 'groq';
  const isOpenRouterKey = apiKey.startsWith('sk-or-');

  const rawBase = (requestedBaseUrl || process.env.OPENAI_BASE_URL || '').trim().replace(/\/$/, '');
  const rawModel = (requestedModel || process.env.OPENAI_MODEL || process.env.GROQ_MODEL || '').trim();

  if (isGroqKey) {
    const baseUrl =
      rawBase && rawBase !== 'https://api.openai.com/v1' ? rawBase : 'https://api.groq.com/openai/v1';
    const isIncompatibleModel =
      !rawModel || rawModel.startsWith('gpt-') || rawModel.startsWith('gemini-');
    const cacheKey = `${baseUrl}:${crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 12)}`;
    const cached = discoveredModelCache.get(cacheKey);
    const model = !isIncompatibleModel
      ? rawModel
      : cached && cached.expiresAt > Date.now()
        ? cached.model
        : 'llama-3.1-8b-instant';
    return {
      available: true,
      provider: 'openai',
      apiKey,
      model,
      baseUrl,
      label: `Groq (${model})`,
      modelExplicit: !isIncompatibleModel,
    };
  }

  if (isOpenRouterKey) {
    const baseUrl =
      rawBase && rawBase !== 'https://api.openai.com/v1' ? rawBase : 'https://openrouter.ai/api/v1';
    const model = rawModel || 'openai/gpt-4o-mini';
    return {
      available: true,
      provider: 'openai',
      apiKey,
      model,
      baseUrl,
      label: `OpenRouter (${model})`,
      modelExplicit: Boolean(rawModel),
    };
  }

  const baseUrl = rawBase || 'https://api.openai.com/v1';
  const model = rawModel || 'gpt-4o-mini';
  return {
    available: true,
    provider: 'openai',
    apiKey,
    model,
    baseUrl,
    label: `OpenAI-compatible (${model})`,
    modelExplicit: Boolean(rawModel),
  };
}

export function resolveLlmConfig(runtime?: LlmRuntimeConfig): LlmResolvedConfig {
  const runtimeKey = runtime?.apiKey?.trim();
  if (runtimeKey) {
    // Priorizar la detección automática por prefijo de clave para evitar errores 401 entre proveedores
    if (runtimeKey.startsWith('AIza')) {
      const model =
        runtime?.model?.trim() && !runtime.model.startsWith('gpt-') && !runtime.model.startsWith('llama')
          ? runtime.model.trim()
          : process.env.GEMINI_MODEL || 'gemini-2.5-flash';
      return {
        available: true,
        provider: 'gemini',
        apiKey: runtimeKey,
        model,
        label: `Gemini (${model})`,
      };
    }
    if (runtimeKey.startsWith('gsk_') || runtimeKey.startsWith('sk-or-')) {
      return resolveOpenAiCompatible(runtimeKey, runtime?.provider, runtime?.model, runtime?.baseUrl);
    }
    if (runtime?.provider === 'gemini') {
      const model = runtime?.model?.trim() || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
      return {
        available: true,
        provider: 'gemini',
        apiKey: runtimeKey,
        model,
        label: `Gemini (${model})`,
      };
    }
    return resolveOpenAiCompatible(runtimeKey, runtime?.provider, runtime?.model, runtime?.baseUrl);
  }

  const envGroq = process.env.GROQ_API_KEY?.trim();
  if (envGroq) {
    return resolveOpenAiCompatible(envGroq, 'groq');
  }

  const envGemini = process.env.GEMINI_API_KEY?.trim();
  if (envGemini) {
    const model = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
    return {
      available: true,
      provider: 'gemini',
      apiKey: envGemini,
      model,
      label: `Gemini (${model})`,
    };
  }

  const envOpenAi = process.env.OPENAI_API_KEY?.trim();
  if (envOpenAi) {
    return resolveOpenAiCompatible(envOpenAi);
  }

  return {
    available: false,
    label: 'Modo Basado en Evidencia Local (sin clave LLM externa)',
  };
}

function extractJsonObject(rawText: string): string {
  const trimmed = rawText.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) return fenced[1].trim();
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

export async function callLlmJson<T>(
  systemPrompt: string,
  userPrompt: string,
  runtime?: LlmRuntimeConfig
): Promise<{ ok: true; data: T; providerLabel: string } | { ok: false; error: string }> {
  const cfg = resolveLlmConfig(runtime);
  if (!cfg.available || !cfg.apiKey) {
    return { ok: false, error: 'No hay clave API de LLM configurada.' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);

  try {
    if (cfg.provider === 'gemini') {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        cfg.model || 'gemini-2.5-flash'
      )}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;

      const res = await fetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        return {
          ok: false,
          error: `Error en Gemini API (HTTP ${res.status}): ${errBody.slice(0, 220)}`,
        };
      }

      const payload = (await res.json()) as any;
      const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        return { ok: false, error: 'Gemini no devolvió contenido textual.' };
      }
      const parsed = JSON.parse(extractJsonObject(text)) as T;
      return { ok: true, data: parsed, providerLabel: cfg.label };
    }

    // OpenAI-compatible chat completions (OpenAI, Groq, OpenRouter)
    let activeModel = cfg.model || 'gpt-4o-mini';
    if (!cfg.modelExplicit && cfg.baseUrl?.includes('groq.com')) {
      const models = await listOpenAiCompatibleModels(cfg.baseUrl, cfg.apiKey);
      const preferred = pickPreferredChatModel(models);
      if (preferred) activeModel = preferred;
    }

    const sendChat = async (modelToUse: string, useJsonFormat: boolean) =>
      fetch(`${cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: modelToUse,
          temperature: 0.1,
          ...(useJsonFormat ? { response_format: { type: 'json_object' } } : {}),
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      });

    let res = await sendChat(activeModel, true);
    let errText = !res.ok ? await res.text().catch(() => '') : '';

    // Si el modelo no existe o no tiene acceso (404 / model_not_found), descubrir modelos disponibles en la cuenta y reintentar
    if (!res.ok && (res.status === 404 || /model_not_found|does not exist/i.test(errText)) && cfg.baseUrl) {
      const availableModels = await listOpenAiCompatibleModels(cfg.baseUrl, cfg.apiKey);
      const fallbackModel = pickPreferredChatModel(availableModels, activeModel);
      if (fallbackModel) {
        activeModel = fallbackModel;
        const cacheKey = `${cfg.baseUrl}:${crypto.createHash('sha256').update(cfg.apiKey).digest('hex').slice(0, 12)}`;
        discoveredModelCache.set(cacheKey, {
          model: fallbackModel,
          allModels: availableModels,
          expiresAt: Date.now() + 10 * 60 * 1000,
        });
        res = await sendChat(activeModel, true);
        errText = !res.ok ? await res.text().catch(() => '') : '';
      }
    }

    if (!res.ok && res.status === 400 && /response_format|json_object/i.test(errText)) {
      res = await sendChat(activeModel, false);
      errText = !res.ok ? await res.text().catch(() => '') : '';
    }

    const activeLabel = cfg.baseUrl?.includes('groq.com')
      ? `Groq (${activeModel})`
      : cfg.baseUrl?.includes('openrouter.ai')
        ? `OpenRouter (${activeModel})`
        : `OpenAI-compatible (${activeModel})`;

    if (!res.ok) {
      return {
        ok: false,
        error: `Error en ${activeLabel} (HTTP ${res.status}): ${errText.slice(0, 220)}`,
      };
    }

    const payload = (await res.json()) as any;
    const text = payload?.choices?.[0]?.message?.content;
    if (!text) {
      return { ok: false, error: 'El proveedor OpenAI-compatible no devolvió contenido.' };
    }
    const parsed = JSON.parse(extractJsonObject(text)) as T;
    return { ok: true, data: parsed, providerLabel: activeLabel };
  } catch (err: any) {
    return {
      ok: false,
      error: `Fallo al invocar el LLM: ${err?.message || 'error desconocido'}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
