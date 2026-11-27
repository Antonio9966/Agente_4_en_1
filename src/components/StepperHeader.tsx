import { BookOpen, CheckCircle2, FileSearch, FileText, GitCompare, KeyRound, Loader2 } from 'lucide-react';
import type { HealthInfo, LlmRuntimeConfig } from '../types';

export type AgentStepId = 'search' | 'extract' | 'compare' | 'document';

export type StepStatus = 'pendiente' | 'en_curso' | 'completado';

interface StepperHeaderProps {
  activeStep: AgentStepId;
  onSelectStep: (step: AgentStepId) => void;
  statuses: Record<AgentStepId, StepStatus>;
  health: HealthInfo | null;
  llmConfig: LlmRuntimeConfig;
  onOpenSettings: () => void;
}

const STEPS: Array<{
  id: AgentStepId;
  number: string;
  title: string;
  subtitle: string;
  icon: typeof FileSearch;
}> = [
  {
    id: 'search',
    number: 'Agente 1',
    title: 'Búsqueda y Selección',
    subtitle: 'APIs académicas y filtros',
    icon: FileSearch,
  },
  {
    id: 'extract',
    number: 'Agente 2',
    title: 'Extracción y PDF',
    subtitle: '13 campos y revisión APA 7',
    icon: BookOpen,
  },
  {
    id: 'compare',
    number: 'Agente 3',
    title: 'Análisis Comparativo',
    subtitle: 'Tabla y respuesta con evidencia',
    icon: GitCompare,
  },
  {
    id: 'document',
    number: 'Agente 4',
    title: 'Documento Final',
    subtitle: 'Integración y exportación',
    icon: FileText,
  },
];

export function StepperHeader({
  activeStep,
  onSelectStep,
  statuses,
  health,
  llmConfig,
  onOpenSettings,
}: StepperHeaderProps) {
  const activeModeLabel = llmConfig.apiKey
    ? `LLM de sesión (${
        llmConfig.apiKey.startsWith('gsk_') || llmConfig.provider === 'groq'
          ? 'Groq'
          : llmConfig.provider === 'openai'
            ? 'OpenAI-compatible'
            : 'Gemini'
      })`
    : health?.llm.label || 'Modo Basado en Evidencia Local';

  return (
    <header className="border-b border-slate-200 bg-white shadow-xs">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              Agentes Inteligentes para la Extracción y Análisis de Artículos Científicos
            </h1>
            <p className="mt-0.5 text-sm text-slate-600">
              Plataforma modular con trazabilidad de fuentes, revisión humana en cada etapa y citas APA 7 verificables.
            </p>
          </div>

          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex items-center gap-2 self-start rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
          >
            <KeyRound className="h-4 w-4 text-indigo-600" />
            <span>{activeModeLabel}</span>
          </button>
        </div>

        <nav aria-label="Progreso de los agentes" className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => {
            const Icon = step.icon;
            const status = statuses[step.id];
            const isActive = activeStep === step.id;

            return (
              <button
                key={step.id}
                type="button"
                onClick={() => onSelectStep(step.id)}
                className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition ${
                  isActive
                    ? 'border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-600/20'
                    : status === 'completado'
                      ? 'border-emerald-200 bg-emerald-50/40 hover:border-emerald-300'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    isActive
                      ? 'bg-indigo-600 text-white'
                      : status === 'completado'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {status === 'en_curso' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : status === 'completado' && !isActive ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                      {step.number}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        status === 'en_curso'
                          ? 'bg-amber-100 text-amber-800'
                          : status === 'completado'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {status === 'en_curso' ? 'Ejecutando' : status === 'completado' ? 'Listo' : 'Pendiente'}
                    </span>
                  </div>
                  <p className="truncate text-sm font-semibold text-slate-900">{step.title}</p>
                  <p className="truncate text-xs text-slate-500">{step.subtitle}</p>
                </div>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
