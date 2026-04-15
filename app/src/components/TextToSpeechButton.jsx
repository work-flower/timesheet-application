import { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Button, Slider, Spinner, Tooltip, tokens } from '@fluentui/react-components';
import { PlayRegular, PauseRegular, StopRegular } from '@fluentui/react-icons';
import { ttsApi } from '../api/index.js';

function formatTime(seconds) {
  if (!isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const TextToSpeechButton = forwardRef(function TextToSpeechButton({ text, backgroundMusic, audioUrl, onAudioGenerated, disabled: externalDisabled, persistKey }, ref) {
  const [state, setState] = useState('idle'); // idle | preflight | loading | ready
  const [error, setError] = useState(null);
  const [geminiReady, setGeminiReady] = useState(null);
  const [preflightSeconds, setPreflightSeconds] = useState(5);
  const [countdown, setCountdown] = useState(0);
  const [audioSrc, setAudioSrc] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioElRef = useRef(null);
  const blobUrlRef = useRef(null);
  const bgAudioRef = useRef(null);
  const preflightRef = useRef(null);
  const shouldAutoPlayRef = useRef(false);

  const storageKey = persistKey ? `tts-pos-${persistKey}` : null;

  useEffect(() => {
    ttsApi.getStatus().then((s) => {
      setGeminiReady(s.ready);
      setPreflightSeconds(s.preflightSeconds ?? 5);
    }).catch(() => setGeminiReady(false));
  }, []);

  // Verify cached audio exists on mount
  useEffect(() => {
    if (!audioUrl) return;
    let cancelled = false;
    fetch(audioUrl, { method: 'HEAD' }).then((res) => {
      if (!cancelled && res.ok) {
        setAudioSrc(audioUrl);
        setState('ready');
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [audioUrl]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
    };
  }, []);

  const cleanupBgMusic = useCallback(() => {
    if (bgAudioRef.current) {
      bgAudioRef.current.pause();
      bgAudioRef.current = null;
    }
  }, []);

  const cancelPreflight = useCallback(() => {
    if (preflightRef.current) {
      clearInterval(preflightRef.current.timer);
      preflightRef.current.reject(new Error('Cancelled'));
      preflightRef.current = null;
    }
    setCountdown(0);
  }, []);

  const startPreflight = useCallback((seconds) => {
    return new Promise((resolve, reject) => {
      let remaining = seconds;
      setCountdown(remaining);
      const timer = setInterval(() => {
        remaining -= 1;
        setCountdown(remaining);
        if (remaining <= 0) {
          clearInterval(timer);
          preflightRef.current = null;
          resolve();
        }
      }, 1000);
      preflightRef.current = { timer, resolve, reject };
    });
  }, []);

  const startBgMusic = useCallback(async () => {
    if (!backgroundMusic) return;
    try {
      const settings = await ttsApi.getBackgroundMusicSettings();
      if (!settings.hasMusic || !settings.filename) return;

      const bgAudio = new Audio(ttsApi.getBackgroundMusicUrl(settings.filename));
      bgAudio.loop = true;
      bgAudio.volume = (settings.volume ?? 10) / 100;
      bgAudioRef.current = bgAudio;
      await bgAudio.play();
    } catch {
      // Background music is optional
    }
  }, [backgroundMusic]);

  const handleLoadedMetadata = useCallback(() => {
    const el = audioElRef.current;
    if (!el) return;
    setDuration(el.duration);
    if (storageKey) {
      const saved = localStorage.getItem(storageKey);
      if (saved != null) {
        const pos = parseFloat(saved);
        if (isFinite(pos) && pos > 0) {
          el.currentTime = pos;
          setCurrentTime(pos);
        }
      }
    }
    if (shouldAutoPlayRef.current) {
      shouldAutoPlayRef.current = false;
      el.play().catch(() => {});
    }
  }, [storageKey]);

  const handleTimeUpdate = useCallback(() => {
    const el = audioElRef.current;
    if (!el) return;
    setCurrentTime(el.currentTime);
    if (storageKey) {
      localStorage.setItem(storageKey, String(el.currentTime));
    }
  }, [storageKey]);

  const handleEnded = useCallback(() => {
    setPlaying(false);
    if (storageKey) localStorage.removeItem(storageKey);
    cleanupBgMusic();
  }, [storageKey, cleanupBgMusic]);

  const handleSeek = useCallback((_ev, data) => {
    const el = audioElRef.current;
    if (!el) return;
    el.currentTime = data.value;
    setCurrentTime(data.value);
  }, []);

  const togglePlayPause = useCallback(() => {
    const el = audioElRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, []);

  const handleGenerate = useCallback(async (textOverride) => {
    const content = textOverride || text;
    setError(null);

    // Already have audio loaded — just play it
    if (audioSrc && audioElRef.current) {
      audioElRef.current.play().catch(() => {});
      return;
    }

    // Try cached audio first
    if (audioUrl && !audioSrc) {
      setState('loading');
      try {
        const res = await fetch(audioUrl, { method: 'HEAD' });
        if (res.ok) {
          shouldAutoPlayRef.current = true;
          setAudioSrc(audioUrl);
          setState('ready');
          return;
        }
        // 404 — no cached audio, fall through to generate
      } catch {
        // fall through to generate
      }
    }

    if (!content?.trim()) {
      setState('idle');
      return;
    }

    setState('loading');

    try {
      if (preflightSeconds > 0) {
        setState('preflight');
        await startPreflight(preflightSeconds);
        setState('loading');
      }

      const blob = await ttsApi.generateSpeech(content);
      const url = URL.createObjectURL(blob);
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = url;

      shouldAutoPlayRef.current = true;
      setAudioSrc(url);
      setState('ready');

      if (onAudioGenerated) onAudioGenerated(blob);
    } catch (err) {
      if (err.message === 'Cancelled') {
        setState('idle');
        return;
      }
      setError(err.message);
      setState('idle');
    }
  }, [text, audioUrl, audioSrc, preflightSeconds, startPreflight, onAudioGenerated]);

  const handleStop = () => {
    cancelPreflight();
    setState('idle');
  };

  useImperativeHandle(ref, () => ({ play: handleGenerate }), [handleGenerate]);

  const canPlay = audioUrl || geminiReady;
  const disabled = externalDisabled || !canPlay || (!text?.trim() && !audioUrl);
  const notConfiguredMessage = !geminiReady && !audioUrl
    ? 'Gemini text-to-speech configuration is not set and tested successfully.'
    : undefined;

  // Custom Fluent UI player when ready
  if (state === 'ready' && audioSrc) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 260 }}>
        {/* Hidden audio element */}
        <audio
          ref={audioElRef}
          src={audioSrc}
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          onPlay={() => { setPlaying(true); startBgMusic(); }}
          onPause={() => { setPlaying(false); cleanupBgMusic(); }}
        />
        <Button
          appearance="subtle"
          size="small"
          icon={playing ? <PauseRegular /> : <PlayRegular />}
          onClick={togglePlayPause}
          style={{ minWidth: 28, padding: '2px 4px' }}
        />
        <span style={{ fontSize: 11, color: tokens.colorNeutralForeground3, whiteSpace: 'nowrap', minWidth: 36, textAlign: 'right' }}>
          {formatTime(currentTime)}
        </span>
        <Slider
          size="small"
          min={0}
          max={duration || 1}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          style={{ flex: 1, minWidth: 100 }}
        />
        <span style={{ fontSize: 11, color: tokens.colorNeutralForeground3, whiteSpace: 'nowrap', minWidth: 36 }}>
          {formatTime(duration)}
        </span>
      </div>
    );
  }

  if (state === 'preflight') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <Spinner size="tiny" />
        <Button appearance="subtle" size="small" icon={<StopRegular />} onClick={handleStop}>
          Cancel ({countdown}s)
        </Button>
      </span>
    );
  }

  if (state === 'loading') {
    return (
      <Button appearance="subtle" size="small" disabled icon={<Spinner size="tiny" />}>
        Generating...
      </Button>
    );
  }

  // Show "Generate" when no cached audio, "Listen" when cached
  const buttonLabel = audioSrc ? 'Listen' : 'Generate';

  const button = (
    <Button
      appearance="subtle"
      size="small"
      icon={<PlayRegular />}
      onClick={() => handleGenerate()}
      disabled={notConfiguredMessage ? undefined : disabled}
      disabledFocusable={notConfiguredMessage ? true : undefined}
      title={error || undefined}
    >
      {buttonLabel}
    </Button>
  );

  return (
    <>
      {notConfiguredMessage ? (
        <Tooltip content={notConfiguredMessage} relationship="label" withArrow>
          {button}
        </Tooltip>
      ) : button}
      {error && <span style={{ color: 'red', fontSize: 12, marginLeft: 4 }}>{error}</span>}
    </>
  );
});

export default TextToSpeechButton;
