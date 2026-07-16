import { useState, useEffect, useRef, useCallback } from 'react';
import {
  makeStyles,
  tokens,
  Button,
  Checkbox,
  Spinner,
  Text,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import {
  CameraRegular,
  ArrowClockwiseRegular,
  ArrowRotateClockwiseRegular,
  ArrowRotateCounterclockwiseRegular,
} from '@fluentui/react-icons';

/**
 * True when the browser exposes a usable camera API.
 *
 * `navigator.mediaDevices` is undefined on plain-http origins (localhost
 * excepted), so this single check covers both an insecure context and an
 * unsupported browser.
 */
export function isCameraSupported() {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

export const CAMERA_UNSUPPORTED_MESSAGE =
  'Camera needs a secure connection (HTTPS) and a supported browser.';

/** Map a getUserMedia rejection to user-facing copy. Switch on `name` — it is
 *  specified and stable, unlike `message`, which is vendor prose. */
function mapGumError(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera permission denied. Allow camera access in your browser’s site settings and try again.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No camera found on this device.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'The camera is in use by another app. Close it and try again.';
    case 'OverconstrainedError':
      return 'This camera does not support the requested settings.';
    case 'AbortError':
      return 'The camera could not be started. Try again.';
    default:
      return err?.message || 'The camera could not be started.';
  }
}

/**
 * Camera focus is the usual cause of soft receipts: some devices default to a
 * fixed or hunting focus. Where the track exposes focus control we nudge it to
 * continuous autofocus (plus steady exposure / white balance for legibility).
 * Feature-detected and fire-and-forget — most laptop webcams expose nothing
 * here and simply keep their fixed focus, and being closer than the lens's
 * minimum focus distance can't be fixed in software (back off + crop instead).
 */
function applyFocusHints(stream) {
  try {
    const track = stream?.getVideoTracks?.()[0];
    const caps = track?.getCapabilities?.();
    if (!track || !caps) return;
    const advanced = [];
    if (caps.focusMode?.includes('continuous')) advanced.push({ focusMode: 'continuous' });
    if (caps.exposureMode?.includes('continuous')) advanced.push({ exposureMode: 'continuous' });
    if (caps.whiteBalanceMode?.includes('continuous')) advanced.push({ whiteBalanceMode: 'continuous' });
    if (advanced.length) track.applyConstraints({ advanced }).catch(() => {});
  } catch { /* focus control unsupported — ignore */ }
}

/** True when the device lets us steer focus, so a "tap to focus" is meaningful. */
function hasFocusControls(stream) {
  try {
    const caps = stream?.getVideoTracks?.()[0]?.getCapabilities?.();
    return !!(caps && (caps.pointsOfInterest || caps.focusMode?.length));
  } catch {
    return false;
  }
}

// Crop rectangle is tracked as fractions of the image [0,1] — resolution
// independent, so it survives the display canvas being scaled by CSS and maps
// to source pixels with a single multiply at confirm time.
const DEFAULT_CROP = { x: 0.08, y: 0.08, w: 0.84, h: 0.84 };
const MIN_CROP = 0.08; // a crop can never collapse below 8% of an axis
const ROTATE_STEP = 2; // degrees per click — fine deskew, not a 90° orientation flip
const CORNERS = ['nw', 'ne', 'sw', 'se'];
const HANDLE_STYLE = {
  nw: { left: -8, top: -8, cursor: 'nwse-resize' },
  ne: { right: -8, top: -8, cursor: 'nesw-resize' },
  sw: { left: -8, bottom: -8, cursor: 'nesw-resize' },
  se: { right: -8, bottom: -8, cursor: 'nwse-resize' },
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function moveCrop(c, dx, dy) {
  return { ...c, x: clamp(c.x + dx, 0, 1 - c.w), y: clamp(c.y + dy, 0, 1 - c.h) };
}

// Each corner resizes against the opposite (fixed) corner, so the box can flip
// neither its width nor height. Deltas are fractions of the image.
function resizeCrop(type, c, dx, dy) {
  const right = c.x + c.w;
  const bottom = c.y + c.h;
  if (type === 'nw') {
    const nx = clamp(c.x + dx, 0, right - MIN_CROP);
    const ny = clamp(c.y + dy, 0, bottom - MIN_CROP);
    return { x: nx, y: ny, w: right - nx, h: bottom - ny };
  }
  if (type === 'ne') {
    const ny = clamp(c.y + dy, 0, bottom - MIN_CROP);
    return { x: c.x, y: ny, w: clamp(c.w + dx, MIN_CROP, 1 - c.x), h: bottom - ny };
  }
  if (type === 'sw') {
    const nx = clamp(c.x + dx, 0, right - MIN_CROP);
    return { x: nx, y: c.y, w: right - nx, h: clamp(c.h + dy, MIN_CROP, 1 - c.y) };
  }
  // se
  return { x: c.x, y: c.y, w: clamp(c.w + dx, MIN_CROP, 1 - c.x), h: clamp(c.h + dy, MIN_CROP, 1 - c.y) };
}

/**
 * Return a canvas holding `src` rotated by `deg` degrees clockwise (any angle,
 * used for fine deskew). At 0° the source is returned as-is — no copy. Otherwise
 * the canvas grows to the rotated bounding box and the gaps are filled white
 * (a document on white, not black), so a slight tilt is corrected without
 * clipping the corners. The crop rect is normalized precisely so it stays valid
 * as the bounding box changes size with the angle.
 */
function drawRotated(src, deg) {
  if (!deg) return src;
  const rad = (deg * Math.PI) / 180;
  const sw = src.width;
  const sh = src.height;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const out = document.createElement('canvas');
  out.width = Math.round(sw * cos + sh * sin);
  out.height = Math.round(sw * sin + sh * cos);
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate(rad);
  ctx.drawImage(src, -sw / 2, -sh / 2);
  return out;
}

/**
 * Black & white: grayscale + contrast, in place. A legibility pass for faded
 * receipts — applied to a copy of the pristine source each time, so unticking
 * it restores the original exactly.
 */
function applyBlackWhite(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const C = 1.3; // contrast factor around mid-grey
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = clamp((lum - 128) * C + 128, 0, 255);
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Unsharp 3x3 sharpen, in place. This is edge sharpening, NOT deblurring — it
 * cannot recover detail the sensor never captured. Convolves each colour
 * channel independently so it works on a colour image too (not only after B&W);
 * border pixels pass through unfiltered.
 */
function applySharpen(ctx, w, h) {
  const src = ctx.getImageData(0, 0, w, h);
  const s = src.data;
  const out = ctx.createImageData(w, h);
  const o = out.data;
  const K = [0, -1, 0, -1, 5, -1, 0, -1, 0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        o[idx] = s[idx]; o[idx + 1] = s[idx + 1]; o[idx + 2] = s[idx + 2]; o[idx + 3] = s[idx + 3];
        continue;
      }
      for (let c = 0; c < 3; c++) {
        let acc = 0;
        let k = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            acc += s[((y + ky) * w + (x + kx)) * 4 + c] * K[k++];
          }
        }
        o[idx + c] = clamp(acc, 0, 255);
      }
      o[idx + 3] = s[idx + 3];
    }
  }
  ctx.putImageData(out, 0, 0);
}

