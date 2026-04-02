import { useEffect, useRef, useState } from 'react';
import { makeStyles, tokens, Button, Tooltip } from '@fluentui/react-components';
import { ChatRegular, DismissRegular } from '@fluentui/react-icons';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

const useStyles = makeStyles({
  toggle: {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    zIndex: 1000,
    minWidth: '48px',
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    padding: '0',
    boxShadow: tokens.shadow16,
  },
  panel: {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    width: '700px',
    height: '500px',
    zIndex: 1001,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    boxShadow: tokens.shadow64,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground3,
  },
  headerTitle: {
    fontSize: '13px',
    fontWeight: '600',
    color: tokens.colorNeutralForeground1,
  },
  terminalContainer: {
    flex: 1,
    padding: '4px',
    overflow: 'hidden',
  },
});

/**
 * Reusable Claude Code chat component.
 * Renders a floating toggle button + panel with an xterm.js terminal
 * connected to a Claude CLI process via WebSocket.
 *
 * @param {Object} props
 * @param {string} props.type - Asset type: 'daily-plan' or 'notebook'
 * @param {string} props.id   - Asset identifier (date for daily-plan, _id for notebook)
 */
export default function ClaudeChat({ type, id }) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const termRef = useRef(null);
  const terminalRef = useRef(null);
  const fitAddonRef = useRef(null);
  const wsRef = useRef(null);

  useEffect(() => {
    if (!open || !type || !id) return;

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#fafafa',
        foreground: '#242424',
        cursor: '#0078D4',
        cursorAccent: '#fafafa',
        selectionBackground: '#0078D440',
        selectionForeground: '#242424',
        black: '#242424',
        red: '#d13438',
        green: '#107c10',
        yellow: '#ca5010',
        blue: '#0078D4',
        magenta: '#881798',
        cyan: '#00b7c3',
        white: '#e1dfdd',
        brightBlack: '#605e5c',
        brightRed: '#d13438',
        brightGreen: '#107c10',
        brightYellow: '#ca5010',
        brightBlue: '#0078D4',
        brightMagenta: '#881798',
        brightCyan: '#00b7c3',
        brightWhite: '#fafafa',
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    terminal.open(termRef.current);
    fitAddon.fit();

    // Connect WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/claude-chat?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const data = event.data instanceof ArrayBuffer
        ? new Uint8Array(event.data)
        : event.data;
      terminal.write(data);
    };

    ws.onclose = () => {
      terminal.write('\r\n\x1b[90m[Session ended]\x1b[0m\r\n');
    };

    ws.onerror = () => {
      terminal.write('\r\n\x1b[31m[Connection error]\x1b[0m\r\n');
    };

    // Forward terminal input to WebSocket
    terminal.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    // Handle resize
    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    const observer = new ResizeObserver(() => fitAddon.fit());
    if (termRef.current) observer.observe(termRef.current);

    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
      ws.close();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      wsRef.current = null;
    };
  }, [open, type, id]);

  if (!type || !id) return null;

  return (
    <>
      {!open && (
        <Tooltip content="Claude Chat" relationship="label" positioning="above">
          <Button
            className={styles.toggle}
            appearance="primary"
            icon={<ChatRegular />}
            onClick={() => setOpen(true)}
          />
        </Tooltip>
      )}
      {open && (
        <div className={styles.panel}>
          <div className={styles.header}>
            <span className={styles.headerTitle}>Claude Chat</span>
            <Button
              appearance="subtle"
              icon={<DismissRegular />}
              size="small"
              onClick={() => setOpen(false)}
            />
          </div>
          <div className={styles.terminalContainer} ref={termRef} />
        </div>
      )}
    </>
  );
}
