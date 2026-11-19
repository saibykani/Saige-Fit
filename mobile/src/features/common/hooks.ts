import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** Refresh everything that depends on what the user ate/drank/did today. */
export function useInvalidateDay() {
  const qc = useQueryClient();
  return () => Promise.all(['dashboard', 'journal', 'hydration', 'recent-foods', 'favorite-foods'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
}