const useStyles = makeStyles({
  pane: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  stage: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground3,
  },
  video: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    display: 'block',
  },
  centered: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    padding: '24px',
    textAlign: 'center',
  },
  // Shrink-wraps the display canvas so the crop overlay aligns to the image
  // exactly, with no letterbox maths.
  cropWrap: {
    position: 'relative',
    display: 'inline-block',
    lineHeight: 0,
    maxWidth: '100%',
  },
  displayCanvas: {
    display: 'block',
    maxWidth: '100%',
    width: 'auto',
    height: 'auto',
  },
  overlay: {
    position: 'absolute',
    inset: 0,
  },
  cropBox: {
    position: 'absolute',
    boxSizing: 'border-box',
    border: `2px solid ${tokens.colorBrandStroke1}`,
    cursor: 'move',
    // Masks everything outside the crop; clipped to the stage by its overflow.
    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)',
    touchAction: 'none', // stop touch drags from scrolling the page
  },
  handle: {
    position: 'absolute',
    width: '14px',
    height: '14px',
    boxSizing: 'border-box',
    backgroundColor: tokens.colorNeutralBackground1,
    border: `2px solid ${tokens.colorBrandStroke1}`,
    borderRadius: '2px',
    touchAction: 'none',
  },
  adjustBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  hint: {
    color: tokens.colorNeutralForeground3,
    marginRight: 'auto',
  },
  focusHint: {
    position: 'absolute',
    bottom: '8px',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '2px 10px',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    color: '#fff',
    fontSize: tokens.fontSizeBase200,
    pointerEvents: 'none', // taps pass through to the video for focus
  },
});

