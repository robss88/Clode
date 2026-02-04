import React, { useEffect, useRef, useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Terminal as TerminalIcon,
  X,
  Plus,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import clsx from 'clsx';

// Dynamically import xterm only in browser
let Terminal: typeof import('xterm').Terminal | undefined;
let FitAddon: typeof import('xterm-addon-fit').FitAddon | undefined;
let WebLinksAddon: typeof import('xterm-addon-web-links').WebLinksAddon | undefined;

if (typeof window !== 'undefined') {
  import('xterm').then((mod) => {
    Terminal = mod.Terminal;
  });
  import('xterm-addon-fit').then((mod) => {
    FitAddon = mod.FitAddon;
  });
  import('xterm-addon-web-links').then((mod) => {
    WebLinksAddon = mod.WebLinksAddon;
  });
}

interface TerminalTab {
  id: string;
  title: string;
}

interface EmbeddedTerminalProps {
  onCommand?: (command: string) => void;
  onData?: (data: string) => void;
  writeData?: string;
  className?: string;
}

export function EmbeddedTerminal({
  onCommand,
  onData,
  writeData,
  className,
}: EmbeddedTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<InstanceType<typeof import('xterm').Terminal> | null>(null);
  const fitAddonRef = useRef<InstanceType<typeof import('xterm-addon-fit').FitAddon> | null>(null);
  const [tabs, setTabs] = useState<TerminalTab[]>([{ id: '1', title: 'Terminal' }]);
  const [activeTab, setActiveTab] = useState('1');
  const [isMaximized, setIsMaximized] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const commandBuffer = useRef('');

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current || !Terminal || !FitAddon) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 13,
      fontFamily: "'JetBrains Mono', Menlo, Monaco, Consolas, monospace",
      theme: {
        background: '#0d0d0d',
        foreground: '#fafafa',
        cursor: '#7c3aed',
        cursorAccent: '#0d0d0d',
        selectionBackground: '#7c3aed40',
        black: '#0d0d0d',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#7c3aed',
        cyan: '#06b6d4',
        white: '#fafafa',
        brightBlack: '#666666',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#fde047',
        brightBlue: '#60a5fa',
        brightMagenta: '#a78bfa',
        brightCyan: '#22d3ee',
        brightWhite: '#ffffff',
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    if (WebLinksAddon) {
      const webLinksAddon = new WebLinksAddon();
      term.loadAddon(webLinksAddon);
    }

    term.open(containerRef.current);
    fitAddon.fit();

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    // Handle input
    term.onData((data) => {
      if (data === '\r') {
        // Enter key
        term.write('\r\n');
        if (commandBuffer.current && onCommand) {
          onCommand(commandBuffer.current);
        }
        commandBuffer.current = '';
        term.write('$ ');
      } else if (data === '\x7f') {
        // Backspace
        if (commandBuffer.current.length > 0) {
          commandBuffer.current = commandBuffer.current.slice(0, -1);
          term.write('\b \b');
        }
      } else if (data === '\x03') {
        // Ctrl+C
        term.write('^C\r\n$ ');
        commandBuffer.current = '';
      } else {
        commandBuffer.current += data;
        term.write(data);
      }

      onData?.(data);
    });

    // Write initial prompt
    term.write('$ ');
    setIsReady(true);

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      term.dispose();
    };
  }, [onCommand, onData]);

  // Write external data
  useEffect(() => {
    if (writeData && terminalRef.current && isReady) {
      terminalRef.current.write(writeData);
    }
  }, [writeData, isReady]);

  // Add new tab
  const handleAddTab = useCallback(() => {
    const newId = String(tabs.length + 1);
    setTabs([...tabs, { id: newId, title: `Terminal ${newId}` }]);
    setActiveTab(newId);
  }, [tabs]);

  // Close tab
  const handleCloseTab = useCallback((id: string) => {
    if (tabs.length === 1) return;

    const newTabs = tabs.filter((t) => t.id !== id);
    setTabs(newTabs);

    if (activeTab === id) {
      setActiveTab(newTabs[newTabs.length - 1].id);
    }
  }, [tabs, activeTab]);

  return (
    <div className={clsx('flex flex-col h-full bg-background', className)}>
      {/* Tab bar */}
      <div className="flex items-center justify-between px-2 py-1 bg-background-secondary border-b border-border">
        <div className="flex items-center gap-1">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-colors',
                activeTab === tab.id
                  ? 'bg-background-hover text-foreground'
                  : 'text-foreground-muted hover:text-foreground'
              )}
            >
              <TerminalIcon className="w-3.5 h-3.5" />
              <span>{tab.title}</span>
              {tabs.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCloseTab(tab.id);
                  }}
                  className="hover:bg-background-active rounded p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={handleAddTab}
            className="btn-icon p-1.5"
            title="New terminal"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <button
          onClick={() => setIsMaximized(!isMaximized)}
          className="btn-icon p-1.5"
          title={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? (
            <Minimize2 className="w-4 h-4" />
          ) : (
            <Maximize2 className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Terminal container */}
      <div ref={containerRef} className="flex-1 p-2" />
    </div>
  );
}

export { EmbeddedTerminal as default };
