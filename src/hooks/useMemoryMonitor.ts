import { useEffect, useState } from 'react';

interface MemoryInfo {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

export function useMemoryMonitor() {
  const [memoryUsage, setMemoryUsage] = useState<MemoryInfo | null>(null);
  const [isHighMemory, setIsHighMemory] = useState(false);

  useEffect(() => {
    // Check if performance.memory is available (Chromium only)
    if (!('memory' in performance)) {
      console.warn('[MemoryMonitor] performance.memory not available');
      return;
    }

    const checkMemory = () => {
      const memory = (performance as any).memory as MemoryInfo;
      setMemoryUsage(memory);

      // Warn if using >80% of heap limit
      const usagePercent = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;
      setIsHighMemory(usagePercent > 80);

      if (usagePercent > 80) {
        console.warn('[MemoryMonitor] High memory usage:', usagePercent.toFixed(1), '%');
      }
    };

    // Check every 5 seconds
    const interval = setInterval(checkMemory, 5000);
    checkMemory(); // Initial check

    return () => clearInterval(interval);
  }, []);

  const formatMemory = (bytes: number) => {
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  };

  return {
    memoryUsage,
    isHighMemory,
    formatMemory
  };
}
