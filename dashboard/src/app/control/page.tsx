'use client';

import { useState } from 'react';
import { useHealth } from '@/hooks/use-health';
import { useEmergencyStop, useResetKillSwitch } from '@/hooks/use-control';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { LoadingCard } from '@/components/shared/loading-card';
import { ErrorCard } from '@/components/shared/error-card';
import { formatTimestampFull } from '@/lib/utils';
import { ShieldAlert, ShieldCheck, OctagonX, RotateCcw, AlertTriangle, Clock } from 'lucide-react';

const CONFIRM_TEXT = 'HALT';
const RESET_CONFIRM_TEXT = 'RESET';

export default function ControlPage() {
  const { data: health, isLoading, error, refetch } = useHealth();
  const emergencyStop = useEmergencyStop();
  const resetKillSwitch = useResetKillSwitch();

  const [haltInput, setHaltInput] = useState('');
  const [resetInput, setResetInput] = useState('');
  const [showHaltConfirm, setShowHaltConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const killSwitch = health?.killSwitch;
  const isHalted = killSwitch?.halted === true;

  const handleEmergencyStop = () => {
    if (haltInput !== CONFIRM_TEXT) return;
    emergencyStop.mutate(undefined, {
      onSuccess: () => {
        setHaltInput('');
        setShowHaltConfirm(false);
      },
    });
  };

  const handleReset = () => {
    if (resetInput !== RESET_CONFIRM_TEXT) return;
    resetKillSwitch.mutate(undefined, {
      onSuccess: () => {
        setResetInput('');
        setShowResetConfirm(false);
      },
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Control</h2>
          <p className="text-sm text-text-muted">Safety controls and emergency actions</p>
        </div>
        <LoadingCard />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Control</h2>
        </div>
        <ErrorCard message="Failed to load kill switch state" onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Control</h2>
        <p className="text-sm text-text-muted">Safety controls and emergency actions</p>
      </div>

      <Card className={isHalted ? 'border-accent-danger/50' : 'border-accent-success/30'}>
        <CardHeader>
          <div className="flex items-center gap-3">
            {isHalted ? (
              <OctagonX className="h-5 w-5 text-accent-danger" />
            ) : (
              <ShieldCheck className="h-5 w-5 text-accent-success" />
            )}
            <div>
              <CardTitle className="text-text-primary font-semibold text-base">
                Kill Switch Status
              </CardTitle>
              <p className="text-xs text-text-muted mt-0.5">Current system safety state</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 mb-4">
            <Badge variant={isHalted ? 'danger' : 'success'} className="text-sm px-3 py-1">
              {isHalted ? 'HALTED' : 'ACTIVE'}
            </Badge>
            {isHalted && killSwitch?.triggeredAt && (
              <span className="text-xs text-text-muted">
                since {formatTimestampFull(killSwitch.triggeredAt)}
              </span>
            )}
          </div>
          {isHalted && killSwitch?.reason && (
            <div className="rounded border border-accent-danger/30 bg-accent-danger/5 p-3 mb-4">
              <p className="text-sm text-accent-danger font-medium">Reason</p>
              <p className="text-sm text-text-secondary mt-1">{killSwitch.reason}</p>
            </div>
          )}
          <div className="text-xs text-text-muted flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            Source: Bot API /health
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        <Card className="border-accent-danger/30">
          <CardHeader>
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-5 w-5 text-accent-danger" />
              <div>
                <CardTitle className="text-text-primary font-semibold">Emergency Stop</CardTitle>
                <p className="text-xs text-text-muted mt-0.5">
                  Immediately halt all trading operations
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded border border-accent-warning/30 bg-accent-warning/5 p-3 mb-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-accent-warning shrink-0 mt-0.5" />
                <p className="text-xs text-text-secondary">
                  This will immediately stop all trading activity. The bot will not execute any new
                  trades until the kill switch is manually reset. Use only in emergency situations.
                </p>
              </div>
            </div>

            {!showHaltConfirm ? (
              <Button
                variant="danger"
                size="lg"
                className="w-full"
                disabled={isHalted || emergencyStop.isPending}
                onClick={() => setShowHaltConfirm(true)}
              >
                <OctagonX className="h-4 w-4" />
                {isHalted ? 'Already Halted' : 'Halt Trading'}
              </Button>
            ) : (
              <div className="space-y-3 animate-fade-in">
                <p className="text-sm text-accent-danger font-medium">
                  Type <code className="bg-bg-primary px-1.5 py-0.5 rounded text-accent-danger">{CONFIRM_TEXT}</code> to confirm
                </p>
                <Input
                  value={haltInput}
                  onChange={(e) => setHaltInput(e.target.value)}
                  placeholder={`Type ${CONFIRM_TEXT} to confirm...`}
                  className="border-accent-danger/30 focus-visible:ring-accent-danger/50"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    variant="danger"
                    className="flex-1"
                    disabled={haltInput !== CONFIRM_TEXT || emergencyStop.isPending}
                    onClick={handleEmergencyStop}
                  >
                    {emergencyStop.isPending ? 'Stopping...' : 'Confirm Emergency Stop'}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setShowHaltConfirm(false);
                      setHaltInput('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
                {emergencyStop.isError && (
                  <p className="text-xs text-accent-danger">
                    Failed to trigger emergency stop. Try again.
                  </p>
                )}
              </div>
            )}
          </CardContent>
          <CardFooter>
            <p className="text-xs text-text-muted flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              POST /emergency-stop
            </p>
          </CardFooter>
        </Card>

        <Card className={isHalted ? 'border-accent-cyan/30' : 'border-border-default opacity-60'}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <RotateCcw className="h-5 w-5 text-accent-cyan" />
              <div>
                <CardTitle className="text-text-primary font-semibold">
                  Reset Kill Switch
                </CardTitle>
                <p className="text-xs text-text-muted mt-0.5">
                  Re-enable trading after emergency stop
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {!isHalted ? (
              <p className="text-sm text-text-muted">
                Kill switch is not active. No reset needed.
              </p>
            ) : !showResetConfirm ? (
              <Button
                variant="default"
                size="lg"
                className="w-full"
                disabled={!isHalted || resetKillSwitch.isPending}
                onClick={() => setShowResetConfirm(true)}
              >
                <RotateCcw className="h-4 w-4" />
                Reset Kill Switch
              </Button>
            ) : (
              <div className="space-y-3 animate-fade-in">
                <p className="text-sm text-accent-cyan font-medium">
                  Type <code className="bg-bg-primary px-1.5 py-0.5 rounded text-accent-cyan">{RESET_CONFIRM_TEXT}</code> to confirm
                </p>
                <Input
                  value={resetInput}
                  onChange={(e) => setResetInput(e.target.value)}
                  placeholder={`Type ${RESET_CONFIRM_TEXT} to confirm...`}
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    variant="default"
                    className="flex-1"
                    disabled={resetInput !== RESET_CONFIRM_TEXT || resetKillSwitch.isPending}
                    onClick={handleReset}
                  >
                    {resetKillSwitch.isPending ? 'Resetting...' : 'Confirm Reset'}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setShowResetConfirm(false);
                      setResetInput('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
                {resetKillSwitch.isError && (
                  <p className="text-xs text-accent-danger">
                    Failed to reset kill switch. Try again.
                  </p>
                )}
              </div>
            )}
          </CardContent>
          <CardFooter>
            <p className="text-xs text-text-muted flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              POST /control/reset
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
