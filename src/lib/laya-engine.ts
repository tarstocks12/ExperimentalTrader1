export type LayaRegimeChoice =
  | "trend_continuation"
  | "pullback_continuation"
  | "climax_reversal"
  | "chop_avoid";

export type LayaConvictionTier =
  | "low"
  | "moderate"
  | "high"
  | "institutional";

export interface LayaChoiceAnswer<T extends string = string> {
  choice: T;
  confidence: number;
  probabilities: Record<T, number>;
}

export interface LayaScoreAnswer<T extends string = string> {
  tier: T;
  score: number; // Normalized 0 - 100 expected ordinal value
  confidence: number;
  distribution: Record<T, number>;
}

export interface LayaNoulAnswer {
  noul: number; // Calibrated probability in [0, 1] that the answer is "yes"
  verdict: boolean;
}

export interface LayaDecisionOutput {
  symbol: string;
  mode: "trend" | "reversal";
  direction: "BULL" | "BEAR";
  state: string;
  answers: {
    setup_regime: LayaChoiceAnswer<LayaRegimeChoice>;
    conviction_tier: LayaScoreAnswer<LayaConvictionTier>;
    follow_through_prob: LayaNoulAnswer;
    whipsaw_trap_risk: LayaNoulAnswer;
  };
  compositeScore: number; // 0 - 100 RLCD composite decision score
  routing: {
    model: string;
    runtime: "laya-sidecar" | "laya-ts-onnx" | "laya-rlcd-calibrated";
    temperature: [number, number, number]; // [choice_temp, score_temp, noul_temp]
    latencyMs: number;
  };
  tournament?: {
    qualified: boolean;
    rounds: number;
    groupSize: number;
    groupRank: number;
    finalRank?: number;
  };
}

export interface LayaCalibrationReport {
  temperature: [number, number, number];
  brierScore: number;
  logLoss: number;
  expectedCalibrationError: number;
  sampleCount: number;
  runtimeMode: "laya-sidecar" | "laya-ts-onnx" | "laya-rlcd-calibrated";
}

export const LAYA_QUANT_QUESTIONS_SCHEMA = {
  setup_regime: {
    type: "choice" as const,
    instructions: "Classify the primary next-day NSE market structure and setup regime.",
    criteria: {
      trend_continuation: "Aligned CTF and HTF momentum with sustainable velocity and low exhaustion",
      pullback_continuation: "Oversold or overbought counter-swing inside a dominant higher-timeframe trend",
      climax_reversal: "Extreme oscillator stretch with fresh counter-trend crossover and divergence",
      chop_avoid: "Conflicting multi-timeframe signals or aged crossover prone to whipsaw",
    },
  },
  conviction_tier: {
    type: "score" as const,
    instructions: "Rate the institutional trade conviction level across timeframes.",
    criteria: ["low", "moderate", "high", "institutional"] as LayaConvictionTier[],
  },
  follow_through_prob: {
    type: "noul" as const,
    instructions: "Will the directional signal follow through cleanly in the next session without whipsaw?",
  },
  whipsaw_trap_risk: {
    type: "noul" as const,
    instructions: "Is this setup at elevated risk of a false breakout, exhausted chase, or counter-trend trap?",
  },
};

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function round4(val: number): number {
  return Math.round(val * 10000) / 10000;
}

function softmaxWithTemp<T extends string>(
  logits: Record<T, number>,
  temperature: number
): Record<T, number> {
  const keys = Object.keys(logits) as T[];
  const safeTemp = Math.max(0.05, temperature);
  const scaled = keys.map((k) => logits[k] / safeTemp);
  const maxLogit = Math.max(...scaled);
  const exps = scaled.map((v) => Math.exp(v - maxLogit));
  const sumExp = exps.reduce((a, b) => a + b, 0) || 1;
  const out = {} as Record<T, number>;
  keys.forEach((k, idx) => {
    out[k] = round4(exps[idx] / sumExp);
  });
  return out;
}

function sigmoidWithTemp(logit: number, temperature: number): number {
  const safeTemp = Math.max(0.05, temperature);
  const z = clamp(logit / safeTemp, -15, 15);
  return round4(1 / (1 + Math.exp(-z)));
}

/**
 * Serializes a symbol's multi-timeframe indicator snapshot into a deterministic
 * Laya System-1 state string (compatible with laya Router.predict / Agent.predictBatch).
 */
export function buildLayaStateString(
  symbol: string,
  timeframe: string,
  mode: "trend" | "reversal",
  direction: "BULL" | "BEAR",
  tfData: any
): string {
  if (!tfData) {
    return `SYM:${symbol} TF:${timeframe} MODE:${mode.toUpperCase()} DIR:${direction} STATE:UNAVAILABLE`;
  }
  const wt1 = Number(tfData.wt1 ?? 0).toFixed(1);
  const wt2 = Number(tfData.wt2 ?? 0).toFixed(1);
  const wtState = tfData.isBull ? "BULL" : tfData.isBear ? "BEAR" : "FLAT";
  const wtBars = tfData.barsSinceCross ?? 0;

  const emaState = tfData.isEmaBull ? "BULL" : tfData.isEmaBear ? "BEAR" : "FLAT";
  const emaBars = tfData.emaBarsSinceCross ?? 0;

  const hmaState = tfData.hmaIsBull ? "BULL" : tfData.hmaIsBear ? "BEAR" : "FLAT";
  const hmaBars = tfData.hmaBarsSinceCross ?? 0;

  const stState = tfData.isStBull ? "BULL" : tfData.isStBear ? "BEAR" : "FLAT";
  const stBars = tfData.stBarsSinceCross ?? 0;

  const tsiVal = Number(tfData.scaledTsi ?? 0).toFixed(1);
  const tsiSig = Number(tfData.scaledTsiSig ?? 0).toFixed(1);
  const tsiState = tfData.isTsiBull ? "BULL" : tfData.isTsiBear ? "BEAR" : "FLAT";
  const tsiBars = tfData.tsiBarsSinceCross ?? 0;

  const htfWt = tfData.screenerH1b ? "BULL" : tfData.screenerH1s ? "BEAR" : "NEUT";
  const htfSt = tfData.isStHtf1Bull ? "BULL" : tfData.isStHtf1Bear ? "BEAR" : "NEUT";
  const htfHma = tfData.screenerHmaHtf1b ? "BULL" : tfData.screenerHmaHtf1s ? "BEAR" : "NEUT";
  const htfGc = tfData.screenerGcb ? "BULL" : tfData.screenerGcs ? "BEAR" : "NEUT";
  const d7Confl = tfData.screenerCb ? "CB" : tfData.screenerCs ? "CS" : "NONE";

  return [
    `SYM:${symbol}`,
    `TF:${timeframe}`,
    `MODE:${mode.toUpperCase()}`,
    `TARGET:${direction}`,
    `WT:${wt1}/${wt2}(${wtState},${wtBars}b)`,
    `EMA10_20:${emaState}(${emaBars}b)`,
    `HMA21:${hmaState}(${hmaBars}b)`,
    `ST10_3:${stState}(${stBars}b)`,
    `TSI:${tsiVal}/${tsiSig}(${tsiState},${tsiBars}b)`,
    `HTF[WT:${htfWt},ST:${htfSt},HMA:${htfHma},GC:${htfGc},D7:${d7Confl}]`,
  ].join(" | ");
}

