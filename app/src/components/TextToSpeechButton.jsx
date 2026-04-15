import { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Button, Spinner, Tooltip } from '@fluentui/react-components';
import { PlayRegular, StopRegular } from '@fluentui/react-icons';
import { ttsApi } from '../api/index.js';

const TextToSpeechButton = forwardRef(function TextToSpeechButton({ text, backgroundMusic, audioUrl, onAudioGenerated, disabled: externalDisabled }, ref) {
  const [state, setState] = useState('idle'); // idle | preflight | loading | playing
  const [error, setError] = useState(null);
  const [geminiReady, setGeminiReady] = useState(null); // null = loading, true/false
  const [preflightSeconds, setPreflightSeconds] = useState(5);
  const [countdown, setCountdown] = useState(0);
  const audioRef = useRef(null);
  const urlRef = useRef(null);
  const bgAudioRef = useRef(null);
  const preflightRef = useRef(null); // { timer, resolve, reject }
  const pendingContentRef = useRef(null);

  useEffect(() => {
    ttsApi.getStatus().then((s) => {
      setGeminiReady(s.ready);
      setPreflightSeconds(s.preflightSeconds ?? 5);
    }).catch(() => setGeminiReady(false));
  }, []);

  const cleanupBgMusic = useCallback(() => {
    if (bgAudioRef.current) {
      bgAudioRef.current.pause();
      bgAudioRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    cleanupBgMusic();
  }, [cleanupBgMusic]);

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
      // Background music is optional — don't fail TTS if it errors
    }
  }, [backgroundMusic]);

  const playAudioElement = useCallback(async (src, isObjectUrl) => {
    const audio = new Audio(src);
    audioRef.current = audio;
    if (isObjectUrl) urlRef.current = src;

    audio.onended = () => {
      cleanup();
      setState('idle');
    };

    audio.onerror = () => {
      cleanup();
      setError('Audio playback failed');
      setState('idle');
    };

    await audio.play();
    await startBgMusic();
    setState('playing');
  }, [cleanup, startBgMusic]);

  const handlePlay = useCallback(async (textOverride) => {
    const content = textOverride || text;

    setError(null);
    setState('loading');

    try {
      // Try cached audio first
      if (audioUrl) {
        const res = await fetch(audioUrl);
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          await playAudioElement(url, true);
          return;
        }
        if (res.status !== 404) {
          throw new Error(`Failed to load cached audio: ${res.status}`);
        }
        // 404 — no cached audio, fall through to generate
      }

      if (!content?.trim()) {
        setState('idle');
        return;
      }

      // Pre-flight countdown before expensive Gemini call
      if (preflightSeconds > 0) {
        setState('preflight');
        pendingContentRef.current = content;
        await startPreflight(preflightSeconds);
        setState('loading');
      }

      const blob = await ttsApi.generateSpeech(content);
      const url = URL.createObjectURL(blob);
      await playAudioElement(url, true);

      // Notify caller with the generated blob so it can be saved
      if (onAudioGenerated) onAudioGenerated(blob);
    } catch (err) {
      cleanup();
      if (err.message === 'Cancelled') {
        setState('idle');
        return;
      }
      setError(err.message);
      setState('idle');
    }
  }, [text, audioUrl, preflightSeconds, cleanup, playAudioElement, startPreflight, onAudioGenerated]);

  const handleStop = () => {
    cancelPreflight();
    cleanup();
    setState('idle');
  };

  useImperativeHandle(ref, () => ({ play: handlePlay }), [handlePlay]);

  // Can play if: Gemini is configured OR cached audio exists
  const canPlay = audioUrl || geminiReady;
  const disabled = externalDisabled || !canPlay || (!text?.trim() && !audioUrl);
  const notConfiguredMessage = !geminiReady && !audioUrl
    ? 'Gemini text-to-speech configuration is not set and tested successfully.'
    : undefined;

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

  if (state === 'playing') {
    return (
      <Button appearance="subtle" size="small" icon={<StopRegular />} onClick={handleStop}>
        Stop
      </Button>
    );
  }

  const button = (
    <Button
      appearance="subtle"
      size="small"
      icon={<PlayRegular />}
      onClick={() => handlePlay()}
      disabled={notConfiguredMessage ? undefined : disabled}
      disabledFocusable={notConfiguredMessage ? true : undefined}
      title={error || undefined}
    >
      Listen
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
