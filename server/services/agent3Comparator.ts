import type {
  Agent3ComparisonResult,
  ArticleExtraction,
  ClaimSupport,
  ComparisonRow,
  LlmRuntimeConfig,
} from '../types.js';
import { callLlmJson } from './llmClient.js';

function shortLabel(ext: ArticleExtraction, index: number): string {
  const cleanCitation = ext.citaEnTextoApa7.replace(/[()]/g, '');
  return `Art. ${index + 1}: ${cleanCitation}`;
}

function summarizeField(value: string, maxLen = 220): string {
  if (!value || value === 'No especificado en el artículo') {
    return 'No especificado en el artículo';
  }
  return value.length > maxLen ? `${value.slice(0, maxLen - 3)}...` : value;
}

function tokenizeKeywords(text: string): string[] {
  const stopwords = new Set([
    'para', 'como', 'sobre', 'entre', 'desde', 'hasta', 'donde', 'cual', 'cuales', 'segun',
    'esto', 'esta', 'estos', 'estas', 'unos', 'unas', 'cada', 'pero', 'porque', 'cuando',
    'what', 'which', 'with', 'from', 'that', 'this', 'have', 'been', 'were', 'their', 'about',
    'como', 'cuales', 'tiene', 'tienen', 'sobre', 'articulos', 'articulo', 'estudio', 'estudios',
  ]);
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !stopwords.has(w));
}

function assessQuestionRelation(ext: ArticleExtraction, questionTokens: string[]): string {
  const searchable = [
    ext.titulo,
    ext.campos.objetivo.valor,
    ext.campos.resultadosPrincipales.valor,
    ext.campos.conclusionesAutores.valor,
    ext.campos.modelosHerramientas.valor,
  ]
    .filter((v) => v && v !== 'No especificado en el artículo')
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const matched = questionTokens.filter((tok) => searchable.includes(tok));
  const uniqueMatched = Array.from(new Set(matched));

  if (uniqueMatched.length === 0) {
    return `Relación indirecta o no explícita con la pregunta en los fragmentos analizados (${ext.citaEnTextoApa7}).`;
  }
  return `Aporta evidencia relacionada con: ${uniqueMatched.slice(0, 6).join(', ')} (${ext.citaEnTextoApa7}; ${ext.notaAlcance}).`;
}

