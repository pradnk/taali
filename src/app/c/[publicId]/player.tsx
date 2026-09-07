'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The play control for a certificate.
 *
 * Two deliberate non-decisions, both of which the obvious instinct gets wrong
 * for this audience:
 *
 *   1. It does not autoplay. A visually impaired visitor's screen reader begins announcing
 *      the page the moment it loads; audio starting on top of that talks over
 *      the very thing telling them whose certificate this is. Browsers would
 *      block it anyway, but this would be the right call even if they did not.
 *
 *   2. It does not steal focus on mount. Moving focus past the heading means a
 *      screen reader user hears "Play, button" before they hear the name. The
 *      button is instead the first focusable thing after the heading, one Tab
 *      away, with the name already announced.
 *
 * A native <audio controls> sits underneath the big button for seeking and
 * volume: it is fully keyboard accessible and correctly labelled on every
 * platform for free, which no custom scrubber achieves.
 */

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00';
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export function CertificatePlayer({
  audioUrl,
  studentName,
  downloadName,
}: {
  audioUrl: string;
  studentName: string;
  downloadName: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => {
      setPlaying(true);
      setStatus('Playing');
    };
    const onPause = () => {
      setPlaying(false);
      // An ended track fires pause too; onEnded sets the better message after.
      setStatus('Paused');
    };
    const onEnded = () => {
      setPlaying(false);
      setStatus('Finished');
    };
    const onTime = () => setElapsed(audio.currentTime);
    const onLoaded = () => setDuration(audio.duration);
    const onError = () =>
      setError('The audio could not be loaded. Please check your connection and reload the page.');

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('error', onError);
    };
  }, []);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      if (audio.paused) {
        await audio.play();
      } else {
        audio.pause();
      }
    } catch {
      setError('This browser would not play the audio. Try the Download button instead.');
    }
  };

  const progress = duration > 0 ? (elapsed / duration) * 100 : 0;

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={toggle}
        aria-label={
          playing
            ? `Pause the audio certificate for ${studentName}`
            : `Play the audio certificate for ${studentName}`
        }
        className="relative flex min-h-32 w-full items-center justify-center gap-4 overflow-hidden rounded-2xl bg-teal-800 text-3xl font-bold text-white hover:bg-teal-900"
      >
        {/* Progress fill. Purely decorative -- the figures below carry the
            same information as text, and forced-colors mode hides this. */}
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 bg-teal-600/40 transition-[width] duration-200 forced-colors:hidden"
          style={{ width: `${progress}%` }}
        />
        <span aria-hidden="true" className="relative text-4xl leading-none">
          {playing ? '❚❚' : '▶'}
        </span>
        <span className="relative">{playing ? 'Pause' : 'Play this certificate'}</span>
      </button>

      {/* Announced by screen readers as it changes, without moving focus. */}
      <p aria-live="polite" className="text-center font-bold text-ink-soft">
        {status && `${status} — `}
        {formatTime(elapsed)} of {formatTime(duration)}
      </p>

      {error && (
        <p role="alert" className="rounded-lg border-2 border-danger bg-danger-bg px-4 py-3 font-bold text-danger">
          {error}
        </p>
      )}

      {/* The same element the big button drives, exposed with native controls
          so seeking and volume come with correct platform accessibility. */}
      <div className="flex flex-col gap-2">
        <label htmlFor="audio-controls" className="text-sm font-bold text-ink-soft">
          Rewind, skip or change the volume
        </label>
        <audio
          ref={audioRef}
          id="audio-controls"
          controls
          src={audioUrl}
          preload="metadata"
          className="w-full"
        />
      </div>

      <a
        href={audioUrl}
        download={downloadName}
        className="inline-flex min-h-14 items-center justify-center gap-2 rounded-lg border-2 border-teal-800 bg-paper px-5 text-lg font-bold text-teal-900 hover:bg-teal-50"
      >
        Download the audio (MP3)
      </a>
    </div>
  );
}
