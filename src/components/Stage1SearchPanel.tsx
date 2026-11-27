import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckSquare,
  ExternalLink,
  FileUp,
  Filter,
  Loader2,
  Search,
  Square,
  Trash2,
} from 'lucide-react';
import type { AcademicSource, ArticleSearchResult, SearchFilters, SourceStatus } from '../types';

const ALL_SOURCES: AcademicSource[] = ['OpenAlex', 'Crossref', 'Europe PMC', 'Semantic Scholar', 'PubMed'];

interface Stage1SearchPanelProps {
  topic: string;
  onTopicChange: (v: string) => void;
  researchQuestion: string;
  onResearchQuestionChange: (v: string) => void;
  selectedSources: AcademicSource[];
  onToggleSource: (source: AcademicSource) => void;
  filters: SearchFilters;
  onFiltersChange: (f: SearchFilters) => void;
  isSearching: boolean;
  onSearch: (currentFilters: SearchFilters) => void;
  articles: ArticleSearchResult[];
  sourceStatuses: SourceStatus[];
  selectedIds: string[];
  onToggleArticle: (id: string) => void;
  onSelectAllFiltered: (ids: string[]) => void;
  onClearSelection: () => void;
  onUploadStandalonePdf: (file: File) => Promise<void>;
  onRemoveArticle: (id: string) => void;
  onProceedToAgent2: () => void;
  searchError: string | null;
  pdfMessage: { type: 'ok' | 'error'; text: string } | null;
}

