import { useState, useEffect, useRef, useCallback } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Spinner,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import { consoleApi } from '../../api/index.js';

const useStyles = makeStyles({
  page: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
  header: {
    padding: '16px 24px 12px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  title: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase500,
    display: 'block',
    marginBottom: '4px',
  },
  subtitle: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  terminal: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#1e1e1e',
    margin: '0 24px 24px',
    borderRadius: '6px',
    overflow: 'hidden',
    minHeight: 0,
  },
  output: {
    flex: 1,
    overflow: 'auto',
    padding: '12px 16px',
    fontFamily: '"Cascadia Code", "Fira Code", "Consolas", monospace',
    fontSize: '13px',
    lineHeight: '1.5',
    color: '#d4d4d4',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  },
  inputRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 16px 12px',
    borderTop: '1px solid #333',
    gap: '8px',
  },
  prompt: {
    fontFamily: '"Cascadia Code", "Fira Code", "Consolas", monospace',
    fontSize: '13px',
    color: '#569cd6',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  input: {
    flex: 1,
    backgroundColor: 'transparent',
    border: 'none',
    outline: 'none',
    fontFamily: '"Cascadia Code", "Fira Code", "Consolas", monospace',
    fontSize: '13px',
    color: '#d4d4d4',
    caretColor: '#d4d4d4',
  },
  lineCommand: {
    color: '#569cd6',
  },
  lineStdout: {
    color: '#d4d4d4',
  },
  lineStderr: {
    color: '#f44747',
  },
  lineInfo: {
    color: '#6a9955',
  },
});

function buildWelcomeLines(welcome) {
  const lines = [];
  lines.push({ type: 'info', text: `Sandbox: ${welcome.sandboxRoot}` });
  lines.push({ type: 'stdout', text: '' });
  for (const section of welcome.sections) {
    lines.push({ type: 'command', text: `  ${section.title}` });
    for (const item of section.items) {
      lines.push({ type: 'stdout', text: `    ${item}` });
    }
    lines.push({ type: 'stdout', text: '' });
  }
  return lines;
}

function formatPrompt(cwd, sandboxRoot) {
  if (!cwd || !sandboxRoot) return 'notebooks$ ';
  if (cwd === sandboxRoot) return 'notebooks$ ';
  const relative = cwd.slice(sandboxRoot.length + 1);
  return `notebooks/${relative}$ `;
}

export default function ConsolePage() {
  const styles = useStyles();
  const [lines, setLines] = useState([]);
  const [input, setInput] = useState('');
  const [cwd, setCwd] = useState('');
  const [sandboxRoot, setSandboxRoot] = useState('');
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [error, setError] = useState('');
  const [welcomeData, setWelcomeData] = useState(null);
  const outputRef = useRef(null);
  const inputRef = useRef(null);

  // Load sandbox info + welcome on mount
  useEffect(() => {
    Promise.all([consoleApi.getInfo(), consoleApi.getWelcome()])
      .then(([info, welcome]) => {
        setSandboxRoot(info.sandboxRoot);
        setCwd(info.sandboxRoot);
        setWelcomeData(welcome);
        setLines(buildWelcomeLines(welcome));
      })
      .catch((err) => {
        setError(err.message);
      });
  }, []);

  // Auto-scroll output to bottom
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [lines]);

  // Focus input on click anywhere in terminal
  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const executeCommand = useCallback(async (command) => {
    const trimmed = command.trim();
    if (!trimmed) return;

    // Add to history
    setHistory((prev) => {
      const filtered = prev.filter((h) => h !== trimmed);
      return [trimmed, ...filtered].slice(0, 100);
    });
    setHistoryIndex(-1);

    // Handle local 'clear' command
    if (trimmed === 'clear') {
      setLines([]);
      return;
    }

    // Handle local 'help' command — render welcome data from server
    if (trimmed === 'help') {
      const helpLines = [{ type: 'command', text: `${formatPrompt(cwd, sandboxRoot)}${trimmed}` }];
      if (welcomeData) {
        helpLines.push(...buildWelcomeLines(welcomeData));
      } else {
        helpLines.push({ type: 'info', text: 'Sandboxed console — type commands to execute them.' });
      }
      setLines((prev) => [...prev, ...helpLines]);
      return;
    }

    // Show the command in output
    setLines((prev) => [...prev, { type: 'command', text: `${formatPrompt(cwd, sandboxRoot)}${trimmed}` }]);
    setRunning(true);

    try {
      const result = await consoleApi.execute(trimmed, cwd);
      const newLines = [];
      if (result.stdout) newLines.push({ type: 'stdout', text: result.stdout });
      if (result.stderr) newLines.push({ type: result.exitCode !== 0 ? 'stderr' : 'stdout', text: result.stderr });
      setLines((prev) => [...prev, ...newLines]);
      setCwd(result.cwd);
    } catch (err) {
      setLines((prev) => [...prev, { type: 'stderr', text: err.message }]);
    } finally {
      setRunning(false);
    }
  }, [cwd, sandboxRoot]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !running) {
      e.preventDefault();
      const cmd = input;
      setInput('');
      executeCommand(cmd);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const newIndex = Math.min(historyIndex + 1, history.length - 1);
      setHistoryIndex(newIndex);
      setInput(history[newIndex]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex <= 0) {
        setHistoryIndex(-1);
        setInput('');
      } else {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInput(history[newIndex]);
      }
    } else if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault();
      if (running) return;
      setLines((prev) => [...prev, { type: 'command', text: `${formatPrompt(cwd, sandboxRoot)}${input}^C` }]);
      setInput('');
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      setLines([]);
    }
  }, [input, running, history, historyIndex, executeCommand, cwd, sandboxRoot]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Text className={styles.title}>Console</Text>
        <Text className={styles.subtitle}>
          Sandboxed terminal — restricted to the notebooks directory. Git and file commands available.
        </Text>
      </div>

      {error && (
        <div style={{ padding: '0 24px' }}>
          <MessageBar intent="error">
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        </div>
      )}

      <div className={styles.terminal} onClick={focusInput}>
        <div className={styles.output} ref={outputRef}>
          {lines.map((line, i) => (
            <div key={i} className={styles[`line${line.type.charAt(0).toUpperCase() + line.type.slice(1)}`] || styles.lineStdout}>
              {line.text}
            </div>
          ))}
        </div>
        <div className={styles.inputRow}>
          <span className={styles.prompt}>
            {formatPrompt(cwd, sandboxRoot)}
          </span>
          {running ? (
            <Spinner size="tiny" />
          ) : (
            <input
              ref={inputRef}
              className={styles.input}
              value={input}
              onChange={(e) => { setInput(e.target.value); setHistoryIndex(-1); }}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              autoComplete="off"
              autoFocus
            />
          )}
        </div>
      </div>
    </div>
  );
}
