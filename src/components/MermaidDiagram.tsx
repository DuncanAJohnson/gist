import { useEffect, useId, useRef, useState } from 'react';
import type { Mermaid } from 'mermaid';

let mermaidPromise: Promise<Mermaid> | null = null;
function loadMermaid(): Promise<Mermaid> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((mod) => {
      mod.default.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose',
        // useMaxWidth:false → SVG renders at its natural pixel size instead of
        // setting style="max-width:100%". This avoids the bug where the SVG scales
        // down to fit the container while htmlLabel foreignObjects keep their
        // measured pixel size, clipping multi-line text. With this off, the
        // container's overflow-x-auto handles wide diagrams via scroll.
        flowchart: { htmlLabels: true, curve: 'basis', useMaxWidth: false },
        themeVariables: {
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          fontSize: '14px',
        },
      });
      return mod.default;
    });
  }
  return mermaidPromise;
}

interface MermaidDiagramProps {
  chart: string;
  caption?: string;
}

function MermaidDiagram({ chart, caption }: MermaidDiagramProps) {
  const id = useId().replace(/:/g, '_');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = await loadMermaid();
        if (cancelled) return;
        const renderId = `mermaid_${id}_${Date.now()}`;
        const { svg, bindFunctions } = await mermaid.render(renderId, chart);
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = svg;
        bindFunctions?.(containerRef.current);
        setError(null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  return (
    <figure className="my-6 not-prose">
      <div
        ref={containerRef}
        className="bg-white rounded-lg border border-gray-200 p-6 overflow-x-auto [&>svg]:mx-auto"
      />
      {error && (
        <pre className="mt-2 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700 whitespace-pre-wrap">
          Diagram render error: {error}
        </pre>
      )}
      {caption && (
        <figcaption className="mt-2 text-sm text-gray-600 italic text-center">{caption}</figcaption>
      )}
    </figure>
  );
}

export default MermaidDiagram;
