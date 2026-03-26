import mermaid from 'mermaid';

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
      block.innerHTML = `<pre class="mermaid-error">${errorMessage}</pre>`;
    }
  }
}
