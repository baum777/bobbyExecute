'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { POLLING } from '@/lib/constants';

export function useDecisions(limit = 50) {
  return useQuery({
    queryKey: ['decisions', limit],
    queryFn: () => api.decisions(limit),
    refetchInterval: POLLING.DECISIONS,
    staleTime: POLLING.DECISIONS,
  });
}
