'use client';

import { Download, Pause, Play } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { ru } from '@/lib/i18n/ru';
import { cn, formatDuration } from '@/lib/utils';

const SPEEDS = [1, 1.5, 2] as const;

/** Плеер записи разговора: play/pause, перемотка, скорость, скачивание (ТЗ 5.4). */
export function AudioPlayer({ src, className }: { src: string; className?: string }) {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = React.useState(false);
  const [current, setCurrent] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [speed, setSpeed] = React.useState<(typeof SPEEDS)[number]>(1);
  const [failed, setFailed] = React.useState(false);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play().catch(() => setFailed(true));
    else audio.pause();
  };

  const changeSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length] ?? 1;
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const seek = (value: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = value;
    setCurrent(value);
  };

  if (failed) {
    return (
      <p className={cn('text-xs text-[var(--text-muted)]', className)}>
        {ru.calls.recordingMissingHint}
      </p>
    );
  }

  return (
    <div className={cn('flex flex-col gap-2 rounded-lg bg-[var(--surface-2)] p-3', className)}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => {
          const value = event.currentTarget.duration;
          setDuration(Number.isFinite(value) ? value : 0);
        }}
        onError={() => setFailed(true)}
      />

      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          size="icon"
          onClick={toggle}
          aria-label={playing ? 'Пауза' : 'Воспроизвести'}
          className="size-9 shrink-0 rounded-full max-md:size-11"
        >
          {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
        </Button>

        <input
          type="range"
          min={0}
          max={Math.max(duration, 0.1)}
          step={0.5}
          value={current}
          onChange={(event) => seek(Number(event.target.value))}
          aria-label="Перемотка записи"
          className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-[var(--border-strong)] accent-[var(--brand)]"
        />

        <span className="numeric text-2xs shrink-0 text-[var(--text-muted)] tabular-nums">
          {formatDuration(current)} / {formatDuration(duration)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={changeSpeed} className="text-2xs">
          {speed}×
        </Button>
        <Button variant="ghost" size="sm" asChild className="text-2xs">
          <a href={src} download>
            <Download aria-hidden />
            {ru.calls.recordingDownload}
          </a>
        </Button>
      </div>
    </div>
  );
}
