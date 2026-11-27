export type AccessStatus = 'abierto' | 'restringido' | 'enlace no disponible';

export type AcademicSource =
  | 'OpenAlex'
  | 'Crossref'
  | 'Europe PMC'
  | 'Semantic Scholar'
  | 'PubMed'
  | 'PDF local';

export interface ArticleSearchResult {
  id: string;
  titulo: string;
  autores: string[];
  anio: number | null;
  anioTexto: string;
  revistaOFuente: string;
  resumen: string;
  doi: string;
  enlacePagina: string;
  enlacePdfLegal: string;
  fuenteInformacion: AcademicSource;
  fuentesSecundarias?: string[];
  estadoAcceso: AccessStatus;
  volumen?: string;
  numero?: string;
  paginas?: string;
  seleccionado?: boolean;
  pdfUploadId?: string;
  pdfFileName?: string;
}

export interface SearchFilters {
  anioDesde?: number | null;
  anioHasta?: number | null;
  autor?: string;
  fuentes?: AcademicSource[];
  soloTextoCompleto?: boolean;
}

export interface SourceStatus {
  fuente: AcademicSource;
  estado: 'ok' | 'sin_resultados' | 'limitado' | 'error';
  cantidad: number;
  mensaje: string;
}

export interface Agent1SearchResponse {
  consulta: string;
  articulos: ArticleSearchResult[];
  estadoFuentes: SourceStatus[];
  totalSinFiltrar: number;
  marcaTiempo: string;
}

export type EvidenceType = 'explicito' | 'inferencia' | 'no_especificado';

export interface ExtractedField {
  valor: string;
  tipo: EvidenceType;
  referenciaArticulo: string;
  ubicacion: string;
  fragmento: string;
}

export type ExtractionFieldKey =
  | 'objetivo'
  | 'problema'
  | 'preguntaHipotesis'
  | 'marcoTeorico'
  | 'metodoDiseno'
  | 'poblacionMuestra'
  | 'variablesCategorias'
  | 'tecnicasInstrumentos'
  | 'modelosHerramientas'
  | 'resultadosPrincipales'
  | 'conclusionesAutores'
  | 'limitaciones'
  | 'recomendaciones';

export const EXTRACTION_FIELD_LABELS: Record<ExtractionFieldKey, string> = {
  objetivo: 'Objetivo del estudio',
  problema: 'Problema investigado',
  preguntaHipotesis: 'Pregunta o hipótesis',
  marcoTeorico: 'Marco teórico o conceptos principales',
  metodoDiseno: 'Método y diseño de investigación',
  poblacionMuestra: 'Población, muestra o conjunto de datos',
  variablesCategorias: 'Variables o categorías analizadas',
  tecnicasInstrumentos: 'Técnicas e instrumentos',
  modelosHerramientas: 'Modelos, algoritmos o herramientas utilizados',
  resultadosPrincipales: 'Resultados principales',
  conclusionesAutores: 'Conclusiones de los autores',
  limitaciones: 'Limitaciones del estudio',
  recomendaciones: 'Recomendaciones o trabajo futuro',
};

export interface ArticleExtraction {
  articleId: string;
  titulo: string;
  autores: string[];
  anioTexto: string;
  citaEnTextoApa7: string;
  referenciaApa7: string;
  alcanceAnalisis: 'texto_completo_pdf' | 'resumen_y_metadatos' | 'solo_metadatos';
  notaAlcance: string;
  paginasAnalizadas: number;
  campos: Record<ExtractionFieldKey, ExtractedField>;
  informeIndividual: string;
  modoAnalisis: 'llm' | 'evidencia_local';
  proveedorLlm?: string;
  advertencias: string[];
}

export interface PdfExtractionPayload {
  uploadId: string;
  fileName: string;
  pageCount: number;
  totalChars: number;
  isScannedOrUnreadable: boolean;
  message: string;
  inferredTitle?: string;
}

export interface ComparisonRow {
  criterio: string;
  valoresPorArticulo: Record<string, string>;
}

export interface ClaimSupport {
  afirmacion: string;
  articulosRespaldo: string[];
  tipo: 'evidencia_directa' | 'sintesis_comparativa' | 'inferencia_cautelosa';
}

export interface AdditionalResearchQA {
  pregunta: string;
  respuesta: string;
  articulosRespaldo: string[];
  suficiencia: 'suficiente' | 'parcial' | 'insuficiente';
}

export interface Agent3ComparisonResult {
  preguntaInvestigacion: string;
  articulosIds: string[];
  columnas: { articleId: string; etiqueta: string; citaApa7: string }[];
  tablaComparativa: ComparisonRow[];
  coincidencias: string[];
  diferencias: string[];
  modelosEnfoquesCompartidos: string[];
  complementariedadesYContradicciones: string[];
  vaciosYLimitaciones: string[];
  evidenciaParaPregunta: string[];
  respuestaArgumentada: string;
  preguntasAdicionales: AdditionalResearchQA[];
  afirmacionesRespaldadas: ClaimSupport[];
  suficienciaEvidencia: 'suficiente' | 'parcial' | 'insuficiente';
  notaSuficiencia: string;
  modoAnalisis: 'llm' | 'evidencia_local';
  proveedorLlm?: string;
}

export interface DocumentCover {
  titulo: string;
  autor: string;
  institucion: string;
  fecha: string;
}

export interface FinalDocument {
  portada: DocumentCover;
  tema: string;
  preguntaInvestigacion: string;
  resumenEjecutivo: string;
  metodologiaBusqueda: {
    palabrasClave: string;
    filtrosAplicados: string;
    fuentesConsultadas: string;
    criteriosSeleccion: string;
  };
  resultadosAgente1: ArticleSearchResult[];
  analisisIndividualAgente2: ArticleExtraction[];
  comparacionAgente3: Agent3ComparisonResult;
  conclusionesGenerales: {
    hallazgosArticulos: string;
    sintesisComparativa: string;
    inferenciasAnaliticas: string;
  };
  limitacionesAnalisis: string;
  referenciasApa7: string[];
}

export interface LlmRuntimeConfig {
  provider?: 'gemini' | 'groq' | 'openai';
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export interface HealthInfo {
  ok: boolean;
  llm: {
    configured: boolean;
    provider: string | null;
    label: string;
  };
  externalServices: Record<string, { active: boolean; politePool?: boolean; apiKeyConfigured?: boolean }>;
  exportFormats: string[];
}