/**
 * Fits Laya temperature scaling [T_choice, T_score, T_noul] and computes Strictly Proper
 * Scoring Rule metrics (Brier Score, Log Loss, ECE) from the 50-day EOD audit history.
 */
export function fitLayaCalibrationFromHistory(
  historyLogs: any[],
  runtimeMode: "laya-sidecar" | "laya-ts-onnx" | "laya-rlcd-calibrated" = "laya-rlcd-calibrated"
): LayaCalibrationReport {
  if (!historyLogs || historyLogs.length === 0) {
    return {
      temperature: [1.12, 1.08, 1.15],
      brierScore: 0.184,
      logLoss: 0.542,
      expectedCalibrationError: 0.038,
      sampleCount: 0,
      runtimeMode,
    };
  }

  const samples: { rawProb: number; outcome: number }[] = [];

  for (const log of historyLogs) {
    const allPicks = [...(log.bullishPicks || []), ...(log.bearishPicks || [])];
    for (const pick of allPicks) {
      const ind = pick.indicators || {};
      const firedCount =
        (ind.hmaFired ? 1 : 0) +
        (ind.stFired ? 1 : 0) +
        (ind.wtFired ? 1 : 0) +
        (ind.tsiFired ? 1 : 0) +
        (ind.htfFired ? 1.25 : 0);
      // Map raw indicator firing density to uncalibrated logit in [-2.5, +2.5]
      const rawLogit = (firedCount - 2.3) * 0.85;
      samples.push({
        rawProb: rawLogit,
        outcome: pick.actualOutcome ? 1 : 0,
      });
    }
  }

  if (samples.length === 0) {
    return {
      temperature: [1.12, 1.08, 1.15],
      brierScore: 0.184,
      logLoss: 0.542,
      expectedCalibrationError: 0.038,
      sampleCount: 0,
      runtimeMode,
    };
  }

  // Grid-search optimal Noul temperature T in [0.60, 2.20] minimizing Strictly Proper Brier Score
  let bestTemp = 1.15;
  let bestBrier = Infinity;
  let bestLogLoss = Infinity;

  for (let t = 0.6; t <= 2.2; t += 0.05) {
    let brierSum = 0;
    let logLossSum = 0;
    for (const s of samples) {
      const p = clamp(1 / (1 + Math.exp(-s.rawProb / t)), 0.01, 0.99);
      brierSum += Math.pow(p - s.outcome, 2);
      logLossSum += -(s.outcome * Math.log(p) + (1 - s.outcome) * Math.log(1 - p));
    }
    const brier = brierSum / samples.length;
    if (brier < bestBrier) {
      bestBrier = brier;
      bestLogLoss = logLossSum / samples.length;
      bestTemp = Number(t.toFixed(2));
    }
  }

  // Compute 5-bin Expected Calibration Error (ECE) at bestTemp
  const bins = Array.from({ length: 5 }, () => ({ count: 0, probSum: 0, winSum: 0 }));
  for (const s of samples) {
    const p = clamp(1 / (1 + Math.exp(-s.rawProb / bestTemp)), 0.01, 0.99);
    const binIdx = Math.min(4, Math.floor(p * 5));
    bins[binIdx].count++;
    bins[binIdx].probSum += p;
    bins[binIdx].winSum += s.outcome;
  }

  let ece = 0;
  for (const b of bins) {
    if (b.count > 0) {
      const avgConf = b.probSum / b.count;
      const avgAcc = b.winSum / b.count;
      ece += (b.count / samples.length) * Math.abs(avgConf - avgAcc);
    }
  }

  const choiceTemp = Number(clamp(bestTemp * 0.96, 0.75, 1.85).toFixed(2));
  const scoreTemp = Number(clamp(bestTemp * 0.92, 0.75, 1.85).toFixed(2));

  return {
    temperature: [choiceTemp, scoreTemp, bestTemp],
    brierScore: Number(bestBrier.toFixed(4)),
    logLoss: Number(bestLogLoss.toFixed(4)),
    expectedCalibrationError: Number(ece.toFixed(4)),
    sampleCount: samples.length,
    runtimeMode,
  };
}

/**
 * Executes a single-pass System-1 RLCD decision over a symbol's multi-timeframe state.
 */
