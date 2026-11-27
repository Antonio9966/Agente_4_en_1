import { useEffect, useMemo, useState } from 'react';
import {
  composeAgent4Document,
  deleteUploadedPdf,
  downloadExportedDocument,
  fetchHealth,
  runAgent2Extraction,
  runAgent3Compare,
  searchAgent1,
  uploadPdfFile,
} from './api';
import { SettingsModal } from './components/SettingsModal';
import { Stage1SearchPanel } from './components/Stage1SearchPanel';
import { Stage2ExtractionPanel } from './components/Stage2ExtractionPanel';
import { Stage3ComparisonPanel } from './components/Stage3ComparisonPanel';
import { Stage4DocumentPanel } from './components/Stage4DocumentPanel';
import { type AgentStepId, StepperHeader, type StepStatus } from './components/StepperHeader';
import type {
  AcademicSource,
  AdditionalResearchQA,
  Agent3ComparisonResult,
  ArticleExtraction,
  ArticleSearchResult,
  EvidenceType,
  ExtractionFieldKey,
  FinalDocument,
  HealthInfo,
  LlmRuntimeConfig,
  SearchFilters,
  SourceStatus,
} from './types';

export function App() {
  const [activeStep, setActiveStep] = useState<AgentStepId>('search');
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [llmConfig, setLlmConfig] = useState<LlmRuntimeConfig>({ provider: 'gemini', apiKey: '' });

  // Estado Agente 1
  const [topic, setTopic] = useState('');
  const [researchQuestion, setResearchQuestion] = useState('');
  const [selectedSources, setSelectedSources] = useState<AcademicSource[]>([
    'OpenAlex',
    'Crossref',
    'Europe PMC',
    'Semantic Scholar',
  ]);
  const [filters, setFilters] = useState<SearchFilters>({});
  const [isSearching, setIsSearching] = useState(false);
  const [articles, setArticles] = useState<ArticleSearchResult[]>([]);
  const [sourceStatuses, setSourceStatuses] = useState<SourceStatus[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [pdfMessage, setPdfMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  // Estado Agente 2
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractions, setExtractions] = useState<ArticleExtraction[]>([]);
  const [extractError, setExtractError] = useState<string | null>(null);

  // Estado Agente 3
  const [isComparing, setIsComparing] = useState(false);
  const [comparison, setComparison] = useState<Agent3ComparisonResult | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);

  // Estado Agente 4
  const [isComposing, setIsComposing] = useState(false);
  const [finalDocument, setFinalDocument] = useState<FinalDocument | null>(null);
  const [composeError, setComposeError] = useState<string | null>(null);

  useEffect(() => {
    fetchHealth()
      .then(setHealth)
      .catch(() => {
        // Ignorar fallo inicial silencioso si el servidor está arrancando
      });
  }, []);

  const selectedArticles = useMemo(
    () => articles.filter((a) => selectedIds.includes(a.id)),
    [articles, selectedIds]
  );

  const statuses: Record<AgentStepId, StepStatus> = {
    search: isSearching ? 'en_curso' : articles.length > 0 ? 'completado' : 'pendiente',
    extract: isExtracting ? 'en_curso' : extractions.length > 0 ? 'completado' : 'pendiente',
    compare: isComparing ? 'en_curso' : comparison ? 'completado' : 'pendiente',
    document: isComposing ? 'en_curso' : finalDocument ? 'completado' : 'pendiente',
  };

  const handleToggleSource = (src: AcademicSource) => {
    setSelectedSources((prev) =>
      prev.includes(src) ? prev.filter((s) => s !== src) : [...prev, src]
    );
  };

  const handleSearch = async (overrideFilters?: SearchFilters) => {
    setSearchError(null);
    setPdfMessage(null);
    setIsSearching(true);
    try {
      const res = await searchAgent1(topic, selectedSources, overrideFilters ?? filters);
      // Conservar PDFs locales previamente cargados por el usuario
      const localPdfs = articles.filter((a) => a.fuenteInformacion === 'PDF local');
      setArticles([...localPdfs, ...res.articulos]);
      setSourceStatuses(res.estadoFuentes);
      if (res.articulos.length === 0 && localPdfs.length === 0) {
        setSearchError(
          'No se encontraron artículos con los términos o filtros ingresados. Intente ampliar los filtros o usar términos en inglés.'
        );
      }
    } catch (err: any) {
      setSearchError(err?.message || 'Error al realizar la búsqueda académica.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleToggleArticle = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleUploadStandalonePdf = async (file: File) => {
    setPdfMessage(null);
    try {
      const payload = await uploadPdfFile(file);
      if (payload.isScannedOrUnreadable) {
        setPdfMessage({ type: 'error', text: `${file.name}: ${payload.message}` });
        await deleteUploadedPdf(payload.uploadId);
        return;
      }

      const newId = `local_${payload.uploadId}`;
      const newArticle: ArticleSearchResult = {
        id: newId,
        titulo: payload.inferredTitle || file.name.replace(/\.pdf$/i, ''),
        autores: ['No disponible'],
        anio: null,
        anioTexto: 'No disponible',
        revistaOFuente: 'Archivo PDF cargado por el usuario',
        resumen: 'Documento completo cargado en PDF por el usuario.',
        doi: 'No disponible',
        enlacePagina: 'No disponible',
        enlacePdfLegal: 'No disponible',
        fuenteInformacion: 'PDF local',
        estadoAcceso: 'abierto',
        pdfUploadId: payload.uploadId,
        pdfFileName: payload.fileName,
      };

      setArticles((prev) => [newArticle, ...prev]);
      setSelectedIds((prev) => [newId, ...prev]);
      setPdfMessage({ type: 'ok', text: `${file.name}: ${payload.message}` });
    } catch (err: any) {
      setPdfMessage({ type: 'error', text: err?.message || 'Error al procesar el PDF.' });
    }
  };

  const handleRemoveArticle = async (id: string) => {
    const target = articles.find((a) => a.id === id);
    if (target?.pdfUploadId) {
      await deleteUploadedPdf(target.pdfUploadId).catch(() => {});
    }
    setArticles((prev) => prev.filter((a) => a.id !== id));
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  };

  const handleAttachPdfToArticle = async (articleId: string, file: File) => {
    setExtractError(null);
    try {
      const payload = await uploadPdfFile(file);
      if (payload.isScannedOrUnreadable) {
        setExtractError(`${file.name}: ${payload.message}`);
        await deleteUploadedPdf(payload.uploadId);
        return;
      }
      setArticles((prev) =>
        prev.map((art) =>
          art.id === articleId
            ? {
                ...art,
                pdfUploadId: payload.uploadId,
                pdfFileName: payload.fileName,
                estadoAcceso: 'abierto',
              }
            : art
        )
      );
    } catch (err: any) {
      setExtractError(err?.message || 'No se pudo adjuntar el PDF.');
    }
  };

  const handleRunAgent2 = async () => {
    setExtractError(null);
    setIsExtracting(true);
    try {
      const res = await runAgent2Extraction(selectedArticles, llmConfig);
      setExtractions(res.extracciones);
    } catch (err: any) {
      setExtractError(err?.message || 'Error durante la extracción del Agente 2.');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleUpdateField = (
    articleId: string,
    fieldKey: ExtractionFieldKey,
    patch: { valor?: string; tipo?: EvidenceType; ubicacion?: string }
  ) => {
    setExtractions((prev) =>
      prev.map((ext) => {
        if (ext.articleId !== articleId) return ext;
        const current = ext.campos[fieldKey];
        const nextField = { ...current, ...patch };
        return {
          ...ext,
          campos: { ...ext.campos, [fieldKey]: nextField },
        };
      })
    );
  };

  const handleRunAgent3 = async () => {
    setCompareError(null);
    setIsComparing(true);
    try {
      const res = await runAgent3Compare(extractions, researchQuestion, llmConfig);
      setComparison(res);
    } catch (err: any) {
      setCompareError(err?.message || 'Error al ejecutar la comparación del Agente 3.');
    } finally {
      setIsComparing(false);
    }
  };

  const handleUpdateTableCell = (rowIndex: number, articleId: string, value: string) => {
    setComparison((prev) => {
      if (!prev) return prev;
      const nextRows = prev.tablaComparativa.map((row, idx) =>
        idx === rowIndex
          ? {
              ...row,
              valoresPorArticulo: { ...row.valoresPorArticulo, [articleId]: value },
            }
          : row
      );
      return { ...prev, tablaComparativa: nextRows };
    });
  };

  const handleRunAgent4 = async () => {
    if (!comparison) return;
    setComposeError(null);
    setIsComposing(true);
    try {
      const doc = await composeAgent4Document({
        portada: finalDocument?.portada || {
          titulo: `Análisis científico: ${topic || 'Revisión de literatura'}`,
          autor: 'Investigador(a)',
          institucion: 'Institución académica',
          fecha: new Date().toISOString().slice(0, 10),
        },
        tema: topic || 'Análisis documental de artículos científicos',
        preguntaInvestigacion: researchQuestion || comparison.preguntaInvestigacion,
        palabrasClave: topic || 'Documentos PDF cargados',
        filtrosAplicados: filters,
        fuentesConsultadas: selectedSources,
        articulosSeleccionados: selectedArticles,
        extracciones: extractions,
        comparacion: comparison,
        llmConfig,
      });
      setFinalDocument(doc);
    } catch (err: any) {
      setComposeError(err?.message || 'Error al generar el documento final.');
    } finally {
      setIsComposing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <StepperHeader
        activeStep={activeStep}
        onSelectStep={setActiveStep}
        statuses={statuses}
        health={health}
        llmConfig={llmConfig}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {activeStep === 'search' && (
          <Stage1SearchPanel
            topic={topic}
            onTopicChange={setTopic}
            researchQuestion={researchQuestion}
            onResearchQuestionChange={setResearchQuestion}
            selectedSources={selectedSources}
            onToggleSource={handleToggleSource}
            filters={filters}
            onFiltersChange={setFilters}
            isSearching={isSearching}
            onSearch={handleSearch}
            articles={articles}
            sourceStatuses={sourceStatuses}
            selectedIds={selectedIds}
            onToggleArticle={handleToggleArticle}
            onSelectAllFiltered={(ids) => setSelectedIds(Array.from(new Set([...selectedIds, ...ids])))}
            onClearSelection={() => setSelectedIds([])}
            onUploadStandalonePdf={handleUploadStandalonePdf}
            onRemoveArticle={handleRemoveArticle}
            onProceedToAgent2={() => setActiveStep('extract')}
            searchError={searchError}
            pdfMessage={pdfMessage}
          />
        )}

        {activeStep === 'extract' && (
          <Stage2ExtractionPanel
            selectedArticles={selectedArticles}
            extractions={extractions}
            isExtracting={isExtracting}
            onRunExtraction={handleRunAgent2}
            onAttachPdfToArticle={handleAttachPdfToArticle}
            onUpdateField={handleUpdateField}
            onProceedToAgent3={() => setActiveStep('compare')}
            error={extractError}
          />
        )}

        {activeStep === 'compare' && (
          <Stage3ComparisonPanel
            extractions={extractions}
            researchQuestion={researchQuestion}
            onResearchQuestionChange={setResearchQuestion}
            comparison={comparison}
            isComparing={isComparing}
            onRunComparison={handleRunAgent3}
            onUpdateTableCell={handleUpdateTableCell}
            onUpdateAnswer={(ans) =>
              setComparison((prev) => (prev ? { ...prev, respuestaArgumentada: ans } : prev))
            }
            onUpdateAdditionalQA={(idx, patch: Partial<AdditionalResearchQA>) =>
              setComparison((prev) => {
                if (!prev) return prev;
                const nextQAs = (prev.preguntasAdicionales ?? []).map((item, i) =>
                  i === idx ? { ...item, ...patch } : item
                );
                return { ...prev, preguntasAdicionales: nextQAs };
              })
            }
            onAddAdditionalQA={() =>
              setComparison((prev) => {
                if (!prev) return prev;
                const nuevo: AdditionalResearchQA = {
                  pregunta: '¿Qué otro aspecto específico abordan los artículos analizados?',
                  respuesta: 'Escriba aquí la respuesta basada en la evidencia de los documentos.',
                  articulosRespaldo: extractions.map((e) => e.citaEnTextoApa7),
                  suficiencia: 'parcial',
                };
                return {
                  ...prev,
                  preguntasAdicionales: [...(prev.preguntasAdicionales ?? []), nuevo],
                };
              })
            }
            onRemoveAdditionalQA={(idx) =>
              setComparison((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  preguntasAdicionales: (prev.preguntasAdicionales ?? []).filter((_, i) => i !== idx),
                };
              })
            }
            onProceedToAgent4={() => setActiveStep('document')}
            error={compareError}
          />
        )}

        {activeStep === 'document' && (
          <Stage4DocumentPanel
            canCompose={Boolean(comparison && extractions.length > 0)}
            document={finalDocument}
            isComposing={isComposing}
            onCompose={handleRunAgent4}
            onUpdateDocument={(updater) =>
              setFinalDocument((prev) => (prev ? updater(prev) : prev))
            }
            onExport={(format) => {
              if (!finalDocument) return Promise.resolve();
              return downloadExportedDocument(format, finalDocument);
            }}
            error={composeError}
          />
        )}
      </main>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        llmConfig={llmConfig}
        onSaveLlmConfig={setLlmConfig}
        health={health}
      />
    </div>
  );
}

export default App;
