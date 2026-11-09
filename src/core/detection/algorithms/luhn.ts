// LeakLens — Luhn Algorithm
// Used for credit/debit card number checksum validation.
//
// The Luhn algorithm (ISO/IEC 7812) is used by all major card networks
// (Visa, Mastercard, Amex, Discover, RuPay, etc.) as a basic check digit.
//
// Reference: https://en.wikipedia.org/wiki/Luhn_algorithm

/**
 * Validates a numeric string using the Luhn algorithm.
 *
 * The input should contain only digit characters. Spaces and hyphens used
 * as separators should be stripped before calling this function.
 *
 * @param digits - A string of digit characters only (no spaces or hyphens).
 * @returns true if the Luhn checksum is valid.
 *
 * @example
 *   luhnValidate('4532015112830366') // true (Visa test number)
 *   luhnValidate('4532015112830367') // false
 *   luhnValidate('378282246310005')  // true (Amex test number)
 */
export function luhnValidate(digits: string): boolean {
  const len = digits.length;
  if (len < 2) return false;

  let sum = 0;
  let isEven = false;

  // Iterate from right to left
  for (let i = len - 1; i >= 0; i--) {
    const charCode = digits.charCodeAt(i);
    if (charCode < 48 || charCode > 57) return false; // Non-digit character
    let digit = charCode - 48;

    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    isEven = !isEven;
  }

  return sum % 10 === 0;
}

/**
 * Generates the Luhn check digit for a partial card number.
 *
 * @param partialDigits - The card number without its final check digit.
 * @returns The check digit (0–9) to append, or -1 on invalid input.
 */
export function luhnGenerate(partialDigits: string): number {
  // Append a '0', validate, and determine what digit makes it valid
  for (let d = 0; d <= 9; d++) {
    if (luhnValidate(partialDigits + d.toString())) {
      return d;
    }
  }
  return -1;
}