export function evaluateLayaSystemOne(
  symbol: string,
  timeframe: string,
  mode: "trend" | "reversal",
  direction: "BULL" | "BEAR",
  tfData: any,
  mwuaScore: number,
  maxMwuaScore: number,
  temperature: [number, number, number] = [1.1, 1.05, 1.15],
  runtime: "laya-sidecar" | "laya-ts-onnx" | "laya-rlcd-calibrated" = "laya-rlcd-calibrated"
): LayaDecisionOutput {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const state = buildLayaStateString(symbol, timeframe, mode, direction, tfData);

  if (!tfData || tfData.isUnavailable) {
    return {
      symbol,
      mode,
      direction,
      state,
      answers: {
        setup_regime: {
          choice: "chop_avoid",
          confidence: 0.72,
          probabilities: {
            trend_continuation: 0.08,
            pullback_continuation: 0.1,
            climax_reversal: 0.1,
            chop_avoid: 0.72,
          },
        },
        conviction_tier: {
          tier: "low",
          score: 18,
          confidence: 0.68,
          distribution: { low: 0.68, moderate: 0.22, high: 0.07, institutional: 0.03 },
        },
        follow_through_prob: { noul: 0.28, verdict: false },
        whipsaw_trap_risk: { noul: 0.74, verdict: true },
      },
      compositeScore: 22,
      routing: {
        model: "laya-quant-rlcd",
        runtime,
        temperature,
        latencyMs: 0.4,
      },
    };
  }

  const isBullTarget = direction === "BULL";
  const wt1 = Number(tfData.wt1 ?? 0);
  const wt2 = Number(tfData.wt2 ?? 0);
  const wtAligned = isBullTarget ? Boolean(tfData.isBull) : Boolean(tfData.isBear);
  const emaAligned = isBullTarget ? Boolean(tfData.isEmaBull) : Boolean(tfData.isEmaBear);
  const hmaAligned = isBullTarget ? Boolean(tfData.hmaIsBull) : Boolean(tfData.hmaIsBear);
  const stAligned = isBullTarget ? Boolean(tfData.isStBull) : Boolean(tfData.isStBear);
  const tsiAligned = isBullTarget ? Boolean(tfData.isTsiBull) : Boolean(tfData.isTsiBear);

  const htfWtAligned = isBullTarget ? Boolean(tfData.screenerH1b) : Boolean(tfData.screenerH1s);
  const htfStAligned = isBullTarget ? Boolean(tfData.isStHtf1Bull) : Boolean(tfData.isStHtf1Bear);
  const htfHmaAligned = isBullTarget ? Boolean(tfData.screenerHmaHtf1b) : Boolean(tfData.screenerHmaHtf1s);
  const htfGcAligned = isBullTarget ? Boolean(tfData.screenerGcb) : Boolean(tfData.screenerGcs);
  const d7Aligned = isBullTarget ? Boolean(tfData.screenerCb) : Boolean(tfData.screenerCs);

  const wtBars = Number(tfData.barsSinceCross ?? 10);
  const emaBars = Number(tfData.emaBarsSinceCross ?? 10);
  const stBars = Number(tfData.stBarsSinceCross ?? 10);
  const scaledTsi = Number(tfData.scaledTsi ?? 0);

  const ctfConfluenceCount =
    (wtAligned ? 1 : 0) +
    (emaAligned ? 1 : 0) +
    (hmaAligned ? 1 : 0) +
    (stAligned ? 1 : 0) +
    (tsiAligned ? 1 : 0);

  const htfConfluenceCount =
    (htfWtAligned ? 1 : 0) +
    (htfStAligned ? 1 : 0) +
    (htfHmaAligned ? 1 : 0) +
    (htfGcAligned ? 1 : 0) +
    (d7Aligned ? 1 : 0);

  // Stretch in direction of reversal or exhaustion in direction of trend
  const favorableStretch = isBullTarget ? wt1 < -32 : wt1 > 32;
  const severeStretch = isBullTarget ? wt1 < -50 : wt1 > 50;
  const overextendedChase = isBullTarget ? wt1 > 55 : wt1 < -55;
  const tsiStretch = isBullTarget ? scaledTsi < -32 : scaledTsi > 32;
  const freshCross = wtAligned && wtBars >= 1 && wtBars <= 4;
  const agedCross = wtBars >= 14 && emaBars >= 14;

  // 1. Compute Choice Logits for `setup_regime`
  const choiceLogits: Record<LayaRegimeChoice, number> = {
    trend_continuation: -0.5,
    pullback_continuation: -0.5,
    climax_reversal: -0.5,
    chop_avoid: -0.2,
  };

  // Trend continuation features
  choiceLogits.trend_continuation +=
    ctfConfluenceCount * 0.55 +
    htfConfluenceCount * 0.65 +
    (freshCross ? 0.65 : 0) -
    (overextendedChase ? 0.9 : 0) -
    (agedCross ? 0.6 : 0) +
    (mode === "trend" ? 0.45 : -0.2);

  // Pullback continuation ("Buy the dip in HTF uptrend" / "Sell the rally in HTF downtrend")
  choiceLogits.pullback_continuation +=
    htfConfluenceCount * 0.75 +
    (favorableStretch ? 1.15 : -0.4) +
    (wtAligned ? 0.7 : 0) +
    (hmaAligned || stAligned ? 0.5 : 0) +
    (freshCross ? 0.55 : 0);

  // Climax reversal (Deep oscillator stretch + fresh turn)
  choiceLogits.climax_reversal +=
    (favorableStretch ? 1.1 : -0.8) +
    (severeStretch ? 1.05 : 0) +
    (tsiStretch ? 0.75 : 0) +
    (freshCross ? 0.85 : 0) +
    (mode === "reversal" ? 0.55 : -0.25);

  // Chop / Avoid (Conflicting CTF vs HTF or overextended / stale signals)
  const conflictPenalty =
    (ctfConfluenceCount <= 2 && htfConfluenceCount <= 1 ? 1.4 : 0) +
    (overextendedChase && mode === "trend" ? 1.1 : 0) +
    (agedCross ? 0.85 : 0) +
    (Math.abs(wt1 - wt2) < 1.2 ? 0.6 : 0);
  choiceLogits.chop_avoid += conflictPenalty - (ctfConfluenceCount + htfConfluenceCount) * 0.35;

  const choiceProbs = softmaxWithTemp(choiceLogits, temperature[0]);
  let bestChoice: LayaRegimeChoice = "trend_continuation";
  let bestChoiceProb = -1;
  (Object.keys(choiceProbs) as LayaRegimeChoice[]).forEach((k) => {
    if (choiceProbs[k] > bestChoiceProb) {
      bestChoiceProb = choiceProbs[k];
      bestChoice = k;
    }
  });

  // 2. Compute Ordinal Score Logits for `conviction_tier`
  const normMwua = maxMwuaScore > 0 ? clamp(mwuaScore / maxMwuaScore, 0, 1) : 0.5;
  const qualitySignal =
    normMwua * 2.2 +
    (ctfConfluenceCount / 5) * 1.3 +
    (htfConfluenceCount / 5) * 1.5 +
    (freshCross ? 0.55 : 0) -
    conflictPenalty * 0.65;

  const scoreLogits: Record<LayaConvictionTier, number> = {
    low: 1.8 - qualitySignal * 1.1,
    moderate: 1.2 - Math.abs(qualitySignal - 1.8) * 0.9,
    high: qualitySignal * 0.95 - 0.6,
    institutional: qualitySignal * 1.35 - 2.15,
  };

  const scoreDist = softmaxWithTemp(scoreLogits, temperature[1]);
  let bestTier: LayaConvictionTier = "moderate";
  let bestTierProb = -1;
  (Object.keys(scoreDist) as LayaConvictionTier[]).forEach((k) => {
    if (scoreDist[k] > bestTierProb) {
      bestTierProb = scoreDist[k];
      bestTier = k;
    }
  });

  const expectedOrdinalScore = Math.round(
    (scoreDist.low * 0.15 +
      scoreDist.moderate * 0.45 +
      scoreDist.high * 0.78 +
      scoreDist.institutional * 0.98) *
      100
  );

  // 3. Compute Noul Binary Probabilities (`follow_through_prob` & `whipsaw_trap_risk`)
  const followThroughLogit =
    (qualitySignal - 1.55) * 1.25 +
    (d7Aligned ? 0.55 : 0) +
    (htfWtAligned && htfStAligned ? 0.5 : 0) -
    (agedCross ? 0.7 : 0) -
    (overextendedChase && mode === "trend" ? 0.85 : 0);

  const followThroughNoul = sigmoidWithTemp(followThroughLogit, temperature[2]);

  const whipsawLogit =
    conflictPenalty * 1.15 +
    (agedCross ? 0.75 : 0) +
    (stBars > 18 ? 0.45 : 0) +
    (overextendedChase && mode === "trend" ? 0.95 : 0) -
    htfConfluenceCount * 0.55 -
    (freshCross ? 0.5 : 0) -
    0.65;

  const whipsawRiskNoul = sigmoidWithTemp(whipsawLogit, temperature[2]);

  // 4. RLCD Composite Decision Score (0 - 100)
  const regimeBonus =
    bestChoice === "chop_avoid"
      ? -18
      : bestChoice === "pullback_continuation" || bestChoice === "trend_continuation"
      ? 8
      : 6;

  const compositeScore = clamp(
    Math.round(
      expectedOrdinalScore * 0.42 +
        followThroughNoul * 100 * 0.38 +
        (1 - whipsawRiskNoul) * 100 * 0.2 +
        regimeBonus
    ),
    1,
    99
  );

  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const latencyMs = Math.max(0.1, Number((t1 - t0).toFixed(2)));

  return {
    symbol,
    mode,
    direction,
    state,
    answers: {
      setup_regime: {
        choice: bestChoice,
        confidence: bestChoiceProb,
        probabilities: choiceProbs,
      },
      conviction_tier: {
        tier: bestTier,
        score: expectedOrdinalScore,
        confidence: bestTierProb,
        distribution: scoreDist,
      },
      follow_through_prob: {
        noul: followThroughNoul,
        verdict: followThroughNoul >= 0.5,
      },
      whipsaw_trap_risk: {
        noul: whipsawRiskNoul,
        verdict: whipsawRiskNoul >= 0.5,
      },
    },
    compositeScore,
    routing: {
      model: "laya-quant-rlcd",
      runtime,
      temperature,
      latencyMs,
    },
  };
}

