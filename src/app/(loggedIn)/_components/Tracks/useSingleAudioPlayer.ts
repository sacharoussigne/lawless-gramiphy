'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type TogglePlayParams = {
  trackId: string;
  src: string;
};

export default function useSingleAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audioRef.current = audio;

    const handleTimeUpdate = () => setPosition(audio.currentTime || 0);
    const handleLoadedMetadata = () => setDuration(audio.duration || 0);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTrackId(null);
      setDuration(0);
      setPosition(0);
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, []);

  const togglePlay = useCallback(
    async ({ trackId, src }: TogglePlayParams) => {
      const audio = audioRef.current;
      if (!audio) return;

      if (currentTrackId === trackId) {
        if (audio.paused) {
          try {
            await audio.play();
          } catch {
            // Ignore autoplay/playback failures (browser policy).
          }
        } else {
          audio.pause();
        }
        return;
      }

      setCurrentTrackId(trackId);
      setDuration(0);
      setPosition(0);
      audio.src = src;
      audio.currentTime = 0;

      try {
        await audio.play();
      } catch {
        // Ignore autoplay/playback failures (browser policy).
      }
    },
    [currentTrackId],
  );

  const seekTo = useCallback((timeSeconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, timeSeconds);
    setPosition(audio.currentTime || 0);
  }, []);

  const progressRatio = useMemo(() => {
    if (!duration) return 0;
    return Math.min(1, Math.max(0, position / duration));
  }, [duration, position]);

  return {
    currentTrackId,
    isPlaying,
    duration,
    position,
    progressRatio,
    togglePlay,
    seekTo,
  };
}

