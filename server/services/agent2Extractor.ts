import type {
  ArticleExtraction,
  ArticleSearchResult,
  EvidenceType,
  ExtractedField,
  ExtractionFieldKey,
  LlmRuntimeConfig,
  PdfExtractionPayload,
  PdfPageContent,
} from '../types.js';
import { formatInTextCitationApa7, formatReferenceApa7 } from './apa7.js';
import { coerceLlmText } from './agent4Composer.js';
import { callLlmJson } from './llmClient.js';
import { getStoredPdf, tryFetchEuropePmcFullTextXml, tryFetchOpenAccessPdf } from './pdfProcessor.js';

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

const FIELD_KEYS = Object.keys(EXTRACTION_FIELD_LABELS) as ExtractionFieldKey[];

interface TextSegment {
  ubicacion: string;
  section: string;
  sentence: string;
}

const KEYWORD_RULES: Record<ExtractionFieldKey, { patterns: RegExp[]; preferredSections: string[] }> = {
  objetivo: {
    patterns: [
      /\b(aim|aims|objective|objectives|purpose|goal|goals|this study (investigates|examines|explores|evaluates|proposes|presents)|we (propose|present|investigate|aim|evaluate)|objetivo|prop[oó]sito|finalidad|este estudio (analiza|eval[uú]a|propone|examina))\b/i,
    ],
    preferredSections: ['Resumen / Abstract', 'Introducción'],
  },
  problema: {
    patterns: [
      /\b(problem|challenge|challenges|gap|issue|limitation of existing|lack of|burden|dificultad|problema|problem[aá]tica|brecha|desaf[ií]o|carencia)\b/i,
    ],
    preferredSections: ['Introducción', 'Resumen / Abstract'],
  },
  preguntaHipotesis: {
    patterns: [
      /\b(research question|rq\d|hypothes[ie]s|we hypothesize|posited|pregunta de investigaci[oó]n|hip[oó]tesis|se plantea)\b|\?/i,
    ],
    preferredSections: ['Introducción', 'Marco teórico / Revisión'],
  },
  marcoTeorico: {
    patterns: [
      /\b(framework|theory|theoretical|concept|conceptual|grounded in|literature|paradigm|marco te[oó]rico|teor[ií]a|enfoque conceptual|conceptos)\b/i,
    ],
    preferredSections: ['Marco teórico / Revisión', 'Introducción'],
  },
  metodoDiseno: {
    patterns: [
      /\b(method|methodology|design|randomized|quasi-experimental|qualitative|quantitative|mixed[- ]methods|systematic review|meta-analysis|case study|cross-sectional|longitudinal|cohort|experimental|dise[nñ]o|metodolog[ií]a|m[eé]todo|estudio (cuantitativo|cualitativo|mixto|experimental|transversal))\b/i,
    ],
    preferredSections: ['Metodología / Métodos', 'Resumen / Abstract'],
  },
  poblacionMuestra: {
    patterns: [
      /\b(sample|participants|subjects|patients|students|respondents|cohort|dataset|corpus|articles|studies|n\s*=\s*\d+|muestra|poblaci[oó]n|participantes|conjunto de datos|base de datos|sujetos)\b/i,
    ],
    preferredSections: ['Metodología / Métodos', 'Resultados'],
  },
  variablesCategorias: {
    patterns: [
      /\b(variable|variables|dependent|independent|predictor|outcome|covariate|indicator|factor|category|categories|dimension|theme|variable dependiente|variable independiente|categor[ií]as|indicadores)\b/i,
    ],
    preferredSections: ['Metodología / Métodos'],
  },
  tecnicasInstrumentos: {
    patterns: [
      /\b(instrument|questionnaire|survey|interview|scale|rubric|test|measurement|protocol|coding|statistical analysis|anova|regression|t-test|chi-square|cuestionario|encuesta|entrevista|escala|instrumento|t[eé]cnica)\b/i,
    ],
    preferredSections: ['Metodología / Métodos'],
  },
  modelosHerramientas: {
    patterns: [
      /\b(model|algorithm|transformer|llm|gpt|bert|neural network|random forest|svm|xgboost|machine learning|deep learning|software|python|r\b|spss|nvivo|atlas\.ti|modelo|algoritmo|herramienta|arquitectura)\b/i,
    ],
    preferredSections: ['Metodología / Métodos', 'Resumen / Abstract'],
  },
  resultadosPrincipales: {
    patterns: [
      /\b(results? (show|indicate|demonstrate|reveal|found)|findings?|outperform|accuracy|f1|auc|p\s*[<≤]\s*0\.\d+|significant|achieved|resultados|hallazgos|se observ[oó]|demostr[oó]|evidenci[oó])\b/i,
    ],
    preferredSections: ['Resultados', 'Resumen / Abstract'],
  },
  conclusionesAutores: {
    patterns: [
      /\b(conclu(de|sion|sions)|in summary|overall|takeaway|these findings suggest|concluimos|conclusi[oó]n|en s[ií]ntesis|en resumen)\b/i,
    ],
    preferredSections: ['Conclusiones', 'Discusión', 'Resumen / Abstract'],
  },
  limitaciones: {
    patterns: [
      /\b(limitation|limitations|caveat|shortcoming|constraint|bias|small sample|generalizability|cannot be generalized|limitaci[oó]n|limitaciones|sesgo|restricci[oó]n)\b/i,
    ],
    preferredSections: ['Limitaciones', 'Discusión', 'Conclusiones'],
  },
  recomendaciones: {
    patterns: [
      /\b(future work|future research|further research|recommend|recommendations|implications|next step|should explore|trabajo futuro|futuras investigaciones|recomendaciones|se sugiere)\b/i,
    ],
    preferredSections: ['Recomendaciones / Trabajo futuro', 'Conclusiones', 'Discusión'],
  },
};