/**
 * Port of `laya-ts` `predictTournament`:
 * Splits candidate decisions into balanced groups of at most `groupSize` (default 16),
 * advances the top winners of each group in Round 1, and ranks finalists in Round 2.
 */
export function runLayaTournament(
  decisions: LayaDecisionOutput[],
  groupSize: number = 16,
  finalistsCount: number = 10
): LayaDecisionOutput[] {
  if (decisions.length === 0) return [];

  if (decisions.length <= groupSize) {
    const sorted = [...decisions].sort((a, b) => b.compositeScore - a.compositeScore);
    return sorted.map((d, idx) => ({
      ...d,
      tournament: {
        qualified: idx < finalistsCount,
        rounds: 1,
        groupSize,
        groupRank: idx + 1,
        finalRank: idx + 1,
      },
    }));
  }

  // Round 1: Balanced groups of <= groupSize
  const numGroups = Math.ceil(decisions.length / groupSize);
  const advancePerGroup = Math.max(2, Math.ceil(finalistsCount / numGroups) + 1);
  const round1Winners: LayaDecisionOutput[] = [];
  const annotatedMap = new Map<string, LayaDecisionOutput>();

  for (let g = 0; g < numGroups; g++) {
    const groupSlice = decisions.slice(g * groupSize, (g + 1) * groupSize);
    const sortedGroup = [...groupSlice].sort((a, b) => {
      // Tournament tie-breaker: compositeScore, then follow_through_prob.noul, then lower whipsaw_trap_risk.noul
      if (b.compositeScore !== a.compositeScore) return b.compositeScore - a.compositeScore;
      const ftDiff = b.answers.follow_through_prob.noul - a.answers.follow_through_prob.noul;
      if (Math.abs(ftDiff) > 0.001) return ftDiff;
      return a.answers.whipsaw_trap_risk.noul - b.answers.whipsaw_trap_risk.noul;
    });

    sortedGroup.forEach((item, idx) => {
      const qualifiedR1 = idx < advancePerGroup && item.answers.setup_regime.choice !== "chop_avoid";
      const updated: LayaDecisionOutput = {
        ...item,
        tournament: {
          qualified: false,
          rounds: 2,
          groupSize,
          groupRank: idx + 1,
        },
      };
      annotatedMap.set(`${item.symbol}_${item.direction}`, updated);
      if (qualifiedR1) {
        round1Winners.push(updated);
      }
    });
  }

  // Round 2: Finalist championship pass
  const sortedFinalists = [...round1Winners].sort((a, b) => {
    const scoreA =
      a.compositeScore * 0.65 +
      a.answers.follow_through_prob.noul * 100 * 0.25 -
      a.answers.whipsaw_trap_risk.noul * 100 * 0.1;
    const scoreB =
      b.compositeScore * 0.65 +
      b.answers.follow_through_prob.noul * 100 * 0.25 -
      b.answers.whipsaw_trap_risk.noul * 100 * 0.1;
    return scoreB - scoreA;
  });

  sortedFinalists.forEach((fin, idx) => {
    const key = `${fin.symbol}_${fin.direction}`;
    const existing = annotatedMap.get(key);
    if (existing && existing.tournament) {
      existing.tournament.finalRank = idx + 1;
      existing.tournament.qualified = idx < finalistsCount;
    }
  });

  return decisions.map((d) => annotatedMap.get(`${d.symbol}_${d.direction}`) || d);
}

export type LayaDashboardId =
  | "d1_hma"
  | "d2_st"
  | "d3_wt"
  | "d4_tsi"
  | "d6_wtema"
  | "d6b_wthma"
  | "d7_confl"
  | "d8_setup"
  | "ema";

export interface LayaPreTurnIntel {
  score: number; // 0 to 100 (50 = Neutral, >=60 = About to Turn Bullish, <=40 = About to Turn Bearish)
  signedScore?: number;
  label: "STRONG TURN BULL" | "TURN BULL" | "NEUTRAL" | "TURN BEAR" | "STRONG TURN BEAR";
  direction: "BULL" | "BEAR" | "NEUTRAL";
  convictionPct: number; // 0 to 100 intensity of the imminent turn
  triggerTfs: string[]; // Timeframes exhibiting pre-cross / early turn behavior
  summary: string;
}

export interface D1ToD4CombinedIntel {
  d1Score: number;
  d1Label: string;
  d1Laya: LayaPreTurnIntel;
  d2Score: number;
  d2Label: string;
  d2Laya: LayaPreTurnIntel;
  d3Score: number;
  d3Label: string;
  d3Laya: LayaPreTurnIntel;
  d4Score: number;
  d4Label: string;
  d4Laya: LayaPreTurnIntel;
  combinedD1D4Score: number;
  combinedD1D4Label: string;
  combinedLaya: LayaPreTurnIntel;
  combinedLayaIntel: LayaPreTurnIntel;
  perTfPreTurn: Record<
    string,
    {
      state: "TURN BULL" | "TURN BEAR" | "BULL" | "BEAR" | "WAIT";
      bullSignals: number;
      bearSignals: number;
      preBullCount: number;
      preBearCount: number;
      score: number;
    }
  >;
}

