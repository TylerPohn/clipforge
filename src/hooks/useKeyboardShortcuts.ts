import { useEffect } from 'react';
import { useVideoStore } from '../store/videoStore';

export function useKeyboardShortcuts() {
  const {
    isPlaying,
    currentTime,
    videoDuration,
    trimStart,
    trimEnd,
    setPlaying,
    setCurrentTime,
    setTrimPoints
  } = useVideoStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          setPlaying(!isPlaying);
          break;

        case 'ArrowLeft':
          e.preventDefault();
          // Go back 5 seconds
          setCurrentTime(Math.max(0, currentTime - 5));
          break;

        case 'ArrowRight':
          e.preventDefault();
          // Go forward 5 seconds
          setCurrentTime(Math.min(videoDuration || 0, currentTime + 5));
          break;

        case 'KeyJ':
          e.preventDefault();
          // Go back 1 frame (assume 30fps = 0.033s)
          setCurrentTime(Math.max(0, currentTime - 0.033));
          break;

        case 'KeyK':
          e.preventDefault();
          // Toggle play/pause
          setPlaying(!isPlaying);
          break;

        case 'KeyL':
          e.preventDefault();
          // Go forward 1 frame
          setCurrentTime(Math.min(videoDuration || 0, currentTime + 0.033));
          break;

        // TRIM SHORTCUTS
        case 'KeyI':
          // Set trim start (In point) to current time
          e.preventDefault();
          if (videoDuration) {
            setTrimPoints(currentTime, Math.max(currentTime + 1, trimEnd));
          }
          break;

        case 'KeyO':
          // Set trim end (Out point) to current time
          e.preventDefault();
          if (videoDuration) {
            setTrimPoints(Math.min(trimStart, currentTime - 1), currentTime);
          }
          break;

        case 'KeyR':
          // Reset trim to full video
          e.preventDefault();
          if (videoDuration) {
            setTrimPoints(0, videoDuration);
          }
          break;

        case 'Home':
          // Jump to trim start
          e.preventDefault();
          setCurrentTime(trimStart);
          break;

        case 'End':
          // Jump to trim end
          e.preventDefault();
          setCurrentTime(trimEnd);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isPlaying,
    currentTime,
    videoDuration,
    trimStart,
    trimEnd,
    setPlaying,
    setCurrentTime,
    setTrimPoints
  ]);
}