/**
 * Live camera preview → capture → adjust (rotate + crop + B&W/sharpen) → emit a
 * named JPEG `File`. The adjust step lets the user straighten and tighten the
 * shot to just the receipt and optionally clean it up; the emitted File is what
 * gets both parsed and attached, so the contract with consumers is unchanged.
 *
 * The pane owns the MediaStream: mount acquires it, unmount releases it. That
 * gives exactly one release point, enforced by React, so no consumer can leave
 * the camera light on by forgetting to tear down. The stream stays live through
 * the adjust step (the user is mid-capture), which also makes Retake instant.
 * Consumers control the camera purely by mounting/unmounting — no imperative API.
 */
export default function CameraCapturePane({
  onCapture,
  onCancel,
  facingMode = 'environment',
  captureLabel = 'Use photo',
  height = 360,
  hint,
}) {
  const styles = useStyles();
  const [status, setStatus] = useState('starting'); // starting | live | error — the STREAM
  const [mode, setMode] = useState('live');          // live | adjust — the UI step
  const [errorMsg, setErrorMsg] = useState(null);
  const [attempt, setAttempt] = useState(0); // bump to retry
  const [crop, setCrop] = useState(DEFAULT_CROP);
  const [rotation, setRotation] = useState(0); // accumulated degrees clockwise — fine deskew
  const [bw, setBw] = useState(false);
  const [sharpen, setSharpen] = useState(false);
  const [canTapFocus, setCanTapFocus] = useState(false); // device exposes focus control

  const streamRef = useRef(null);
  const videoRef = useRef(null);
  const sourceCanvasRef = useRef(null);  // pristine, full-res frozen frame — never mutated
  const displayCanvasRef = useRef(null); // downscaled preview shown during adjust
  const overlayRef = useRef(null);
  const dragRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let localStream = null;

    const start = async () => {
      setStatus('starting');
      setErrorMsg(null);
      setCanTapFocus(false);

      if (!isCameraSupported()) {
        setStatus('error');
        setErrorMsg(CAMERA_UNSUPPORTED_MESSAGE);
        return;
      }

      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          // `ideal`, never `exact`: an exact facingMode throws OverconstrainedError
          // on any laptop with only a front camera. 1080p is plenty — the model
          // downscales anyway, so a larger capture costs bytes for no accuracy.
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });

        if (cancelled) {
          // Unmounted while the permission prompt was open. Without this the
          // stream is never assigned to the ref and the camera light stays on
          // for the life of the tab.
          localStream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = localStream;
        if (videoRef.current) {
          videoRef.current.srcObject = localStream;
          videoRef.current.play().catch(() => { /* autoplay race — harmless */ });
        }
        setStatus('live');
        // Nudge into continuous autofocus where the device allows it — many
        // default to a fixed/hunting focus, which is why receipts come out soft.
        applyFocusHints(localStream);
        setCanTapFocus(hasFocusControls(localStream));
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        setErrorMsg(mapGumError(err));
      }
    };

    start();

    return () => {
      cancelled = true;
      localStream?.getTracks().forEach((t) => t.stop());
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [facingMode, attempt]);

  // Redraw the adjust preview from the pristine source whenever we enter adjust
  // or a transform changes (rotation / B&W / sharpen). Downscaled so the passes
  // stay snappy; the crop box is only an overlay, so dragging it does NOT re-run
  // this.
  useEffect(() => {
    if (mode !== 'adjust') return;
    const src = sourceCanvasRef.current;
    const disp = displayCanvasRef.current;
    if (!src || !disp || !src.width) return;

    const rotated = drawRotated(src, rotation);
    const MAX = 1000;
    const scale = Math.min(1, MAX / Math.max(rotated.width, rotated.height));
    const w = Math.max(1, Math.round(rotated.width * scale));
    const h = Math.max(1, Math.round(rotated.height * scale));
    disp.width = w;
    disp.height = h;
    const ctx = disp.getContext('2d');
    ctx.drawImage(rotated, 0, 0, w, h);
    if (bw) applyBlackWhite(ctx, w, h);
    if (sharpen) applySharpen(ctx, w, h);
  }, [mode, rotation, bw, sharpen]);

  const handleTakePhoto = useCallback(() => {
    const video = videoRef.current;
    const src = sourceCanvasRef.current;
    if (!video || !src || !video.videoWidth) return; // stream not ready yet

    // Freeze at the negotiated stream size, not the requested ideal — the device
    // may hand back 1280x720 or 1920x1440, and hardcoding would distort the receipt.
    src.width = video.videoWidth;
    src.height = video.videoHeight;
    src.getContext('2d').drawImage(video, 0, 0, src.width, src.height);

    setCrop(DEFAULT_CROP);
    setRotation(0);
    setBw(false);
    setSharpen(false);
    setMode('adjust');
  }, []);

  // Tap the live preview to focus there, where the device supports it. Point is
  // normalized to the element (approximate — good enough for an AF point); we ask
  // for a single-shot lock at that point, falling back to re-arming continuous.
  const handleFocusTap = useCallback((e) => {
    const track = streamRef.current?.getVideoTracks?.()[0];
    const caps = track?.getCapabilities?.();
    if (!track || !caps) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((e.clientY - rect.top) / rect.height, 0, 1);
    const advanced = [];
    if (caps.pointsOfInterest) advanced.push({ pointsOfInterest: [{ x, y }] });
    if (caps.focusMode?.includes('single-shot')) advanced.push({ focusMode: 'single-shot' });
    else if (caps.focusMode?.includes('continuous')) advanced.push({ focusMode: 'continuous' });
    if (advanced.length) track.applyConstraints({ advanced }).catch(() => {});
  }, []);

  // Fine deskew — a few degrees per click to straighten a tilted receipt. Unlike
  // a 90° flip this does NOT reset the crop: you nudge the tilt then crop, and a
  // small angle change barely moves the normalized box.
  const rotate = useCallback((delta) => {
    setRotation((r) => r + delta);
  }, []);

  const handleRetake = useCallback(() => {
    // Stream is still live (never stopped), so this returns to a live preview
    // instantly with no second permission prompt.
    setMode('live');
  }, []);

  const handleConfirm = useCallback(() => {
    const src = sourceCanvasRef.current;
    if (!src || !src.width) return;

    // Apply rotation first, then map the normalized crop onto the rotated image
    // and render just that region at full resolution so the attachment stays
    // sharp (and a tight crop is smaller).
    const rotated = drawRotated(src, rotation);
    const cx = Math.round(crop.x * rotated.width);
    const cy = Math.round(crop.y * rotated.height);
    const cw = Math.max(1, Math.round(crop.w * rotated.width));
    const ch = Math.max(1, Math.round(crop.h * rotated.height));

    const out = document.createElement('canvas');
    out.width = cw;
    out.height = ch;
    const octx = out.getContext('2d');
    octx.drawImage(rotated, cx, cy, cw, ch, 0, 0, cw, ch);
    if (bw) applyBlackWhite(octx, cw, ch);
    if (sharpen) applySharpen(octx, cw, ch);

    out.toBlob(
      (blob) => {
        if (!mountedRef.current) return; // unmounted mid-encode
        if (!blob) {
          setStatus('error');
          setErrorMsg('Could not capture the photo. Try again.');
          return;
        }
        // A named File, not a bare Blob: FormData labels a Blob part "blob",
        // and expenseAttachmentService derives the extension via split('.').pop(),
        // which would save the receipt as ".blob". The unique suffix keeps
        // captures distinguishable on disk and in the file list.
        const name = `receipt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
        setMode('live'); // ready for the next shot (list flow); the form flow unmounts us anyway
        onCapture(new File([blob], name, { type: 'image/jpeg' }));
      },
      'image/jpeg',
      // Receipt glyphs are thin and low-contrast; below ~0.85 JPEG ringing lands
      // on exactly those edges. 1.0 is 2-3x the size for no gain.
      0.92,
    );
  }, [crop, rotation, bw, sharpen, onCapture]);

  // Pointer-drag the crop box / its corner handles. The pointer is captured on
  // the element that started the drag, so move/up route back to it even outside
  // the box; the start rect is snapshotted so deltas are cheap and stable.
  const startDrag = (type) => (e) => {
    e.stopPropagation();
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* older browsers */ }
    dragRef.current = { type, startX: e.clientX, startY: e.clientY, startCrop: crop, rectW: rect.width, rectH: rect.height };
  };

  const handlePointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / d.rectW;
    const dy = (e.clientY - d.startY) / d.rectH;
    setCrop(d.type === 'move' ? moveCrop(d.startCrop, dx, dy) : resizeCrop(d.type, d.startCrop, dx, dy));
  };

  const handlePointerUp = (e) => {
    if (!dragRef.current) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    dragRef.current = null;
  };

  const dragHandlers = {
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerUp,
  };

  const inAdjust = mode === 'adjust' && status !== 'error';

  return (
    <div className={styles.pane}>
      <div className={styles.stage} style={{ height }}>
        {status === 'error' ? (
          <div className={styles.centered}>
            <MessageBar intent="error">
              <MessageBarBody>{errorMsg}</MessageBarBody>
            </MessageBar>
          </div>
        ) : (
          <>
            {status === 'starting' && (
              <div className={styles.centered}>
                <Spinner size="small" label="Starting camera..." />
              </div>
            )}
            {/* Kept mounted across live↔adjust so its srcObject survives — a
                remount would blank the preview since the stream effect won't
                re-run. Not Fluent because Fluent has no video primitive;
                `playsInline` is required on iOS, `muted` for autoplay. */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={styles.video}
              onClick={canTapFocus ? handleFocusTap : undefined}
              style={{
                display: status === 'live' && mode === 'live' ? 'block' : 'none',
                cursor: canTapFocus ? 'crosshair' : 'default',
              }}
            />
            {status === 'live' && mode === 'live' && canTapFocus && (
              <div className={styles.focusHint}>Tap to focus</div>
            )}

            {inAdjust && (
              <div className={styles.cropWrap} style={{ maxHeight: height }}>
                <canvas ref={displayCanvasRef} className={styles.displayCanvas} style={{ maxHeight: height }} />
                <div ref={overlayRef} className={styles.overlay}>
                  <div
                    className={styles.cropBox}
                    style={{
                      left: `${crop.x * 100}%`,
                      top: `${crop.y * 100}%`,
                      width: `${crop.w * 100}%`,
                      height: `${crop.h * 100}%`,
                    }}
                    onPointerDown={startDrag('move')}
                    {...dragHandlers}
                  >
                    {CORNERS.map((corner) => (
                      <div
                        key={corner}
                        className={styles.handle}
                        style={HANDLE_STYLE[corner]}
                        onPointerDown={startDrag(corner)}
                        {...dragHandlers}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Hidden pristine frozen frame — source for both preview and final render. */}
      <canvas ref={sourceCanvasRef} style={{ display: 'none' }} />

      {inAdjust && (
        <div className={styles.adjustBar}>
          <Button
            appearance="subtle"
            icon={<ArrowRotateCounterclockwiseRegular />}
            size="small"
            onClick={() => rotate(-ROTATE_STEP)}
            title={`Rotate left ${ROTATE_STEP}°`}
            aria-label={`Rotate left ${ROTATE_STEP} degrees`}
          />
          <Button
            appearance="subtle"
            icon={<ArrowRotateClockwiseRegular />}
            size="small"
            onClick={() => rotate(ROTATE_STEP)}
            title={`Rotate right ${ROTATE_STEP}°`}
            aria-label={`Rotate right ${ROTATE_STEP} degrees`}
          />
          {rotation !== 0 && (
            <Text size={200} style={{ color: tokens.colorNeutralForeground3, minWidth: '32px' }}>
              {rotation > 0 ? `+${rotation}` : rotation}°
            </Text>
          )}
          <Checkbox label="B&W" checked={bw} onChange={(e, d) => setBw(!!d.checked)} />
          <Checkbox label="Sharpen" checked={sharpen} onChange={(e, d) => setSharpen(!!d.checked)} />
        </div>
      )}

      <div className={styles.actions}>
        {status === 'error' && errorMsg !== CAMERA_UNSUPPORTED_MESSAGE && (
          <Button
            appearance="outline"
            icon={<ArrowClockwiseRegular />}
            size="small"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Retry
          </Button>
        )}

        {inAdjust ? (
          <>
            <Text size={200} className={styles.hint}>Drag the box to crop</Text>
            <Button appearance="secondary" size="small" onClick={handleRetake}>
              Retake
            </Button>
            <Button appearance="primary" icon={<CameraRegular />} size="small" onClick={handleConfirm}>
              {captureLabel}
            </Button>
          </>
        ) : (
          <>
            {hint && status === 'live' && (
              <Text size={200} className={styles.hint}>{hint}</Text>
            )}
            <Button appearance="secondary" size="small" onClick={onCancel}>
              {hint ? 'Done' : 'Cancel'}
            </Button>
            <Button
              appearance="primary"
              icon={<CameraRegular />}
              size="small"
              onClick={handleTakePhoto}
              disabled={status !== 'live'}
            >
              Take photo
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