const TF_WEIGHTS: Record<string, number> = {
  "5m": 1,
  "15m": 1.5,
  "1H": 2.5,
  "3H": 3,
  "4H": 4,
  "1D": 6,
  "3D": 5.5,
  "1W": 6.5,
};

const ORDERED_TFS = ["5m", "15m", "1H", "3H", "4H", "1D", "3D", "1W"];

export function getStrengthLabelFromScore(score: number): string {
  if (score >= 80) return "STRONG BULL";
  if (score >= 60) return "BULL";
  if (score > 40) return "NEUTRAL";
  if (score >= 20) return "BEAR";
  return "STRONG BEAR";
}

export function getLayaTurnLabel(
  score: number
): "STRONG TURN BULL" | "TURN BULL" | "NEUTRAL" | "TURN BEAR" | "STRONG TURN BEAR" {
  if (score >= 76) return "STRONG TURN BULL";
  if (score >= 58) return "TURN BULL";
  if (score <= 24) return "STRONG TURN BEAR";
  if (score <= 42) return "TURN BEAR";
  return "NEUTRAL";
}

/**
 * Evaluates a single timeframe's pre-crossover / anticipatory turn potential (-100 to +100)
 * for a specific dashboard indicator family.
 * Positive (+1 to +100) = About to turn Bullish before or at inflection.
 * Negative (-1 to -100) = About to turn Bearish before or at inflection.
 */
export function evaluateTfPreTurnForDashboard(
  tfData: any,
  dashboard: LayaDashboardId
): { netImpulse: number; isPreBull: boolean; isPreBear: boolean } {
  if (!tfData || tfData.isUnavailable) {
    return { netImpulse: 0, isPreBull: false, isPreBear: false };
  }

  const wt1 = Number(tfData.wt1 ?? 0);
  const wt2 = Number(tfData.wt2 ?? 0);
  const wtGap = Math.abs(wt1 - wt2);
  const upBars = Number(tfData.consecutiveUp ?? 0);
  const downBars = Number(tfData.consecutiveDown ?? 0);
  const wtBars = Number(tfData.barsSinceCross ?? 0);

  const hmaOpen = Number(tfData.hmaOpen ?? 0);
  const hmaClose = Number(tfData.hmaClose ?? 0);
  const hmaSpreadPct = hmaOpen > 0 ? (Math.abs(hmaClose - hmaOpen) / hmaOpen) * 100 : 1;
  const hmaBars = Number(tfData.hmaBarsSinceCross ?? 0);

  const stBars = Number(tfData.stBarsSinceCross ?? 0);

  const tsi = Number(tfData.scaledTsi ?? 0);
  const tsiSig = Number(tfData.scaledTsiSig ?? 0);
  const tsiGap = Math.abs(tsi - tsiSig);
  const tsiBars = Number(tfData.tsiBarsSinceCross ?? 0);

  const ema10 = Number(tfData.ema10 ?? 0);
  const ema20 = Number(tfData.ema20 ?? 0);
  const emaSpreadPct = ema20 > 0 ? (Math.abs(ema10 - ema20) / ema20) * 100 : 1;
  const emaBars = Number(tfData.emaBarsSinceCross ?? 0);

  let bullPotential = 0;
  let bearPotential = 0;

  if (dashboard === "d1_hma") {
    // Pre-Bullish HMA 21 turn: currently Bearish but spread compressing / oscillator hooking up
    if (tfData.hmaIsBear) {
      if (hmaSpreadPct < 0.85) bullPotential += 28;
      if (hmaSpreadPct < 0.35) bullPotential += 22;
      if (upBars >= 1 || wt1 > wt2) bullPotential += 22;
      if (wt1 < -28) bullPotential += 16;
      if (hmaBars >= 6) bullPotential += 12;
      if (tfData.screenerHmaHtf1b) bullPotential += 15;
    } else if (tfData.hmaIsBull && hmaBars <= 2 && wt1 < 25) {
      // Bar 1-2 inflection confirmation
      bullPotential += 68 + (tfData.screenerHmaHtf1b ? 16 : 0);
    }

    // Pre-Bearish HMA 21 turn: currently Bullish but spread compressing / oscillator rolling over
    if (tfData.hmaIsBull) {
      if (hmaSpreadPct < 0.85) bearPotential += 28;
      if (hmaSpreadPct < 0.35) bearPotential += 22;
      if (downBars >= 1 || wt1 < wt2) bearPotential += 22;
      if (wt1 > 28) bearPotential += 16;
      if (hmaBars >= 6) bearPotential += 12;
      if (tfData.screenerHmaHtf1s) bearPotential += 15;
    } else if (tfData.hmaIsBear && hmaBars <= 2 && wt1 > -25) {
      bearPotential += 68 + (tfData.screenerHmaHtf1s ? 16 : 0);
    }
  } else if (dashboard === "d2_st") {
    // Pre-Bullish SuperTrend turn: ST is still Bearish, but faster indicators (HMA, EMA, WT) are curling up
    if (tfData.isStBear) {
      if (tfData.hmaIsBull) bullPotential += 30;
      if (tfData.isEmaBull) bullPotential += 20;
      if (tfData.isBull || upBars >= 2) bullPotential += 24;
      if (wt1 < -30 && upBars >= 1) bullPotential += 18;
      if (tfData.isStHtf1Bull) bullPotential += 20;
      if (stBars >= 8) bullPotential += 12;
    } else if (tfData.isStBull && stBars <= 2 && wt1 < 30) {
      bullPotential += 72 + (tfData.isStHtf1Bull ? 15 : 0);
    }

    // Pre-Bearish SuperTrend turn: ST is still Bullish, but faster indicators are rolling over
    if (tfData.isStBull) {
      if (tfData.hmaIsBear) bearPotential += 30;
      if (tfData.isEmaBear) bearPotential += 20;
      if (tfData.isBear || downBars >= 2) bearPotential += 24;
      if (wt1 > 30 && downBars >= 1) bearPotential += 18;
      if (tfData.isStHtf1Bear) bearPotential += 20;
      if (stBars >= 8) bearPotential += 12;
    } else if (tfData.isStBear && stBars <= 2 && wt1 > -30) {
      bearPotential += 72 + (tfData.isStHtf1Bear ? 15 : 0);
    }
  } else if (dashboard === "d3_wt") {
    // Pre-Bullish WaveTrend turn: WT1 is below WT2 in oversold zone and hooking/converging toward cross
    if (tfData.isBear) {
      if (wt1 < -20) bullPotential += 20;
      if (wt1 < -38) bullPotential += 22;
      if (wt1 < -50) bullPotential += 15;
      if (upBars >= 1) bullPotential += 26;
      if (wtGap <= 4.2 && wt1 < -10) bullPotential += 24;
      if (tfData.screenerH1b) bullPotential += 15;
      if (wtBars >= 6) bullPotential += 10;
    } else if (tfData.isBull && wtBars <= 2 && wt1 < -15) {
      bullPotential += 74 + (wt1 < -35 ? 14 : 0);
    }

    // Pre-Bearish WaveTrend turn: WT1 is above WT2 in overbought zone and hooking/converging toward cross
    if (tfData.isBull) {
      if (wt1 > 20) bearPotential += 20;
      if (wt1 > 38) bearPotential += 22;
      if (wt1 > 50) bearPotential += 15;
      if (downBars >= 1) bearPotential += 26;
      if (wtGap <= 4.2 && wt1 > 10) bearPotential += 24;
      if (tfData.screenerH1s) bearPotential += 15;
      if (wtBars >= 6) bearPotential += 10;
    } else if (tfData.isBear && wtBars <= 2 && wt1 > 15) {
      bearPotential += 74 + (wt1 > 35 ? 14 : 0);
    }
  } else if (dashboard === "d4_tsi") {
    // Pre-Bullish TSI turn: TSI is below signal line, stretched negative, gap narrowing + velocity hooking up
    if (tfData.isTsiBear) {
      if (tsi < -18) bullPotential += 20;
      if (tsi < -32) bullPotential += 20;
      if (tsiGap <= 4.5 && tsi < -10) bullPotential += 26;
      else if (tsiGap <= 8.0 && tsi < -15) bullPotential += 14;
      if (upBars >= 1 || tfData.isBull) bullPotential += 24;
      if (tfData.screenerGcb) bullPotential += 15;
      if (tsiBars >= 6) bullPotential += 10;
    } else if (tfData.isTsiBull && tsiBars <= 2 && tsi < -12) {
      bullPotential += 72 + (tsi < -30 ? 15 : 0);
    }

    // Pre-Bearish TSI turn: TSI is above signal line, stretched positive, gap narrowing + velocity curling down
    if (tfData.isTsiBull) {
      if (tsi > 18) bearPotential += 20;
      if (tsi > 32) bearPotential += 20;
      if (tsiGap <= 4.5 && tsi > 10) bearPotential += 26;
      else if (tsiGap <= 8.0 && tsi > 15) bearPotential += 14;
      if (downBars >= 1 || tfData.isBear) bearPotential += 24;
      if (tfData.screenerGcs) bearPotential += 15;
      if (tsiBars >= 6) bearPotential += 10;
    } else if (tfData.isTsiBear && tsiBars <= 2 && tsi > 12) {
      bearPotential += 72 + (tsi > 30 ? 15 : 0);
    }
  } else if (dashboard === "ema" || dashboard === "d6_wtema") {
    // Pre-Bullish EMA 10/20 + WT turn
    if (tfData.isEmaBear) {
      if (emaSpreadPct < 0.75) bullPotential += 26;
      if (tfData.isBull || upBars >= 1) bullPotential += 26;
      if (wt1 < -25) bullPotential += 20;
      if (emaBars >= 6) bullPotential += 12;
      if (tfData.isTsiBull || tsi < -25) bullPotential += 12;
    } else if (tfData.isEmaBull && emaBars <= 2 && wt1 < 20) {
      bullPotential += 70;
    }

    if (tfData.isEmaBull) {
      if (emaSpreadPct < 0.75) bearPotential += 26;
      if (tfData.isBear || downBars >= 1) bearPotential += 26;
      if (wt1 > 25) bearPotential += 20;
      if (emaBars >= 6) bearPotential += 12;
      if (tfData.isTsiBear || tsi > 25) bearPotential += 12;
    } else if (tfData.isEmaBear && emaBars <= 2 && wt1 > -20) {
      bearPotential += 70;
    }
  } else if (dashboard === "d6b_wthma") {
    // Pre-Bullish HMA + WT turn
    const d1 = evaluateTfPreTurnForDashboard(tfData, "d1_hma");
    const d3 = evaluateTfPreTurnForDashboard(tfData, "d3_wt");
    const combined = Math.round(d1.netImpulse * 0.5 + d3.netImpulse * 0.5);
    return {
      netImpulse: clamp(combined, -100, 100),
      isPreBull: combined >= 32,
      isPreBear: combined <= -32,
    };
  } else {
    // D7 / D8 multi-indicator synthesis
    const d1 = evaluateTfPreTurnForDashboard(tfData, "d1_hma");
    const d2 = evaluateTfPreTurnForDashboard(tfData, "d2_st");
    const d3 = evaluateTfPreTurnForDashboard(tfData, "d3_wt");
    const d4 = evaluateTfPreTurnForDashboard(tfData, "d4_tsi");
    const combined = Math.round(
      d1.netImpulse * 0.25 + d2.netImpulse * 0.25 + d3.netImpulse * 0.25 + d4.netImpulse * 0.25
    );
    return {
      netImpulse: clamp(combined, -100, 100),
      isPreBull: combined >= 28,
      isPreBear: combined <= -28,
    };
  }

  const clampedBull = clamp(bullPotential, 0, 100);
  const clampedBear = clamp(bearPotential, 0, 100);
  const netImpulse = clamp(clampedBull - clampedBear, -100, 100);

  return {
    netImpulse,
    isPreBull: netImpulse >= 32,
    isPreBear: netImpulse <= -32,
  };
}

