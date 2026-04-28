/**
 * gamevalidation.ts
 *
 * Validates that the GameState detected by the computer vision pipeline
 * matches the GameState the rules engine expects after a player action.
 *
 * Intended to be called from the build/road, build/settlement, and robber
 * route handlers: the rules engine produces an "expected" GameState for
 * the requested action, the CV pipeline produces an "actual" GameState
 * from the physical board, and this file confirms they agree before the
 * action is committed. A mismatch means the camera saw something the
 * rules engine did not predict — a misplaced piece, missed detection,
 * or cheating attempt.
 */

import type { GameState } from "../../utils/type.ts";


// ============================================================
// Validation Result
// ============================================================

/**
 * Standard return type, matching the shape used in gamerules.ts so that
 * callers can compose these checks with the rest of the rule engine.
 * - valid: true  → the two GameStates are identical
 * - valid: false → they differ; reason names the first field that disagreed
 */
type RuleResult = { valid: boolean; reason?: string };


// ============================================================
// GameState Comparison
// ============================================================

/**
 * Compares the expected GameState (from the rules engine) against the
 * actual GameState (from CV detection) and reports whether they match.
 *
 * On mismatch, reason names the path of the first field that differs
 * (e.g. "players[0].resourceCards.WOOD") so the discrepancy can be
 * diagnosed without dumping the full state.
 *
 * @param expected - The GameState the rules engine produced for this action
 * @param actual   - The GameState the CV pipeline detected from the board
 * @returns RuleResult — valid if every field matches, invalid with the
 *          path of the first differing field otherwise
 *
 * @example
 * validateGameStateMatch(expected, actual)
 * // Returns { valid: false, reason: "GameState differs at: players[0].resourceCards.WOOD" }
 */
export function validateGameStateMatch(
    expected: GameState,
    actual: GameState,
): RuleResult {
    const mismatchPath = findFirstDifference("", expected, actual);

    if (mismatchPath === null) {
        return { valid: true };
    }

    return {
        valid: false,
        reason: `GameState differs at: ${mismatchPath}`,
    };
}


// ============================================================
// Deep Comparison Helper
// ============================================================

/**
 * Recursively walks two values in lockstep and returns the path of the
 * first field where they differ, or null if they are deeply equal.
 *
 * Handles primitives, arrays, and plain objects, which covers every
 * field shape inside GameState. Walks keys from both sides so a field
 * present in one state but missing from the other is still reported.
 */
function findFirstDifference(
    path: string,
    a: unknown,
    b: unknown,
): string | null {
    // Same primitive value, or same object reference — nothing more to check
    if (a === b) return null;

    // Arrays: lengths must match, then walk element by element
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) {
            return `${path}.length (${a.length} vs ${b.length})`;
        }
        for (let i = 0; i < a.length; i++) {
            const result = findFirstDifference(`${path}[${i}]`, a[i], b[i]);
            if (result !== null) return result;
        }
        return null;
    }

    // Plain objects: compare the union of keys so missing fields surface
    if (
        a !== null &&
        b !== null &&
        typeof a === "object" &&
        typeof b === "object"
    ) {
        const aObj = a as Record<string, unknown>;
        const bObj = b as Record<string, unknown>;
        const keys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);

        for (const key of keys) {
            const childPath = path ? `${path}.${key}` : key;
            const result = findFirstDifference(childPath, aObj[key], bObj[key]);
            if (result !== null) return result;
        }
        return null;
    }

    // Differing primitives, or one side null/undefined while the other isn't
    return path || "(root)";
}
