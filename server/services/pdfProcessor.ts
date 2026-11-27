import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { PdfExtractionPayload, PdfPageContent } from '../types.js';

const PRIVATE_UPLOAD_DIR = path.resolve(process.cwd(), 'server', '.private_uploads');

const SECTION_PATTERNS: Array<{ regex: RegExp; label: string }> = [
  { regex: /^(?:\d+\.?\s*)?(?:abstract|resumen|summary)\b/i, label: 'Resumen / Abstract' },
  { regex: /^(?:\d+\.?\s*)?(?:introduction|introducci[oó]n|background|antecedentes)\b/i, label: 'Introducción' },
  {
    regex: /^(?:\d+\.?\s*)?(?:theoretical\s+framework|literature\s+review|marco\s+te[oó]rico|revisi[oó]n\s+de\s+literatura|estado\s+del\s+arte)\b/i,
    label: 'Marco teórico / Revisión',
  },
  {
    regex: /^(?:\d+\.?\s*)?(?:methods?|methodology|materials?\s+and\s+methods?|metodolog[ií]a|m[eé]todos?|materiales\s+y\s+m[eé]todos?|dise[nñ]o\s+metodol[oó]gico)\b/i,
    label: 'Metodología / Métodos',
  },
  { regex: /^(?:\d+\.?\s*)?(?:results?|findings?|resultados?|hallazgos)\b/i, label: 'Resultados' },
  { regex: /^(?:\d+\.?\s*)?(?:discussion|discusi[oó]n|an[aá]lisis)\b/i, label: 'Discusión' },
  { regex: /^(?:\d+\.?\s*)?(?:limitations?|limitaciones)\b/i, label: 'Limitaciones' },
  { regex: /^(?:\d+\.?\s*)?(?:conclusions?|conclusiones?|final\s+remarks)\b/i, label: 'Conclusiones' },
  {
    regex: /^(?:\d+\.?\s*)?(?:future\s+work|recommendations?|trabajo\s+futuro|recomendaciones)\b/i,
    label: 'Recomendaciones / Trabajo futuro',
  },
  { regex: /^(?:\d+\.?\s*)?(?:references|bibliography|referencias|bibliograf[ií]a)\b/i, label: 'Referencias' },
];

const pdfStore = new Map<string, PdfExtractionPayload>();

async function ensurePrivateDir(): Promise<void> {
  await fs.mkdir(PRIVATE_UPLOAD_DIR, { recursive: true });
}

function detectSectionInPage(text: string, previousSection: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines.slice(0, 25)) {
    if (line.length > 90) continue;
    for (const pat of SECTION_PATTERNS) {
      if (pat.regex.test(line)) {
        return pat.label;
      }
    }
  }
  return previousSection;
}

export async function parsePdfBuffer(buffer: Buffer, fileName: string): Promise<PdfExtractionPayload> {
  // Importación dinámica de pdfjs-dist legacy para compatibilidad con Node.js ESM
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    verbosity: 0,
    useSystemFonts: true,
  });

  const pdfDoc = await loadingTask.promise;
  const pageCount = pdfDoc.numPages;
  const pages: PdfPageContent[] = [];
  let currentSection = 'Inicio / Encabezado';
  let totalAlphaChars = 0;

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    let pageText = '';
    let lastY: number | null = null;

    for (const item of textContent.items as Array<any>) {
      if (typeof item.str !== 'string') continue;
      const y = Array.isArray(item.transform) ? item.transform[5] : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 4) {
        pageText += '\n';
      } else if (pageText.length > 0 && !pageText.endsWith(' ') && !pageText.endsWith('\n')) {
        pageText += ' ';
      }
      pageText += item.str;
      if (item.hasEOL) {
        pageText += '\n';
      }
      if (y !== null) lastY = y;
    }

    const cleanedPage = pageText
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    currentSection = detectSectionInPage(cleanedPage, pageNum === 1 ? 'Inicio / Encabezado' : currentSection);
    const alphaOnly = cleanedPage.replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/g, '');
    totalAlphaChars += alphaOnly.length;

    pages.push({
      pageNumber: pageNum,
      text: cleanedPage,
      detectedSection: currentSection,
    });
  }

  const totalChars = pages.reduce((acc, p) => acc + p.text.length, 0);
  const avgAlphaPerPage = pageCount > 0 ? totalAlphaChars / pageCount : 0;
  const isScannedOrUnreadable = pageCount === 0 || totalChars < 120 || avgAlphaPerPage < 40;

  const uploadId = `pdf_${crypto.randomUUID()}`;

  // Inferir título tentativo de las primeras líneas de la página 1 si es legible
  let inferredTitle: string | undefined;
  if (!isScannedOrUnreadable && pages[0]?.text) {
    const firstLines = pages[0].text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 15 && l.length < 180 && !/^http|^doi:|^vol\.|^issn/i.test(l));
    if (firstLines[0]) {
      inferredTitle = firstLines[0];
    }
  }

  const payload: PdfExtractionPayload = {
    uploadId,
    fileName,
    pageCount,
    totalChars,
    isScannedOrUnreadable,
    message: isScannedOrUnreadable
      ? 'El archivo PDF parece estar escaneado o compuesto por imágenes sin capa de texto legible. No es posible extraer la información de forma confiable sin OCR. Por favor, cargue una versión con texto seleccionable o procesada previamente con OCR.'
      : `PDF procesado correctamente: ${pageCount} página(s) y ${totalChars} caracteres extraídos con referencia por página.`,
    pages,
    inferredTitle,
  };

  pdfStore.set(uploadId, payload);

  // Guardar copia privada temporal fuera de carpetas públicas (sin exponer por HTTP estático)
  try {
    await ensurePrivateDir();
    await fs.writeFile(path.join(PRIVATE_UPLOAD_DIR, `${uploadId}.pdf`), buffer);
  } catch {
    // Si no se puede escribir en disco, se conserva en memoria de sesión de forma segura
  }

  return payload;
}