/**
 * Computes the Laya Pre-Turn Intelligence Score (0-100) across all timeframes for a symbol row
 * on any specific dashboard (D1, D2, D3, D4, D6, D6B, D7, D8, EMA).
 */
export function computeLayaPreTurnIntel(
  row: any,
  dashboard: LayaDashboardId
): LayaPreTurnIntel {
  const timeframesObj = row?.timeframes || {};
  let weightedSum = 0;
  let totalWeight = 0;
  const bullTfs: string[] = [];
  const bearTfs: string[] = [];

  for (const tf of ORDERED_TFS) {
    const tfData = timeframesObj[tf];
    if (!tfData || tfData.isUnavailable) continue;
    const w = TF_WEIGHTS[tf] ?? 1;
    const { netImpulse, isPreBull, isPreBear } = evaluateTfPreTurnForDashboard(tfData, dashboard);
    weightedSum += netImpulse * w;
    totalWeight += w;

    if (isPreBull) bullTfs.push(tf);
    if (isPreBear) bearTfs.push(tf);
  }

  if (totalWeight === 0) {
    return {
      score: 50,
      label: "NEUTRAL",
      direction: "NEUTRAL",
      convictionPct: 0,
      triggerTfs: [],
      summary: "Awaiting data",
    };
  }

  // Normalized -100..+100 -> 0..100
  const avgImpulse = weightedSum / totalWeight;
  // Multi-timeframe pre-turn confluence bonus when >= 2 timeframes align
  const confluenceBoost =
    bullTfs.length >= 3
      ? 14
      : bullTfs.length === 2
      ? 8
      : bearTfs.length >= 3
      ? -14
      : bearTfs.length === 2
      ? -8
      : 0;

  const rawScore = clamp(Math.round(50 + avgImpulse * 0.52 + confluenceBoost), 2, 98);
  const label = getLayaTurnLabel(rawScore);
  const direction = rawScore >= 58 ? "BULL" : rawScore <= 42 ? "BEAR" : "NEUTRAL";
  const convictionPct = clamp(Math.round(Math.abs(rawScore - 50) * 2), 0, 100);
  const triggerTfs =
    direction === "BULL"
      ? bullTfs.slice(-3).reverse()
      : direction === "BEAR"
      ? bearTfs.slice(-3).reverse()
      : bullTfs.length >= bearTfs.length
      ? bullTfs.slice(-2).reverse()
      : bearTfs.slice(-2).reverse();

  const summary =
    direction === "BULL"
      ? triggerTfs.length > 0
        ? `Pre-Bull Turn: ${triggerTfs.join(", ")}`
        : "Early Bullish Curl"
      : direction === "BEAR"
      ? triggerTfs.length > 0
        ? `Pre-Bear Turn: ${triggerTfs.join(", ")}`
        : "Early Bearish Roll"
      : "No Imminent Turn";

  return {
    score: rawScore,
    signedScore: rawScore,
    label,
    direction,
    convictionPct,
    triggerTfs,
    summary,
  };
}

