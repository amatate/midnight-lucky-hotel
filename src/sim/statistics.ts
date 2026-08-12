function validated(samples: readonly number[]): readonly number[] {
  if (samples.length === 0) throw new RangeError("samples must not be empty");
  if (samples.some((sample) => !Number.isFinite(sample))) {
    throw new RangeError("samples must contain only finite values");
  }
  return samples;
}

export function mean(samples: readonly number[]): number {
  const values = validated(samples);
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function sampleVariance(samples: readonly number[]): number {
  const values = validated(samples);
  if (values.length === 1) return 0;
  const average = mean(values);
  return values.reduce((total, value) => total + (value - average) ** 2, 0) / (values.length - 1);
}

export function standardError(samples: readonly number[]): number {
  const values = validated(samples);
  return Math.sqrt(sampleVariance(values) / values.length);
}

export function confidenceInterval95(samples: readonly number[]): readonly [number, number] {
  const values = validated(samples);
  const average = mean(values);
  const margin = 1.96 * standardError(values);
  return [average - margin, average + margin];
}
