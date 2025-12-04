import React, { useRef, useEffect, useState } from 'react';
import { PageData, BlockLabel } from '../../types';

interface ImageViewerProps {
  page: PageData;
}

const ImageViewer: React.FC<ImageViewerProps> = ({ page }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // Colors for bounding boxes
  const labelColors: Record<string, string> = {
    [BlockLabel.TITLE]: 'rgba(59, 130, 246, 0.2)', // Blue
    [BlockLabel.MAIN_TEXT]: 'rgba(34, 197, 94, 0.1)', // Green
    [BlockLabel.FOOTNOTE]: 'rgba(239, 68, 68, 0.2)', // Red
    [BlockLabel.HEADER]: 'rgba(249, 115, 22, 0.2)', // Orange
    [BlockLabel.FOOTER]: 'rgba(249, 115, 22, 0.2)', // Orange
  };

  const borderColors: Record<string, string> = {
    [BlockLabel.TITLE]: '#3b82f6',
    [BlockLabel.MAIN_TEXT]: '#22c55e',
    [BlockLabel.FOOTNOTE]: '#ef4444',
    [BlockLabel.HEADER]: '#f97316',
    [BlockLabel.FOOTER]: '#f97316',
  };

  return (
    <div className="relative w-full h-full overflow-auto bg-slate-100 dark:bg-slate-900 p-4 transition-colors flex" ref={containerRef}>
      <div className="relative shadow-lg m-auto">
        <img
          src={page.imageUrl}
          alt={`Page ${page.pageNumber}`}
          className="max-w-[600px] w-full h-auto block"
          onLoad={() => {
            // Logic to potentially adjust scale based on container width could go here
          }}
        />
        
        {/* Render Bounding Boxes Overlay */}
        <div className="absolute inset-0 pointer-events-none">
          {page.blocks.map((block) => {
            if (!block.box_2d) return null;
            // box_2d is [ymin, xmin, ymax, xmax] usually normalized 0-1000 or 0-1
            // Assuming Gemini sends 0-1000 per the prompt request, or we normalize it.
            // Let's assume standard Gemini output which is 0-1000.
            const [ymin, xmin, ymax, xmax] = block.box_2d;
            
            const style: React.CSSProperties = {
              top: `${(ymin / 1000) * 100}%`,
              left: `${(xmin / 1000) * 100}%`,
              height: `${((ymax - ymin) / 1000) * 100}%`,
              width: `${((xmax - xmin) / 1000) * 100}%`,
              backgroundColor: labelColors[block.label] || 'rgba(0,0,0,0.1)',
              border: `1px solid ${borderColors[block.label] || '#000'}`,
              position: 'absolute',
            };

            return (
              <div key={block.id} style={style} className="group">
                <span className="hidden group-hover:block absolute -top-5 left-0 bg-black text-white text-[10px] px-1 rounded whitespace-nowrap z-10">
                  {block.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ImageViewer;