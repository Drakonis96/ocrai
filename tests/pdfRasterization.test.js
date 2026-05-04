import { describe, expect, it } from 'vitest';
import { renderPdfToPageImages } from '../services/pdfRasterization.js';

const MINIMAL_PDF_BUFFER = Buffer.from(`%PDF-1.1
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 55 >>
stream
BT
/F1 24 Tf
100 100 Td
(Hello PDF) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000063 00000 n 
0000000122 00000 n 
0000000251 00000 n 
0000000356 00000 n 
trailer
<< /Root 1 0 R /Size 6 >>
startxref
426
%%EOF
`);

describe('server-side PDF rasterization', () => {
  it('renders uploaded PDF pages to jpeg buffers for OCR', async () => {
    const renderedPages = await renderPdfToPageImages(MINIMAL_PDF_BUFFER);

    expect(renderedPages).toHaveLength(1);
    expect(renderedPages[0].pageNumber).toBe(1);
    expect(renderedPages[0].mimeType).toBe('image/jpeg');
    expect(renderedPages[0].extension).toBe('jpg');
    expect(renderedPages[0].buffer.length).toBeGreaterThan(0);
  });

  it('reports page progress as pages finish rendering', async () => {
    const progressUpdates = [];

    await renderPdfToPageImages(MINIMAL_PDF_BUFFER, {
      onPageRendered: (update) => {
        progressUpdates.push({
          pageNumber: update.renderedPage.pageNumber,
          completedPages: update.completedPages,
          totalPages: update.totalPages,
        });
      },
    });

    expect(progressUpdates).toEqual([
      {
        pageNumber: 1,
        completedPages: 1,
        totalPages: 1,
      },
    ]);
  });
});