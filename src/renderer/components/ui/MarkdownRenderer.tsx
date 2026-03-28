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

import { useWorkspaceStore } from '../../store/workspaceStore';

// File extensions that trigger the "Pill" rendering for inline code
const FILE_EXTENSIONS = ['.js', '.ts', '.jsx', '.tsx', '.json', '.html', '.css', '.md', '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.txt', '.yml', '.yaml', '.sh', '.bash', '.env', '.svg', '.png'];

function getVSCodeIcon(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const baseUrl = 'https://cdn.jsdelivr.net/gh/vscode-icons/vscode-icons@master/icons';
  const iconMap: Record<string, string> = {
    ts: 'file_type_typescript.svg', tsx: 'file_type_reactts.svg',
    js: 'file_type_js.svg', jsx: 'file_type_reactjs.svg',
    css: 'file_type_css.svg', html: 'file_type_html.svg',
    json: 'file_type_json.svg', md: 'file_type_markdown.svg',
    py: 'file_type_python.svg', rs: 'file_type_rust.svg',
    go: 'file_type_go.svg', java: 'file_type_java.svg',
    c: 'file_type_c.svg', cpp: 'file_type_cpp.svg', h: 'file_type_c.svg',
    svg: 'file_type_svg.svg', png: 'file_type_image.svg',
    jpg: 'file_type_image.svg', jpeg: 'file_type_image.svg',
    txt: 'file_type_text.svg', yml: 'file_type_yaml.svg',
    yaml: 'file_type_yaml.svg', xml: 'file_type_xml.svg',
    sh: 'file_type_shell.svg', bash: 'file_type_shell.svg',
    env: 'file_type_env.svg'
  };
  if (fileName === '.env' || fileName.endsWith('.env')) return `${baseUrl}/file_type_light_env.svg`;
  if (fileName === 'package.json') return `${baseUrl}/file_type_npm.svg`;
  if (fileName === 'vite.config.js' || fileName === 'vite.config.ts') return `${baseUrl}/file_type_vite.svg`;
  return `${baseUrl}/${iconMap[ext] || 'default_file.svg'}`;
}

const FilePill: React.FC<{ filePath: string; className?: string }> = ({ filePath, className }) => {
  const openFile = useWorkspaceStore(state => state.openFile);
  const activeWorkspace = useWorkspaceStore(state => state.activeWorkspace);
  
  const handleClick = async () => {
    if (!activeWorkspace) return;
    const orchide = (window as any).orchide;
    if (!orchide) return;
    
    // Attempt absolute or relative resolve
    const fullPath = filePath.startsWith('/') ? filePath : `${activeWorkspace.path}/${filePath}`;
    
    try {
      const result = await orchide.fs.readFile(fullPath);
      openFile({ 
        path: fullPath, 
        name: filePath.split('/').pop() || filePath, 
        content: result.content, 
        isDirty: false, 
        language: filePath.split('.').pop() || 'text' 
      });
    } catch (e) {
      console.warn('Could not open file from markdown:', fullPath);
    }
  };

  const fileName = filePath.split('/').pop() || filePath;
  const iconUrl = getVSCodeIcon(fileName);

  return (
    <span 
      onClick={handleClick}
      title={`Open ${filePath}`}
      className={cn(className, "inline-flex items-center gap-[5px] px-[6px] py-[2px] mx-[1px] text-[85%] bg-white/[0.05] hover:bg-white/[0.1] text-orch-fg rounded-md font-mono cursor-pointer transition-colors select-none align-baseline")}
    >
      <img src={iconUrl} alt="icon" className="w-[12px] h-[12px] opacity-[0.85] object-contain flex-shrink-0 relative top-[1px]" />
      <span>{filePath}</span>
    </span>
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
          pre: ({ children }: any) => {
            return (
              <>
                {React.Children.map(children, (child) => {
                  if (React.isValidElement(child)) {
                    return React.cloneElement(child, { isBlock: true } as any);
                  }
                  return child;
                })}
              </>
            );
          },
          code({ className: cls, children, isBlock, ...props }: any) {
            const stringContent = String(children);
            const match    = /language-(\w+)/.exec(cls || '');
            const language = match ? match[1] : 'text';

            if (language === 'mermaid') {
              return <div className="md-mermaid">{stringContent.replace(/\n$/, '')}</div>;
            }

            if (isBlock) {
              return (
                <div className="my-4 bg-[#1e1e1e] border border-white/10 rounded-md overflow-hidden">
                  {/* Header */}
                  <div className="flex justify-between items-center px-3 py-2 bg-white/[0.03] border-b border-white/[0.05]">
                    <span className="font-mono text-[11.5px] text-[#8b949e] opacity-80">{language === 'text' ? 'plaintext' : language.toLowerCase()}</span>
                    <div className="flex items-center gap-1">
                      <button className="flex items-center justify-center bg-transparent border-none text-[#8b949e] cursor-pointer p-1 rounded transition-all hover:bg-white/[0.08] hover:text-[#c9d1d9]" title="Append to Context">
                        <Icon name="mention" size={13} />
                      </button>
                      <CopyButton text={stringContent.replace(/\n$/, '')} />
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
                    {stringContent.replace(/\n$/, '')}
                  </SyntaxHighlighter>
                </div>
              );
            }

            // Inline Code Handlers
            const isLikelyFile = !stringContent.includes(' ') && FILE_EXTENSIONS.some(ext => stringContent.endsWith(ext));
            if (isLikelyFile) {
              return <FilePill filePath={stringContent} className={cls} />;
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
