import type {
  Agent3ComparisonResult,
  ArticleExtraction,
  ArticleSearchResult,
  DocumentCover,
  FinalDocument,
  LlmRuntimeConfig,
  SearchFilters,
} from '../types.js';
import { callLlmJson } from './llmClient.js';

export interface ComposeInput {
  portada: DocumentCover;
  tema: string;
  preguntaInvestigacion: string;
  palabrasClave: string;
  filtrosAplicados?: SearchFilters;
  fuentesConsultadas?: string[];
  articulosSeleccionados: ArticleSearchResult[];
  extracciones: ArticleExtraction[];
  comparacion: Agent3ComparisonResult;
  llmConfig?: LlmRuntimeConfig;
}

function formatFiltersText(filtros?: SearchFilters): string {
  if (!filtros) return 'Sin filtros adicionales aplicados.';
  const parts: string[] = [];
  if (filtros.anioDesde || filtros.anioHasta) {
    parts.push(`Rango de años: ${filtros.anioDesde ?? 'cualquiera'} - ${filtros.anioHasta ?? 'actual'}`);
  }
  if (filtros.autor?.trim()) {
    parts.push(`Filtro por autor: "${filtros.autor.trim()}"`);
  }
  if (filtros.fuentes && filtros.fuentes.length > 0) {
    parts.push(`Fuentes filtradas: ${filtros.fuentes.join(', ')}`);
  }
  if (filtros.soloTextoCompleto) {
    parts.push('Solo artículos con texto completo / acceso abierto disponible');
  }
  return parts.length > 0 ? parts.join('; ') : 'Sin filtros adicionales aplicados.';
}

