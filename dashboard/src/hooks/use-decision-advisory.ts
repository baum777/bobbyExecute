'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { POLLING } from '@/lib/constants';

export function useDecisionAdvisory(traceId?: string) {
  return useQuery({
    queryKey: ['decision-advisory', traceId],
    queryFn: () => api.decisionAdvisory(traceId as string),
    enabled: Boolean(traceId),
    refetchInterval: POLLING.DECISIONS,
    staleTime: POLLING.DECISIONS,
  });
}
