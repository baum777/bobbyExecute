'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { POLLING } from '@/lib/constants';

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    refetchInterval: POLLING.HEALTH,
    staleTime: POLLING.HEALTH,
  });
}
