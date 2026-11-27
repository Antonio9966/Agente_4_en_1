import assert from 'node:assert/strict';
import test from 'node:test';
import PDFDocument from 'pdfkit';
import { applySearchFilters, pickEarliestValidYear } from '../services/academicApis.js';
import { extractArticleInfo } from '../services/agent2Extractor.js';
import { runAgent3Comparison } from '../services/agent3Comparator.js';
import { composeFinalDocument, coerceLlmText } from '../services/agent4Composer.js';
import { formatInTextCitationApa7, formatReferenceApa7 } from '../services/apa7.js';
import { exportToDocx, exportToMarkdown, exportToPdf } from '../services/exporter.js';
import { pickPreferredChatModel, resolveLlmConfig } from '../services/llmClient.js';
import { parsePdfBuffer, removeStoredPdf } from '../services/pdfProcessor.js';
import type { ArticleSearchResult } from '../types.js';

async function makeTestPdf(pagesText: string[]): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    pagesText.forEach((txt, idx) => {
      if (idx > 0) doc.addPage();
      doc.fontSize(12).text(txt);
    });
    doc.end();
  });
}

test('APA 7 formatter formats citations and handles missing fields without inventing data', () => {
  const art: ArticleSearchResult = {
    id: 'a1',
    titulo: 'Large language models in higher education',
    autores: ['María García', 'John Smith', 'Ana López'],
    anio: 2024,
    anioTexto: '2024',
    revistaOFuente: 'Computers & Education',
    resumen: 'Abstract...',
    doi: '10.1016/j.compedu.2024.01.001',
    enlacePagina: 'https://doi.org/10.1016/j.compedu.2024.01.001',
    enlacePdfLegal: 'No disponible',
    fuenteInformacion: 'Crossref',
    estadoAcceso: 'restringido',
  };

  assert.equal(formatInTextCitationApa7(art), '(García et al., 2024)');
  const ref = formatReferenceApa7(art);
  assert.ok(ref.includes('García, M., Smith, J., & López, A.'));
  assert.ok(ref.includes('(2024).'));
  assert.ok(ref.includes('https://doi.org/10.1016/j.compedu.2024.01.001'));
});