function buildLocalComparison(
  extractions: ArticleExtraction[],
  researchQuestion: string
): Agent3ComparisonResult {
  const qTokens = tokenizeKeywords(researchQuestion);
  const columnas = extractions.map((ext, idx) => ({
    articleId: ext.articleId,
    etiqueta: shortLabel(ext, idx),
    citaApa7: ext.citaEnTextoApa7,
  }));

  const rowDefs: Array<{ criterio: string; getter: (e: ArticleExtraction) => string }> = [
    { criterio: 'Objetivo', getter: (e) => summarizeField(e.campos.objetivo.valor) },
    { criterio: 'Método', getter: (e) => summarizeField(e.campos.metodoDiseno.valor) },
    { criterio: 'Muestra o datos', getter: (e) => summarizeField(e.campos.poblacionMuestra.valor) },
    { criterio: 'Modelo o herramienta', getter: (e) => summarizeField(e.campos.modelosHerramientas.valor) },
    { criterio: 'Resultados', getter: (e) => summarizeField(e.campos.resultadosPrincipales.valor) },
    { criterio: 'Limitaciones', getter: (e) => summarizeField(e.campos.limitaciones.valor) },
    { criterio: 'Relación con la pregunta', getter: (e) => assessQuestionRelation(e, qTokens) },
  ];

  const tablaComparativa: ComparisonRow[] = rowDefs.map((def) => {
    const valoresPorArticulo: Record<string, string> = {};
    for (const ext of extractions) {
      valoresPorArticulo[ext.articleId] = def.getter(ext);
    }
    return { criterio: def.criterio, valoresPorArticulo };
  });

  // Identificar términos o herramientas compartidas entre >=2 artículos
  const tokenToCitations = new Map<string, Set<string>>();
  const toolToCitations = new Map<string, Set<string>>();

  for (const ext of extractions) {
    const bodyText = [
      ext.campos.objetivo.valor,
      ext.campos.metodoDiseno.valor,
      ext.campos.resultadosPrincipales.valor,
      ext.campos.conclusionesAutores.valor,
    ]
      .filter((v) => v !== 'No especificado en el artículo')
      .join(' ');
    for (const tok of new Set(tokenizeKeywords(bodyText))) {
      if (!tokenToCitations.has(tok)) tokenToCitations.set(tok, new Set());
      tokenToCitations.get(tok)!.add(ext.citaEnTextoApa7);
    }

    const toolText = ext.campos.modelosHerramientas.valor;
    if (toolText !== 'No especificado en el artículo') {
      for (const tok of new Set(tokenizeKeywords(toolText))) {
        if (!toolToCitations.has(tok)) toolToCitations.set(tok, new Set());
        toolToCitations.get(tok)!.add(ext.citaEnTextoApa7);
      }
    }
  }

  const sharedConcepts = Array.from(tokenToCitations.entries())
    .filter(([, cites]) => cites.size >= 2)
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 6);

  const coincidencias =
    sharedConcepts.length > 0
      ? sharedConcepts.map(
          ([concept, cites]) =>
            `Múltiples estudios abordan o reportan elementos vinculados a "${concept}": ${Array.from(cites).join(', ')}.`
        )
      : [
          'Con el nivel de detalle disponible en los textos analizados, no se identifican coincidencias temáticas literales suficientes más allá de la consulta común.',
        ];

  const diferencias: string[] = [];
  const methodsList = extractions
    .filter((e) => e.campos.metodoDiseno.valor !== 'No especificado en el artículo')
    .map((e) => `${e.citaEnTextoApa7}: "${summarizeField(e.campos.metodoDiseno.valor, 130)}"`);
  if (methodsList.length > 0) {
    diferencias.push(`Diseños y métodos reportados: ${methodsList.join(' | ')}.`);
  }
  const samplesList = extractions
    .filter((e) => e.campos.poblacionMuestra.valor !== 'No especificado en el artículo')
    .map((e) => `${e.citaEnTextoApa7}: "${summarizeField(e.campos.poblacionMuestra.valor, 120)}"`);
  if (samplesList.length > 0) {
    diferencias.push(`Poblaciones, muestras o conjuntos de datos: ${samplesList.join(' | ')}.`);
  }
  if (diferencias.length === 0) {
    diferencias.push(
      'Varios artículos carecen de detalles metodológicos o muestrales explícitos en los fragmentos disponibles (por ejemplo, cuando solo se dispuso del resumen).'
    );
  }

  const sharedTools = Array.from(toolToCitations.entries())
    .filter(([, cites]) => cites.size >= 2)
    .slice(0, 5);
  const modelosEnfoquesCompartidos =
    sharedTools.length > 0
      ? sharedTools.map(([t, cites]) => `Uso o mención compartida de "${t}" en ${Array.from(cites).join(', ')}.`)
      : extractions.some((e) => e.campos.modelosHerramientas.valor !== 'No especificado en el artículo')
        ? extractions
            .filter((e) => e.campos.modelosHerramientas.valor !== 'No especificado en el artículo')
            .map((e) => `${e.citaEnTextoApa7} reporta: ${summarizeField(e.campos.modelosHerramientas.valor, 160)}`)
        : ['No se reportaron modelos, algoritmos o herramientas compartidos en los textos analizados.'];

  const complementariedadesYContradicciones: string[] = [];
  const resultsEntries = extractions.filter((e) => e.campos.resultadosPrincipales.valor !== 'No especificado en el artículo');
  if (resultsEntries.length >= 2) {
    complementariedadesYContradicciones.push(
      `Complementariedad observada: ${resultsEntries
        .map((e) => `${e.citaEnTextoApa7} reporta "${summarizeField(e.campos.resultadosPrincipales.valor, 130)}"`)
        .join(' Por su parte, ')}.`
    );
  } else {
    complementariedadesYContradicciones.push(
      'No hay suficientes resultados explícitos en múltiples artículos para contrastar complementariedades o contradicciones directas.'
    );
  }

  const vaciosYLimitaciones: string[] = [];
  const missingLimitationsCount = extractions.filter(
    (e) => e.campos.limitaciones.valor === 'No especificado en el artículo'
  ).length;
  for (const ext of extractions) {
    if (ext.campos.limitaciones.valor !== 'No especificado en el artículo') {
      vaciosYLimitaciones.push(`${ext.citaEnTextoApa7}: ${summarizeField(ext.campos.limitaciones.valor, 180)}`);
    }
  }
  if (missingLimitationsCount > 0) {
    vaciosYLimitaciones.push(
      `${missingLimitationsCount} de ${extractions.length} artículo(s) no especifican limitaciones en el texto disponible (frecuente cuando solo se cuenta con el resumen).`
    );
  }

  const fullTextCount = extractions.filter((e) => e.alcanceAnalisis === 'texto_completo_pdf').length;
  const withResultsCount = resultsEntries.length;

  let suficienciaEvidencia: Agent3ComparisonResult['suficienciaEvidencia'] = 'parcial';
  let notaSuficiencia = '';

  if (extractions.length < 2 || withResultsCount === 0) {
    suficienciaEvidencia = 'insuficiente';
    notaSuficiencia =
      'La evidencia disponible es insuficiente para responder de manera concluyente a la pregunta de investigación debido al bajo número de artículos con resultados explícitos o a la falta de texto completo.';
  } else if (fullTextCount === extractions.length && withResultsCount === extractions.length) {
    suficienciaEvidencia = 'suficiente';
    notaSuficiencia =
      'Los artículos seleccionados cuentan con texto completo y resultados explícitos que permiten sustentar una respuesta comparativa fundamentada, sujeta a las limitaciones individuales de cada estudio.';
  } else {
    suficienciaEvidencia = 'parcial';
    notaSuficiencia =
      `La evidencia es parcial: ${fullTextCount} de ${extractions.length} artículos fueron analizados en texto completo PDF y ${withResultsCount} reportan resultados explícitos en el fragmento disponible.`;
  }

  const evidenciaParaPregunta = extractions.map((ext) => {
    const res =
      ext.campos.resultadosPrincipales.valor !== 'No especificado en el artículo'
        ? ext.campos.resultadosPrincipales.valor
        : ext.campos.conclusionesAutores.valor;
    return `${ext.citaEnTextoApa7}: ${
      res !== 'No especificado en el artículo'
        ? summarizeField(res, 220)
        : 'Sin resultados o conclusiones explícitas en el texto disponible.'
    }`;
  });

  const afirmacionesRespaldadas: ClaimSupport[] = extractions
    .filter((e) => e.campos.resultadosPrincipales.valor !== 'No especificado en el artículo')
    .map((e) => ({
      afirmacion: `${summarizeField(e.campos.resultadosPrincipales.valor, 200)}`,
      articulosRespaldo: [e.citaEnTextoApa7],
      tipo: 'evidencia_directa',
    }));

  const respuestaArgumentada = [
    `En relación con la pregunta de investigación ("${researchQuestion}"), se analizaron ${extractions.length} artículo(s).`,
    '',
    'Evidencia reportada por los estudios:',
    ...evidenciaParaPregunta.map((line) => `- ${line}`),
    '',
    `Valoración de suficiencia: ${notaSuficiencia}`,
    'Nota metodológica: Las convergencias entre estudios indican coincidencias observadas en los textos analizados y no deben interpretarse automáticamente como relaciones causales ni generalizarse fuera de las muestras o contextos descritos por los autores.',
  ].join('\n');

  return {
    preguntaInvestigacion: researchQuestion,
    articulosIds: extractions.map((e) => e.articleId),
    columnas,
    tablaComparativa,
    coincidencias,
    diferencias,
    modelosEnfoquesCompartidos,
    complementariedadesYContradicciones,
    vaciosYLimitaciones,
    evidenciaParaPregunta,
    respuestaArgumentada,
    afirmacionesRespaldadas,
    suficienciaEvidencia,
    notaSuficiencia,
    modoAnalisis: 'evidencia_local',
  };
}

