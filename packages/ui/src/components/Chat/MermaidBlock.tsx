import React, { useEffect, useRef, useState } from 'react';

let mermaidInstance: typeof import('mermaid').default | null = null;
let mermaidLoading: Promise<typeof import('mermaid').default> | null = null;

function loadMermaid() {
  if (mermaidInstance) return Promise.resolve(mermaidInstance);
  if (mermaidLoading) return mermaidLoading;
  mermaidLoading = import('mermaid').then((mod) => {
    mermaidInstance = mod.default;
    mermaidInstance.initialize({
      startOnLoad: false,
      theme: 'dark',
      themeVariables: {
        darkMode: true,
        background: '#1e1e1e',
        primaryColor: '#3b82f6',
        primaryTextColor: '#e5e7eb',
        primaryBorderColor: '#4b5563',
        lineColor: '#6b7280',
        secondaryColor: '#374151',
        tertiaryColor: '#1f2937',
      },
    });
    return mermaidInstance;
  });
  return mermaidLoading;
}

let idCounter = 0;

export function MermaidBlock({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const id = `mermaid-${Date.now()}-${idCounter++}`;
    loadMermaid()
      .then((m) => m.render(id, code))
      .then(({ svg: renderedSvg }) => {
        if (!cancelled) {
          setSvg(renderedSvg);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message || 'Failed to render diagram');
        }
      });
    return () => { cancelled = true; };
  }, [code]);

  if (error) {
    return (
      <div className="my-3 rounded-lg border border-border overflow-hidden">
        <div className="code-block-header">
          <span className="text-xs text-foreground-muted font-mono">mermaid (render error)</span>
        </div>
        <pre className="code-block-content">
          <code>{code}</code>
        </pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="my-3 p-4 rounded-lg border border-border bg-background-tertiary text-center">
        <span className="text-xs text-foreground-muted">Rendering diagram...</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="my-3 p-4 rounded-lg border border-border bg-background-tertiary overflow-x-auto [&_svg]:max-w-full [&_svg]:h-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
