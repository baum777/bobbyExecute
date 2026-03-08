'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { POLLING } from '@/lib/constants';

export function useSummary() {
  return useQuery({
    queryKey: ['summary'],
    queryFn: api.summary,
    refetchInterval: POLLING.SUMMARY,
    staleTime: POLLING.SUMMARY,
  });
}
