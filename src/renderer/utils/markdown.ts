import DOMPurify from 'dompurify';
import hljs from 'highlight.js';
import MarkdownIt from 'markdown-it';
import markdownItDeflist from 'markdown-it-deflist';
import markdownItFootnote from 'markdown-it-footnote';
import markdownItLinkAttributes from 'markdown-it-link-attributes';
import markdownItTaskLists from 'markdown-it-task-lists';
import mermaid from 'mermaid';

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

md.use(markdownItTaskLists as any, {
  enabled: true,
  label: true,
  labelAfter: true,
});
md.use(markdownItFootnote as any);
md.use(markdownItDeflist as any);
md.use(markdownItLinkAttributes as any, {
  matcher: (href: string) => /^https?:\/\//i.test(href),
  attrs: {
    target: '_blank',
    rel: 'noopener noreferrer nofollow',
  },
});

const defaultFence = md.renderer.rules.fence?.bind(md.renderer.rules);

md.renderer.rules.fence = (
  tokens: any[],
  idx: number,
  options: any,
  env: any,
  self: any
) => {
  const token = tokens[idx];
  const info = (token.info || '').trim().toLowerCase();
  const source = token.content || '';

  if (info === 'mermaid') {
    return `<div class="md-mermaid">${md.utils.escapeHtml(source)}</div>`;
  }

  if (!info && defaultFence) {
    return defaultFence(tokens, idx, options, env, self);
  }

  let highlighted: string;
  if (info && hljs.getLanguage(info)) {
    highlighted = hljs.highlight(source, {
      language: info,
      ignoreIllegals: true,
    }).value;
  } else {
    highlighted = hljs.highlightAuto(source).value;
  }

  const className = info ? `hljs language-${md.utils.escapeHtml(info)}` : 'hljs';
  return `<pre class="code-block"><code class="${className}">${highlighted}</code></pre>`;
};

let mermaidInitialized = false;

function initMermaid(): void {
  if (mermaidInitialized) return;

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'dark',
    deterministicIds: true,
  });

  mermaidInitialized = true;
}

export function renderMarkdownToHtml(markdown: string): string {
  const rendered = md.render(markdown || '');

  return DOMPurify.sanitize(rendered, {
    USE_PROFILES: { html: true },
  });
}

export async function renderMermaidDiagrams(container: HTMLElement): Promise<void> {
  initMermaid();

  const blocks = Array.from(container.querySelectorAll<HTMLElement>('.md-mermaid'));
  if (blocks.length === 0) return;

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const source = block.textContent?.trim() || '';

    if (!source) continue;

    try {
      const id = `mermaid-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;
      const { svg, bindFunctions } = await mermaid.render(id, source);
      block.innerHTML = svg;
      if (bindFunctions) bindFunctions(block);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to render Mermaid diagram';
      block.innerHTML = `<pre class="mermaid-error">${md.utils.escapeHtml(errorMessage)}</pre>`;
    }
  }
}
