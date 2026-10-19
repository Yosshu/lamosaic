import { describe, expect, it } from 'vitest';
import { exportFileName } from '../../src/io/save';

describe('exportFileName', () => {
  it('uses a timestamp and the format extension', () => {
    const date = new Date(2026, 9, 19, 7, 5, 3);
    expect(exportFileName('png', date)).toBe('lamosaic-20261019-070503.png');
    expect(exportFileName('jpeg', date)).toBe('lamosaic-20261019-070503.jpg');
  });
});