export async function runAgent3Comparison(
  extractions: ArticleExtraction[],
  researchQuestion: string,
  llmConfig?: LlmRuntimeConfig
): Promise<Agent3ComparisonResult> {
  const fallback = buildLocalComparison(extractions, researchQuestion);
  if (extractions.length === 0) return fallback;

  const compactArticles = extractions.map((ext, idx) => ({
    articleId: ext.articleId,
    etiqueta: shortLabel(ext, idx),
    citaApa7: ext.citaEnTextoApa7,
    titulo: ext.titulo,
    alcance: ext.notaAlcance,
    campos: {
      objetivo: ext.campos.objetivo.valor,
      problema: ext.campos.problema.valor,
      metodoDiseno: ext.campos.metodoDiseno.valor,
      poblacionMuestra: ext.campos.poblacionMuestra.valor,
      modelosHerramientas: ext.campos.modelosHerramientas.valor,
      resultadosPrincipales: ext.campos.resultadosPrincipales.valor,
      conclusionesAutores: ext.campos.conclusionesAutores.valor,
      limitaciones: ext.campos.limitaciones.valor,
    },
  }));

  const systemPrompt = `Eres un investigador académico senior que realiza síntesis comparativa de literatura científica en español.
Reglas obligatorias:
1. Usa ÚNICAMENTE la información contenida en los artículos analizados que se te entregan. No agregues conocimiento externo ni inventes resultados.
2. Cada afirmación importante debe citar explícitamente la cita APA 7 del artículo o artículos que la respaldan.
3. Si existen desacuerdos o contradicciones entre artículos, muéstralos explícitamente en lugar de ocultarlos.
4. No confundas correlación o coincidencia con causalidad, y no generalices más allá de la evidencia disponible.
5. Si los artículos no permiten responder suficientemente la pregunta, indícalo claramente.
Devuelve un JSON con esta estructura exacta:
{
  "tablaComparativa": [
    { "criterio": "Objetivo", "valoresPorArticulo": { "<articleId>": "..." } },
    { "criterio": "Método", "valoresPorArticulo": { "<articleId>": "..." } },
    { "criterio": "Muestra o datos", "valoresPorArticulo": { "<articleId>": "..." } },
    { "criterio": "Modelo o herramienta", "valoresPorArticulo": { "<articleId>": "..." } },
    { "criterio": "Resultados", "valoresPorArticulo": { "<articleId>": "..." } },
    { "criterio": "Limitaciones", "valoresPorArticulo": { "<articleId>": "..." } },
    { "criterio": "Relación con la pregunta", "valoresPorArticulo": { "<articleId>": "..." } }
  ],
  "coincidencias": ["..."],
  "diferencias": ["..."],
  "modelosEnfoquesCompartidos": ["..."],
  "complementariedadesYContradicciones": ["..."],
  "vaciosYLimitaciones": ["..."],
  "evidenciaParaPregunta": ["..."],
  "respuestaArgumentada": "texto académico en español con citas APA 7",
  "afirmacionesRespaldadas": [{ "afirmacion": "...", "articulosRespaldo": ["(Autor, Año)"], "tipo": "evidencia_directa" | "sintesis_comparativa" | "inferencia_cautelosa" }],
  "suficienciaEvidencia": "suficiente" | "parcial" | "insuficiente",
  "notaSuficiencia": "..."
}`;

  const userPrompt = `Pregunta de investigación del usuario:
"${researchQuestion}"

Artículos analizados por el Agente 2:
${JSON.stringify(compactArticles, null, 2)}`;

  const llmRes = await callLlmJson<any>(systemPrompt, userPrompt, llmConfig);
  if (!llmRes.ok) {
    return fallback;
  }

  const d = llmRes.data;
  const safeArray = (val: unknown, fb: string[]): string[] =>
    Array.isArray(val) && val.length > 0 ? val.map(String) : fb;

  const validTable =
    Array.isArray(d?.tablaComparativa) && d.tablaComparativa.length >= 7
      ? d.tablaComparativa.map((row: any) => ({
          criterio: String(row.criterio || 'Criterio'),
          valoresPorArticulo:
            row.valoresPorArticulo && typeof row.valoresPorArticulo === 'object'
              ? row.valoresPorArticulo
              : {},
        }))
      : fallback.tablaComparativa;

  return {
    preguntaInvestigacion: researchQuestion,
    articulosIds: fallback.articulosIds,
    columnas: fallback.columnas,
    tablaComparativa: validTable,
    coincidencias: safeArray(d?.coincidencias, fallback.coincidencias),
    diferencias: safeArray(d?.diferencias, fallback.diferencias),
    modelosEnfoquesCompartidos: safeArray(d?.modelosEnfoquesCompartidos, fallback.modelosEnfoquesCompartidos),
    complementariedadesYContradicciones: safeArray(
      d?.complementariedadesYContradicciones,
      fallback.complementariedadesYContradicciones
    ),
    vaciosYLimitaciones: safeArray(d?.vaciosYLimitaciones, fallback.vaciosYLimitaciones),
    evidenciaParaPregunta: safeArray(d?.evidenciaParaPregunta, fallback.evidenciaParaPregunta),
    respuestaArgumentada:
      typeof d?.respuestaArgumentada === 'string' && d.respuestaArgumentada.trim()
        ? d.respuestaArgumentada.trim()
        : fallback.respuestaArgumentada,
    afirmacionesRespaldadas: Array.isArray(d?.afirmacionesRespaldadas)
      ? d.afirmacionesRespaldadas
      : fallback.afirmacionesRespaldadas,
    suficienciaEvidencia:
      d?.suficienciaEvidencia === 'suficiente' ||
      d?.suficienciaEvidencia === 'parcial' ||
      d?.suficienciaEvidencia === 'insuficiente'
        ? d.suficienciaEvidencia
        : fallback.suficienciaEvidencia,
    notaSuficiencia:
      typeof d?.notaSuficiencia === 'string' && d.notaSuficiencia.trim()
        ? d.notaSuficiencia.trim()
        : fallback.notaSuficiencia,
    modoAnalisis: 'llm',
    proveedorLlm: llmRes.providerLabel,
  };
}
