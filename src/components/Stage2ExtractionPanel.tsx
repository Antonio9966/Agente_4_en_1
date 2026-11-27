import { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  FileUp,
  Loader2,
  Play,
  RefreshCw,
} from 'lucide-react';
import {
  EXTRACTION_FIELD_LABELS,
  type ArticleExtraction,
  type ArticleSearchResult,
  type EvidenceType,
  type ExtractionFieldKey,
} from '../types';

const FIELD_KEYS = Object.keys(EXTRACTION_FIELD_LABELS) as ExtractionFieldKey[];

interface Stage2ExtractionPanelProps {
  selectedArticles: ArticleSearchResult[];
  extractions: ArticleExtraction[];
  isExtracting: boolean;
  onRunExtraction: () => void;
  onAttachPdfToArticle: (articleId: string, file: File) => Promise<void>;
  onUpdateField: (
    articleId: string,
    fieldKey: ExtractionFieldKey,
    patch: { valor?: string; tipo?: EvidenceType; ubicacion?: string }
  ) => void;
  onProceedToAgent3: () => void;
  error: string | null;
}

export function Stage2ExtractionPanel({
  selectedArticles,
  extractions,
  isExtracting,
  onRunExtraction,
  onAttachPdfToArticle,
  onUpdateField,
  onProceedToAgent3,
  error,
}: Stage2ExtractionPanelProps) {
  const [uploadingForId, setUploadingForId] = useState<string | null>(null);
  const [activeReportTab, setActiveReportTab] = useState<Record<string, 'campos' | 'informe'>>({});

  const handleAttachPdf = async (articleId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingForId(articleId);
    try {
      await onAttachPdfToArticle(articleId, file);
    } finally {
      setUploadingForId(null);
      e.target.value = '';
    }
  };

  if (selectedArticles.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <p className="text-base font-medium text-slate-800">
          Aún no hay artículos seleccionados para el Agente 2.
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Regrese al Agente 1 para seleccionar artículos de la búsqueda o cargar un PDF propio.
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
              2. Extracción de información y trazabilidad por artículo (Agente 2)
            </h2>
            <p className="text-sm text-slate-600">
              Puede adjuntar archivos PDF legibles a cada artículo antes de extraer. Luego revise y edite cualquier campo.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isExtracting}
              onClick={onRunExtraction}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {isExtracting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : extractions.length > 0 ? (
                <RefreshCw className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              <span>
                {isExtracting
                  ? 'Extrayendo información...'
                  : extractions.length > 0
                    ? 'Volver a ejecutar Agente 2'
                    : `Extraer ${selectedArticles.length} artículo(s)`}
              </span>
            </button>

            {extractions.length > 0 && (
              <button
                type="button"
                onClick={onProceedToAgent3}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                <span>Comparar en Agente 3</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Lista compacta de artículos seleccionados con carga opcional de PDF */}
        <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50/70">
          {selectedArticles.map((art, idx) => (
            <div key={art.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {idx + 1}. {art.titulo}
                </p>
                <p className="text-xs text-slate-600">
                  {art.autores.join(', ')} ({art.anioTexto}) · Acceso: {art.estadoAcceso}
                  {art.pdfFileName ? ` · PDF adjunto: ${art.pdfFileName}` : ''}
                </p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                {uploadingForId === art.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileUp className="h-3.5 w-3.5 text-indigo-600" />
                )}
                <span>{art.pdfUploadId ? 'Reemplazar PDF' : 'Adjuntar PDF legible'}</span>
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={(e) => handleAttachPdf(art.id, e)}
                />
              </label>
            </div>
          ))}
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </section>

      {/* Paneles editables de extracción por artículo */}
      {extractions.map((ext, idx) => {
        const mode = activeReportTab[ext.articleId] || 'campos';
        return (
          <section key={ext.articleId} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800">
                    Artículo {idx + 1} · {ext.citaEnTextoApa7}
                  </span>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                    {ext.modoAnalisis === 'llm' ? `Modo: ${ext.proveedorLlm}` : 'Modo: Evidencia local'}
                  </span>
                </div>
                <h3 className="mt-1.5 text-base font-semibold text-slate-900">{ext.titulo}</h3>
                <p className="mt-0.5 text-xs text-slate-600">{ext.notaAlcance}</p>
              </div>

              <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setActiveReportTab((p) => ({ ...p, [ext.articleId]: 'campos' }))}
                  className={`rounded-md px-3 py-1.5 ${
                    mode === 'campos' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Campos editables (13)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveReportTab((p) => ({ ...p, [ext.articleId]: 'informe' }))}
                  className={`rounded-md px-3 py-1.5 ${
                    mode === 'informe' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Informe individual APA 7
                </button>
              </div>
            </div>

            {ext.advertencias.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {ext.advertencias.map((adv, aIdx) => (
                  <div
                    key={aIdx}
                    className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900"
                  >
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{adv}</span>
                  </div>
                ))}
              </div>
            )}

            {mode === 'informe' ? (
              <div className="mt-4 space-y-3">
                <pre className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 font-sans text-sm leading-relaxed text-slate-800">
                  {ext.informeIndividual}
                </pre>
                <div className="rounded-xl border border-slate-200 bg-indigo-50/40 p-3 text-xs text-slate-700">
                  <strong>Referencia APA 7:</strong> {ext.referenciaApa7}
                </div>
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                {FIELD_KEYS.map((key) => {
                  const field = ext.campos[key];
                  return (
                    <div key={key} className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="text-xs font-semibold text-slate-800">
                          {EXTRACTION_FIELD_LABELS[key]}
                        </label>
                        <select
                          value={field.tipo}
                          onChange={(e) =>
                            onUpdateField(ext.articleId, key, { tipo: e.target.value as EvidenceType })
                          }
                          className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                            field.tipo === 'explicito'
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                              : field.tipo === 'inferencia'
                                ? 'border-amber-300 bg-amber-50 text-amber-800'
                                : 'border-slate-300 bg-slate-100 text-slate-600'
                          }`}
                        >
                          <option value="explicito">Explícito en el artículo</option>
                          <option value="inferencia">Inferencia</option>
                          <option value="no_especificado">No especificado</option>
                        </select>
                      </div>

                      <textarea
                        rows={3}
                        value={field.valor}
                        onChange={(e) => onUpdateField(ext.articleId, key, { valor: e.target.value })}
                        className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-2 text-xs leading-relaxed text-slate-900 focus:border-indigo-500 focus:outline-none"
                      />

                      <div className="mt-2 flex flex-col gap-1 text-[11px] text-slate-500">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-slate-600">Ubicación:</span>
                          <input
                            type="text"
                            value={field.ubicacion}
                            onChange={(e) => onUpdateField(ext.articleId, key, { ubicacion: e.target.value })}
                            className="flex-1 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-700"
                          />
                        </div>
                        {field.fragmento && (
                          <p className="italic text-slate-500">
                            Fragmento de respaldo: "{field.fragmento}"
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
