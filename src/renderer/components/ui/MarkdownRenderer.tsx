import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Check, Copy, AtSign } from 'lucide-react';
import { renderMermaidDiagrams } from '../../utils/markdown';
import './MarkdownRenderer.css';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  /** If true, skips mermaid rendering (use during streaming for performance) */
  isStreaming?: boolean;
}

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button className="code-action-btn" onClick={handleCopy} title="Copy Code">
      {copied ? <Check size={13} style={{ color: '#2ea043' }} /> : <Copy size={13} />}
    </button>
  );
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className, isStreaming }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastContentHashRef = useRef<string>('');

  // Only render mermaid diagrams when not streaming and content has stabilized
  // This prevents expensive SVG generation during live typing
  useEffect(() => {
    if (!containerRef.current || isStreaming) return;

    // Simple hash to detect actual content changes
    const contentHash = content.length.toString() + content.slice(-50);
    if (contentHash === lastContentHashRef.current) return;
    lastContentHashRef.current = contentHash;

    const timer = setTimeout(() => {
      if (containerRef.current) void renderMermaidDiagrams(containerRef.current);
    }, 100); // Slightly longer delay for stability
    return () => clearTimeout(timer);
  }, [content, isStreaming]);

  return (
    <div ref={containerRef} className={`markdown-renderer ${className || ''}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }: any) => <>{children}</>,
          code({ inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';

            if (language === 'mermaid') {
              return <div className="md-mermaid">{String(children).replace(/\\n$/, '')}</div>;
            }

            if (!inline && match) {
              return (
                <div className="modern-code-block">
                  <div className="modern-code-header">
                    <span className="modern-code-language">{language.toLowerCase()}</span>
                    <div className="modern-code-actions">
                      <button className="code-action-btn" title="Append to Context">
                        <AtSign size={13} />
                      </button>
                      <CopyButton text={String(children).replace(/\\n$/, '')} />
                    </div>
                  </div>
                  <SyntaxHighlighter
                    style={vscDarkPlus as any}
                    language={language}
                    PreTag="div"
                    className="code-block-content"
                    customStyle={{ margin: 0, padding: '12px 16px', background: 'transparent' }}
                    {...props}
                  >
                    {String(children).replace(/\\n$/, '')}
                  </SyntaxHighlighter>
                </div>
              );
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
