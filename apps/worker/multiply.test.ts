import { multiply } from './multiply';

describe('multiply', () => {
  describe('basic multiplication', () => {
    test('multiplies two positive numbers', () => {
      expect(multiply(2, 3)).toBe(6);
      expect(multiply(5, 4)).toBe(20);
      expect(multiply(10, 10)).toBe(100);
    });

    test('multiplies two negative numbers', () => {
      expect(multiply(-2, -3)).toBe(6);
      expect(multiply(-5, -4)).toBe(20);
      expect(multiply(-10, -10)).toBe(100);
    });

    test('multiplies positive and negative numbers', () => {
      expect(multiply(2, -3)).toBe(-6);
      expect(multiply(-5, 4)).toBe(-20);
      expect(multiply(10, -10)).toBe(-100);
    });
  });

  describe('edge cases', () => {
    test('multiplies by zero', () => {
      expect(multiply(0, 5)).toBe(0);
      expect(multiply(7, 0)).toBe(0);
      expect(multiply(0, 0)).toBe(0);
      expect(multiply(0, -5)).toBe(0);
      expect(multiply(-7, 0)).toBe(0);
    });

    test('multiplies by one', () => {
      expect(multiply(1, 5)).toBe(5);
      expect(multiply(7, 1)).toBe(7);
      expect(multiply(1, 1)).toBe(1);
      expect(multiply(1, -5)).toBe(-5);
      expect(multiply(-7, 1)).toBe(-7);
    });

    test('multiplies by negative one', () => {
      expect(multiply(-1, 5)).toBe(-5);
      expect(multiply(7, -1)).toBe(-7);
      expect(multiply(-1, -1)).toBe(1);
      expect(multiply(-1, 0)).toBe(0);
    });
  });

  describe('decimal numbers', () => {
    test('multiplies decimal numbers', () => {
      expect(multiply(0.5, 2)).toBe(1);
      expect(multiply(0.1, 10)).toBe(1);
      expect(multiply(2.5, 4)).toBe(10);
      expect(multiply(0.25, 0.25)).toBe(0.0625);
      expect(multiply(-0.5, 2)).toBe(-1);
      expect(multiply(0.5, -2)).toBe(-1);
    });

    test('handles floating point precision', () => {
      expect(multiply(0.1, 0.2)).toBeCloseTo(0.02);
      expect(multiply(0.3, 0.3)).toBeCloseTo(0.09);
      expect(multiply(0.7, 0.1)).toBeCloseTo(0.07);
    });
  });

  describe('large numbers', () => {
    test('multiplies large numbers', () => {
      expect(multiply(1000, 1000)).toBe(1000000);
      expect(multiply(999999, 1)).toBe(999999);
      expect(multiply(123456, 789)).toBe(97406784);
    });

    test('handles very large numbers', () => {
      expect(multiply(1e6, 1e6)).toBe(1e12);
      expect(multiply(1e10, 1e5)).toBe(1e15);
    });
  });

  describe('special numeric values', () => {
    test('handles Infinity', () => {
      expect(multiply(Infinity, 2)).toBe(Infinity);
      expect(multiply(2, Infinity)).toBe(Infinity);
      expect(multiply(Infinity, Infinity)).toBe(Infinity);
      expect(multiply(Infinity, -2)).toBe(-Infinity);
      expect(multiply(-2, Infinity)).toBe(-Infinity);
      expect(multiply(-Infinity, -Infinity)).toBe(Infinity);
      expect(multiply(Infinity, 0)).toBe(NaN);
      expect(multiply(0, Infinity)).toBe(NaN);
    });

    test('handles NaN', () => {
      expect(multiply(NaN, 5)).toBe(NaN);
      expect(multiply(5, NaN)).toBe(NaN);
      expect(multiply(NaN, NaN)).toBe(NaN);
      expect(multiply(NaN, 0)).toBe(NaN);
      expect(multiply(0, NaN)).toBe(NaN);
    });
  });

  describe('property-based tests', () => {
    test('commutative property', () => {
      expect(multiply(3, 5)).toBe(multiply(5, 3));
      expect(multiply(-2, 7)).toBe(multiply(7, -2));
      expect(multiply(0.5, 8)).toBe(multiply(8, 0.5));
    });

    test('associative property with third multiplication', () => {
      const a = 2, b = 3, c = 4;
      expect(multiply(multiply(a, b), c)).toBe(multiply(a, multiply(b, c)));
    });

    test('distributive property', () => {
      const a = 2, b = 3, c = 4;
      expect(multiply(a, b + c)).toBe(multiply(a, b) + multiply(a, c));
    });

    test('identity property', () => {
      expect(multiply(5, 1)).toBe(5);
      expect(multiply(1, -7)).toBe(-7);
      expect(multiply(0.5, 1)).toBe(0.5);
    });

    test('zero property', () => {
      expect(multiply(5, 0)).toBe(0);
      expect(multiply(0, -7)).toBe(0);
      expect(multiply(0.5, 0)).toBe(0);
    });
  });
});