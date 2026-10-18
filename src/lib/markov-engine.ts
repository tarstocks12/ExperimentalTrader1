import { Candle } from "./pine-math.js";

export interface MarkovSignalResult {
  direction: "LONG" | "SHORT" | "WAIT";
  score: number; // raw value as percentage value (e.g. 42 for +42%)
  regime: "Bull" | "Bear" | "Side";
  confidence: number; // 1-5 scalar value (visualized as dots/stars)
}

/**
 * Returns timeframe-adjusted threshold of 20-bar return to classify market state.
 * Prevents low-timeframe noise from forcing everything to stay in "Sideways" state.
 */
export function getTimeframeThreshold(timeframe: string): number {
  switch (timeframe) {
    case "1D":
    case "3D":
    case "1W":
      return 0.05; // 5%
    case "1H":
    case "3H":
    case "4H":
      return 0.015; // 1.5%
    case "15m":
      return 0.005; // 0.5%
    case "5m":
    case "1m":
    default:
      return 0.002; // 0.2%
  }
}

/**
 * Hidden Markov Model (HMM) pass as secondary confirmation layer.
 * Analyzes the price returns sequence to discover hidden transition frequencies
 * and determine if short-term regime dynamics agree with the labeled 20-bar return states.
 */
export function runHMMConfirmation(
  candles: Candle[],
  todayState: number,
  labeledDirection: "LONG" | "SHORT" | "WAIT"
): boolean {
  const n = candles.length;
  if (n < 21) return false;

  // 1. Calculate 1-bar percentage returns of closes: r[t]
  const returns: number[] = [];
  for (let i = 1; i < n; i++) {
    const prev = candles[i - 1].close || 1;
    returns.push((candles[i].close - prev) / prev);
  }

  // 2. Perform percentile pattern recognition to get 3 hidden regimes
  const sortedReturns = [...returns].sort((a, b) => a - b);
  const len = sortedReturns.length;
  const p20Idx = Math.floor(len * 0.20);
  const p80Idx = Math.floor(len * 0.80);
  const bearThreshold = sortedReturns[p20Idx] || -0.002;
  const bullThreshold = sortedReturns[p80Idx] || 0.002;

  // Classify each return into hidden regimes: 0 (Sideways/Middle), 1 (Bull/High-range), 2 (Bear/Low-range)
  const hiddenStates: number[] = [];
  for (const r of returns) {
    if (r >= bullThreshold) {
      hiddenStates.push(1); // Bullish
    } else if (r <= bearThreshold) {
      hiddenStates.push(2); // Bearish
    } else {
      hiddenStates.push(0); // Sideways
    }
  }

  // 3. Count transition frequency of hidden states
  const hCounts = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];

  for (let i = 0; i < hiddenStates.length - 1; i++) {
    const fromS = hiddenStates[i];
    const toS = hiddenStates[i + 1];
    hCounts[fromS][toS]++;
  }

  // Convert hidden state counts to probabilities
  const hMatrix = [
    [0.333, 0.333, 0.334],
    [0.333, 0.333, 0.334],
    [0.333, 0.333, 0.334]
  ];

  for (let r = 0; r < 3; r++) {
    const sum = hCounts[r][0] + hCounts[r][1] + hCounts[r][2];
    if (sum > 0) {
      hMatrix[r][0] = hCounts[r][0] / sum;
      hMatrix[r][1] = hCounts[r][1] / sum;
      hMatrix[r][2] = hCounts[r][2] / sum;
    }
  }

  // Today's current hidden state is the last return's hidden state
  const todayHidden = hiddenStates[hiddenStates.length - 1] !== undefined ? hiddenStates[hiddenStates.length - 1] : 0;

  // Extract tomorrow's predicted probabilities
  const pHiddenBull = hMatrix[todayHidden][1];
  const pHiddenBear = hMatrix[todayHidden][2];
  const hiddenBias = pHiddenBull - pHiddenBear;

  // 4. Compare agreement with labeled direction
  if (labeledDirection === "LONG" && hiddenBias > 0.05) {
    return true;
  }
  if (labeledDirection === "SHORT" && hiddenBias < -0.05) {
    return true;
  }
  if (labeledDirection === "WAIT" && Math.abs(hiddenBias) <= 0.05) {
    return true;
  }

  return false;
}