test('Agent 1 search filters respect year, author, source, and full-text flags', () => {
  const sample: ArticleSearchResult[] = [
    {
      id: '1',
      titulo: 'Study One',
      autores: ['Elena Torres'],
      anio: 2023,
      anioTexto: '2023',
      revistaOFuente: 'Journal A',
      resumen: 'Res 1',
      doi: '10.1000/1',
      enlacePagina: 'https://example.org/1',
      enlacePdfLegal: 'https://example.org/1.pdf',
      fuenteInformacion: 'OpenAlex',
      estadoAcceso: 'abierto',
    },
    {
      id: '2',
      titulo: 'Study Two',
      autores: ['Carlos Ruiz'],
      anio: 2018,
      anioTexto: '2018',
      revistaOFuente: 'Journal B',
      resumen: 'Res 2',
      doi: '10.1000/2',
      enlacePagina: 'https://example.org/2',
      enlacePdfLegal: 'No disponible',
      fuenteInformacion: 'Crossref',
      estadoAcceso: 'restringido',
    },
  ];

  const filtered = applySearchFilters(sample, {
    anioDesde: 2020,
    soloTextoCompleto: true,
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, '1');
});

test('pickEarliestValidYear resolves original 2007 publication year when 2025 online/deposit year is also present', () => {
  assert.equal(pickEarliestValidYear([2025, 2007, '2025-02-01']), 2007);
  assert.equal(pickEarliestValidYear(['2007 Mar', '2025']), 2007);
  assert.equal(pickEarliestValidYear([null, undefined, 'invalid']), null);
});

test('resolveLlmConfig auto-detects Groq gsk_, Gemini AIza, and OpenRouter sk-or- keys', () => {
  const groq = resolveLlmConfig({ provider: 'gemini', apiKey: 'gsk_example_key_123456' });
  assert.equal(groq.provider, 'openai');
  assert.equal(groq.baseUrl, 'https://api.groq.com/openai/v1');
  assert.ok(groq.model && !groq.model.startsWith('gpt-') && !groq.model.startsWith('gemini-'));

  const gemini = resolveLlmConfig({ provider: 'openai', apiKey: 'AIzaExampleKey123456' });
  assert.equal(gemini.provider, 'gemini');

  const openrouter = resolveLlmConfig({ apiKey: 'sk-or-v1-example123' });
  assert.equal(openrouter.baseUrl, 'https://openrouter.ai/api/v1');
});

test('pickPreferredChatModel skips audio/guard models and picks active chat fallback', () => {
  const picked = pickPreferredChatModel(
    ['whisper-large-v3', 'meta-llama/llama-guard-4-12b', 'llama-3.1-8b-instant', 'qwen/qwen3-32b'],
    'llama-3.3-70b-versatile'
  );
  assert.equal(picked, 'llama-3.1-8b-instant');
});

test('coerceLlmText safely normalizes strings, arrays, and nested objects from LLM JSON', () => {
  assert.equal(coerceLlmText(['Punto 1', 'Punto 2']), 'Punto 1\nPunto 2');
  assert.equal(coerceLlmText({ '(Alicia, 2024)': 'Hallazgo A' }), '(Alicia, 2024): Hallazgo A');
  assert.equal(coerceLlmText('  Texto  '), 'Texto');
  assert.equal(coerceLlmText(null), '');
});

test('PDF processor extracts page-level text and flags unreadable/scanned PDFs', async () => {
  const readableBuffer = await makeTestPdf([
    'Abstract\nThis study investigates how transformer models assist literature screening in university courses. Our objective is to evaluate precision and recall.',
    'Methodology\nWe conducted a quasi-experimental design with n = 120 undergraduate students using GPT-4 and BERT models.\nResults\nResults show that accuracy improved significantly (p < 0.01). Limitations include a small single-campus sample.',
  ]);

  const parsed = await parsePdfBuffer(readableBuffer, 'sample-study.pdf');
  assert.equal(parsed.isScannedOrUnreadable, false);
  assert.equal(parsed.pageCount, 2);
  assert.ok(parsed.pages[0].text.includes('transformer models'));
  assert.equal(parsed.pages[1].detectedSection, 'Metodología / Métodos');
  await removeStoredPdf(parsed.uploadId);

  const emptyScannedBuffer = await makeTestPdf(['   ']);
  const scannedParsed = await parsePdfBuffer(emptyScannedBuffer, 'scanned.pdf');
  assert.equal(scannedParsed.isScannedOrUnreadable, true);
  assert.ok(scannedParsed.message.toLowerCase().includes('ocr'));
  await removeStoredPdf(scannedParsed.uploadId);
});

test('End-to-end Agent 2 -> Agent 3 -> Agent 4 -> DOCX/PDF/MD exports work reliably', async () => {
  const pdfBuf = await makeTestPdf([
    'Introduction\nThe objective of this study is to examine automated feedback tools in engineering education. A major challenge is grading latency.',
    'Methods\nA quantitative cohort design was applied on a dataset of 450 essays using a Python BERT classifier.\nResults\nFindings indicate 89% accuracy and reduced grading time. Limitations: limited generalizability outside engineering.',
  ]);
  const parsedPdf = await parsePdfBuffer(pdfBuf, 'paper1.pdf');

  const art1: ArticleSearchResult = {
    id: 'art_1',
    titulo: 'Automated feedback in engineering education',
    autores: ['Lucía Méndez', 'David Park'],
    anio: 2024,
    anioTexto: '2024',
    revistaOFuente: 'IEEE Transactions on Learning',
    resumen: 'Automated feedback study.',
    doi: '10.1109/TLT.2024.100',
    enlacePagina: 'https://doi.org/10.1109/TLT.2024.100',
    enlacePdfLegal: 'No disponible',
    fuenteInformacion: 'Crossref',
    estadoAcceso: 'abierto',
    pdfUploadId: parsedPdf.uploadId,
    pdfFileName: 'paper1.pdf',
  };

  const art2: ArticleSearchResult = {
    id: 'art_2',
    titulo: 'LLM tutoring systems in computer science',
    autores: ['Sofía Herrera'],
    anio: 2025,
    anioTexto: '2025',
    revistaOFuente: 'ACM Computing Education',
    resumen:
      'This study aims to evaluate LLM tutoring systems using a randomized trial with 80 students. Results show higher engagement, though limitations include short study duration.',
    doi: '10.1145/3600000',
    enlacePagina: 'https://doi.org/10.1145/3600000',
    enlacePdfLegal: 'No disponible',
    fuenteInformacion: 'OpenAlex',
    estadoAcceso: 'restringido',
  };

  const ext1 = await extractArticleInfo(art1);
  const ext2 = await extractArticleInfo(art2);
  assert.equal(ext1.alcanceAnalisis, 'texto_completo_pdf');
  assert.equal(ext2.alcanceAnalisis, 'resumen_y_metadatos');
  assert.ok(ext1.campos.objetivo.ubicacion.includes('Página 1'));

  const comp = await runAgent3Comparison(
    [ext1, ext2],
    '¿Qué efectividad y limitaciones presentan los sistemas basados en PLN y LLM en educación?'
  );
  assert.equal(comp.columnas.length, 2);
  assert.ok(comp.tablaComparativa.length >= 7);
  assert.ok(comp.preguntasAdicionales.length >= 3);
  assert.ok(comp.preguntasAdicionales.every((qa) => qa.pregunta && qa.respuesta && qa.articulosRespaldo.length > 0));

  const doc = await composeFinalDocument({
    portada: {
      titulo: 'Revisión sobre PLN y LLM en educación',
      autor: 'Equipo Investigador',
      institucion: 'Universidad de Prueba',
      fecha: '2026-11-26',
    },
    tema: 'PLN y LLM en educación',
    preguntaInvestigacion: comp.preguntaInvestigacion,
    palabrasClave: 'LLM, NLP, education',
    articulosSeleccionados: [art1, art2],
    extracciones: [ext1, ext2],
    comparacion: comp,
  });

  const md = exportToMarkdown(doc);
  assert.ok(md.includes('## 10. Referencias bibliográficas (APA 7)'));
  assert.ok(md.includes('### Preguntas de investigación adicionales generadas y respondidas'));

  const docxBuf = await exportToDocx(doc);
  assert.equal(docxBuf.subarray(0, 2).toString('ascii'), 'PK');

  const pdfOutBuf = await exportToPdf(doc);
  assert.equal(pdfOutBuf.subarray(0, 5).toString('ascii'), '%PDF-');

  await removeStoredPdf(parsedPdf.uploadId);
});
