import type {
  AcademicSource,
  Agent1SearchResponse,
  Agent3ComparisonResult,
  ArticleExtraction,
  ArticleSearchResult,
  DocumentCover,
  FinalDocument,
  HealthInfo,
  LlmRuntimeConfig,
  PdfExtractionPayload,
  SearchFilters,
} from './types';

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `Error HTTP ${res.status}` }));
    throw new Error(body.error || `Error HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function fetchHealth(): Promise<HealthInfo> {
  const res = await fetch('/api/health');
  return parseJsonOrThrow<HealthInfo>(res);
}

export async function fetchAvailableLlmModels(
  llmConfig: LlmRuntimeConfig
): Promise<{ provider: string; models: string[] }> {
  const res = await fetch('/api/llm/models', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ llmConfig }),
  });
  return parseJsonOrThrow<{ provider: string; models: string[] }>(res);
}

export async function searchAgent1(
  query: string,
  sources: AcademicSource[],
  filters: SearchFilters
): Promise<Agent1SearchResponse> {
  const res = await fetch('/api/agent1/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, sources, filters, limitPerSource: 8 }),
  });
  return parseJsonOrThrow<Agent1SearchResponse>(res);
}

export async function uploadPdfFile(file: File): Promise<PdfExtractionPayload> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/agent2/upload-pdf', {
    method: 'POST',
    body: form,
  });
  return parseJsonOrThrow<PdfExtractionPayload>(res);
}

export async function deleteUploadedPdf(uploadId: string): Promise<void> {
  await fetch(`/api/agent2/pdf/${encodeURIComponent(uploadId)}`, { method: 'DELETE' });
}

export async function runAgent2Extraction(
  articles: ArticleSearchResult[],
  llmConfig?: LlmRuntimeConfig
): Promise<{ extracciones: ArticleExtraction[] }> {
  const res = await fetch('/api/agent2/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ articles, llmConfig }),
  });
  return parseJsonOrThrow<{ extracciones: ArticleExtraction[] }>(res);
}

export async function runAgent3Compare(
  extracciones: ArticleExtraction[],
  preguntaInvestigacion: string,
  llmConfig?: LlmRuntimeConfig
): Promise<Agent3ComparisonResult> {
  const res = await fetch('/api/agent3/compare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ extracciones, preguntaInvestigacion, llmConfig }),
  });
  return parseJsonOrThrow<Agent3ComparisonResult>(res);
}

export async function composeAgent4Document(payload: {
  portada: DocumentCover;
  tema: string;
  preguntaInvestigacion: string;
  palabrasClave: string;
  filtrosAplicados: SearchFilters;
  fuentesConsultadas: string[];
  articulosSeleccionados: ArticleSearchResult[];
  extracciones: ArticleExtraction[];
  comparacion: Agent3ComparisonResult;
  llmConfig?: LlmRuntimeConfig;
}): Promise<FinalDocument> {
  const res = await fetch('/api/agent4/compose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow<FinalDocument>(res);
}

export async function downloadExportedDocument(
  format: 'docx' | 'pdf' | 'md',
  document: FinalDocument
): Promise<void> {
  const res = await fetch(`/api/agent4/export/${format}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ document }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `Error HTTP ${res.status}` }));
    throw new Error(body.error || 'No se pudo exportar el documento.');
  }

  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] || `documento-cientifico.${format}`;

  const url = URL.createObjectURL(blob);
  const a = window.document.createElement('a');
  a.href = url;
  a.download = filename;
  window.document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
