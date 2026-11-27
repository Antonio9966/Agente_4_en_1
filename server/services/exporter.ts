import fs from 'node:fs';
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import PDFDocument from 'pdfkit';
import type { ExtractionFieldKey, FinalDocument } from '../types.js';
import { EXTRACTION_FIELD_LABELS } from './agent2Extractor.js';

const FIELD_ORDER = Object.keys(EXTRACTION_FIELD_LABELS) as ExtractionFieldKey[];

export function exportToMarkdown(doc: FinalDocument): string {
  const lines: string[] = [
    `# ${doc.portada.titulo}`,
    '',
    `- **Autor:** ${doc.portada.autor}`,
    `- **Institución:** ${doc.portada.institucion}`,
    `- **Fecha:** ${doc.portada.fecha}`,
    '',
    '---',
    '',
    '## 2. Tema y pregunta de investigación',
    `**Tema:** ${doc.tema}`,
    '',
    `**Pregunta de investigación:** ${doc.preguntaInvestigacion}`,
    '',
    '## 3. Resumen ejecutivo',
    doc.resumenEjecutivo,
    '',
    '## 4. Metodología de búsqueda',
    `- **Palabras clave:** ${doc.metodologiaBusqueda.palabrasClave}`,
    `- **Filtros aplicados:** ${doc.metodologiaBusqueda.filtrosAplicados}`,
    `- **Fuentes consultadas:** ${doc.metodologiaBusqueda.fuentesConsultadas}`,
    `- **Criterios de selección:** ${doc.metodologiaBusqueda.criteriosSeleccion}`,
    '',
    '## 5. Resultados del Agente 1: artículos seleccionados',
  ];

  doc.resultadosAgente1.forEach((art, idx) => {
    lines.push(
      `### ${idx + 1}. ${art.titulo}`,
      `- **Autores:** ${art.autores.join(', ')}`,
      `- **Año:** ${art.anioTexto}`,
      `- **Revista / Fuente:** ${art.revistaOFuente}`,
      `- **DOI:** ${art.doi}`,
      `- **Enlace al artículo:** ${art.enlacePagina}`,
      `- **Enlace PDF legal:** ${art.enlacePdfLegal}`,
      `- **Fuente de información:** ${art.fuenteInformacion}`,
      `- **Estado de acceso:** ${art.estadoAcceso}`,
      `- **Resumen:** ${art.resumen}`,
      ''
    );
  });

  lines.push('## 6. Análisis individual de los artículos (Agente 2)');
  doc.analisisIndividualAgente2.forEach((ext, idx) => {
    lines.push(
      `### ${idx + 1}. ${ext.titulo} ${ext.citaEnTextoApa7}`,
      `*Alcance del análisis:* ${ext.notaAlcance}`,
      ''
    );
    for (const k of FIELD_ORDER) {
      const f = ext.campos[k];
      const label = EXTRACTION_FIELD_LABELS[k];
      if (f.tipo === 'no_especificado' || f.valor === 'No especificado en el artículo') {
        lines.push(`- **${label}:** No especificado en el artículo.`);
      } else {
        const tag = f.tipo === 'inferencia' ? 'Inferencia' : 'Explícito';
        lines.push(`- **${label}** (*${tag}* | ${f.ubicacion}): ${f.valor}`);
      }
    }
    lines.push('');
  });

  lines.push('## 7. Tabla comparativa y respuesta a la pregunta (Agente 3)', '');
  const cols = doc.comparacionAgente3.columnas;
  if (cols.length > 0) {
    lines.push(`| Criterio | ${cols.map((c) => c.etiqueta.replace(/\|/g, '/')).join(' | ')} |`);
    lines.push(`| --- | ${cols.map(() => '---').join(' | ')} |`);
    for (const row of doc.comparacionAgente3.tablaComparativa) {
      const cells = cols.map((c) =>
        (row.valoresPorArticulo[c.articleId] || 'No especificado en el artículo')
          .replace(/\r?\n/g, ' ')
          .replace(/\|/g, '/')
      );
      lines.push(`| **${row.criterio}** | ${cells.join(' | ')} |`);
    }
    lines.push('');
  }

  lines.push(
    '### Respuesta argumentada a la pregunta de investigación',
    doc.comparacionAgente3.respuestaArgumentada,
    '',
    '## 8. Conclusiones generales',
    '### Hallazgos de los artículos',
    doc.conclusionesGenerales.hallazgosArticulos,
    '',
    '### Síntesis comparativa',
    doc.conclusionesGenerales.sintesisComparativa,
    '',
    '### Inferencias analíticas',
    doc.conclusionesGenerales.inferenciasAnaliticas,
    '',
    '## 9. Limitaciones del análisis',
    doc.limitacionesAnalisis,
    '',
    '## 10. Referencias bibliográficas (APA 7)'
  );

  doc.referenciasApa7.forEach((ref) => {
    lines.push(`- ${ref}`);
  });

  return lines.join('\n');
}