/**
 * Standard Markov Regime Model implementation following quant mechanics.
 * Walks forward over the historical candle chain to train transition probabilities
 * and returns tomorrow's directional forecast.
 */
export function computeMarkovRegime(candles: Candle[], timeframe: string): MarkovSignalResult {
  if (!candles || candles.length < 21) {
    return {
      direction: "WAIT",
      score: 0,
      regime: "Side",
      confidence: 1
    };
  }

  const threshold = getTimeframeThreshold(timeframe);
  const n = candles.length;

  // 1. Define states for historical bars index 20 onward
  const states: number[] = new Array(n);
  for (let i = 20; i < n; i++) {
    const ret20 = (candles[i].close - candles[i - 20].close) / (candles[i - 20].close || 1);
    if (ret20 >= threshold) {
      states[i] = 1; // Bull
    } else if (ret20 <= -threshold) {
      states[i] = 2; // Bear
    } else {
      states[i] = 0; // Sideways
    }
  }

  // 2. Build of 3x3 Transition Matrix of state transitions from 20 to n - 2
  const counts = [
    [0, 0, 0], // Sideways
    [0, 0, 0], // Bull
    [0, 0, 0]  // Bear
  ];

  for (let i = 20; i < n - 1; i++) {
    const fromState = states[i];
    const toState = states[i + 1];
    counts[fromState][toState]++;
  }

  // Convert to transition probability rows summing to 1.0 (100%)
  const matrix = [
    [0.333, 0.333, 0.334],
    [0.333, 0.333, 0.334],
    [0.333, 0.333, 0.334]
  ];

  for (let r = 0; r < 3; r++) {
    const sum = counts[r][0] + counts[r][1] + counts[r][2];
    if (sum > 0) {
      matrix[r][0] = counts[r][0] / sum;
      matrix[r][1] = counts[r][1] / sum;
      matrix[r][2] = counts[r][2] / sum;
    }
  }

  // 3. Identify today's current state (final candle at index n - 1)
  const todayState = states[n - 1] !== undefined ? states[n - 1] : 0;
  const currentRegimeName: "Bull" | "Bear" | "Side" = todayState === 1 ? "Bull" : todayState === 2 ? "Bear" : "Side";

  // 4. Extract tomorrow's probabilities
  const pSide = matrix[todayState][0];
  const pBull = matrix[todayState][1];
  const pBear = matrix[todayState][2];

  // 5. Generate the signal score: P(Bull tomorrow) - P(Bear tomorrow)
  const signalScore = pBull - pBear; // range: -1.0 to 1.0

  let direction: "LONG" | "SHORT" | "WAIT" = "WAIT";
  if (signalScore > 0.10) {
    direction = "LONG";
  } else if (signalScore < -0.10) {
    direction = "SHORT";
  } else {
    direction = "WAIT";
  }

  // 6. Stickiness awareness
  const maxProbabilityVal = Math.max(matrix[todayState][0], matrix[todayState][1], matrix[todayState][2]);
  const isStickyRegime = (matrix[todayState][todayState] === maxProbabilityVal);

  // 8. Hidden Markov Model layer confirmation pass
  const hmmAgreement = runHMMConfirmation(candles, todayState, direction);

  // Compute confidence profile from stickiness, signal magnitude, and HMM consensus
  let baseConfidence = 1;
  const absScore = Math.abs(signalScore);
  
  if (absScore > 0.35) baseConfidence = 3;
  else if (absScore > 0.12) baseConfidence = 2;

  let finalConfidence = baseConfidence;
  if (isStickyRegime) {
    finalConfidence += 1;
  }
  if (hmmAgreement) {
    finalConfidence += 1;
  }

  finalConfidence = Math.max(1, Math.min(5, finalConfidence));

  return {
    direction,
    score: Math.round(signalScore * 100), // convert to e.g. +42 or -18 percentage magnitude
    regime: currentRegimeName,
    confidence: finalConfidence
  };
}
