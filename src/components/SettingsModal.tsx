import { useState } from 'react';
import { Loader2, RefreshCw, X } from 'lucide-react';
import { fetchAvailableLlmModels } from '../api';
import type { HealthInfo, LlmRuntimeConfig } from '../types';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  llmConfig: LlmRuntimeConfig;
  onSaveLlmConfig: (cfg: LlmRuntimeConfig) => void;
  health: HealthInfo | null;
}

export function SettingsModal({ open, onClose, llmConfig, onSaveLlmConfig, health }: SettingsModalProps) {
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  if (!open) return null;

  const handleDetectModels = async () => {
    setModelsError(null);
    setLoadingModels(true);
    try {
      const res = await fetchAvailableLlmModels(llmConfig);
      setAvailableModels(res.models);
      if (res.models.length === 0) {
        setModelsError('No se encontraron modelos de chat activos para esta clave.');
      } else if (!llmConfig.model && res.models[0]) {
        onSaveLlmConfig({ ...llmConfig, model: res.models[0] });
      }
    } catch (err: any) {
      setModelsError(err?.message || 'No se pudieron consultar los modelos.');
    } finally {
      setLoadingModels(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <h2 className="text-base font-semibold text-slate-900">
            Configuración de servicios externos y modelo LLM (opcional)
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4 text-sm">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            <p className="font-semibold text-slate-900">Transparencia sobre APIs y dependencias:</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4">
              <li>
                <strong>Agente 1 (APIs académicas):</strong> OpenAlex, Crossref, Europe PMC y PubMed funcionan sin clave.
                Semantic Scholar puede limitar solicitudes sin <code>SEMANTIC_SCHOLAR_API_KEY</code> en el servidor.
              </li>
              <li>
                <strong>Agentes 2, 3 y 4:</strong> Funcionan sin clave externa mediante el motor{' '}
                <em>Basado en Evidencia Local</em>. Si desea extracción y síntesis semántica con un LLM, puede configurar{' '}
                <code>GEMINI_API_KEY</code> u <code>OPENAI_API_KEY</code> en <code>.env</code> o ingresar una clave temporal solo para esta sesión.
              </li>
              <li>
                <strong>Estado en servidor:</strong> {health?.llm.label || 'Verificando...'}
              </li>
            </ul>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">Proveedor LLM de sesión (opcional)</label>
            <select
              value={llmConfig.provider || 'gemini'}
              onChange={(e) => {
                const nextProvider = e.target.value as 'gemini' | 'groq' | 'openai';
                onSaveLlmConfig({
                  ...llmConfig,
                  provider: nextProvider,
                  baseUrl:
                    nextProvider === 'groq'
                      ? 'https://api.groq.com/openai/v1'
                      : nextProvider === 'openai'
                        ? llmConfig.baseUrl || 'https://api.openai.com/v1'
                        : '',
                });
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="gemini">Google Gemini (AIza...)</option>
              <option value="groq">Groq (gsk_...)</option>
              <option value="openai">OpenAI / Compatible (sk-..., OpenRouter, etc.)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">
              Clave API de sesión (solo en memoria del navegador, no se guarda en disco)
            </label>
            <input
              type="password"
              value={llmConfig.apiKey || ''}
              onChange={(e) => {
                const key = e.target.value;
                const trimmed = key.trim();
                let detectedProvider = llmConfig.provider || 'gemini';
                let detectedBaseUrl = llmConfig.baseUrl;
                if (trimmed.startsWith('gsk_')) {
                  detectedProvider = 'groq';
                  detectedBaseUrl = 'https://api.groq.com/openai/v1';
                } else if (trimmed.startsWith('AIza')) {
                  detectedProvider = 'gemini';
                  detectedBaseUrl = '';
                } else if (trimmed.startsWith('sk-or-')) {
                  detectedProvider = 'openai';
                  detectedBaseUrl = 'https://openrouter.ai/api/v1';
                }
                onSaveLlmConfig({
                  ...llmConfig,
                  provider: detectedProvider,
                  baseUrl: detectedBaseUrl,
                  apiKey: key,
                });
              }}
              placeholder="Dejar vacío para usar la configuración del servidor o modo local"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <label className="block text-xs font-medium text-slate-700">Modelo (opcional)</label>
              <button
                type="button"
                disabled={loadingModels || (!llmConfig.apiKey?.trim() && !health?.llm.configured)}
                onClick={handleDetectModels}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:underline disabled:opacity-40"
              >
                {loadingModels ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                <span>Detectar modelos disponibles</span>
              </button>
            </div>
            <input
              type="text"
              value={llmConfig.model || ''}
              onChange={(e) => onSaveLlmConfig({ ...llmConfig, model: e.target.value })}
              placeholder={
                llmConfig.provider === 'groq'
                  ? 'Detección automática según su cuenta Groq'
                  : llmConfig.provider === 'openai'
                    ? 'gpt-4o-mini'
                    : 'gemini-2.5-flash'
              }
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            {availableModels.length > 0 && (
              <select
                value={llmConfig.model || ''}
                onChange={(e) => onSaveLlmConfig({ ...llmConfig, model: e.target.value })}
                className="mt-1.5 w-full rounded-lg border border-indigo-200 bg-indigo-50/40 px-2.5 py-1.5 text-xs text-slate-800"
              >
                <option value="">-- Elegir modelo detectado ({availableModels.length}) --</option>
                {availableModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            )}
            {modelsError && <p className="mt-1 text-xs text-rose-600">{modelsError}</p>}
          </div>

          {(llmConfig.provider === 'openai' || llmConfig.provider === 'groq') && (
            <div>
              <label className="block text-xs font-medium text-slate-700">Base URL (opcional)</label>
              <input
                type="text"
                value={llmConfig.baseUrl || ''}
                onChange={(e) => onSaveLlmConfig({ ...llmConfig, baseUrl: e.target.value })}
                placeholder={
                  llmConfig.provider === 'groq'
                    ? 'https://api.groq.com/openai/v1'
                    : 'https://api.openai.com/v1'
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-slate-200 pt-3">
          <button
            type="button"
            onClick={() => onSaveLlmConfig({ provider: 'gemini', apiKey: '', model: '', baseUrl: '' })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Limpiar clave de sesión
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}