function splitIntoSentences(text: string): string[] {
  return text
    .replace(/\r?\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÜÑ0-9("])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 25 && s.length <= 700);
}

function buildSegmentsFromPdf(pages: PdfPageContent[]): TextSegment[] {
  const segments: TextSegment[] = [];
  for (const page of pages) {
    if (page.detectedSection === 'Referencias') continue;
    const sentences = splitIntoSentences(page.text);
    for (const sentence of sentences) {
      segments.push({
        ubicacion: `Página ${page.pageNumber}, sección "${page.detectedSection}"`,
        section: page.detectedSection,
        sentence,
      });
    }
  }
  return segments;
}

function buildSegmentsFromAbstract(article: ArticleSearchResult): TextSegment[] {
  if (!article.resumen || article.resumen === 'No disponible') return [];
  const sentences = splitIntoSentences(article.resumen);
  if (sentences.length === 0 && article.resumen.trim().length > 15) {
    return [
      {
        ubicacion: `Resumen en metadatos (${article.fuenteInformacion})`,
        section: 'Resumen / Abstract',
        sentence: article.resumen.trim(),
      },
    ];
  }
  return sentences.map((sentence) => ({
    ubicacion: `Resumen en metadatos (${article.fuenteInformacion})`,
    section: 'Resumen / Abstract',
    sentence,
  }));
}

function createNotSpecifiedField(citation: string): ExtractedField {
  return {
    valor: 'No especificado en el artículo',
    tipo: 'no_especificado',
    referenciaArticulo: citation,
    ubicacion: 'No disponible en el texto analizado',
    fragmento: '',
  };
}

function extractLocallyFromSegments(
  article: ArticleSearchResult,
  segments: TextSegment[],
  citation: string
): Record<ExtractionFieldKey, ExtractedField> {
  const result = {} as Record<ExtractionFieldKey, ExtractedField>;

  for (const key of FIELD_KEYS) {
    const rule = KEYWORD_RULES[key];
    let best: { seg: TextSegment; score: number } | null = null;

    for (const seg of segments) {
      let score = 0;
      for (const pat of rule.patterns) {
        const matches = seg.sentence.match(new RegExp(pat.source, 'gi'));
        if (matches) score += matches.length * 2;
      }
      if (score > 0 && rule.preferredSections.includes(seg.section)) {
        score += 2;
      }
      if (score > 0 && (!best || score > best.score)) {
        best = { seg, score };
      }
    }

    if (best) {
      const snippet =
        best.seg.sentence.length > 360 ? `${best.seg.sentence.slice(0, 357)}...` : best.seg.sentence;
      result[key] = {
        valor: snippet,
        tipo: 'explicito',
        referenciaArticulo: citation,
        ubicacion: best.seg.ubicacion,
        fragmento: snippet,
      };
    } else {
      result[key] = createNotSpecifiedField(citation);
    }
  }

  return result;
}

function buildIndividualReport(
  article: ArticleSearchResult,
  citation: string,
  referenceApa7: string,
  notaAlcance: string,
  campos: Record<ExtractionFieldKey, ExtractedField>
): string {
  const lines: string[] = [
    `Informe analítico individual: ${article.titulo}`,
    `Cita en texto (APA 7): ${citation}`,
    `Alcance del análisis: ${notaAlcance}`,
    '',
  ];

  for (const key of FIELD_KEYS) {
    const label = EXTRACTION_FIELD_LABELS[key];
    const field = campos[key];
    if (field.tipo === 'no_especificado' || field.valor === 'No especificado en el artículo') {
      lines.push(`- ${label}: No especificado en el artículo.`);
    } else {
      const tag = field.tipo === 'inferencia' ? '[Inferencia basada en evidencia]' : '[Información explícita]';
      lines.push(`- ${label} ${tag}: ${field.valor} (${field.referenciaArticulo}; ${field.ubicacion}).`);
    }
  }

  lines.push('', `Referencia (APA 7): ${referenceApa7}`);
  return lines.join('\n');
}

function normalizeLlmField(
  raw: any,
  citation: string
): ExtractedField {
  if (!raw || typeof raw !== 'object') {
    return createNotSpecifiedField(citation);
  }
  const valor = coerceLlmText(raw.valor) || 'No especificado en el artículo';
  if (valor.toLowerCase().includes('no especificado en el artículo')) {
    return createNotSpecifiedField(citation);
  }
  const tipo: EvidenceType =
    raw.tipo === 'inferencia' ? 'inferencia' : raw.tipo === 'no_especificado' ? 'no_especificado' : 'explicito';

  return {
    valor,
    tipo,
    referenciaArticulo: citation,
    ubicacion: coerceLlmText(raw.ubicacion) || 'Fuente no precisada en el texto',
    fragmento: coerceLlmText(raw.fragmento),
  };
}

export async function extractArticleInfo(
  article: ArticleSearchResult,
  llmConfig?: LlmRuntimeConfig
): Promise<ArticleExtraction> {
  const citation = formatInTextCitationApa7(article);
  const referenceApa7 = formatReferenceApa7(article);
  const advertencias: string[] = [];

  let pdfPayload: PdfExtractionPayload | null = null;
  let xmlSections: PdfPageContent[] | null = null;

  if (article.pdfUploadId) {
    pdfPayload = getStoredPdf(article.pdfUploadId) ?? null;
  } else if (article.estadoAcceso === 'abierto') {
    if (article.enlacePdfLegal !== 'No disponible') {
      pdfPayload = await tryFetchOpenAccessPdf(article.enlacePdfLegal, `${article.id}.pdf`);
    }
    if (!pdfPayload) {
      xmlSections = await tryFetchEuropePmcFullTextXml(article.enlacePagina, article.enlacePdfLegal);
    }
    if (!pdfPayload && !xmlSections && article.enlacePdfLegal !== 'No disponible') {
      advertencias.push(
        'El enlace externo de acceso abierto no devolvió un PDF directo descargable (posible visor web o restricción automática del servidor). Se analizó el resumen y los metadatos disponibles; puede descargar el PDF manualmente y adjuntarlo arriba si desea análisis completo por páginas.'
      );
    }
  }

  if (pdfPayload?.isScannedOrUnreadable) {
    advertencias.push(pdfPayload.message);
  }

  let segments: TextSegment[] = [];
  let alcanceAnalisis: ArticleExtraction['alcanceAnalisis'] = 'solo_metadatos';
  let notaAlcance = '';
  let paginasAnalizadas = 0;

  if (pdfPayload && !pdfPayload.isScannedOrUnreadable && pdfPayload.pages.length > 0) {
    segments = buildSegmentsFromPdf(pdfPayload.pages);
    alcanceAnalisis = 'texto_completo_pdf';
    paginasAnalizadas = pdfPayload.pageCount;
    notaAlcance = `Análisis sobre texto completo del PDF (${pdfPayload.pageCount} páginas) con trazabilidad por página y sección.`;
  } else if (xmlSections && xmlSections.length > 0) {
    segments = xmlSections.flatMap((sec) =>
      splitIntoSentences(sec.text).map((sentence) => ({
        ubicacion: `Texto completo XML (Europe PMC), sección "${sec.detectedSection}"`,
        section: sec.detectedSection,
        sentence,
      }))
    );
    alcanceAnalisis = 'texto_completo_pdf';
    paginasAnalizadas = xmlSections.length;
    notaAlcance = `Análisis sobre texto completo XML de acceso abierto (Europe PMC, ${xmlSections.length} secciones).`;
  } else if (article.resumen && article.resumen !== 'No disponible') {
    segments = buildSegmentsFromAbstract(article);
    alcanceAnalisis = 'resumen_y_metadatos';
    notaAlcance = `Análisis limitado al resumen y metadatos recuperados de ${article.fuenteInformacion} (sin acceso al texto completo en PDF).`;
    if (!article.pdfUploadId && article.estadoAcceso !== 'abierto') {
      advertencias.push(
        `El artículo tiene estado de acceso "${article.estadoAcceso}". Puede cargar manualmente el PDF legible si dispone de acceso institucional.`
      );
    }
  } else {
    alcanceAnalisis = 'solo_metadatos';
    notaAlcance = `Solo se dispone de metadatos bibliográficos básicos de ${article.fuenteInformacion} (sin resumen ni texto completo).`;
    advertencias.push(
      'Este artículo no incluye resumen en la fuente consultada ni PDF cargado. Cargue un PDF legible para realizar la extracción completa.'
    );
  }

  // Intentar extracción avanzada con LLM si hay clave configurada y texto disponible
  let campos: Record<ExtractionFieldKey, ExtractedField> | null = null;
  let modoAnalisis: 'llm' | 'evidencia_local' = 'evidencia_local';
  let proveedorLlm: string | undefined;

  if (segments.length > 0) {
    const contextText =
      pdfPayload && !pdfPayload.isScannedOrUnreadable
        ? pdfPayload.pages
            .filter((p) => p.detectedSection !== 'Referencias')
            .map((p) => `[Página ${p.pageNumber} | Sección: ${p.detectedSection}]\n${p.text}`)
            .join('\n\n')
            .slice(0, 48000)
        : xmlSections && xmlSections.length > 0
          ? xmlSections
              .map((s) => `[Sección: ${s.detectedSection}]\n${s.text}`)
              .join('\n\n')
              .slice(0, 48000)
          : `[Resumen de metadatos (${article.fuenteInformacion})]\n${article.resumen}`;

    const systemPrompt = `Eres un asistente académico experto en análisis riguroso de artículos científicos en español.
Reglas estrictas:
1. Extrae información ÚNICAMENTE del texto proporcionado. Nunca inventes datos, citas textuales ni números de página.
2. Si un campo no aparece en el texto, devuelve exactamente "No especificado en el artículo" como valor y tipo "no_especificado".
3. Diferencia claramente entre información explícita ("explicito") e inferencias prudentes ("inferencia").
4. Incluye siempre la ubicación exacta observada en el contexto (ej. "Página 3, Sección: Metodología" o "Resumen de metadatos") y un fragmento breve textual de respaldo en el idioma original del texto.
5. Redacta los valores en español académico claro.
Devuelve únicamente un objeto JSON con las 13 claves: ${FIELD_KEYS.join(', ')}.
Cada clave debe tener: { "valor": string, "tipo": "explicito" | "inferencia" | "no_especificado", "ubicacion": string, "fragmento": string }.`;

    const userPrompt = `Metadatos del artículo:
Título: ${article.titulo}
Autores: ${article.autores.join(', ')}
Año: ${article.anioTexto}
Fuente/Revista: ${article.revistaOFuente}
DOI: ${article.doi}

Texto disponible para analizar:
${contextText}`;

    const llmRes = await callLlmJson<Record<string, any>>(systemPrompt, userPrompt, llmConfig);
    if (llmRes.ok) {
      const parsedFields = {} as Record<ExtractionFieldKey, ExtractedField>;
      for (const k of FIELD_KEYS) {
        parsedFields[k] = normalizeLlmField(llmRes.data?.[k], citation);
      }
      campos = parsedFields;
      modoAnalisis = 'llm';
      proveedorLlm = llmRes.providerLabel;
    } else if (
      llmConfig?.apiKey ||
      process.env.GEMINI_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.GROQ_API_KEY
    ) {
      advertencias.push(`No se pudo usar el proveedor LLM (${llmRes.error}). Se aplicó extracción local basada en evidencia.`);
    }
  }

  if (!campos) {
    campos = extractLocallyFromSegments(article, segments, citation);
    modoAnalisis = 'evidencia_local';
  }

  const informeIndividual = buildIndividualReport(article, citation, referenceApa7, notaAlcance, campos);

  return {
    articleId: article.id,
    titulo: article.titulo,
    autores: article.autores,
    anioTexto: article.anioTexto,
    citaEnTextoApa7: citation,
    referenciaApa7: referenceApa7,
    alcanceAnalisis,
    notaAlcance,
    paginasAnalizadas,
    campos,
    informeIndividual,
    modoAnalisis,
    proveedorLlm,
    advertencias,
  };
}
