export type Timeframe = "1m" | "5m" | "15m" | "1H" | "3H" | "4H" | "1D" | "3D" | "1W" | "1M";

export type SignalType = 
  | "HTF FLIP L" | "HTF FLIP S" 
  | "R1 LONG" | "R1 SHORT" 
  | "R3 LONG" | "R3 SHORT" 
  | "E1 LONG" | "E1 SHORT" 
  | "DIV LONG" | "DIV SHORT" 
  | "R1 Long" | "R1 Short" 
  | "R3 Long" | "R3 Short" 
  | "E1 Long" | "E1 Short" 
  | "H1 Flip Long" | "H1 Flip Short" 
  | "B Signal" | "S Signal" 
  | "B" | "S" 
  | "2XB" | "4XB" 
  | "$2XB" | "$4XB" 
  | "2XS" | "4XS" 
  | "$2XS" | "$4XS" 
  | "HB" | "$HB" | "H2XB" 
  | "HS" | "$HS" | "H2XS" 
  | "+B2" | "+B3" | "+S2" | "+S3" 
  | "SYNC BUY" | "SYNC SELL" 
  | "POI BUY" | "POI SELL" 
  | "BB" | "SS" 
  | "None";

export interface SignalDetail {
  type: SignalType;
  prio: number; // For priority overrides
  color: string;
  label: string;
}

export interface ScreenerMetrics {
  Symbol: string;
  Description: string;
  CurrentPrice: number;
  ChangePercent: number;
  SessionChangePercent?: number;
  ScreenerPrice: number;
  ActiveSignal: SignalType;
  ST_Chart_Upper: number;
  ST_Chart_Avg: number;
  ST_Chart_Lower: number;
  ST_HTF1_Upper: number;
  ST_HTF1_Avg: number;
  ST_HTF1_Lower: number;
  CTF_HMA: number;
  CTF_SMA: number;
  CTF_SMA_Slow: number;
  HTF_HMA: number;
  WT1_Current: number;
  WT2_Current: number;
  HTF1_WT1: number;
  HTF1_WT2: number;
  HTF2_WT1: number;
  HTF2_WT2: number;
  HTF_SMA: number;
  StopLoss: number;
  TakeProfit: number;
  ConfidenceScore: number; // 0-100%
  ConfluenceScore: number; // 0-100% (High Confluence Score)
  EmaCross?: string;
  Volume: number;
  WinRate?: number;
  TotalTrades?: number;
  AverageReturn?: number;
  SupportRejections?: number;
  ResistanceRejections?: number;
  MarkovDirection?: "LONG" | "SHORT" | "WAIT";
  MarkovScore?: number;
  MarkovRegime?: "Bull" | "Bear" | "Side";
  MarkovConfidence?: number;
  isUnavailable?: boolean;
}

export interface AgentInsight {
  QuantAnalyst: string;
  MLPatternEvaluator: string;
  RiskManager: string;
  FundamentalOracle: string;
  OverallConfidence: number;
  TradingSignalRecommendation: string;
}

export interface BacktestLearnedProfile {
  symbol: string;
  timeframe: string;
  winRate: number;
  totalTrades: number;
  avgReturn: number;
  learnedBias: "STRONG BULLISH" | "BULLISH BIAS" | "BEARISH REJECTION" | "STRONG BEARISH" | "NEUTRAL CHOP";
  edgeScore: number;
  mfe: number;
  mae: number;
  trendEdge: number;
  reversalEdge: number;
  chopRisk: "LOW" | "MEDIUM" | "HIGH";
  patternFeedback: string;
  timestamp: number;
}

export interface HistoricalCandle {
  Time: string;
  Open: number;
  High: number;
  Low: number;
  Close: number;
  Volume: number;
  ST_Chart_Upper: number;
  ST_Chart_Avg: number;
  ST_Chart_Lower: number;
  ST_HTF1_Avg?: number;
  ST_HTF1_Upper?: number;
  ST_HTF1_Lower?: number;
  CTF_HMA?: number;
  CTF_SMA?: number;
  CTF_SMA_Slow?: number;
  WT1: number;
  WT2: number;
  proj_wt1?: number;
  proj_wt2?: number;
  htf1_proj_wt1?: number;
  htf1_proj_wt2?: number;
  htf2_proj_wt1?: number;
  htf2_proj_wt2?: number;
  ctf_ema10?: number;
  ctf_ema20?: number;
  htf_ema10?: number;
  htf_ema20?: number;
  SignalMarker?: {
    type: SignalType;
    direction: "buy" | "sell";
  };
}

export interface LiveAlert {
  id: string;
  time: string;
  symbol: string;
  type: string;
  message: string;
  direction: "Bullish" | "Bearish" | "Neutral";
}