export function Stage1SearchPanel({
  topic,
  onTopicChange,
  researchQuestion,
  onResearchQuestionChange,
  selectedSources,
  onToggleSource,
  filters,
  onFiltersChange,
  isSearching,
  onSearch,
  articles,
  sourceStatuses,
  selectedIds,
  onToggleArticle,
  onSelectAllFiltered,
  onClearSelection,
  onUploadStandalonePdf,
  onRemoveArticle,
  onProceedToAgent2,
  searchError,
  pdfMessage,
}: Stage1SearchPanelProps) {
  const [localFilterAuthor, setLocalFilterAuthor] = useState(filters.autor || '');
  const [localYearFrom, setLocalYearFrom] = useState(filters.anioDesde ? String(filters.anioDesde) : '');
  const [localYearTo, setLocalYearTo] = useState(filters.anioHasta ? String(filters.anioHasta) : '');
  const [localOnlyOa, setLocalOnlyOa] = useState(Boolean(filters.soloTextoCompleto));
  const [localSourceFilter, setLocalSourceFilter] = useState<string>('todas');
  const [uploadingPdf, setUploadingPdf] = useState(false);

  const visibleArticles = useMemo(() => {
    return articles.filter((art) => {
      const yFrom = localYearFrom ? Number.parseInt(localYearFrom, 10) : null;
      const yTo = localYearTo ? Number.parseInt(localYearTo, 10) : null;
      if (yFrom && (art.anio === null || art.anio < yFrom)) return false;
      if (yTo && (art.anio === null || art.anio > yTo)) return false;
      if (localFilterAuthor.trim()) {
        const needle = localFilterAuthor.trim().toLowerCase();
        if (!art.autores.some((a) => a.toLowerCase().includes(needle))) return false;
      }
      if (localSourceFilter !== 'todas') {
        const all = [art.fuenteInformacion, ...(art.fuentesSecundarias ?? [])];
        if (!all.includes(localSourceFilter as AcademicSource)) return false;
      }
      if (localOnlyOa) {
        if (art.estadoAcceso !== 'abierto' && art.enlacePdfLegal === 'No disponible') return false;
      }
      return true;
    });
  }, [articles, localYearFrom, localYearTo, localFilterAuthor, localSourceFilter, localOnlyOa]);

  const buildCurrentFilters = (): SearchFilters => ({
    anioDesde: localYearFrom ? Number.parseInt(localYearFrom, 10) : null,
    anioHasta: localYearTo ? Number.parseInt(localYearTo, 10) : null,
    autor: localFilterAuthor,
    soloTextoCompleto: localOnlyOa,
    fuentes: localSourceFilter !== 'todas' ? [localSourceFilter as AcademicSource] : undefined,
  });

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPdf(true);
    try {
      await onUploadStandalonePdf(file);
    } finally {
      setUploadingPdf(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Formulario de tema, pregunta y fuentes */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              1. Definición del tema, pregunta de investigación y búsqueda (Agente 1)
            </h2>
            <p className="text-sm text-slate-600">
              Consulta fuentes académicas reales y legítimas. Ningún artículo ni enlace se fabrica.
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100">
            {uploadingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            <span>{uploadingPdf ? 'Procesando PDF...' : 'Cargar PDF local propio'}</span>
            <input type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleFileInput} />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Tema o palabras clave de búsqueda <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => onTopicChange(e.target.value)}
              placeholder="Ej.: large language models systematic literature review education"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-500">
              Consejo: las consultas en inglés suelen recuperar mayor volumen en APIs internacionales como OpenAlex o Crossref.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              Pregunta de investigación (para el Agente 3) <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              value={researchQuestion}
              onChange={(e) => onResearchQuestionChange(e.target.value)}
              placeholder="Ej.: ¿Qué beneficios y limitaciones reportan los LLM en educación superior?"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-4">
          <span className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Fuentes académicas a consultar
          </span>
          <div className="mt-2 flex flex-wrap gap-2">
            {ALL_SOURCES.map((src) => {
              const active = selectedSources.includes(src);
              return (
                <button
                  key={src}
                  type="button"
                  onClick={() => onToggleSource(src)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {src}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <button
            type="button"
            disabled={isSearching || !topic.trim() || selectedSources.length === 0}
            onClick={() => {
              const current = buildCurrentFilters();
              onFiltersChange(current);
              onSearch(current);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span>{isSearching ? 'Buscando artículos...' : 'Buscar artículos científicos'}</span>
          </button>

          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={onProceedToAgent2}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-emerald-700"
            >
              <span>Enviar {selectedIds.length} artículo(s) al Agente 2</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>

        {searchError && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{searchError}</span>
          </div>
        )}

        {pdfMessage && (
          <div
            className={`mt-4 flex items-start gap-2 rounded-xl border p-3 text-sm ${
              pdfMessage.type === 'error'
                ? 'border-amber-300 bg-amber-50 text-amber-900'
                : 'border-emerald-200 bg-emerald-50 text-emerald-900'
            }`}
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{pdfMessage.text}</span>
          </div>
        )}
      </section>

      {/* Estado de las APIs consultadas */}
      {sourceStatuses.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Estado de fuentes consultadas
          </h3>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {sourceStatuses.map((st) => (
              <div
                key={st.fuente}
                className={`rounded-lg border p-2.5 text-xs ${
                  st.estado === 'ok'
                    ? 'border-emerald-200 bg-emerald-50/50 text-emerald-900'
                    : st.estado === 'limitado'
                      ? 'border-amber-200 bg-amber-50 text-amber-900'
                      : st.estado === 'error'
                        ? 'border-rose-200 bg-rose-50 text-rose-900'
                        : 'border-slate-200 bg-slate-50 text-slate-700'
                }`}
              >
                <div className="font-semibold">{st.fuente}</div>
                <div className="mt-0.5 text-[11px] opacity-90">{st.mensaje}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Filtros y lista de artículos */}
      {articles.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-500" />
              <h3 className="text-base font-semibold text-slate-900">
                Resultados recuperados ({visibleArticles.length} visibles de {articles.length})
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onSelectAllFiltered(visibleArticles.map((a) => a.id))}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Seleccionar visibles
              </button>
              <button
                type="button"
                onClick={onClearSelection}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Limpiar selección ({selectedIds.length})
              </button>
            </div>
          </div>

          {/* Controles de filtrado */}
          <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="block text-xs font-medium text-slate-600">Año desde</label>
              <input
                type="number"
                value={localYearFrom}
                onChange={(e) => {
                  setLocalYearFrom(e.target.value);
                  onFiltersChange({
                    ...filters,
                    anioDesde: e.target.value ? Number.parseInt(e.target.value, 10) : null,
                  });
                }}
                placeholder="Ej. 2020"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">Año hasta</label>
              <input
                type="number"
                value={localYearTo}
                onChange={(e) => {
                  setLocalYearTo(e.target.value);
                  onFiltersChange({
                    ...filters,
                    anioHasta: e.target.value ? Number.parseInt(e.target.value, 10) : null,
                  });
                }}
                placeholder="Ej. 2026"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">Filtrar por autor</label>
              <input
                type="text"
                value={localFilterAuthor}
                onChange={(e) => {
                  setLocalFilterAuthor(e.target.value);
                  onFiltersChange({ ...filters, autor: e.target.value });
                }}
                placeholder="Apellido o nombre"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">Fuente</label>
              <select
                value={localSourceFilter}
                onChange={(e) => {
                  setLocalSourceFilter(e.target.value);
                  onFiltersChange({
                    ...filters,
                    fuentes: e.target.value !== 'todas' ? [e.target.value as AcademicSource] : undefined,
                  });
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
              >
                <option value="todas">Todas las fuentes</option>
                {[...ALL_SOURCES, 'PDF local'].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end pb-1">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={localOnlyOa}
                  onChange={(e) => {
                    setLocalOnlyOa(e.target.checked);
                    onFiltersChange({ ...filters, soloTextoCompleto: e.target.checked });
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                />
                <span>Solo texto completo / OA</span>
              </label>
            </div>
          </div>

          {/* Lista */}
          {visibleArticles.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600">
              Ningún artículo cumple los filtros actuales. Ajuste los criterios de año, autor, fuente o acceso.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {visibleArticles.map((art) => {
                const isSelected = selectedIds.includes(art.id);
                const accessBadgeClass =
                  art.estadoAcceso === 'abierto'
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                    : art.estadoAcceso === 'restringido'
                      ? 'bg-amber-100 text-amber-800 border-amber-200'
                      : 'bg-slate-100 text-slate-700 border-slate-200';

                return (
                  <article
                    key={art.id}
                    className={`rounded-xl border p-4 transition ${
                      isSelected ? 'border-indigo-500 bg-indigo-50/40 ring-1 ring-indigo-500/30' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => onToggleArticle(art.id)}
                        className="mt-0.5 text-indigo-600 hover:text-indigo-800"
                        title={isSelected ? 'Descartar artículo' : 'Seleccionar para Agente 2'}
                      >
                        {isSelected ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5 text-slate-400" />}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <h4 className="text-base font-semibold text-slate-900">{art.titulo}</h4>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                              {art.fuenteInformacion}
                              {art.fuentesSecundarias && art.fuentesSecundarias.length > 0
                                ? ` + ${art.fuentesSecundarias.join(', ')}`
                                : ''}
                            </span>
                            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${accessBadgeClass}`}>
                              Acceso: {art.estadoAcceso}
                            </span>
                            {art.fuenteInformacion === 'PDF local' && (
                              <button
                                type="button"
                                onClick={() => onRemoveArticle(art.id)}
                                className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                title="Eliminar PDF local"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                          <span>
                            <strong>Autores:</strong> {art.autores.join(', ')}
                          </span>
                          <span>
                            <strong>Año:</strong> {art.anioTexto}
                          </span>
                          <span>
                            <strong>Fuente/Revista:</strong> {art.revistaOFuente}
                          </span>
                          <span>
                            <strong>DOI:</strong> {art.doi}
                          </span>
                        </div>

                        <p className="mt-2 text-sm leading-relaxed text-slate-700">
                          <strong>Resumen:</strong>{' '}
                          {art.resumen !== 'No disponible' ? art.resumen : 'No disponible en los metadatos recuperados.'}
                        </p>

                        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                          {art.enlacePagina !== 'No disponible' ? (
                            <a
                              href={art.enlacePagina}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 font-medium text-indigo-700 hover:underline"
                            >
                              <span>Página del artículo</span>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          ) : (
                            <span className="text-slate-500">Página del artículo: No disponible</span>
                          )}

                          {art.enlacePdfLegal !== 'No disponible' ? (
                            <a
                              href={art.enlacePdfLegal}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:underline"
                            >
                              <span>PDF / Texto completo legal</span>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          ) : (
                            <span className="text-slate-500">PDF legal: No disponible</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
