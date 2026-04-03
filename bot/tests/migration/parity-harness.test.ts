import { describe, expect, it } from "vitest";
import {
  MIGRATION_PARITY_SURVIVOR_NAMING_LINE,
  runMigrationParityHarness,
} from "./parity-harness.js";
import { MIGRATION_PARITY_FIXTURES } from "../fixtures/migration/parity-fixtures.js";

describe("migration parity harness smoke", () => {
  it("runs old and new deterministic lineages on shared fixture families", () => {
    const results = runMigrationParityHarness(MIGRATION_PARITY_FIXTURES);

    expect(results).toHaveLength(MIGRATION_PARITY_FIXTURES.length);
    expect(results.map((result) => result.fixtureId)).toEqual(
      [...MIGRATION_PARITY_FIXTURES]
        .map((fixture) => fixture.id)
        .sort((left, right) => left.localeCompare(right))
    );

    const fixtureById = new Map(
      MIGRATION_PARITY_FIXTURES.map((fixture) => [fixture.id, fixture])
    );

    for (const result of results) {
      const fixture = fixtureById.get(result.fixtureId);
      expect(fixture, `missing fixture for ${result.fixtureId}`).toBeDefined();
      expect(result.oldLineage.executed).toBe(true);
      expect(result.newLineage.executed).toBe(true);
      expect(result.newLineage.sourceObservationCount).toBeGreaterThan(0);
      expect(result.survivorNamingLine).toEqual(MIGRATION_PARITY_SURVIVOR_NAMING_LINE);

      const scope = fixture!.comparisonScope;
      expect(Object.keys(result.comparison.stableFields)).toEqual(scope.stableFields);
      for (const expectedDeltaField of scope.expectedDeltaFields) {
        expect(
          result.comparison.deltaFields.map((delta) => delta.field),
          `${result.fixtureId} missing delta field: ${expectedDeltaField}`
        ).toContain(expectedDeltaField);
      }
    }
  });
});

describe("migration fixture determinism", () => {
  it("produces stable harness output across repeated runs", () => {
    const firstRun = runMigrationParityHarness(MIGRATION_PARITY_FIXTURES);
    const secondRun = runMigrationParityHarness(MIGRATION_PARITY_FIXTURES);

    expect(secondRun).toEqual(firstRun);
  });

  it("normalizes fixture ordering noise before comparison", () => {
    const canonical = runMigrationParityHarness(MIGRATION_PARITY_FIXTURES);
    const reversed = runMigrationParityHarness([...MIGRATION_PARITY_FIXTURES].reverse());

    expect(reversed).toEqual(canonical);
  });
});

describe("shadow-only parity semantics", () => {
  it("keeps parity outputs explicitly derived and non-canonical", () => {
    const results = runMigrationParityHarness(MIGRATION_PARITY_FIXTURES);

    for (const result of results) {
      expect(result.shadowGuard.harnessMode).toBe("shadow");
      expect(result.shadowGuard.derivedOnly).toBe(true);
      expect(result.shadowGuard.nonAuthoritative).toBe(true);
      expect(result.shadowGuard.canonicalDecisionHistory).toBe(false);
      expect(result.shadowGuard.authorityInfluence).toBe(false);

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain("decisionEnvelope");
      expect(serialized).not.toContain("executeDecision");
    }
  });
});
