import { useState } from 'react';
import { AlertTriangle, Download, FileText, Loader2, Play, RefreshCw } from 'lucide-react';
import { EXTRACTION_FIELD_LABELS, type ExtractionFieldKey, type FinalDocument } from '../types';

const FIELD_KEYS = Object.keys(EXTRACTION_FIELD_LABELS) as ExtractionFieldKey[];

interface Stage4DocumentPanelProps {
  canCompose: boolean;
  document: FinalDocument | null;
  isComposing: boolean;
  onCompose: () => void;
  onUpdateDocument: (updater: (prev: FinalDocument) => FinalDocument) => void;
  onExport: (format: 'docx' | 'pdf' | 'md') => Promise<void>;
  error: string | null;
}

export function Stage4DocumentPanel({
  canCompose,
  document,
  isComposing,
  onCompose,
  onUpdateDocument,
  onExport,
  error,
}: Stage4DocumentPanelProps) {
  const [exportingFormat, setExportingFormat] = useState<'docx' | 'pdf' | 'md' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExport = async (format: 'docx' | 'pdf' | 'md') => {
    setExportError(null);
    setExportingFormat(format);
    try {
      await onExport(format);
    } catch (err: any) {
      setExportError(err?.message || 'Error al descargar el documento.');
    } finally {
      setExportingFormat(null);
    }
  };

  if (!canCompose) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <p className="text-base font-medium text-slate-800">
          Complete los Agentes 2 y 3 antes de generar el documento final.
        </p>
        <p className="mt-1 text-sm text-slate-500">
          El Agente 4 integra las extracciones individuales y la comparación argumentada en un documento de 10 secciones.
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
              4. Integración y documento final (Agente 4)
            </h2>
            <p className="text-sm text-slate-600">
              Edite la portada, revise las 10 secciones y exporte el documento en DOCX, PDF o Markdown.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isComposing}
              onClick={onCompose}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {isComposing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : document ? (
                <RefreshCw className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              <span>
                {isComposing
                  ? 'Integrando documento...'
                  : document
                    ? 'Regenerar desde Agentes 2 y 3'
                    : 'Generar documento final'}
              </span>
            </button>

            {document && (
              <>
                <button
                  type="button"
                  disabled={exportingFormat !== null}
                  onClick={() => handleExport('docx')}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  {exportingFormat === 'docx' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  <span>Descargar DOCX</span>
                </button>
                <button
                  type="button"
                  disabled={exportingFormat !== null}
                  onClick={() => handleExport('pdf')}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-rose-700 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-rose-800 disabled:opacity-50"
                >
                  {exportingFormat === 'pdf' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  <span>Descargar PDF</span>
                </button>
                <button
                  type="button"
                  disabled={exportingFormat !== null}
                  onClick={() => handleExport('md')}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {exportingFormat === 'md' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                  <span>Descargar Markdown</span>
                </button>
              </>
            )}
          </div>
        </div>

        {(error || exportError) && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error || exportError}</span>
          </div>
        )}
      </section>

      {document && (
        <div className="space-y-5">
          {/* 1. Portada editable */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <h3 className="text-base font-semibold text-slate-900">1. Portada editable</h3>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600">Título del documento</label>
                <input
                  type="text"
                  value={document.portada.titulo}
                  onChange={(e) =>
                    onUpdateDocument((d) => ({ ...d, portada: { ...d.portada, titulo: e.target.value } }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Autor(a)</label>
                <input
                  type="text"
                  value={document.portada.autor}
                  onChange={(e) =>
                    onUpdateDocument((d) => ({ ...d, portada: { ...d.portada, autor: e.target.value } }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Institución</label>
                <input
                  type="text"
                  value={document.portada.institucion}
                  onChange={(e) =>
                    onUpdateDocument((d) => ({ ...d, portada: { ...d.portada, institucion: e.target.value } }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Fecha</label>
                <input
                  type="date"
                  value={document.portada.fecha}
                  onChange={(e) =>
                    onUpdateDocument((d) => ({ ...d, portada: { ...d.portada, fecha: e.target.value } }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
          </section>

          {/* Vista previa completa de secciones 2 a 10 */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
            <div>
              <h3 className="text-base font-bold text-slate-900">2. Tema y pregunta de investigación</h3>
              <p className="mt-1 text-sm text-slate-700">
                <strong>Tema:</strong> {document.tema}
              </p>
              <p className="mt-1 text-sm text-slate-700">
                <strong>Pregunta de investigación:</strong> {document.preguntaInvestigacion}
              </p>
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900">3. Resumen ejecutivo (editable)</h3>
              <textarea
                rows={4}
                value={document.resumenEjecutivo}
                onChange={(e) => onUpdateDocument((d) => ({ ...d, resumenEjecutivo: e.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-sm leading-relaxed text-slate-800"
              />
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900">4. Metodología de búsqueda</h3>
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                <li><strong>Palabras clave:</strong> {document.metodologiaBusqueda.palabrasClave}</li>
                <li><strong>Filtros aplicados:</strong> {document.metodologiaBusqueda.filtrosAplicados}</li>
                <li><strong>Fuentes consultadas:</strong> {document.metodologiaBusqueda.fuentesConsultadas}</li>
                <li><strong>Criterios de selección:</strong> {document.metodologiaBusqueda.criteriosSeleccion}</li>
              </ul>
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900">
                5. Resultados del Agente 1: artículos seleccionados ({document.resultadosAgente1.length})
              </h3>
              <div className="mt-2 space-y-2">
                {document.resultadosAgente1.map((art, idx) => (
                  <div key={art.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                    <div className="font-semibold text-slate-900">
                      {idx + 1}. {art.titulo}
                    </div>
                    <div className="mt-1">
                      {art.autores.join(', ')} ({art.anioTexto}) · {art.revistaOFuente} · DOI: {art.doi} · Fuente: {art.fuenteInformacion} ({art.estadoAcceso})
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900">
                6. Análisis individual de los artículos (Agente 2)
              </h3>
              <div className="mt-2 space-y-3">
                {document.analisisIndividualAgente2.map((ext, idx) => (
                  <details key={ext.articleId} open className="rounded-xl border border-slate-200 p-3.5">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                      {idx + 1}. {ext.titulo} {ext.citaEnTextoApa7}
                    </summary>
                    <p className="mt-1 text-xs text-slate-500">{ext.notaAlcance}</p>
                    <dl className="mt-2 space-y-1 text-xs text-slate-700">
                      {FIELD_KEYS.map((k) => {
                        const f = ext.campos[k];
                        return (
                          <div key={k}>
                            <dt className="inline font-semibold text-slate-900">{EXTRACTION_FIELD_LABELS[k]}: </dt>
                            <dd className="inline">
                              {f.tipo === 'no_especificado' ? 'No especificado en el artículo.' : `${f.valor} [${f.tipo} · ${f.ubicacion}]`}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  </details>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900">
                7. Tabla comparativa y respuesta a la pregunta (Agente 3)
              </h3>
              <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Criterio</th>
                      {document.comparacionAgente3.columnas.map((c) => (
                        <th key={c.articleId} className="px-3 py-2 font-semibold">
                          {c.etiqueta}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {document.comparacionAgente3.tablaComparativa.map((row) => (
                      <tr key={row.criterio}>
                        <td className="bg-slate-50 px-3 py-2 font-semibold">{row.criterio}</td>
                        {document.comparacionAgente3.columnas.map((c) => (
                          <td key={c.articleId} className="px-3 py-2 text-slate-700">
                            {row.valoresPorArticulo[c.articleId] || 'No especificado en el artículo'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-800">
                {document.comparacionAgente3.respuestaArgumentada}
              </p>

              {document.comparacionAgente3.preguntasAdicionales?.length > 0 && (
                <div className="mt-4 space-y-2.5">
                  <h4 className="text-sm font-semibold text-slate-900">
                    Preguntas de investigación adicionales generadas y respondidas
                  </h4>
                  {document.comparacionAgente3.preguntasAdicionales.map((qa, idx) => (
                    <div key={idx} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                      <div className="font-semibold text-slate-900">
                        {idx + 1}. {qa.pregunta}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        Suficiencia: {qa.suficiencia} · Respaldo: {qa.articulosRespaldo.join(', ')}
                      </div>
                      <p className="mt-1.5 whitespace-pre-line leading-relaxed text-slate-700">{qa.respuesta}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <h3 className="text-base font-bold text-slate-900">8. Conclusiones generales (separadas y editables)</h3>
              <div>
                <label className="block text-xs font-semibold text-slate-700">A. Hallazgos de los artículos</label>
                <textarea
                  rows={3}
                  value={document.conclusionesGenerales.hallazgosArticulos}
                  onChange={(e) =>
                    onUpdateDocument((d) => ({
                      ...d,
                      conclusionesGenerales: { ...d.conclusionesGenerales, hallazgosArticulos: e.target.value },
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">B. Síntesis comparativa</label>
                <textarea
                  rows={3}
                  value={document.conclusionesGenerales.sintesisComparativa}
                  onChange={(e) =>
                    onUpdateDocument((d) => ({
                      ...d,
                      conclusionesGenerales: { ...d.conclusionesGenerales, sintesisComparativa: e.target.value },
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">C. Inferencias analíticas</label>
                <textarea
                  rows={3}
                  value={document.conclusionesGenerales.inferenciasAnaliticas}
                  onChange={(e) =>
                    onUpdateDocument((d) => ({
                      ...d,
                      conclusionesGenerales: { ...d.conclusionesGenerales, inferenciasAnaliticas: e.target.value },
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm"
                />
              </div>
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900">9. Limitaciones del análisis (editable)</h3>
              <textarea
                rows={4}
                value={document.limitacionesAnalisis}
                onChange={(e) => onUpdateDocument((d) => ({ ...d, limitacionesAnalisis: e.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-sm text-slate-800"
              />
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900">10. Referencias bibliográficas (APA 7)</h3>
              <ul className="mt-2 space-y-2 text-sm text-slate-800">
                {document.referenciasApa7.map((ref, idx) => (
                  <li key={idx} className="pl-6 -indent-6">
                    {ref}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
