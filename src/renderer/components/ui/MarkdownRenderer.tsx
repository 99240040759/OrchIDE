import React, { useEffect, useMemo, useRef } from 'react';
import { renderMarkdownToHtml, renderMermaidDiagrams } from '../../utils/markdown';
import './MarkdownRenderer.css';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const html = useMemo(() => renderMarkdownToHtml(content), [content]);

  useEffect(() => {
    if (!containerRef.current) return;
    void renderMermaidDiagrams(containerRef.current);
  }, [html]);

  return (
    <div
      ref={containerRef}
      className={`markdown-renderer ${className || ''}`.trim()}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
