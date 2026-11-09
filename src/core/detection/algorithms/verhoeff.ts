// LeakLens — Verhoeff Algorithm
// Used for Aadhaar number checksum validation.
//
// The Verhoeff algorithm uses three tables: multiplication (d), permutation (p),
// and inverse (inv). It detects all single-digit errors and all adjacent transpositions.
//
// Reference: https://en.wikipedia.org/wiki/Verhoeff_algorithm

/** Multiplication table for the dihedral group D5 */
const D_TABLE: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
] as const;

/** Permutation table */
const P_TABLE: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
] as const;

/** Inverse table */
const INV_TABLE: readonly number[] = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9] as const;

/**
 * Validates a numeric string using the Verhoeff algorithm.
 *
 * @param digits - A string containing only decimal digit characters.
 *                 Must not be empty.
 * @returns true if the checksum is valid (the check digit matches).
 *
 * @example
 *   verhoeffValidate('4417123610') // true (example from Wikipedia)
 *   verhoeffValidate('4417123611') // false
 */
export function verhoeffValidate(digits: string): boolean {
  if (digits.length === 0) return false;

  let c = 0;
  // Iterate right-to-left
  const len = digits.length;
  for (let i = 0; i < len; i++) {
    const charCode = digits.charCodeAt(len - 1 - i);
    // Guard: ensure it's a digit
    if (charCode < 48 || charCode > 57) return false;
    const digit = charCode - 48;
    const pRow = P_TABLE[i % 8];
    if (pRow === undefined) return false;
    const pVal = pRow[digit];
    if (pVal === undefined) return false;
    const dRow = D_TABLE[c];
    if (dRow === undefined) return false;
    const dVal = dRow[pVal];
    if (dVal === undefined) return false;
    c = dVal;
  }

  return c === 0;
}

/**
 * Generates the Verhoeff check digit for a sequence of digits.
 * Appending this digit to the input makes verhoeffValidate return true.
 *
 * @param digits - Digit string (without the check digit)
 * @returns The single check digit as a number (0–9)
 */
export function verhoeffGenerate(digits: string): number {
  let c = 0;
  // Process digits right-to-left, then look up the inverse
  const reversed = digits.split('').reverse().join('');
  for (let i = 0; i < reversed.length; i++) {
    const charCode = reversed.charCodeAt(i);
    if (charCode < 48 || charCode > 57) return -1;
    const digit = charCode - 48;
    const pRow = P_TABLE[(i + 1) % 8];
    if (pRow === undefined) return -1;
    const pVal = pRow[digit];
    if (pVal === undefined) return -1;
    const dRow = D_TABLE[c];
    if (dRow === undefined) return -1;
    const dVal = dRow[pVal];
    if (dVal === undefined) return -1;
    c = dVal;
  }
  const inv = INV_TABLE[c];
  return inv ?? -1;
}
