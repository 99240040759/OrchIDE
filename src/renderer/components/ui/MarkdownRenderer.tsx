import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Icon } from './Icon';
import { renderMermaidDiagrams } from '../../utils/markdown';
import { cn } from '@/lib/utils';

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
    <button
      onClick={handleCopy}
      title="Copy Code"
      className="flex items-center justify-center bg-transparent border-none text-[#8b949e] cursor-pointer p-1 rounded transition-all hover:bg-white/[0.08] hover:text-[#c9d1d9]"
    >
      {copied
        ? <Icon name="pass"  size={13} style={{ color: '#2ea043' }} />
        : <Icon name="copy"  size={13} />
      }
    </button>
  );
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className, isStreaming }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastContentHashRef = useRef<string>('');

  useEffect(() => {
    if (!containerRef.current || isStreaming) return;
    const contentHash = content.length.toString() + content.slice(-50);
    if (contentHash === lastContentHashRef.current) return;
    lastContentHashRef.current = contentHash;
    const timer = setTimeout(() => {
      if (containerRef.current) void renderMermaidDiagrams(containerRef.current);
    }, 100);
    return () => clearTimeout(timer);
  }, [content, isStreaming]);

  return (
    <div
      ref={containerRef}
      className={cn(
        // Base prose styles (replaces MarkdownRenderer.css)
        'font-sans text-[14px] leading-[1.6] text-[#c9d1d9] break-words',
        // Headings
        '[&_h1]:text-[2em] [&_h1]:font-semibold [&_h1]:leading-[1.25] [&_h1]:mt-6 [&_h1]:mb-4 [&_h1]:text-[#e6edf3] [&_h1]:pb-[0.3em] [&_h1]:border-b [&_h1]:border-white/10',
        '[&_h2]:text-[1.5em] [&_h2]:font-semibold [&_h2]:leading-[1.25] [&_h2]:mt-6 [&_h2]:mb-4 [&_h2]:text-[#e6edf3] [&_h2]:pb-[0.3em] [&_h2]:border-b [&_h2]:border-white/10',
        '[&_h3]:text-[1.25em] [&_h3]:font-semibold [&_h3]:leading-[1.25] [&_h3]:mt-6 [&_h3]:mb-4 [&_h3]:text-[#e6edf3]',
        '[&_h4]:text-[1em] [&_h4]:font-semibold [&_h4]:mt-4 [&_h4]:mb-2 [&_h4]:text-[#e6edf3]',
        // Paragraphs / links
        '[&_p]:mt-0 [&_p]:mb-4',
        '[&_a]:text-[#6cb6ff] [&_a]:no-underline [&_a:hover]:underline',
        // Inline code
        '[&_code:not([class*="language-"])]:px-[0.4em] [&_code:not([class*="language-"])]:py-[0.2em] [&_code:not([class*="language-"])]:text-[85%] [&_code:not([class*="language-"])]:bg-[rgba(110,118,129,0.4)] [&_code:not([class*="language-"])]:rounded-md [&_code:not([class*="language-"])]:font-mono',
        // Lists
        '[&_ul]:my-2 [&_ul]:ml-5 [&_ol]:my-2 [&_ol]:ml-5',
        '[&_li]:mb-1.5',
        // Blockquote
        '[&_blockquote]:border-l-[0.25em] [&_blockquote]:border-[#30363d] [&_blockquote]:pl-4 [&_blockquote]:text-[#8b949e] [&_blockquote]:m-0 [&_blockquote]:mb-4',
        // HR
        '[&_hr]:border-none [&_hr]:border-t [&_hr]:border-orch-border [&_hr]:my-4',
        // Tables
        '[&_table]:w-full [&_table]:my-3 [&_table]:border-collapse [&_table]:border [&_table]:border-orch-border [&_table]:rounded-md [&_table]:overflow-hidden',
        '[&_th]:px-3 [&_th]:py-2 [&_th]:border-r [&_th]:border-b [&_th]:border-orch-border [&_th]:text-[13px] [&_th]:text-left [&_th]:font-semibold [&_th]:bg-white/[0.03] [&_th]:text-[#e6edf3]',
        '[&_td]:px-3 [&_td]:py-2 [&_td]:border-r [&_td]:border-b [&_td]:border-orch-border [&_td]:text-[13px]',
        '[&_th:last-child]:border-r-0 [&_td:last-child]:border-r-0',
        '[&_tr:last-child_td]:border-b-0',
        // Mermaid
        '[&_.md-mermaid]:my-3 [&_.md-mermaid]:p-2.5 [&_.md-mermaid]:border [&_.md-mermaid]:border-orch-border [&_.md-mermaid]:rounded-lg [&_.md-mermaid]:bg-[#0d1117] [&_.md-mermaid]:overflow-x-auto',
        '[&_.mermaid-error]:text-orch-red [&_.mermaid-error]:font-mono [&_.mermaid-error]:whitespace-pre-wrap [&_.mermaid-error]:m-0',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }: any) => <>{children}</>,
          code({ inline, className: cls, children, ...props }: any) {
            const match    = /language-(\w+)/.exec(cls || '');
            const language = match ? match[1] : '';

            if (language === 'mermaid') {
              return <div className="md-mermaid">{String(children).replace(/\\n$/, '')}</div>;
            }

            if (!inline && match) {
              return (
                <div className="my-4 bg-[#1e1e1e] border border-white/10 rounded-md overflow-hidden">
                  {/* Header */}
                  <div className="flex justify-between items-center px-3 py-2 bg-white/[0.03] border-b border-white/[0.05]">
                    <span className="font-mono text-[11.5px] text-[#8b949e] opacity-80">{language.toLowerCase()}</span>
                    <div className="flex items-center gap-1">
                      <button className="flex items-center justify-center bg-transparent border-none text-[#8b949e] cursor-pointer p-1 rounded transition-all hover:bg-white/[0.08] hover:text-[#c9d1d9]" title="Append to Context">
                        <Icon name="mention" size={13} />
                      </button>
                      <CopyButton text={String(children).replace(/\\n$/, '')} />
                    </div>
                  </div>
                  {/* Code body */}
                  <SyntaxHighlighter
                    style={vscDarkPlus as any}
                    language={language}
                    PreTag="div"
                    customStyle={{ margin: 0, padding: '12px 16px', background: 'transparent' }}
                    {...props}
                  >
                    {String(children).replace(/\\n$/, '')}
                  </SyntaxHighlighter>
                </div>
              );
            }

            return <code className={cls} {...props}>{children}</code>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
