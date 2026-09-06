declare module "node:assert/strict" {
  const assert: {
    deepEqual(actual: unknown, expected: unknown): void;
    equal(actual: unknown, expected: unknown): void;
  };
  export default assert;
}

declare module "node:test" {
  export function test(name: string, fn: () => void | Promise<void>): void;
}
