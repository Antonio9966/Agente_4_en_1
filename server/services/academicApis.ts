import type {
  AcademicSource,
  AccessStatus,
  Agent1SearchResponse,
  ArticleSearchResult,
  SearchFilters,
  SourceStatus,
} from '../types.js';

const REQUEST_TIMEOUT_MS = 12000;

function stripHtmlAndXml(raw?: string | null): string {
  if (!raw) return 'No disponible';
  const cleaned = raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'No disponible';
}

function normalizeDoi(doi?: string | null): string {
  if (!doi) return 'No disponible';
  const cleaned = doi
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .trim();
  return cleaned || 'No disponible';
}

function normalizeTitleKey(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 90);
}

export function pickEarliestValidYear(candidates: Array<number | string | null | undefined>): number | null {
  const maxYear = new Date().getFullYear() + 1;
  const validYears: number[] = [];

  for (const cand of candidates) {
    if (typeof cand === 'number' && Number.isInteger(cand)) {
      if (cand >= 1800 && cand <= maxYear) validYears.push(cand);
    } else if (typeof cand === 'string') {
      const m = cand.match(/\b(18|19|20)\d{2}\b/);
      if (m) {
        const y = Number.parseInt(m[0], 10);
        if (y >= 1800 && y <= maxYear) validYears.push(y);
      }
    }
  }

  return validYears.length > 0 ? Math.min(...validYears) : null;
}

