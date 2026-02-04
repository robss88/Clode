# Claude Agent

A beautiful, cross-platform Claude Code agent with powerful checkpoint management. Easily revert to any point in your coding session and navigate forward/backward through your work history.

## Features

- **Beautiful Modern UI** - Cursor-inspired interface with dark theme
- **Powerful Checkpoint System** - Git-based checkpoints with bidirectional navigation
- **Cross-Platform** - Single codebase for desktop (Electron) and VSCode extension
- **Claude Code Integration** - Direct integration with Claude Code CLI
- **File Explorer** - View and navigate your project files with change indicators
- **Diff Viewer** - See exactly what changed at each checkpoint
- **Embedded Terminal** - Run commands without leaving the app
- **Multi-Project Support** - Work with multiple projects

## Checkpoint System

The checkpoint system is the heart of Claude Agent:

- **Automatic Checkpoints** - Created automatically after file modifications
- **Manual Checkpoints** - Create checkpoints anytime with Ctrl/Cmd+S
- **Bidirectional Navigation** - Go back AND forward through checkpoints
- **Branching** - Create branches when you diverge from a previous checkpoint
- **Sticky Headers** - Checkpoints grouped by time (Today, Yesterday, etc.)
- **Quick Preview** - Hover to see what changed without switching

### Keyboard Shortcuts

| Action | Mac | Windows/Linux |
|--------|-----|---------------|
| Previous checkpoint | ⌘Z | Ctrl+Z |
| Next checkpoint | ⌘⇧Z | Ctrl+Shift+Z |
| Create checkpoint | ⌘S | Ctrl+S |
| Toggle file explorer | ⌘B | Ctrl+B |
| Toggle checkpoints | ⌘H | Ctrl+H |
| Toggle terminal | ⌘\` | Ctrl+\` |
| Focus chat | ⌘K | Ctrl+K |

## Project Structure

```
claude-agent/
├── packages/
│   ├── core/           # Business logic, Claude integration, checkpoints
│   └── ui/             # React components, stores, hooks
├── apps/
│   ├── desktop/        # Electron desktop app
│   └── vscode/         # VSCode extension
├── turbo.json          # Turborepo config
└── package.json        # Workspace root
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm 10+
- Claude Code CLI installed (`claude` command available)
- Git

### Installation

```bash
# Clone the repository
cd claude-agent

# Install dependencies
npm install

# Build all packages
npm run build
```

### Development

```bash
# Start all packages in dev mode
npm run dev

# Or run specific apps
npm run desktop    # Run Electron app
npm run vscode     # Build VSCode extension
```

### Desktop App

```bash
# Development
cd apps/desktop
npm run dev

# Build for production
npm run build
npm run package        # Build for current platform
npm run package:mac    # Build for macOS
npm run package:win    # Build for Windows
npm run package:linux  # Build for Linux
```

### VSCode Extension

```bash
# Build extension
cd apps/vscode
npm run build

# Package for distribution
npm run package
```

## Architecture

### Core Package (`@claude-agent/core`)

- **ClaudeCodeManager** - Spawns and manages Claude Code CLI subprocess
- **CheckpointManager** - High-level checkpoint API
- **CheckpointTree** - In-memory tree structure for bidirectional navigation
- **GitCheckpointStorage** - Git-based persistence for checkpoints
- **ProjectManager** - Multi-project support

### UI Package (`@claude-agent/ui`)

- **Layout** - Main app shell with resizable panels
- **ChatInterface** - Chat with streaming and tool call visualization
- **CheckpointTimeline** - Timeline with sticky headers and navigation
- **FileExplorer** - Tree view with change indicators
- **DiffViewer** - Split/unified diff display
- **EmbeddedTerminal** - xterm.js-based terminal
- **Zustand Stores** - State management

## How Checkpoints Work

1. **Git-Based Storage**: Each checkpoint is a git commit on a hidden branch
2. **Tree Structure**: Checkpoints form a tree, not just a linear list
3. **Bidirectional**: Both parent and child references are tracked
4. **Metadata**: Checkpoint info stored in `.claude-agent/checkpoints.json`

### Navigation Example

```
      [A] ← You start here
       |
      [B] ← Made some changes
       |
      [C] ← More changes
       |
      [D] ← Current (you're here)
```

If you go back to [B] and make new changes:

```
      [A]
       |
      [B] ← Went back here
      / \
    [C]  [E] ← New branch (current)
     |
    [D] ← Still accessible!
```

You can still navigate to [C] and [D] because forward references are preserved.

## Configuration

### Desktop App

Settings are stored in:
- macOS: `~/Library/Application Support/claude-agent/`
- Windows: `%APPDATA%/claude-agent/`
- Linux: `~/.config/claude-agent/`

### VSCode Extension

```json
{
  "claude-agent.autoCheckpoint": true,
  "claude-agent.maxCheckpoints": 100
}
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test`
5. Submit a pull request

## License

MIT