export async function exportToDocx(doc: FinalDocument): Promise<Buffer> {
  const children: Array<Paragraph | Table> = [];

  // 1. Portada
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 1800, after: 400 },
      children: [new TextRun({ text: doc.portada.titulo, bold: true, size: 36, color: '1E293B' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: `Autor: ${doc.portada.autor}`, size: 24 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: `Institución: ${doc.portada.institucion}`, size: 24 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [new TextRun({ text: `Fecha: ${doc.portada.fecha}`, size: 22, color: '475569' })],
    }),
    new Paragraph({ children: [new PageBreak()] })
  );

  const addHeading1 = (text: string) =>
    children.push(
      new Paragraph({
        text,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 320, after: 160 },
      })
    );

  const addHeading2 = (text: string) =>
    children.push(
      new Paragraph({
        text,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 220, after: 100 },
      })
    );

  const addBodyLines = (text: string) => {
    for (const line of text.split(/\r?\n/)) {
      children.push(
        new Paragraph({
          spacing: { after: 100 },
          children: [new TextRun({ text: line, size: 22 })],
        })
      );
    }
  };

  // 2. Tema y pregunta
  addHeading1('2. Tema y pregunta de investigación');
  addBodyLines(`Tema: ${doc.tema}\nPregunta de investigación: ${doc.preguntaInvestigacion}`);

  // 3. Resumen ejecutivo
  addHeading1('3. Resumen ejecutivo');
  addBodyLines(doc.resumenEjecutivo);

  // 4. Metodología de búsqueda
  addHeading1('4. Metodología de búsqueda');
  addBodyLines(
    [
      `Palabras clave: ${doc.metodologiaBusqueda.palabrasClave}`,
      `Filtros aplicados: ${doc.metodologiaBusqueda.filtrosAplicados}`,
      `Fuentes consultadas: ${doc.metodologiaBusqueda.fuentesConsultadas}`,
      `Criterios de selección: ${doc.metodologiaBusqueda.criteriosSeleccion}`,
    ].join('\n')
  );

  // 5. Resultados Agente 1
  addHeading1('5. Resultados del Agente 1: artículos seleccionados');
  doc.resultadosAgente1.forEach((art, idx) => {
    addHeading2(`${idx + 1}. ${art.titulo}`);
    addBodyLines(
      [
        `Autores: ${art.autores.join(', ')}`,
        `Año: ${art.anioTexto} | Revista/Fuente: ${art.revistaOFuente}`,
        `DOI: ${art.doi} | Fuente de datos: ${art.fuenteInformacion} | Estado de acceso: ${art.estadoAcceso}`,
        `Enlace al artículo: ${art.enlacePagina}`,
        `Enlace PDF legal: ${art.enlacePdfLegal}`,
        `Resumen: ${art.resumen}`,
      ].join('\n')
    );
  });

  // 6. Análisis individual Agente 2
  addHeading1('6. Análisis individual de los artículos (Agente 2)');
  doc.analisisIndividualAgente2.forEach((ext, idx) => {
    addHeading2(`${idx + 1}. ${ext.titulo} ${ext.citaEnTextoApa7}`);
    addBodyLines(`Alcance del análisis: ${ext.notaAlcance}`);
    for (const k of FIELD_ORDER) {
      const f = ext.campos[k];
      const label = EXTRACTION_FIELD_LABELS[k];
      const textVal =
        f.tipo === 'no_especificado' || f.valor === 'No especificado en el artículo'
          ? 'No especificado en el artículo.'
          : `${f.valor} [${f.tipo === 'inferencia' ? 'Inferencia' : 'Explícito'} | ${f.ubicacion}]`;
      children.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [
            new TextRun({ text: `${label}: `, bold: true, size: 21 }),
            new TextRun({ text: textVal, size: 21 }),
          ],
        })
      );
    }
  });

  // 7. Tabla comparativa y respuesta Agente 3
  addHeading1('7. Tabla comparativa y respuesta a la pregunta (Agente 3)');
  const cols = doc.comparacionAgente3.columnas;
  if (cols.length > 0) {
    const tableBorder = {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
      left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
      right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
    };

    const headerRow = new TableRow({
      tableHeader: true,
      children: [
        new TableCell({
          borders: tableBorder,
          children: [new Paragraph({ children: [new TextRun({ text: 'Criterio', bold: true, size: 20 })] })],
        }),
        ...cols.map(
          (c) =>
            new TableCell({
              borders: tableBorder,
              children: [new Paragraph({ children: [new TextRun({ text: c.etiqueta, bold: true, size: 20 })] })],
            })
        ),
      ],
    });

    const dataRows = doc.comparacionAgente3.tablaComparativa.map(
      (row) =>
        new TableRow({
          children: [
            new TableCell({
              borders: tableBorder,
              children: [new Paragraph({ children: [new TextRun({ text: row.criterio, bold: true, size: 19 })] })],
            }),
            ...cols.map(
              (c) =>
                new TableCell({
                  borders: tableBorder,
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: row.valoresPorArticulo[c.articleId] || 'No especificado en el artículo',
                          size: 19,
                        }),
                      ],
                    }),
                  ],
                })
            ),
          ],
        })
    );

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [headerRow, ...dataRows],
      })
    );
  }

  addHeading2('Respuesta argumentada a la pregunta de investigación');
  addBodyLines(doc.comparacionAgente3.respuestaArgumentada);

  // 8. Conclusiones generales
  addHeading1('8. Conclusiones generales');
  addHeading2('Hallazgos de los artículos');
  addBodyLines(doc.conclusionesGenerales.hallazgosArticulos);
  addHeading2('Síntesis comparativa');
  addBodyLines(doc.conclusionesGenerales.sintesisComparativa);
  addHeading2('Inferencias analíticas');
  addBodyLines(doc.conclusionesGenerales.inferenciasAnaliticas);

  // 9. Limitaciones
  addHeading1('9. Limitaciones del análisis');
  addBodyLines(doc.limitacionesAnalisis);

  // 10. Referencias APA 7
  addHeading1('10. Referencias bibliográficas (APA 7)');
  doc.referenciasApa7.forEach((ref) => {
    children.push(
      new Paragraph({
        indent: { left: 720, hanging: 720 },
        spacing: { after: 120 },
        children: [new TextRun({ text: ref, size: 21 })],
      })
    );
  });

  const docxDoc = new Document({
    sections: [{ properties: {}, children }],
  });

  return await Packer.toBuffer(docxDoc);
}

