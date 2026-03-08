'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { POLLING } from '@/lib/constants';

export function useMetrics() {
  return useQuery({
    queryKey: ['metrics'],
    queryFn: api.metrics,
    refetchInterval: POLLING.METRICS,
    staleTime: POLLING.METRICS,
  });
}
