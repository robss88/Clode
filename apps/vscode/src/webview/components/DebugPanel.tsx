import { useRef, useEffect } from 'react';
import { useAgentStore, useUIStore } from '@claude-agent/ui';

export function DebugPanel() {
  const { showDebugPanel, toggleDebugPanel } = useUIStore();
  const debugRawLines = useAgentStore((s) => s.debugRawLines);
  const clearDebugRawLines = useAgentStore((s) => s.clearDebugRawLines);
  const panelRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (showDebugPanel && panelRef.current) {
      panelRef.current.scrollTop = panelRef.current.scrollHeight;
    }
  }, [debugRawLines, showDebugPanel]);

  return (
    <>
      {/* Toggle button — fixed bottom-right */}
      <button
        type="button"
        onClick={toggleDebugPanel}
        className="fixed bottom-2 right-2 z-50 w-7 h-7 flex items-center justify-center rounded bg-background-tertiary border border-border text-foreground-muted hover:text-foreground text-[10px] font-mono transition-colors"
        title="Toggle raw CLI output"
      >
        {showDebugPanel ? '×' : '{}'}
      </button>

      {/* Panel */}
      {showDebugPanel && (
        <div className="fixed inset-x-0 bottom-0 z-40 h-[40vh] flex flex-col bg-[#0d0d0d] border-t border-border">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border text-[11px]">
            <span className="text-foreground-muted font-mono">Raw CLI Output ({debugRawLines.length} chunks)</span>
            <button
              type="button"
              onClick={clearDebugRawLines}
              className="text-foreground-muted hover:text-foreground transition-colors"
            >
              Clear
            </button>
          </div>
          <div ref={panelRef} className="flex-1 overflow-y-auto font-mono text-[11px] p-2 space-y-px">
            {debugRawLines.length === 0 ? (
              <div className="text-foreground-muted/50 text-center py-4">No output yet. Send a message to see raw CLI chunks.</div>
            ) : (
              debugRawLines.map((line, i) => {
                const ts = new Date(line.timestamp).toISOString().slice(11, 23);
                const type = line.data?.type || '?';
                return (
                  <div key={i} className="flex gap-2 hover:bg-white/5 px-1 rounded">
                    <span className="text-foreground-muted/40 flex-shrink-0 select-none">{ts}</span>
                    <span className="text-accent flex-shrink-0">{type}</span>
                    <span className="text-foreground-muted whitespace-pre-wrap break-all">
                      {JSON.stringify(line.data, null, 0).slice(0, 500)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </>
  );
}