/**
 * Computes the complete D1-D4 Combined Dashboard Score AND Combined Laya Intelligence Score
 * for a symbol row from `/api/wt-dashboard`.
 */
export function computeD1ToD4CombinedLaya(row: any): D1ToD4CombinedIntel {
  const timeframesObj = row?.timeframes || {};

  // 1. Compute D1 (HMA 21) Score (same formula as HmaDashboard)
  let netHma = 0;
  let hmaWeight = 0;
  for (const tf of ORDERED_TFS) {
    const d = timeframesObj[tf];
    if (!d || d.isUnavailable) continue;
    const w = TF_WEIGHTS[tf] ?? 1;
    hmaWeight += w;
    const val = d.hmaIsBull ? 1 : d.hmaIsBear ? -1 : 0;
    const decay = (d.hmaBarsSinceCross ?? 0) <= 3 ? 1.2 : (d.hmaBarsSinceCross ?? 0) >= 15 ? 0.7 : 1.0;
    netHma += val * decay * w;
  }
  const d1Score =
    hmaWeight > 0 ? clamp(Math.round(((netHma + 1.2 * hmaWeight) / (2.4 * hmaWeight)) * 100), 0, 100) : 50;
  const d1Label = getStrengthLabelFromScore(d1Score);

  // 2. D2 (SuperTrend), D3 (WaveTrend), D4 (TSI) Scores
  const d2Score = typeof row?.stStrength === "number" ? row.stStrength : 50;
  const d2Label = row?.stStrengthLabel && row.stStrengthLabel !== "---" ? row.stStrengthLabel : getStrengthLabelFromScore(d2Score);

  const d3Score = typeof row?.wtStrength === "number" ? row.wtStrength : 50;
  const d3Label = row?.wtStrengthLabel && row.wtStrengthLabel !== "---" ? row.wtStrengthLabel : getStrengthLabelFromScore(d3Score);

  const d4Score = typeof row?.tsiStrength === "number" ? row.tsiStrength : 50;
  const d4Label = row?.tsiStrengthLabel && row.tsiStrengthLabel !== "---" ? row.tsiStrengthLabel : getStrengthLabelFromScore(d4Score);

  // 3. Individual Dashboard Laya Pre-Turn Intelligence Scores (D1, D2, D3, D4)
  const d1Laya = computeLayaPreTurnIntel(row, "d1_hma");
  const d2Laya = computeLayaPreTurnIntel(row, "d2_st");
  const d3Laya = computeLayaPreTurnIntel(row, "d3_wt");
  const d4Laya = computeLayaPreTurnIntel(row, "d4_tsi");

  // 4. Combined Score of all four dashboards from D1 to D4
  const combinedD1D4Score = clamp(
    Math.round(d1Score * 0.25 + d2Score * 0.25 + d3Score * 0.25 + d4Score * 0.25),
    0,
    100
  );
  const combinedD1D4Label = getStrengthLabelFromScore(combinedD1D4Score);

  // 5. Combined Laya Intelligence Score across D1 to D4
  // Weight fast leading oscillators (D3 WT, D4 TSI, D1 HMA) + structural confirmation (D2 ST)
  const bullDashCount = [d1Laya, d2Laya, d3Laya, d4Laya].filter((x) => x.direction === "BULL").length;
  const bearDashCount = [d1Laya, d2Laya, d3Laya, d4Laya].filter((x) => x.direction === "BEAR").length;

  const synergyBonus =
    bullDashCount >= 3
      ? 10
      : bullDashCount === 2 && bearDashCount === 0
      ? 5
      : bearDashCount >= 3
      ? -10
      : bearDashCount === 2 && bullDashCount === 0
      ? -5
      : 0;

  const rawCombinedLayaScore = clamp(
    Math.round(
      d1Laya.score * 0.26 +
        d2Laya.score * 0.22 +
        d3Laya.score * 0.28 +
        d4Laya.score * 0.24 +
        synergyBonus
    ),
    2,
    98
  );

  const combinedLayaLabel = getLayaTurnLabel(rawCombinedLayaScore);
  const combinedLayaDir =
    rawCombinedLayaScore >= 58 ? "BULL" : rawCombinedLayaScore <= 42 ? "BEAR" : "NEUTRAL";

  // Collect unique trigger timeframes across D1-D4
  const tfFreq = new Map<string, number>();
  [d1Laya, d2Laya, d3Laya, d4Laya].forEach((l) => {
    if (l.direction === combinedLayaDir || combinedLayaDir === "NEUTRAL") {
      l.triggerTfs.forEach((tf) => tfFreq.set(tf, (tfFreq.get(tf) || 0) + 1));
    }
  });
  const combinedTriggerTfs = [...tfFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map((e) => e[0]);

  const activeDashNames: string[] = [];
  if (d1Laya.direction === combinedLayaDir && combinedLayaDir !== "NEUTRAL") activeDashNames.push("D1");
  if (d2Laya.direction === combinedLayaDir && combinedLayaDir !== "NEUTRAL") activeDashNames.push("D2");
  if (d3Laya.direction === combinedLayaDir && combinedLayaDir !== "NEUTRAL") activeDashNames.push("D3");
  if (d4Laya.direction === combinedLayaDir && combinedLayaDir !== "NEUTRAL") activeDashNames.push("D4");

  const combinedSummary =
    combinedLayaDir === "BULL"
      ? `${activeDashNames.length || 1}/4 Dashboards Pre-Bull (${activeDashNames.join("+") || "Curl"})`
      : combinedLayaDir === "BEAR"
      ? `${activeDashNames.length || 1}/4 Dashboards Pre-Bear (${activeDashNames.join("+") || "Roll"})`
      : "Balanced / No Imminent Turn";

  const combinedLaya: LayaPreTurnIntel = {
    score: rawCombinedLayaScore,
    signedScore: rawCombinedLayaScore,
    label: combinedLayaLabel,
    direction: combinedLayaDir,
    convictionPct: clamp(Math.round(Math.abs(rawCombinedLayaScore - 50) * 2), 0, 100),
    triggerTfs: combinedTriggerTfs,
    summary: combinedSummary,
  };

  // Per-timeframe breakdown across D1-D4
  const perTfPreTurn: D1ToD4CombinedIntel["perTfPreTurn"] = {};
  for (const tf of ORDERED_TFS) {
    const d = timeframesObj[tf];
    if (!d || d.isUnavailable) {
      perTfPreTurn[tf] = {
        state: "WAIT",
        bullSignals: 0,
        bearSignals: 0,
        preBullCount: 0,
        preBearCount: 0,
        score: 50,
      };
      continue;
    }
    const bullSignals =
      (d.hmaIsBull ? 1 : 0) +
      (d.isStBull ? 1 : 0) +
      (d.isBull ? 1 : 0) +
      (d.isTsiBull ? 1 : 0);
    const bearSignals =
      (d.hmaIsBear ? 1 : 0) +
      (d.isStBear ? 1 : 0) +
      (d.isBear ? 1 : 0) +
      (d.isTsiBear ? 1 : 0);

    const p1 = evaluateTfPreTurnForDashboard(d, "d1_hma");
    const p2 = evaluateTfPreTurnForDashboard(d, "d2_st");
    const p3 = evaluateTfPreTurnForDashboard(d, "d3_wt");
    const p4 = evaluateTfPreTurnForDashboard(d, "d4_tsi");

    const preBullCount =
      (p1.isPreBull ? 1 : 0) +
      (p2.isPreBull ? 1 : 0) +
      (p3.isPreBull ? 1 : 0) +
      (p4.isPreBull ? 1 : 0);
    const preBearCount =
      (p1.isPreBear ? 1 : 0) +
      (p2.isPreBear ? 1 : 0) +
      (p3.isPreBear ? 1 : 0) +
      (p4.isPreBear ? 1 : 0);

    const avgTfImpulse = (p1.netImpulse + p2.netImpulse + p3.netImpulse + p4.netImpulse) / 4;
    const tfScore = clamp(Math.round(50 + avgTfImpulse * 0.5), 2, 98);

    let state: "TURN BULL" | "TURN BEAR" | "BULL" | "BEAR" | "WAIT" = "WAIT";
    if (preBullCount >= 2 || tfScore >= 62) {
      state = "TURN BULL";
    } else if (preBearCount >= 2 || tfScore <= 38) {
      state = "TURN BEAR";
    } else if (bullSignals >= 3) {
      state = "BULL";
    } else if (bearSignals >= 3) {
      state = "BEAR";
    }

    perTfPreTurn[tf] = {
      state,
      bullSignals,
      bearSignals,
      preBullCount,
      preBearCount,
      score: tfScore,
    };
  }

  return {
    d1Score,
    d1Label,
    d1Laya,
    d2Score,
    d2Label,
    d2Laya,
    d3Score,
    d3Label,
    d3Laya,
    d4Score,
    d4Label,
    d4Laya,
    combinedD1D4Score,
    combinedD1D4Label,
    combinedLaya,
    combinedLayaIntel: combinedLaya,
    perTfPreTurn,
  };
}

/**
 * Computes Laya Pre-Turn Intelligence for D5 Combo ScreenerMetrics rows (`src/App.tsx`).
 */
export function computeD5ComboLayaIntel(row: any): LayaPreTurnIntel {
  if (!row) {
    return {
      score: 50,
      signedScore: 50,
      label: "NEUTRAL",
      direction: "NEUTRAL",
      convictionPct: 0,
      triggerTfs: [],
      summary: "No data",
    };
  }
  const price = Number(row.CurrentPrice ?? 0);
  const wt1 = Number(row.WT1_Current ?? 0);
  const wt2 = Number(row.WT2_Current ?? 0);
  const wtDiff = wt1 - wt2;
  const hma = Number(row.CTF_HMA ?? price);
  const sma = Number(row.CTF_SMA ?? price);
  const upperST = Number(row.ST_Chart_Upper ?? price);
  const lowerST = Number(row.ST_Chart_Lower ?? price);
  const supRej = Number(row.SupportRejections ?? 0);
  const resRej = Number(row.ResistanceRejections ?? 0);

  let bullTurn = 0;
  let bearTurn = 0;

  // Pre-Bullish Turn detection before main trend flips
  if (wt1 < -22 && wtDiff > -3.5) {
    bullTurn += 28;
    if (wt1 < -40) bullTurn += 18;
    if (wtDiff > 0) bullTurn += 16;
  }
  if (price > 0 && lowerST > 0 && price <= lowerST * 1.012) {
    bullTurn += 18;
  }
  if (supRej >= 2) bullTurn += Math.min(20, supRej * 5);
  if (price > 0 && Math.abs(hma - sma) / price < 0.006 && wt1 < 0) {
    bullTurn += 14;
  }

  // Pre-Bearish Turn detection before main trend flips
  if (wt1 > 22 && wtDiff < 3.5) {
    bearTurn += 28;
    if (wt1 > 40) bearTurn += 18;
    if (wtDiff < 0) bearTurn += 16;
  }
  if (price > 0 && upperST > 0 && price >= upperST * 0.988) {
    bearTurn += 18;
  }
  if (resRej >= 2) bearTurn += Math.min(20, resRej * 5);
  if (price > 0 && Math.abs(hma - sma) / price < 0.006 && wt1 > 0) {
    bearTurn += 14;
  }

  const net = clamp(bullTurn - bearTurn, -95, 95);
  const score = clamp(Math.round(50 + net * 0.5), 2, 98);
  const label = getLayaTurnLabel(score);
  const direction = score >= 58 ? "BULL" : score <= 42 ? "BEAR" : "NEUTRAL";

  return {
    score,
    signedScore: score,
    label,
    direction,
    convictionPct: clamp(Math.round(Math.abs(score - 50) * 2), 0, 100),
    triggerTfs: [],
    summary:
      direction === "BULL"
        ? `Pre-Bull Inflection (WT ${Math.round(wt1)})`
        : direction === "BEAR"
        ? `Pre-Bear Inflection (WT ${Math.round(wt1)})`
        : "Consolidated",
  };
}

