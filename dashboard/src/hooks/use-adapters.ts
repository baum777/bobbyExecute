'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { POLLING } from '@/lib/constants';

export function useAdapters() {
  return useQuery({
    queryKey: ['adapters'],
    queryFn: api.adapters,
    refetchInterval: POLLING.ADAPTERS,
    staleTime: POLLING.ADAPTERS,
  });
}
