import { useEffect, useState } from 'react';

// State React yang otomatis tersimpan di localStorage.
// initial boleh berupa fungsi; isValid (opsional) menolak data tersimpan yang rusak.
export function usePersistentState(key, initial, isValid) {
  const [value, setValue] = useState(() => {
    const fallback = () => (typeof initial === 'function' ? initial() : initial);
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback();
      const parsed = JSON.parse(raw);
      return !isValid || isValid(parsed) ? parsed : fallback();
    } catch {
      return fallback();
    }
  });
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);
  return [value, setValue];
}
