'use client';

import { useState, useEffect, useLayoutEffect } from 'react';

// En cliente corrige antes del paint (evita el flash desktop→mobile); en SSR se
// comporta como useEffect (useLayoutEffect no hace nada — y advierte — en el servidor).
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/** `true` por debajo del breakpoint md (768px). Sirve para elegir entre gestos y hover. */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useIsomorphicLayoutEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();

    let timeoutId: ReturnType<typeof setTimeout>;
    const debounced = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(check, 150);
    };

    window.addEventListener('resize', debounced);
    return () => {
      window.removeEventListener('resize', debounced);
      clearTimeout(timeoutId);
    };
  }, []);

  return isMobile;
}