function normalizeLegalPdfCandidate(url?: string | null): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return '';
  const arxivMatch = trimmed.match(/^https?:\/\/arxiv\.org\/abs\/([^?#]+)/i);
  if (arxivMatch?.[1]) {
    return `https://arxiv.org/pdf/${arxivMatch[1]}.pdf`;
  }
  return trimmed;
}

function reconstructOpenAlexAbstract(invertedIndex?: Record<string, number[]> | null): string {
  if (!invertedIndex || typeof invertedIndex !== 'object') return 'No disponible';
  const entries = Object.entries(invertedIndex);
  if (entries.length === 0) return 'No disponible';

  let maxPos = 0;
  for (const [, positions] of entries) {
    for (const pos of positions) {
      if (pos > maxPos) maxPos = pos;
    }
  }
  const words = new Array<string>(maxPos + 1).fill('');
  for (const [word, positions] of entries) {
    for (const pos of positions) {
      if (pos >= 0 && pos <= maxPos) {
        words[pos] = word;
      }
    }
  }
  const joined = words.filter(Boolean).join(' ').trim();
  return joined || 'No disponible';
}

async function fetchJsonWithTimeout(url: string, headers: Record<string, string> = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'AgentesAnalisisCientifico/1.0 (academic-research-assistant)',
        Accept: 'application/json',
        ...headers,
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function searchOpenAlex(
  query: string,
  limit: number,
  politeEmail?: string
): Promise<{ items: ArticleSearchResult[]; status: SourceStatus }> {
  try {
    const params = new URLSearchParams({
      search: query,
      'per-page': String(limit),
    });
    if (politeEmail) {
      params.set('mailto', politeEmail);
    }

    const res = await fetchJsonWithTimeout(`https://api.openalex.org/works?${params.toString()}`);
    if (!res.ok) {
      return {
        items: [],
        status: {
          fuente: 'OpenAlex',
          estado: res.status === 429 ? 'limitado' : 'error',
          cantidad: 0,
          mensaje: `OpenAlex respondió con código HTTP ${res.status}.`,
        },
      };
    }

    const data = (await res.json()) as { results?: Array<Record<string, any>> };
    const results = data.results ?? [];

    const items: ArticleSearchResult[] = results.map((w, idx) => {
      const doi = normalizeDoi(w.doi);
      const authors: string[] = Array.isArray(w.authorships)
        ? w.authorships
            .map((a: any) => a?.author?.display_name)
            .filter((n: unknown): n is string => typeof n === 'string' && n.trim().length > 0)
        : [];

      const year = pickEarliestValidYear([w.publication_year, w.publication_date]);
      const venue =
        w.primary_location?.source?.display_name ||
        w.host_venue?.display_name ||
        'No disponible';

      const oaLocationPdf = Array.isArray(w.oa_locations)
        ? w.oa_locations.find((loc: any) => typeof loc?.pdf_url === 'string' && loc.pdf_url.trim())?.pdf_url
        : '';
      const oaUrlFallback =
        typeof w.open_access?.oa_url === 'string' &&
        (/\.pdf(\?|$)/i.test(w.open_access.oa_url) || /arxiv\.org\/(abs|pdf)\//i.test(w.open_access.oa_url))
          ? w.open_access.oa_url
          : '';

      const pdfUrl: string = normalizeLegalPdfCandidate(
        w.best_oa_location?.pdf_url ||
          w.primary_location?.pdf_url ||
          oaLocationPdf ||
          oaUrlFallback ||
          ''
      );

      const landingPage: string =
        w.primary_location?.landing_page_url ||
        w.open_access?.oa_url ||
        (doi !== 'No disponible' ? `https://doi.org/${doi}` : w.id || '');

      const isOa = Boolean(w.open_access?.is_oa);
      let estadoAcceso: AccessStatus = 'enlace no disponible';
      if (isOa && (pdfUrl || landingPage)) {
        estadoAcceso = 'abierto';
      } else if (landingPage) {
        estadoAcceso = 'restringido';
      }

      return {
        id: `oa_${w.id ? String(w.id).split('/').pop() : idx}`,
        titulo: w.display_name || w.title || 'No disponible',
        autores: authors.length > 0 ? authors : ['No disponible'],
        anio: year,
        anioTexto: year !== null ? String(year) : 'No disponible',
        revistaOFuente: venue,
        resumen: reconstructOpenAlexAbstract(w.abstract_inverted_index),
        doi,
        enlacePagina: landingPage || 'No disponible',
        enlacePdfLegal: isOa && pdfUrl ? pdfUrl : 'No disponible',
        fuenteInformacion: 'OpenAlex',
        estadoAcceso,
        volumen: w.biblio?.volume || undefined,
        numero: w.biblio?.issue || undefined,
        paginas:
          w.biblio?.first_page && w.biblio?.last_page
            ? `${w.biblio.first_page}-${w.biblio.last_page}`
            : w.biblio?.first_page || undefined,
      };
    });

    return {
      items,
      status: {
        fuente: 'OpenAlex',
        estado: items.length > 0 ? 'ok' : 'sin_resultados',
        cantidad: items.length,
        mensaje:
          items.length > 0
            ? `${items.length} resultados recuperados desde OpenAlex.`
            : 'Sin coincidencias en OpenAlex.',
      },
    };
  } catch (err: any) {
    return {
      items: [],
      status: {
        fuente: 'OpenAlex',
        estado: 'error',
        cantidad: 0,
        mensaje: `No se pudo consultar OpenAlex: ${err?.message || 'error de red'}.`,
      },
    };
  }
}

async function searchCrossref(
  query: string,
  limit: number,
  politeEmail?: string
): Promise<{ items: ArticleSearchResult[]; status: SourceStatus }> {
  try {
    const params = new URLSearchParams({
      query,
      rows: String(limit),
    });
    if (politeEmail) {
      params.set('mailto', politeEmail);
    }

    const res = await fetchJsonWithTimeout(`https://api.crossref.org/works?${params.toString()}`);
    if (!res.ok) {
      return {
        items: [],
        status: {
          fuente: 'Crossref',
          estado: res.status === 429 ? 'limitado' : 'error',
          cantidad: 0,
          mensaje: `Crossref respondió con código HTTP ${res.status}.`,
        },
      };
    }

    const data = (await res.json()) as { message?: { items?: Array<Record<string, any>> } };
    const rawItems = data.message?.items ?? [];

    const items: ArticleSearchResult[] = rawItems.map((item, idx) => {
      const doi = normalizeDoi(item.DOI);
      const title = Array.isArray(item.title) && item.title[0] ? stripHtmlAndXml(item.title[0]) : 'No disponible';
      const authors: string[] = Array.isArray(item.author)
        ? item.author
            .map((a: any) => [a.given, a.family].filter(Boolean).join(' ').trim())
            .filter(Boolean)
        : [];

      // Priorizar la fecha original más temprana entre publicación impresa, issued y online
      const year = pickEarliestValidYear([
        item['published-print']?.['date-parts']?.[0]?.[0],
        item.issued?.['date-parts']?.[0]?.[0],
        item.published?.['date-parts']?.[0]?.[0],
        item['published-online']?.['date-parts']?.[0]?.[0],
      ]);

      const venue =
        (Array.isArray(item['container-title']) && item['container-title'][0]) ||
        item.publisher ||
        'No disponible';

      const landingPage = item.URL || (doi !== 'No disponible' ? `https://doi.org/${doi}` : 'No disponible');

      // Verificar si hay enlace PDF declarado con licencia abierta en Crossref
      const links: Array<Record<string, any>> = Array.isArray(item.link) ? item.link : [];
      const pdfLinkObj = links.find(
        (l) => typeof l['content-type'] === 'string' && l['content-type'].toLowerCase().includes('pdf') && l.URL
      );
      const licenses: Array<Record<string, any>> = Array.isArray(item.license) ? item.license : [];
      const hasOpenLicense = licenses.some((lic) => {
        const u = String(lic.URL || '').toLowerCase();
        return u.includes('creativecommons.org') || u.includes('open') || u.includes('cc-by');
      });

      const legalPdf = hasOpenLicense && pdfLinkObj?.URL ? String(pdfLinkObj.URL) : 'No disponible';
      let estadoAcceso: AccessStatus = 'enlace no disponible';
      if (legalPdf !== 'No disponible') {
        estadoAcceso = 'abierto';
      } else if (landingPage !== 'No disponible') {
        estadoAcceso = hasOpenLicense ? 'abierto' : 'restringido';
      }

      return {
        id: `cr_${doi !== 'No disponible' ? doi.replace(/[^a-zA-Z0-9]/g, '_') : idx}`,
        titulo: title,
        autores: authors.length > 0 ? authors : ['No disponible'],
        anio: year,
        anioTexto: year !== null ? String(year) : 'No disponible',
        revistaOFuente: venue,
        resumen: stripHtmlAndXml(item.abstract),
        doi,
        enlacePagina: landingPage,
        enlacePdfLegal: legalPdf,
        fuenteInformacion: 'Crossref',
        estadoAcceso,
        volumen: item.volume || undefined,
        numero: item.issue || undefined,
        paginas: item.page || undefined,
      };
    });

    return {
      items,
      status: {
        fuente: 'Crossref',
        estado: items.length > 0 ? 'ok' : 'sin_resultados',
        cantidad: items.length,
        mensaje:
          items.length > 0
            ? `${items.length} resultados recuperados desde Crossref.`
            : 'Sin coincidencias en Crossref.',
      },
    };
  } catch (err: any) {
    return {
      items: [],
      status: {
        fuente: 'Crossref',
        estado: 'error',
        cantidad: 0,
        mensaje: `No se pudo consultar Crossref: ${err?.message || 'error de red'}.`,
      },
    };
  }
}

async function searchEuropePmc(
  query: string,
  limit: number
): Promise<{ items: ArticleSearchResult[]; status: SourceStatus }> {
  try {
    const params = new URLSearchParams({
      query,
      resultType: 'core',
      pageSize: String(limit),
      format: 'json',
    });

    const res = await fetchJsonWithTimeout(
      `https://www.ebi.ac.uk/europepmc/webservices/rest/search?${params.toString()}`
    );
    if (!res.ok) {
      return {
        items: [],
        status: {
          fuente: 'Europe PMC',
          estado: res.status === 429 ? 'limitado' : 'error',
          cantidad: 0,
          mensaje: `Europe PMC respondió con código HTTP ${res.status}.`,
        },
      };
    }

    const data = (await res.json()) as { resultList?: { result?: Array<Record<string, any>> } };
    const rawItems = data.resultList?.result ?? [];

    const items: ArticleSearchResult[] = rawItems.map((item, idx) => {
      const doi = normalizeDoi(item.doi);
      const pmcid = item.pmcid ? String(item.pmcid) : '';
      const pmid = item.pmid ? String(item.pmid) : '';
      const year = pickEarliestValidYear([item.pubYear, item.firstPublicationDate]);

      const authors: string[] = Array.isArray(item.authorList?.author)
        ? item.authorList.author
            .map((a: any) => a.fullName || [a.firstName, a.lastName].filter(Boolean).join(' ').trim())
            .filter(Boolean)
        : typeof item.authorString === 'string' && item.authorString.trim()
          ? item.authorString.split(',').map((s: string) => s.trim()).filter(Boolean)
          : [];

      const fullTextUrls: Array<Record<string, any>> = Array.isArray(item.fullTextUrlList?.fullTextUrl)
        ? item.fullTextUrlList.fullTextUrl
        : [];
      const pdfCandidate = fullTextUrls.find(
        (u) => String(u.documentStyle || '').toLowerCase() === 'pdf' && String(u.availabilityCode || '').toUpperCase() === 'OA'
      );
      const isOa = String(item.isOpenAccess || '').toUpperCase() === 'Y';
      const pdfUrl =
        pdfCandidate?.url ||
        (isOa && pmcid ? `https://europepmc.org/backend/ptpmcrender.fcgi?accid=${pmcid}&blobtype=pdf` : '');

      const landingPage = pmcid
        ? `https://europepmc.org/article/PMC/${pmcid.replace(/^PMC/i, '')}`
        : pmid
          ? `https://europepmc.org/article/MED/${pmid}`
          : doi !== 'No disponible'
            ? `https://doi.org/${doi}`
            : 'No disponible';

      let estadoAcceso: AccessStatus = 'enlace no disponible';
      if (isOa || pdfUrl) {
        estadoAcceso = 'abierto';
      } else if (landingPage !== 'No disponible') {
        estadoAcceso = 'restringido';
      }

      return {
        id: `epmc_${item.id || idx}`,
        titulo: stripHtmlAndXml(item.title),
        autores: authors.length > 0 ? authors : ['No disponible'],
        anio: year,
        anioTexto: year !== null ? String(year) : 'No disponible',
        revistaOFuente: item.journalInfo?.journal?.title || item.journalTitle || 'No disponible',
        resumen: stripHtmlAndXml(item.abstractText),
        doi,
        enlacePagina: landingPage,
        enlacePdfLegal: pdfUrl || 'No disponible',
        fuenteInformacion: 'Europe PMC',
        estadoAcceso,
        volumen: item.journalInfo?.volume || undefined,
        numero: item.journalInfo?.issue || undefined,
        paginas: item.pageInfo || undefined,
      };
    });

    return {
      items,
      status: {
        fuente: 'Europe PMC',
        estado: items.length > 0 ? 'ok' : 'sin_resultados',
        cantidad: items.length,
        mensaje:
          items.length > 0
            ? `${items.length} resultados recuperados desde Europe PMC.`
            : 'Sin coincidencias en Europe PMC.',
      },
    };
  } catch (err: any) {
    return {
      items: [],
      status: {
        fuente: 'Europe PMC',
        estado: 'error',
        cantidad: 0,
        mensaje: `No se pudo consultar Europe PMC: ${err?.message || 'error de red'}.`,
      },
    };
  }
}

async function searchSemanticScholar(
  query: string,
  limit: number,
  apiKey?: string
): Promise<{ items: ArticleSearchResult[]; status: SourceStatus }> {
  try {
    const params = new URLSearchParams({
      query,
      limit: String(limit),
      fields: 'paperId,title,authors,year,venue,abstract,externalIds,url,isOpenAccess,openAccessPdf',
    });

    const headers: Record<string, string> = {};
    if (apiKey) headers['x-api-key'] = apiKey;

    const res = await fetchJsonWithTimeout(
      `https://api.semanticscholar.org/graph/v1/paper/search?${params.toString()}`,
      headers
    );

    if (!res.ok) {
      return {
        items: [],
        status: {
          fuente: 'Semantic Scholar',
          estado: res.status === 429 ? 'limitado' : 'error',
          cantidad: 0,
          mensaje:
            res.status === 429
              ? 'Semantic Scholar limitó temporalmente las solicitudes sin clave API (HTTP 429).'
              : `Semantic Scholar respondió con código HTTP ${res.status}.`,
        },
      };
    }

    const data = (await res.json()) as { data?: Array<Record<string, any>> };
    const rawItems = data.data ?? [];

    const items: ArticleSearchResult[] = rawItems.map((p, idx) => {
      const doi = normalizeDoi(p.externalIds?.DOI);
      const authors: string[] = Array.isArray(p.authors)
        ? p.authors.map((a: any) => a.name).filter((n: unknown): n is string => typeof n === 'string' && n.trim().length > 0)
        : [];
      const year = typeof p.year === 'number' ? p.year : null;
      const pdfUrl = p.openAccessPdf?.url ? String(p.openAccessPdf.url) : '';
      const landingPage = p.url || (doi !== 'No disponible' ? `https://doi.org/${doi}` : 'No disponible');
      const isOa = Boolean(p.isOpenAccess || pdfUrl);

      let estadoAcceso: AccessStatus = 'enlace no disponible';
      if (isOa) estadoAcceso = 'abierto';
      else if (landingPage !== 'No disponible') estadoAcceso = 'restringido';

      return {
        id: `s2_${p.paperId || idx}`,
        titulo: p.title || 'No disponible',
        autores: authors.length > 0 ? authors : ['No disponible'],
        anio: year,
        anioTexto: year !== null ? String(year) : 'No disponible',
        revistaOFuente: p.venue || 'No disponible',
        resumen: p.abstract ? String(p.abstract).trim() : 'No disponible',
        doi,
        enlacePagina: landingPage,
        enlacePdfLegal: pdfUrl || 'No disponible',
        fuenteInformacion: 'Semantic Scholar',
        estadoAcceso,
      };
    });

    return {
      items,
      status: {
        fuente: 'Semantic Scholar',
        estado: items.length > 0 ? 'ok' : 'sin_resultados',
        cantidad: items.length,
        mensaje:
          items.length > 0
            ? `${items.length} resultados recuperados desde Semantic Scholar.`
            : 'Sin coincidencias en Semantic Scholar.',
      },
    };
  } catch (err: any) {
    return {
      items: [],
      status: {
        fuente: 'Semantic Scholar',
        estado: 'error',
        cantidad: 0,
        mensaje: `No se pudo consultar Semantic Scholar: ${err?.message || 'error de red'}.`,
      },
    };
  }
}

async function searchPubMed(
  query: string,
  limit: number
): Promise<{ items: ArticleSearchResult[]; status: SourceStatus }> {
  try {
    const searchParams = new URLSearchParams({
      db: 'pubmed',
      term: query,
      retmax: String(limit),
      retmode: 'json',
    });
    const searchRes = await fetchJsonWithTimeout(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${searchParams.toString()}`
    );
    if (!searchRes.ok) {
      return {
        items: [],
        status: {
          fuente: 'PubMed',
          estado: searchRes.status === 429 ? 'limitado' : 'error',
          cantidad: 0,
          mensaje: `PubMed respondió con código HTTP ${searchRes.status}.`,
        },
      };
    }

    const searchData = (await searchRes.json()) as { esearchresult?: { idlist?: string[] } };
    const ids = searchData.esearchresult?.idlist ?? [];
    if (ids.length === 0) {
      return {
        items: [],
        status: {
          fuente: 'PubMed',
          estado: 'sin_resultados',
          cantidad: 0,
          mensaje: 'Sin coincidencias en PubMed.',
        },
      };
    }

    const summaryParams = new URLSearchParams({
      db: 'pubmed',
      id: ids.join(','),
      retmode: 'json',
    });
    const summaryRes = await fetchJsonWithTimeout(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?${summaryParams.toString()}`
    );
    if (!summaryRes.ok) {
      return {
        items: [],
        status: {
          fuente: 'PubMed',
          estado: 'error',
          cantidad: 0,
          mensaje: `PubMed esummary respondió HTTP ${summaryRes.status}.`,
        },
      };
    }

    const summaryData = (await summaryRes.json()) as { result?: Record<string, any> };
    const resultObj = summaryData.result ?? {};

    const items: ArticleSearchResult[] = ids
      .map((pmid) => {
        const rec = resultObj[pmid];
        if (!rec) return null;

        const authors: string[] = Array.isArray(rec.authors)
          ? rec.authors.map((a: any) => a.name).filter(Boolean)
          : [];
        const year = pickEarliestValidYear([rec.pubdate, rec.epubdate, rec.sortpubdate]);

        const articleIds: Array<{ idtype: string; value: string }> = Array.isArray(rec.articleids)
          ? rec.articleids
          : [];
        const doiEntry = articleIds.find((x) => x.idtype === 'doi');
        const pmcEntry = articleIds.find((x) => x.idtype === 'pmc');
        const doi = normalizeDoi(doiEntry?.value);
        const pmcid = pmcEntry?.value || '';

        const landingPage = `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
        const pdfUrl = pmcid ? `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/pdf/` : 'No disponible';

        return {
          id: `pm_${pmid}`,
          titulo: stripHtmlAndXml(rec.title),
          autores: authors.length > 0 ? authors : ['No disponible'],
          anio: year,
          anioTexto: year !== null ? String(year) : 'No disponible',
          revistaOFuente: rec.fulljournalname || rec.source || 'No disponible',
          resumen: 'No disponible',
          doi,
          enlacePagina: landingPage,
          enlacePdfLegal: pdfUrl,
          fuenteInformacion: 'PubMed' as AcademicSource,
          estadoAcceso: (pmcid ? 'abierto' : 'restringido') as AccessStatus,
          volumen: rec.volume || undefined,
          numero: rec.issue || undefined,
          paginas: rec.pages || undefined,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    return {
      items,
      status: {
        fuente: 'PubMed',
        estado: items.length > 0 ? 'ok' : 'sin_resultados',
        cantidad: items.length,
        mensaje:
          items.length > 0
            ? `${items.length} resultados recuperados desde PubMed.`
            : 'Sin coincidencias en PubMed.',
      },
    };
  } catch (err: any) {
    return {
      items: [],
      status: {
        fuente: 'PubMed',
        estado: 'error',
        cantidad: 0,
        mensaje: `No se pudo consultar PubMed: ${err?.message || 'error de red'}.`,
      },
    };
  }
}

function mergeAndDeduplicate(articles: ArticleSearchResult[]): ArticleSearchResult[] {
  const byKey = new Map<string, ArticleSearchResult>();

  for (const art of articles) {
    const doiKey = art.doi !== 'No disponible' ? `doi:${art.doi.toLowerCase()}` : '';
    const titleKey = art.titulo !== 'No disponible' ? `title:${normalizeTitleKey(art.titulo)}` : '';
    const existing = (doiKey && byKey.get(doiKey)) || (titleKey && byKey.get(titleKey));

    if (!existing) {
      const clone: ArticleSearchResult = { ...art, fuentesSecundarias: [] };
      if (doiKey) byKey.set(doiKey, clone);
      if (titleKey) byKey.set(titleKey, clone);
      if (!doiKey && !titleKey) byKey.set(art.id, clone);
      continue;
    }

    // Combinar metadatos faltantes de fuentes legítimas sin sobrescribir datos válidos
    if (existing.fuenteInformacion !== art.fuenteInformacion) {
      const sec = new Set(existing.fuentesSecundarias ?? []);
      sec.add(art.fuenteInformacion);
      existing.fuentesSecundarias = Array.from(sec);
    }
    if (existing.resumen === 'No disponible' && art.resumen !== 'No disponible') {
      existing.resumen = art.resumen;
    }
    if (existing.doi === 'No disponible' && art.doi !== 'No disponible') {
      existing.doi = art.doi;
    }
    if (existing.enlacePdfLegal === 'No disponible' && art.enlacePdfLegal !== 'No disponible') {
      existing.enlacePdfLegal = art.enlacePdfLegal;
      existing.estadoAcceso = 'abierto';
    }
    if (existing.autores[0] === 'No disponible' && art.autores[0] !== 'No disponible') {
      existing.autores = art.autores;
    }
    if (existing.revistaOFuente === 'No disponible' && art.revistaOFuente !== 'No disponible') {
      existing.revistaOFuente = art.revistaOFuente;
    }
    if (art.anio !== null && (existing.anio === null || art.anio < existing.anio)) {
      existing.anio = art.anio;
      existing.anioTexto = art.anioTexto;
    }
  }

  // Devolver lista única manteniendo el orden de aparición
  const seenIds = new Set<string>();
  const unique: ArticleSearchResult[] = [];
  for (const item of byKey.values()) {
    if (!seenIds.has(item.id)) {
      seenIds.add(item.id);
      unique.push(item);
    }
  }
  return unique;
}

export function applySearchFilters(
  articles: ArticleSearchResult[],
  filters?: SearchFilters
): ArticleSearchResult[] {
  if (!filters) return articles;
  return articles.filter((art) => {
    if (filters.anioDesde && (art.anio === null || art.anio < filters.anioDesde)) return false;
    if (filters.anioHasta && (art.anio === null || art.anio > filters.anioHasta)) return false;
    if (filters.autor && filters.autor.trim()) {
      const needle = filters.autor.trim().toLowerCase();
      const matchAuthor = art.autores.some((a) => a.toLowerCase().includes(needle));
      if (!matchAuthor) return false;
    }
    if (filters.fuentes && filters.fuentes.length > 0) {
      const allSources = [art.fuenteInformacion, ...(art.fuentesSecundarias ?? [])];
      if (!filters.fuentes.some((f) => allSources.includes(f))) return false;
    }
    if (filters.soloTextoCompleto) {
      if (art.estadoAcceso !== 'abierto' && art.enlacePdfLegal === 'No disponible') return false;
    }
    return true;
  });
}

export async function runAgent1Search(
  query: string,
  selectedSources?: AcademicSource[],
  filters?: SearchFilters,
  limitPerSource = 10
): Promise<Agent1SearchResponse> {
  const cleanQuery = query.trim();
  const sourcesToQuery: AcademicSource[] =
    selectedSources && selectedSources.length > 0
      ? selectedSources
      : ['OpenAlex', 'Crossref', 'Europe PMC', 'Semantic Scholar', 'PubMed'];

  const politeEmail = process.env.ACADEMIC_POLITE_EMAIL?.trim() || undefined;
  const s2Key = process.env.SEMANTIC_SCHOLAR_API_KEY?.trim() || undefined;

  const tasks: Promise<{ items: ArticleSearchResult[]; status: SourceStatus }>[] = [];

  for (const src of sourcesToQuery) {
    if (src === 'OpenAlex') tasks.push(searchOpenAlex(cleanQuery, limitPerSource, politeEmail));
    else if (src === 'Crossref') tasks.push(searchCrossref(cleanQuery, limitPerSource, politeEmail));
    else if (src === 'Europe PMC') tasks.push(searchEuropePmc(cleanQuery, limitPerSource));
    else if (src === 'Semantic Scholar') tasks.push(searchSemanticScholar(cleanQuery, limitPerSource, s2Key));
    else if (src === 'PubMed') tasks.push(searchPubMed(cleanQuery, limitPerSource));
  }

  const settled = await Promise.all(tasks);
  const allRaw = settled.flatMap((s) => s.items);
  const estadoFuentes = settled.map((s) => s.status);

  const deduplicated = mergeAndDeduplicate(allRaw);
  const filtered = applySearchFilters(deduplicated, filters);

  return {
    consulta: cleanQuery,
    articulos: filtered,
    estadoFuentes,
    totalSinFiltrar: deduplicated.length,
    marcaTiempo: new Date().toISOString(),
  };
}