export async function composeFinalDocument(input: ComposeInput): Promise<FinalDocument> {
  const {
    portada,
    tema,
    preguntaInvestigacion,
    palabrasClave,
    filtrosAplicados,
    fuentesConsultadas,
    articulosSeleccionados,
    extracciones,
    comparacion,
    llmConfig,
  } = input;

  const referenciasSet = new Set<string>();
  for (const ext of extracciones) {
    if (ext.referenciaApa7) referenciasSet.add(ext.referenciaApa7);
  }
  const referenciasApa7 = Array.from(referenciasSet).sort((a, b) => a.localeCompare(b, 'es'));

  const fullTextCount = extracciones.filter((e) => e.alcanceAnalisis === 'texto_completo_pdf').length;
  const abstractOnlyCount = extracciones.filter((e) => e.alcanceAnalisis === 'resumen_y_metadatos').length;
  const metaOnlyCount = extracciones.filter((e) => e.alcanceAnalisis === 'solo_metadatos').length;

  const fuentesTexto =
    fuentesConsultadas && fuentesConsultadas.length > 0
      ? fuentesConsultadas.join(', ')
      : Array.from(new Set(articulosSeleccionados.map((a) => a.fuenteInformacion))).join(', ') ||
        'No especificado';

  const defaultHallazgos = extracciones
    .map((e) => {
      const res =
        e.campos.resultadosPrincipales.valor !== 'No especificado en el artículo'
          ? e.campos.resultadosPrincipales.valor
          : e.campos.conclusionesAutores.valor;
      return `${e.citaEnTextoApa7}: ${
        res !== 'No especificado en el artículo'
          ? res
          : 'No se reportaron resultados explícitos en el fragmento disponible.'
      }`;
    })
    .join('\n');

  const defaultSintesis = [
    ...comparacion.coincidencias,
    ...comparacion.complementariedadesYContradicciones,
  ].join(' ');

  const defaultInferencias =
    `${comparacion.notaSuficiencia} Las relaciones identificadas reflejan el estado de los ${extracciones.length} estudio(s) revisado(s) y no constituyen inferencias causales ni generalizaciones universales.`;

  let resumenEjecutivo =
    `Este documento integra el análisis de ${extracciones.length} artículo(s) científico(s) sobre el tema "${tema}", orientado a responder la pregunta de investigación: "${preguntaInvestigacion}". ` +
    `Del total analizado, ${fullTextCount} artículo(s) contaron con texto completo en PDF, ${abstractOnlyCount} se evaluaron con base en su resumen y metadatos, y ${metaOnlyCount} únicamente mediante metadatos bibliográficos. ` +
    `${comparacion.notaSuficiencia}`;

  let hallazgosArticulos = defaultHallazgos || 'No hay hallazgos extraídos disponibles.';
  let sintesisComparativa = defaultSintesis || 'No hay síntesis comparativa disponible.';
  let inferenciasAnaliticas = defaultInferencias;

  // Opcionalmente refinar redacción integradora con LLM manteniendo estricto apego a los datos
  if (extracciones.length > 0) {
    const systemPrompt = `Eres un editor científico en español que redacta únicamente el resumen ejecutivo y las conclusiones generales (separando estrictamente hallazgos de artículos, síntesis comparativa e inferencias analíticas).
Reglas absolutas:
- NO inventes datos, citas, resultados ni conclusiones fuera del material proporcionado.
- Cita siempre en formato APA 7 cuando menciones hallazgos.
- Devuelve un JSON con las claves: "resumenEjecutivo", "hallazgosArticulos", "sintesisComparativa", "inferenciasAnaliticas".`;

    const userPrompt = `Tema: ${tema}
Pregunta de investigación: ${preguntaInvestigacion}
Suficiencia de evidencia (Agente 3): ${comparacion.suficienciaEvidencia} - ${comparacion.notaSuficiencia}
Respuesta del Agente 3: ${comparacion.respuestaArgumentada}
Extracciones del Agente 2:
${extracciones
  .map(
    (e) =>
      `${e.citaEnTextoApa7} | Alcance: ${e.notaAlcance} | Resultados: ${e.campos.resultadosPrincipales.valor} | Conclusiones: ${e.campos.conclusionesAutores.valor}`
  )
  .join('\n')}`;

    const llmRes = await callLlmJson<Record<string, string>>(systemPrompt, userPrompt, llmConfig);
    if (llmRes.ok) {
      if (llmRes.data.resumenEjecutivo?.trim()) resumenEjecutivo = llmRes.data.resumenEjecutivo.trim();
      if (llmRes.data.hallazgosArticulos?.trim()) hallazgosArticulos = llmRes.data.hallazgosArticulos.trim();
      if (llmRes.data.sintesisComparativa?.trim()) sintesisComparativa = llmRes.data.sintesisComparativa.trim();
      if (llmRes.data.inferenciasAnaliticas?.trim()) inferenciasAnaliticas = llmRes.data.inferenciasAnaliticas.trim();
    }
  }

  const limitacionesList: string[] = [
    ...comparacion.vaciosYLimitaciones,
    `Cobertura documental: ${fullTextCount} estudio(s) analizado(s) a texto completo, ${abstractOnlyCount} únicamente con resumen y ${metaOnlyCount} solo con metadatos.`,
    'Los resultados dependen de la disponibilidad legal de metadatos y textos completos en las APIs académicas consultadas o en los PDF proporcionados por el usuario.',
  ];

  return {
    portada: {
      titulo: portada.titulo?.trim() || `Análisis de literatura científica: ${tema}`,
      autor: portada.autor?.trim() || 'No especificado',
      institucion: portada.institucion?.trim() || 'No especificado',
      fecha: portada.fecha?.trim() || new Date().toISOString().slice(0, 10),
    },
    tema,
    preguntaInvestigacion,
    resumenEjecutivo,
    metodologiaBusqueda: {
      palabrasClave: palabrasClave || tema,
      filtrosAplicados: formatFiltersText(filtrosAplicados),
      fuentesConsultadas: fuentesTexto,
      criteriosSeleccion: `Selección manual por parte del usuario de ${articulosSeleccionados.length} artículo(s) tras revisión de título, autores, año, resumen y estado de acceso.`,
    },
    resultadosAgente1: articulosSeleccionados,
    analisisIndividualAgente2: extracciones,
    comparacionAgente3: comparacion,
    conclusionesGenerales: {
      hallazgosArticulos,
      sintesisComparativa,
      inferenciasAnaliticas,
    },
    limitacionesAnalisis: limitacionesList.join('\n'),
    referenciasApa7,
  };
}
