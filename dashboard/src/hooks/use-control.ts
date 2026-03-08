'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useEmergencyStop() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.emergencyStop,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health'] });
      queryClient.invalidateQueries({ queryKey: ['summary'] });
    },
  });
}

export function useResetKillSwitch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.reset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health'] });
      queryClient.invalidateQueries({ queryKey: ['summary'] });
    },
  });
}
