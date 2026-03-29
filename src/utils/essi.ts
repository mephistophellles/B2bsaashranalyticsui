/** Согласовано с backend: сумма блоков / 125 × 100 (ИСУР). */
export const MAX_ESSI_POINTS = 125;

export function essiFromBlockSums(
  b1: number,
  b2: number,
  b3: number,
  b4: number,
  b5: number,
): number {
  const total = b1 + b2 + b3 + b4 + b5;
  return Math.round((total / MAX_ESSI_POINTS) * 100 * 100) / 100;
}
