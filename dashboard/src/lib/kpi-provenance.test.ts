import { describe, expect, it } from 'vitest';
import { kpiProvenanceLabel } from './kpi-provenance';

describe('kpi provenance labels', () => {
  it('labels operational, legacy, and canonical truth surfaces explicitly', () => {
    expect(kpiProvenanceLabel('operational')).toBe('operational');
    expect(kpiProvenanceLabel('derived')).toBe('derived');
    expect(kpiProvenanceLabel('default')).toBe('default');
    expect(kpiProvenanceLabel('legacy_projection')).toBe('legacy');
    expect(kpiProvenanceLabel('unwired')).toBe('unwired');
    expect(kpiProvenanceLabel('canonical')).toBe('canonical');
  });

  it('renders missing provenance as a dash', () => {
    expect(kpiProvenanceLabel(undefined)).toBe('—');
  });
});
