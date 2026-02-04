import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  SplitSquareVertical,
  AlignJustify,
} from 'lucide-react';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';
import clsx from 'clsx';

interface DiffViewerProps {
  oldContent: string;
  newContent: string;
  fileName: string;
  oldFileName?: string;
  onClose?: () => void;
}

export function DiffViewer({
  oldContent,
  newContent,
  fileName,
  oldFileName,
  onClose,
}: DiffViewerProps) {
  const [viewMode, setViewMode] = useState<'split' | 'unified'>('split');
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyNew = async () => {
    await navigator.clipboard.writeText(newContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Calculate stats
  const stats = useMemo(() => {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');

    let additions = 0;
    let deletions = 0;

    // Simple line-by-line comparison
    const maxLen = Math.max(oldLines.length, newLines.length);
    for (let i = 0; i < maxLen; i++) {
      if (oldLines[i] !== newLines[i]) {
        if (i >= oldLines.length || !oldLines[i]) {
          additions++;
        } else if (i >= newLines.length || !newLines[i]) {
          deletions++;
        } else {
          additions++;
          deletions++;
        }
      }
    }

    return { additions, deletions };
  }, [oldContent, newContent]);

  // Custom styles for dark theme
  const diffStyles = {
    variables: {
      dark: {
        diffViewerBackground: '#0d0d0d',
        diffViewerColor: '#fafafa',
        addedBackground: '#22c55e15',
        addedColor: '#22c55e',
        removedBackground: '#ef444415',
        removedColor: '#ef4444',
        wordAddedBackground: '#22c55e30',
        wordRemovedBackground: '#ef444430',
        addedGutterBackground: '#22c55e20',
        removedGutterBackground: '#ef444420',
        gutterBackground: '#141414',
        gutterBackgroundDark: '#0d0d0d',
        highlightBackground: '#7c3aed20',
        highlightGutterBackground: '#7c3aed30',
        codeFoldGutterBackground: '#1a1a1a',
        codeFoldBackground: '#1a1a1a',
        emptyLineBackground: '#141414',
        codeFoldContentColor: '#666666',
      },
    },
    line: {
      padding: '4px 8px',
      fontSize: '13px',
      fontFamily: "'JetBrains Mono', Menlo, Monaco, Consolas, monospace",
    },
    gutter: {
      padding: '0 12px',
      minWidth: '40px',
    },
    codeFold: {
      fontSize: '12px',
    },
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="flex flex-col h-full bg-background rounded-lg border border-border overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-background-secondary border-b border-border">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium">{fileName}</h3>
          {oldFileName && oldFileName !== fileName && (
            <span className="text-xs text-foreground-muted">
              (renamed from {oldFileName})
            </span>
          )}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-success">+{stats.additions}</span>
            <span className="text-error">-{stats.deletions}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center bg-background-tertiary rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('split')}
              className={clsx(
                'p-1.5 rounded transition-colors',
                viewMode === 'split'
                  ? 'bg-background-hover text-foreground'
                  : 'text-foreground-muted hover:text-foreground'
              )}
              title="Split view"
            >
              <SplitSquareVertical className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('unified')}
              className={clsx(
                'p-1.5 rounded transition-colors',
                viewMode === 'unified'
                  ? 'bg-background-hover text-foreground'
                  : 'text-foreground-muted hover:text-foreground'
              )}
              title="Unified view"
            >
              <AlignJustify className="w-4 h-4" />
            </button>
          </div>

          {/* Toggle unchanged */}
          <button
            onClick={() => setShowUnchanged(!showUnchanged)}
            className={clsx(
              'btn-icon p-1.5',
              showUnchanged && 'bg-background-hover'
            )}
            title={showUnchanged ? 'Hide unchanged lines' : 'Show unchanged lines'}
          >
            {showUnchanged ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>

          {/* Copy new content */}
          <button
            onClick={handleCopyNew}
            className="btn-icon p-1.5"
            title="Copy new content"
          >
            {copied ? (
              <Check className="w-4 h-4 text-success" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>

          {/* Close button */}
          {onClose && (
            <button onClick={onClose} className="btn-icon p-1.5" title="Close">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Diff content */}
      <div className="flex-1 overflow-auto">
        <ReactDiffViewer
          oldValue={oldContent}
          newValue={newContent}
          splitView={viewMode === 'split'}
          useDarkTheme={true}
          showDiffOnly={!showUnchanged}
          extraLinesSurroundingDiff={3}
          compareMethod={DiffMethod.WORDS}
          styles={diffStyles}
          leftTitle={oldFileName || 'Original'}
          rightTitle="Modified"
        />
      </div>
    </motion.div>
  );
}

export { DiffViewer as default };
