import { useState, useEffect, useCallback, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';

interface UseAutoRefreshOptions {
  intervalMs?: number;
  enabled?: boolean;
}

export function useAutoRefresh(
  fetchFn: () => Promise<void> | void,
  { intervalMs = 30000, enabled = true }: UseAutoRefreshOptions = {}
) {
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [lastUpdatedText, setLastUpdatedText] = useState('just now');
  const fetchRef = useRef(fetchFn);
  fetchRef.current = fetchFn;

  const refresh = useCallback(async () => {
    await fetchRef.current();
    setLastUpdated(new Date());
  }, []);

  // Auto-poll
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      fetchRef.current();
      setLastUpdated(new Date());
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);

  // Update "X ago" text every 10 seconds
  useEffect(() => {
    const update = () => {
      setLastUpdatedText(formatDistanceToNow(lastUpdated, { addSuffix: true }));
    };
    update();
    const id = setInterval(update, 10000);
    return () => clearInterval(id);
  }, [lastUpdated]);

  return { lastUpdatedText, refresh };
}