export function getStoredPdf(uploadId: string): PdfExtractionPayload | undefined {
  return pdfStore.get(uploadId);
}

export async function removeStoredPdf(uploadId: string): Promise<void> {
  pdfStore.delete(uploadId);
  try {
    await fs.unlink(path.join(PRIVATE_UPLOAD_DIR, `${uploadId}.pdf`));
  } catch {
    // Ignorar si no existe en disco
  }
}

export async function tryFetchOpenAccessPdf(
  pdfUrl: string,
  fallbackName: string
): Promise<PdfExtractionPayload | null> {
  if (!pdfUrl || pdfUrl === 'No disponible' || !/^https?:\/\//i.test(pdfUrl)) {
    return null;
  }

  // Normalizar enlaces de arXiv abs -> pdf
  const arxivMatch = pdfUrl.trim().match(/^https?:\/\/arxiv\.org\/abs\/([^?#]+)/i);
  const targetUrl = arxivMatch?.[1] ? `https://arxiv.org/pdf/${arxivMatch[1]}.pdf` : pdfUrl.trim();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 14000);
  try {
    const fetchPdfBinary = async (urlToFetch: string) => {
      const res = await fetch(urlToFetch, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': 'AgentesAnalisisCientifico/1.0 (open-access-reader)',
          Accept: 'application/pdf,application/octet-stream;q=0.9,text/html;q=0.5,*/*;q=0.3',
        },
      });
      if (!res.ok) return null;
      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const isPdfMagic = buffer.subarray(0, 5).toString('ascii') === '%PDF-';
      return { resUrl: res.url || urlToFetch, contentType, buffer, isPdfMagic };
    };

    const first = await fetchPdfBinary(targetUrl);
    if (!first) return null;
    if (first.isPdfMagic) {
      return await parsePdfBuffer(first.buffer, fallbackName);
    }

    // Si es una página HTML abierta de un visor OJS/DSpace/SciELO, buscar meta citation_pdf_url o enlace directo al PDF
    if (first.contentType.includes('html') && first.buffer.length < 600_000) {
      const html = first.buffer.toString('utf8');
      const metaMatch =
        html.match(/<meta[^>]+name=["']citation_pdf_url["'][^>]+content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']citation_pdf_url["']/i);
      const iframeMatch = html.match(/<(?:iframe|embed)[^>]+src=["']([^"']+\.pdf[^"']*)["']/i);
      const ojsDownloadMatch = html.match(/href=["']([^"']*\/article\/download\/[^"']+)["']/i);

      const resolvedCandidate = metaMatch?.[1] || iframeMatch?.[1] || ojsDownloadMatch?.[1];
      if (resolvedCandidate) {
        const nextUrl = new URL(resolvedCandidate, first.resUrl).href;
        if (nextUrl !== first.resUrl) {
          const second = await fetchPdfBinary(nextUrl);
          if (second?.isPdfMagic) {
            return await parsePdfBuffer(second.buffer, fallbackName);
          }
        }
      }
    }

    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function tryFetchEuropePmcFullTextXml(
  landingPage: string,
  pdfUrl: string
): Promise<PdfPageContent[] | null> {
  const combined = `${landingPage} ${pdfUrl}`;
  const pmcMatch = combined.match(/\bPMC(\d{4,10})\b/i);
  if (!pmcMatch?.[1]) return null;

  const pmcid = `PMC${pmcMatch[1]}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`https://www.ebi.ac.uk/europepmc/webservices/rest/${pmcid}/fullTextXML`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'AgentesAnalisisCientifico/1.0 (europepmc-xml-reader)',
        Accept: 'application/xml,text/xml',
      },
    });
    if (!res.ok) return null;
    const xml = await res.text();
    if (!xml.includes('<body') && !xml.includes('<sec')) return null;

    // Extraer secciones de texto XML JATS de forma limpia
    const secMatches = Array.from(xml.matchAll(/<sec\b[^>]*>([\s\S]*?)<\/sec>/gi));
    const blocks: PdfPageContent[] = [];

    const stripTags = (s: string) =>
      s
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/\s+/g, ' ')
        .trim();

    if (secMatches.length > 0) {
      secMatches.forEach((m, idx) => {
        const inner = m[1];
        const titleMatch = inner.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const secTitle = titleMatch ? stripTags(titleMatch[1]) : `Sección ${idx + 1}`;
        const text = stripTags(inner.replace(/<title[^>]*>[\s\S]*?<\/title>/i, ''));
        if (text.length > 40 && !/^references$/i.test(secTitle)) {
          blocks.push({
            pageNumber: idx + 1,
            text,
            detectedSection: secTitle,
          });
        }
      });
    } else {
      const bodyMatch = xml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      const bodyText = bodyMatch ? stripTags(bodyMatch[1]) : '';
      if (bodyText.length > 120) {
        blocks.push({
          pageNumber: 1,
          text: bodyText,
          detectedSection: 'Texto completo XML (Europe PMC)',
        });
      }
    }

    return blocks.length > 0 ? blocks : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
