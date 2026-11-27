import { AlertTriangle, ArrowRight, Loader2, Play, RefreshCw } from 'lucide-react';
import type { Agent3ComparisonResult, ArticleExtraction } from '../types';

interface Stage3ComparisonPanelProps {
  extractions: ArticleExtraction[];
  researchQuestion: string;
  onResearchQuestionChange: (q: string) => void;
  comparison: Agent3ComparisonResult | null;
  isComparing: boolean;
  onRunComparison: () => void;
  onUpdateTableCell: (rowIndex: number, articleId: string, value: string) => void;
  onUpdateAnswer: (answer: string) => void;
  onProceedToAgent4: () => void;
  error: string | null;
}

export function Stage3ComparisonPanel({
  extractions,
  researchQuestion,
  onResearchQuestionChange,
  comparison,
  isComparing,
  onRunComparison,
  onUpdateTableCell,
  onUpdateAnswer,
  onProceedToAgent4,
  error,
}: Stage3ComparisonPanelProps) {
  if (extractions.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <p className="text-base font-medium text-slate-800">
          No hay artículos analizados por el Agente 2 todavía.
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Ejecute primero el Agente 2 para extraer la información de los artículos seleccionados.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              3. Comparación entre estudios y respuesta a la pregunta (Agente 3)
            </h2>
            <p className="text-sm text-slate-600">
              Contrasta coincidencias, diferencias, contradicciones y suficiencia de evidencia sobre {extractions.length} artículo(s).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isComparing || !researchQuestion.trim()}
              onClick={onRunComparison}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {isComparing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : comparison ? (
                <RefreshCw className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              <span>
                {isComparing
                  ? 'Comparando estudios...'
                  : comparison
                    ? 'Volver a ejecutar Agente 3'
                    : 'Ejecutar comparación'}
              </span>
            </button>

            {comparison && (
              <button
                type="button"
                onClick={onProceedToAgent4}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                <span>Integrar documento en Agente 4</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-slate-700">
            Pregunta de investigación a responder
          </label>
          <input
            type="text"
            value={researchQuestion}
            onChange={(e) => onResearchQuestionChange(e.target.value)}
            placeholder="Escriba la pregunta de investigación..."
            className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </section>

      {comparison && (
        <>
          {/* Tabla comparativa */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-900">Tabla comparativa (editable)</h3>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  comparison.suficienciaEvidencia === 'suficiente'
                    ? 'bg-emerald-100 text-emerald-800'
                    : comparison.suficienciaEvidencia === 'parcial'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-rose-100 text-rose-800'
                }`}
              >
                Suficiencia de evidencia: {comparison.suficienciaEvidencia}
              </span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-slate-100 text-slate-800">
                  <tr>
                    <th className="w-40 px-3 py-3 font-semibold">Criterio</th>
                    {comparison.columnas.map((col) => (
                      <th key={col.articleId} className="min-w-56 px-3 py-3 font-semibold">
                        {col.etiqueta}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {comparison.tablaComparativa.map((row, rIdx) => (
                    <tr key={row.criterio} className="align-top">
                      <td className="bg-slate-50 px-3 py-2.5 font-semibold text-slate-800">
                        {row.criterio}
                      </td>
                      {comparison.columnas.map((col) => (
                        <td key={col.articleId} className="p-2">
                          <textarea
                            rows={3}
                            value={row.valoresPorArticulo[col.articleId] || 'No especificado en el artículo'}
                            onChange={(e) => onUpdateTableCell(rIdx, col.articleId, e.target.value)}
                            className="w-full rounded-lg border border-slate-200 p-1.5 text-xs leading-relaxed text-slate-800 focus:border-indigo-500 focus:outline-none"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Hallazgos analíticos estructurados */}
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {[
              { title: 'Coincidencias entre autores', items: comparison.coincidencias },
              { title: 'Diferencias en objetivos, métodos, muestras y resultados', items: comparison.diferencias },
              { title: 'Modelos, enfoques o herramientas compartidos', items: comparison.modelosEnfoquesCompartidos },
              { title: 'Resultados que se complementan o contradicen', items: comparison.complementariedadesYContradicciones },
              { title: 'Vacíos, limitaciones o temas poco estudiados', items: comparison.vaciosYLimitaciones },
              { title: 'Evidencia directa vinculada a la pregunta', items: comparison.evidenciaParaPregunta },
            ].map((block) => (
              <div key={block.title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                <h4 className="text-sm font-semibold text-slate-900">{block.title}</h4>
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-slate-700">
                  {block.items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </section>

          {/* Respuesta argumentada */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <h3 className="text-base font-semibold text-slate-900">
              Respuesta argumentada a la pregunta de investigación (editable)
            </h3>
            <p className="mt-1 text-xs text-slate-600">{comparison.notaSuficiencia}</p>
            <textarea
              rows={8}
              value={comparison.respuestaArgumentada}
              onChange={(e) => onUpdateAnswer(e.target.value)}
              className="mt-3 w-full rounded-xl border border-slate-300 p-3 text-sm leading-relaxed text-slate-900 focus:border-indigo-500 focus:outline-none"
            />
          </section>
        </>
      )}
    </div>
  );
}