function sanitizePdfText(text: string, hasUnicodeFont: boolean): string {
  if (hasUnicodeFont) return text;
  return text
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2022/g, '*')
    .replace(/\u2264/g, '<=')
    .replace(/\u2265/g, '>=')
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, '');
}

export async function exportToPdf(doc: FinalDocument): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
    const chunks: Buffer[] = [];
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);

    // Registrar fuente TTF Unicode si está disponible en Windows para tildes y caracteres académicos
    let regularFont = 'Helvetica';
    let boldFont = 'Helvetica-Bold';
    let hasUnicodeFont = false;

    const arialRegular = 'C:\\Windows\\Fonts\\arial.ttf';
    const arialBold = 'C:\\Windows\\Fonts\\arialbd.ttf';
    if (fs.existsSync(arialRegular) && fs.existsSync(arialBold)) {
      pdf.registerFont('ArialRegular', arialRegular);
      pdf.registerFont('ArialBold', arialBold);
      regularFont = 'ArialRegular';
      boldFont = 'ArialBold';
      hasUnicodeFont = true;
    }

    const t = (s: string) => sanitizePdfText(s, hasUnicodeFont);

    // 1. Portada
    pdf.font(boldFont).fontSize(20).fillColor('#0F172A').text(t(doc.portada.titulo), { align: 'center' });
    pdf.moveDown(1.5);
    pdf.font(regularFont).fontSize(12).fillColor('#334155');
    pdf.text(t(`Autor: ${doc.portada.autor}`), { align: 'center' });
    pdf.text(t(`Institución: ${doc.portada.institucion}`), { align: 'center' });
    pdf.text(t(`Fecha: ${doc.portada.fecha}`), { align: 'center' });
    pdf.addPage();

    const addSection = (title: string) => {
      if (pdf.y > 700) pdf.addPage();
      pdf.moveDown(0.7);
      pdf.font(boldFont).fontSize(13).fillColor('#0F172A').text(t(title));
      pdf.moveDown(0.3);
      pdf.font(regularFont).fontSize(10).fillColor('#1E293B');
    };

    const addSubSection = (title: string) => {
      if (pdf.y > 720) pdf.addPage();
      pdf.moveDown(0.4);
      pdf.font(boldFont).fontSize(11).fillColor('#1E3A8A').text(t(title));
      pdf.moveDown(0.2);
      pdf.font(regularFont).fontSize(10).fillColor('#1E293B');
    };

    addSection('2. Tema y pregunta de investigación');
    pdf.text(t(`Tema: ${doc.tema}`));
    pdf.text(t(`Pregunta de investigación: ${doc.preguntaInvestigacion}`));

    addSection('3. Resumen ejecutivo');
    pdf.text(t(doc.resumenEjecutivo), { align: 'justify' });

    addSection('4. Metodología de búsqueda');
    pdf.text(t(`Palabras clave: ${doc.metodologiaBusqueda.palabrasClave}`));
    pdf.text(t(`Filtros aplicados: ${doc.metodologiaBusqueda.filtrosAplicados}`));
    pdf.text(t(`Fuentes consultadas: ${doc.metodologiaBusqueda.fuentesConsultadas}`));
    pdf.text(t(`Criterios de selección: ${doc.metodologiaBusqueda.criteriosSeleccion}`));

    addSection('5. Resultados del Agente 1: artículos seleccionados');
    doc.resultadosAgente1.forEach((art, idx) => {
      addSubSection(`${idx + 1}. ${art.titulo}`);
      pdf.text(t(`Autores: ${art.autores.join(', ')}`));
      pdf.text(t(`Año: ${art.anioTexto} | Revista/Fuente: ${art.revistaOFuente}`));
      pdf.text(t(`DOI: ${art.doi} | Fuente: ${art.fuenteInformacion} | Acceso: ${art.estadoAcceso}`));
      pdf.text(t(`Enlace al artículo: ${art.enlacePagina}`));
      pdf.text(t(`Enlace PDF legal: ${art.enlacePdfLegal}`));
      pdf.text(t(`Resumen: ${art.resumen}`));
    });

    addSection('6. Análisis individual de los artículos (Agente 2)');
    doc.analisisIndividualAgente2.forEach((ext, idx) => {
      addSubSection(`${idx + 1}. ${ext.titulo} ${ext.citaEnTextoApa7}`);
      pdf.text(t(`Alcance: ${ext.notaAlcance}`));
      for (const k of FIELD_ORDER) {
        const f = ext.campos[k];
        const label = EXTRACTION_FIELD_LABELS[k];
        const val =
          f.tipo === 'no_especificado' || f.valor === 'No especificado en el artículo'
            ? 'No especificado en el artículo.'
            : `${f.valor} [${f.tipo === 'inferencia' ? 'Inferencia' : 'Explícito'} | ${f.ubicacion}]`;
        pdf.font(boldFont).text(t(`${label}: `), { continued: true });
        pdf.font(regularFont).text(t(val));
      }
    });

    addSection('7. Tabla comparativa y respuesta a la pregunta (Agente 3)');
    const cols = doc.comparacionAgente3.columnas;
    if (cols.length > 0) {
      doc.comparacionAgente3.tablaComparativa.forEach((row) => {
        addSubSection(row.criterio);
        cols.forEach((col) => {
          const v = row.valoresPorArticulo[col.articleId] || 'No especificado en el artículo';
          pdf.font(boldFont).text(t(`${col.etiqueta}: `), { continued: true });
          pdf.font(regularFont).text(t(v));
        });
      });
    }
    addSubSection('Respuesta argumentada a la pregunta de investigación');
    pdf.text(t(doc.comparacionAgente3.respuestaArgumentada));

    addSection('8. Conclusiones generales');
    addSubSection('Hallazgos de los artículos');
    pdf.text(t(doc.conclusionesGenerales.hallazgosArticulos));
    addSubSection('Síntesis comparativa');
    pdf.text(t(doc.conclusionesGenerales.sintesisComparativa));
    addSubSection('Inferencias analíticas');
    pdf.text(t(doc.conclusionesGenerales.inferenciasAnaliticas));

    addSection('9. Limitaciones del análisis');
    pdf.text(t(doc.limitacionesAnalisis));

    addSection('10. Referencias bibliográficas (APA 7)');
    doc.referenciasApa7.forEach((ref) => {
      pdf.text(t(ref), { indent: 18 });
      pdf.moveDown(0.3);
    });

    pdf.end();
  });
}
