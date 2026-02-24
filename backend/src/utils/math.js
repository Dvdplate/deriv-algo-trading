/**
 * Utility functions for statistical price calculations.
 */

export function calculateSMA(prices) {
  const sum = prices.reduce((acc, val) => acc + val, 0);
  return sum / prices.length;
}

export function calculateSD(prices, sma) {
  // Use population standard deviation
  const variance = prices.reduce((acc, val) => acc + Math.pow(val - sma, 2), 0) / prices.length;
  return Math.sqrt(variance);
}

export function calculateBollingerBands(prices) {
  if (!prices || prices.length === 0) {
    return null;
  }

  const sma = calculateSMA(prices);
  const sd = calculateSD(prices, sma);

  const upper = sma + (2 * sd);
  const lower = sma - (2 * sd);
  const bandwidth = (upper - lower) / sma;

  return {
    sma,
    sd,
    upper,
    lower,
    bandwidth
  };
}
