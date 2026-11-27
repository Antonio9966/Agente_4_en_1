import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import multer from 'multer';
import { runAgent1Search } from './services/academicApis.js';
import { extractArticleInfo } from './services/agent2Extractor.js';
import { runAgent3Comparison } from './services/agent3Comparator.js';
import { composeFinalDocument } from './services/agent4Composer.js';
import { exportToDocx, exportToMarkdown, exportToPdf } from './services/exporter.js';
import { listOpenAiCompatibleModels, resolveLlmConfig } from './services/llmClient.js';
import { parsePdfBuffer, removeStoredPdf } from './services/pdfProcessor.js';
import type {
  AcademicSource,
  ArticleExtraction,
  ArticleSearchResult,
  FinalDocument,
  LlmRuntimeConfig,
  SearchFilters,
} from './types.js';

const app = express();
const PORT = Number(process.env.PORT || 3001);

app.use(cors());
app.use(express.json({ limit: '15mb' }));

// Almacenamiento en memoria para PDFs cargados: nunca se exponen en rutas públicas estáticas
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const isPdf =
      file.mimetype === 'application/pdf' ||
      file.originalname.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      cb(new Error('Solo se permiten archivos en formato PDF.'));
      return;
    }
    cb(null, true);
  },
});

app.get('/api/health', (_req, res) => {
  const llm = resolveLlmConfig();
  res.json({
    ok: true,
    llm: {
      configured: llm.available,
      provider: llm.provider || null,
      label: llm.label,
    },
    externalServices: {
      openAlex: { active: true, politePool: Boolean(process.env.ACADEMIC_POLITE_EMAIL?.trim()) },
      crossref: { active: true, politePool: Boolean(process.env.ACADEMIC_POLITE_EMAIL?.trim()) },
      europePmc: { active: true },
      pubmed: { active: true },
      semanticScholar: { active: true, apiKeyConfigured: Boolean(process.env.SEMANTIC_SCHOLAR_API_KEY?.trim()) },
    },
    exportFormats: ['docx', 'pdf', 'md'],
  });
});

app.post('/api/llm/models', async (req, res) => {
  try {
    const { llmConfig } = req.body as { llmConfig?: LlmRuntimeConfig };
    const cfg = resolveLlmConfig(llmConfig);
    if (!cfg.available || !cfg.apiKey) {
      res.status(400).json({ error: 'Ingrese una clave API válida para consultar los modelos disponibles.' });
      return;
    }
    if (cfg.provider === 'gemini') {
      res.json({
        provider: cfg.label,
        models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
      });
      return;
    }
    const models = await listOpenAiCompatibleModels(cfg.baseUrl || 'https://api.openai.com/v1', cfg.apiKey);
    res.json({ provider: cfg.label, models });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'No se pudieron consultar los modelos.' });
  }
});

app.post('/api/agent1/search', async (req, res) => {
  try {
    const { query, sources, filters, limitPerSource } = req.body as {
      query?: string;
      sources?: AcademicSource[];
      filters?: SearchFilters;
      limitPerSource?: number;
    };

    if (!query || !query.trim()) {
      res.status(400).json({ error: 'Debe ingresar un tema, palabras clave o consulta de búsqueda.' });
      return;
    }

    const result = await runAgent1Search(
      query,
      sources,
      filters,
      Math.min(Math.max(Number(limitPerSource) || 8, 3), 20)
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error al ejecutar la búsqueda académica del Agente 1.' });
  }
});

app.post('/api/agent2/upload-pdf', (req, res) => {
  upload.single('file')(req, res, async (uploadErr: any) => {
    if (uploadErr) {
      res.status(400).json({ error: uploadErr.message || 'Archivo PDF no válido.' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'No se recibió ningún archivo PDF.' });
      return;
    }
    try {
      const payload = await parsePdfBuffer(req.file.buffer, req.file.originalname);
      res.json(payload);
    } catch (err: any) {
      res.status(500).json({
        error: `No fue posible leer el PDF (${err?.message || 'error de procesamiento'}). Verifique que el archivo no esté corrupto o cifrado.`,
      });
    }
  });
});

app.delete('/api/agent2/pdf/:uploadId', async (req, res) => {
  await removeStoredPdf(req.params.uploadId);
  res.json({ ok: true });
});

app.post('/api/agent2/extract', async (req, res) => {
  try {
    const { articles, llmConfig } = req.body as {
      articles?: ArticleSearchResult[];
      llmConfig?: LlmRuntimeConfig;
    };

    if (!Array.isArray(articles) || articles.length === 0) {
      res.status(400).json({ error: 'Seleccione al menos un artículo o cargue un PDF legible para analizar.' });
      return;
    }

    const extracciones: ArticleExtraction[] = [];
    for (const art of articles) {
      const extraction = await extractArticleInfo(art, llmConfig);
      extracciones.push(extraction);
    }

    res.json({ extracciones });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error en la extracción del Agente 2.' });
  }
});

app.post('/api/agent3/compare', async (req, res) => {
  try {
    const { extracciones, preguntaInvestigacion, llmConfig } = req.body as {
      extracciones?: ArticleExtraction[];
      preguntaInvestigacion?: string;
      llmConfig?: LlmRuntimeConfig;
    };

    if (!Array.isArray(extracciones) || extracciones.length === 0) {
      res.status(400).json({ error: 'Se requiere al menos un artículo analizado por el Agente 2.' });
      return;
    }
    if (!preguntaInvestigacion || !preguntaInvestigacion.trim()) {
      res.status(400).json({ error: 'Debe especificar una pregunta de investigación para el Agente 3.' });
      return;
    }

    const result = await runAgent3Comparison(extracciones, preguntaInvestigacion.trim(), llmConfig);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error en el análisis comparativo del Agente 3.' });
  }
});

app.post('/api/agent4/compose', async (req, res) => {
  try {
    const body = req.body;
    if (!body?.comparacion || !Array.isArray(body?.extracciones)) {
      res.status(400).json({ error: 'Faltan los resultados de los Agentes 2 y 3 para integrar el documento.' });
      return;
    }
    const doc = await composeFinalDocument(body);
    res.json(doc);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error al generar el documento final del Agente 4.' });
  }
});

app.post('/api/agent4/export/:format', async (req, res) => {
  try {
    const format = req.params.format.toLowerCase();
    const { document } = req.body as { document?: FinalDocument };
    if (!document) {
      res.status(400).json({ error: 'No se proporcionó el documento final para exportar.' });
      return;
    }

    const safeTitle = (document.portada?.titulo || 'analisis-cientifico')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50) || 'analisis-cientifico';

    if (format === 'md' || format === 'markdown') {
      const md = exportToMarkdown(document);
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.md"`);
      res.send(md);
      return;
    }

    if (format === 'docx') {
      const buffer = await exportToDocx(document);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.docx"`);
      res.send(buffer);
      return;
    }

    if (format === 'pdf') {
      const buffer = await exportToPdf(document);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.pdf"`);
      res.send(buffer);
      return;
    }

    res.status(400).json({ error: `Formato de exportación no soportado: ${format}` });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error al exportar el documento.' });
  }
});

// Servir frontend compilado en producción si existe dist/
const distDir = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      next();
      return;
    }
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Servidor de Agentes Científicos escuchando en http://localhost:${PORT}`);
});
