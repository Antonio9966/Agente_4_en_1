import type { ArticleSearchResult } from '../types.js';

function formatSingleAuthorApa7(fullName: string): string {
  const clean = fullName.trim().replace(/\s+/g, ' ');
  if (!clean || clean === 'No disponible') return '';

  // Si ya viene en formato "Apellido, N."
  if (clean.includes(',')) {
    const [last, rest] = clean.split(',').map((s) => s.trim());
    if (!rest) return last;
    const initials = rest
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => `${part[0].toUpperCase()}.`)
      .join(' ');
    return `${last}, ${initials}`;
  }

  const parts = clean.split(' ');
  if (parts.length === 1) return parts[0];

  const lastName = parts[parts.length - 1];
  const givenNames = parts.slice(0, -1);
  const initials = givenNames
    .filter(Boolean)
    .map((n) => `${n[0].toUpperCase()}.`)
    .join(' ');
  return `${lastName}, ${initials}`;
}

function extractLastName(fullName: string): string {
  const clean = fullName.trim();
  if (!clean || clean === 'No disponible') return '';
  if (clean.includes(',')) {
    return clean.split(',')[0].trim();
  }
  const parts = clean.split(/\s+/);
  return parts[parts.length - 1];
}

export function formatInTextCitationApa7(article: Pick<ArticleSearchResult, 'autores' | 'anioTexto' | 'titulo'>): string {
  const year = article.anioTexto && article.anioTexto !== 'No disponible' ? article.anioTexto : 's. f.';
  const validAuthors = article.autores.filter((a) => a && a !== 'No disponible');

  if (validAuthors.length === 0) {
    const shortTitle = article.titulo.split(/\s+/).slice(0, 4).join(' ');
    return `("${shortTitle}...", ${year})`;
  }
  if (validAuthors.length === 1) {
    return `(${extractLastName(validAuthors[0])}, ${year})`;
  }
  if (validAuthors.length === 2) {
    return `(${extractLastName(validAuthors[0])} y ${extractLastName(validAuthors[1])}, ${year})`;
  }
  return `(${extractLastName(validAuthors[0])} et al., ${year})`;
}

export function formatReferenceApa7(article: ArticleSearchResult): string {
  const validAuthors = article.autores.filter((a) => a && a !== 'No disponible');
  let authorsPart = '';

  if (validAuthors.length === 0) {
    authorsPart = '';
  } else if (validAuthors.length <= 20) {
    const formatted = validAuthors.map(formatSingleAuthorApa7).filter(Boolean);
    if (formatted.length === 1) {
      authorsPart = formatted[0];
    } else if (formatted.length > 1) {
      authorsPart = `${formatted.slice(0, -1).join(', ')}, & ${formatted[formatted.length - 1]}`;
    }
  } else {
    const first19 = validAuthors.slice(0, 19).map(formatSingleAuthorApa7);
    const last = formatSingleAuthorApa7(validAuthors[validAuthors.length - 1]);
    authorsPart = `${first19.join(', ')}, ... ${last}`;
  }

  const yearPart = article.anioTexto && article.anioTexto !== 'No disponible' ? `(${article.anioTexto})` : '(s. f.)';
  const titlePart = article.titulo && article.titulo !== 'No disponible' ? article.titulo.replace(/\.$/, '') : 'Título no disponible';

  const sourceParts: string[] = [];
  if (article.revistaOFuente && article.revistaOFuente !== 'No disponible') {
    let venue = article.revistaOFuente;
    if (article.volumen) {
      venue += `, ${article.volumen}`;
      if (article.numero) {
        venue += `(${article.numero})`;
      }
    }
    if (article.paginas) {
      venue += `, ${article.paginas}`;
    }
    sourceParts.push(`${venue}.`);
  }

  let locator = '';
  if (article.doi && article.doi !== 'No disponible') {
    const cleanDoi = article.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
    locator = `https://doi.org/${cleanDoi}`;
  } else if (article.enlacePagina && article.enlacePagina !== 'No disponible') {
    locator = article.enlacePagina;
  }

  if (authorsPart) {
    return [authorsPart, `${yearPart}.`, `${titlePart}.`, ...sourceParts, locator]
      .filter(Boolean)
      .join(' ')
      .replace(/\.\./g, '.');
  }

  return [`${titlePart}.`, `${yearPart}.`, ...sourceParts, locator]
    .filter(Boolean)
    .join(' ')
    .replace(/\.\./g, '.');
}
