# Quant SWT Screener & Multi-Timeframe Quantitative Analytics Engine

**Quant SWT Screener** is a full-stack quantitative equity and index screening, charting, backtesting, and multi-timeframe (MTF) signal intelligence platform engineered for the **Indian National Stock Exchange (NSE)**. Built with **React 19**, **TypeScript**, **Express**, and **Tailwind CSS**, it translates complex multi-timeframe Pine Script v5 indicator systems—combining **WaveTrend (WT)**, **SuperTrend (ST)**, **Hull Moving Average (HMA)**, **Exponential Moving Average (EMA)**, **True Strength Index (TSI)**, **Markov Chain Regime Detection**, and a **Multiplicative Weights Update Algorithm (MWUA)**—into a real-time, deterministic web workspace.

---

## Table of Contents

1. [System Architecture & Tech Stack](#1-system-architecture--tech-stack)
2. [Market Universes & NSE Index ETF Proxy Scaling](#2-market-universes--nse-index-etf-proxy-scaling)
3. [Multi-Timeframe (MTF) Hierarchy & Candle Aggregation](#3-multi-timeframe-mtf-hierarchy--candle-aggregation)
4. [Quantitative Mathematical Engines](#4-quantitative-mathematical-engines)
   - [4.1 WaveTrend Oscillator & Projected Crossovers](#41-wavetrend-oscillator--projected-crossovers)
   - [4.2 Volume-Aware SuperTrend Channels](#42-volume-aware-supertrend-channels)
   - [4.3 Moving Average Systems (HMA 21, EMA 10/20, SMA 21/150)](#43-moving-average-systems-hma-21-ema-1020-sma-21150)
   - [4.4 WaveTrend-Scaled True Strength Index (TSI)](#44-wavetrend-scaled-true-strength-index-tsi)
   - [4.5 Non-Repainting Higher-Timeframe Mapping (`mapHTFIndicator`)](#45-non-repainting-higher-timeframe-mapping-maphtfindicator)
   - [4.6 Markov Chain Regime Engine](#46-markov-chain-regime-engine)
   - [4.7 Adaptive Reversal Engine](#47-adaptive-reversal-engine)
   - [4.8 MWUA Self-Learning Engine & EOD Audit Loop](#48-mwua-self-learning-engine--eod-audit-loop)
5. [Signal Taxonomy & Priority Hierarchy](#5-signal-taxonomy--priority-hierarchy)
6. [Dashboards & Workspace Modules](#6-dashboards--workspace-modules)
7. [Backend REST API Reference](#7-backend-rest-api-reference)
8. [Caching, Batch Concurrency & Resilience](#8-caching-batch-concurrency--resilience)
9. [Repository File Structure](#9-repository-file-structure)
10. [Installation, Configuration & Deployment](#10-installation-configuration--deployment)
11. [Client-Side Persistence (`localStorage` Keys)](#11-client-side-persistence-localstorage-keys)

---

## 1. System Architecture & Tech Stack

The application runs as a unified full-stack Node.js server (`server.ts`) serving both the REST API (`/api/*`) and the React Single Page Application (via Vite middleware in development and static bundle serving in production).

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend UI** | React 19, TypeScript, Tailwind CSS v4 | Multi-dashboard quantitative workspace, interactive heatmaps, custom filter matrices |
| **Charting** | Plotly.js (`2.35.0`), Lightweight Charts (`5.2.0`) | Multi-pane candlestick, SuperTrend band, HMA/EMA ribbon, and WaveTrend oscillator rendering |
| **Icons & Motion** | `lucide-react`, `motion` | High-density financial telemetry badges, transitions, and interactive modals |
| **Backend Server** | Express 4, `tsx`, `esbuild` | High-concurrency indicator computation, MTF alignment, and Yahoo Finance data ingestion |
| **Market Data** | Yahoo Finance v8 Chart API + `yahoo-finance2` | Real-time and historical OHLCV candles across 10 timeframes (`1m` to `1M`) |
| **Scheduling** | `node-cron` (`Asia/Kolkata` timezone) | Automated End-of-Day (4:00 PM IST) prediction verification and MWUA weight recalibration |
| **AI Optional Layer** | `@google/genai` + MiniMax Fallback | Optional multi-agent quantitative synthesis (`QuantAnalyst`, `Researcher`, `Trader`) |

---

## 2. Market Universes & NSE Index ETF Proxy Scaling

### 2.1 Supported Watchlist Universes (`src/data/watchlists.ts`)
1. **Personal Watchlist (`personal`)**: User-customizable list initialized with 143 high-liquidity NSE equities and indices (`DEFAULT_PERSONAL_SYMBOLS`). Supports live addition/removal of NSE symbols in the UI.
2. **Nifty F&O Universe (`fno`)**: 220+ Futures & Options stocks and benchmark indices (`FNO_SYMBOLS_LIST`).
3. **Nifty 500 Universe (`nifty500`)**: Comprehensive 500+ NSE large-cap and mid-cap universe (`NIFTY_500_SYMBOLS_LIST`).

### 2.2 Liquid ETF Proxy Mapping & Scaling for Indices
Yahoo Finance's raw Indian index tickers frequently suffer from missing intraday volume, rate limiting, or truncated daily/weekly candle arrays. To guarantee 100% intraday and multi-year historical OHLCV coverage, `server.ts` maps major NSE indices to their most liquid NSE-listed ETFs and multiplies OHLC prices by a deterministic scale factor (`INDEX_SCALE_MAP`):

| Application Symbol | Underlying Index / Instrument | Yahoo Finance Proxy Ticker | Scale Factor |
| :--- | :--- | :--- | :--- |
| `NIFTY` | Nifty 50 Index | `NIFTYBEES.NS` | `100x` |
| `BANKNIFTY` | Nifty Bank Index | `BANKBEES.NS` | `100x` |
| `CNXFINANCE` / `FINNIFTY` / `FINNIFTY1!` | Nifty Financial Services Index | `BFSI.NS` | `1000x` |
| `NIFTY_MID_SELECT` / `MIDCPNIFTY` / `MIDCPNIFTY1!` | Nifty MidCap Select Index | `MID150BEES.NS` | `100x` |
| `NIFTYNXT50` / `NIFTYNXT501!` | Nifty Next 50 Index | `JUNIORBEES.NS` | `100x` |
| Equities (e.g., `BAJAJ_AUTO`, `M&M`) | NSE Listed Equity | `<SYMBOL>.NS` (`_` replaced with `-`) | `1x` |

---

## 3. Multi-Timeframe (MTF) Hierarchy & Candle Aggregation

### 3.1 Supported Timeframes & Yahoo Finance Fetch Parameters
The engine supports 10 distinct timeframes (`Timeframe` type in `src/types.ts`). Custom intermediate timeframes (`3H`, `4H`, `3D`, and `1M` fallback) are constructed by downsampling native Yahoo Finance intervals via `aggregateCandles` and `aggregateToMonthly`:

| Timeframe | Yahoo Query Interval | Yahoo Query Range | Aggregation Rule |
| :--- | :--- | :--- | :--- |
| `1m` | `1m` | `5d` | Native 1-minute bars |
| `5m` | `5m` | `1mo` | Native 5-minute bars |
| `15m` | `15m` | `1mo` | Native 15-minute bars |
| `1H` | `60m` | `1mo` | Native 60-minute bars |
| `3H` | `1h` | `60d` | Aggregated in 3-bar OHLCV blocks (`aggregateCandles(candles, 3)`) |
| `4H` | `1h` | `60d` | Aggregated in 4-bar OHLCV blocks (`aggregateCandles(candles, 4)`) |
| `1D` | `1d` | `2y` | Native daily bars |
| `3D` | `1d` | `3y` | Aggregated in 3-bar daily OHLCV blocks (`aggregateCandles(candles, 3)`) |
| `1W` | `1wk` | `5y` | Native weekly bars |
| `1M` | `1mo` | `10y` | Native monthly bars (with automatic fallback to `1W` -> calendar month aggregation) |

### 3.2 Multi-Timeframe Mapping Tables
Different engines and screeners pair the Current Timeframe (**CTF**) with one or two Higher Timeframes (**HTF1**, **HTF2**):

| Current Timeframe (CTF) | Core Pine Engine (`getHtfTimeframes`) HTF1 / HTF2 | D7 Screener (`getScreenerHtf`) HTF1 / HTF2 | HX & WT HTF (`getHxHtf1` / `getWtHtf1`) | GC HTF (`getGcHtf1`) | SuperTrend HTF (`getStHtf1`) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`1m`** | `5m` / `15m` | `1H` / `1D` | `1H` | `1H` | `1H` |
| **`5m`** | `15m` / `1H` | `1H` / `1D` | `1H` | `1H` | `1H` |
| **`15m`** | `1H` / `4H` | `1D` / `1W` | `1D` | `1D` | `1D` |
| **`1H`** | `4H` / `1D` | `1D` / `1W` | `1D` | `1D` | `1D` |
| **`3H`** | `1D` / `3D` | `1D` / `1W` | `1D` | `1D` | `1W` |
| **`4H`** | `1D` / `3D` | `1D` / `1W` | `1W` | `1D` | `1W` |
| **`1D`** | `3D` / `1W` | `1W` / `1M` | `1W` | `1W` | `1W` |
| **`3D`** | `1W` / `1W` | `1W` / `1M` | `1W` | `1W` | `1M` |
| **`1W`** | `1W` / `1W` | `1M` / `1M` | `1M` | `1M` | `1M` |

---

## 4. Quantitative Mathematical Engines

All indicator calculations are implemented from scratch in pure TypeScript without external TA library black boxes, ensuring 1:1 parity with TradingView Pine Script v5 execution semantics.

### 4.1 WaveTrend Oscillator & Projected Crossovers (`src/lib/pine-math.ts`)
- **Parameters**: Channel Length $n_1 = 7$ (or $10$ in standard mode), Average Length $n_2 = 18$ (or $21$), Signal SMA Length $= 4$.
- **Formulas**:
  1. Typical Price: $\text{ap}_t = \frac{\text{High}_t + \text{Low}_t + \text{Close}_t}{3}$
  2. Exponential Moving Average of $\text{ap}$: $\text{esa}_t = \text{EMA}(\text{ap}, n_1)$
  3. Absolute Deviation EMA: $d_t = \text{EMA}(|\text{ap}_t - \text{esa}_t|, n_1)$
  4. Commodity Channel Index proxy: $\text{ci}_t = \frac{\text{ap}_t - \text{esa}_t}{0.015 \cdot d_t}$
  5. **WaveTrend Fast ($\text{WT}_1$)**: $\text{WT}_{1,t} = \text{EMA}(\text{ci}, n_2)$
  6. **WaveTrend Slow ($\text{WT}_2$)**: $\text{WT}_{2,t} = \text{SMA}(\text{WT}_1, 4)$
  7. **Projected WaveTrend ($\text{proj\_wt}_1, \text{proj\_wt}_2$)**: Linear momentum extrapolation $\text{WT}_{1,t} + (\text{WT}_{1,t} - \text{WT}_{1,t-1})$ used for anticipating Point-of-Interest (`POI`) and `R3` velocity crossovers.
- **Overbought / Oversold Thresholds**:
  - Standard Extreme Zones: $\pm 53$ and $\pm 60$
  - Reversal Initiation Zones: $\pm 30$ (deep stretch bonus up to $\pm 50$)

### 4.2 Volume-Aware SuperTrend Channels (`calcSuperTrend` & `calcSupertrendChannel`)
- **Parameters**: ATR Period $= 10$, Factor $= 3.0$.
- Computes True Range ($\text{TR}_t$) and Wilder's/RMA Average True Range ($\text{ATR}_t$), then dynamically ratchets Upper and Lower trailing bands:
  - Upper Band ratchets down when $\text{Close}_{t-1} < \text{UpperBand}_{t-1}$
  - Lower Band ratchets up when $\text{Close}_{t-1} > \text{LowerBand}_{t-1}$
- Tracks directional state $\text{os}_t \in \{0, 1\}$, channel boundaries (`ST_Chart_Upper`, `ST_Chart_Lower`), and channel equilibrium (`ST_Chart_Avg`), plus higher-timeframe equivalents (`ST_HTF1_Upper`, `ST_HTF1_Avg`, `ST_HTF1_Lower`).

### 4.3 Moving Average Systems (HMA 21, EMA 10/20, SMA 21/150)
- **Hull Moving Average (`calcHMA`, length 21)**:
  $$\text{HMA}(n) = \text{WMA}\left(2 \cdot \text{WMA}\left(\text{src}, \lfloor n/2 \rfloor\right) - \text{WMA}(\text{src}, n), \text{round}(\sqrt{n})\right)$$
  Computed both on `Close` vs `SMA(21)` (for CTF/HTF ribbon bias) and `HMA(Close, 21)` vs `HMA(Open, 21)` (for bar-by-bar HMA crossover dashboards).
- **EMA 10 / 20 Crossover Counter (`computeEmaTrendCounter`)**:
  Computes `EMA(Close, 10)` and `EMA(Close, 20)` and counts the exact number of bars since the last bullish or bearish crossover (e.g., `BULL (3 bars)`, `BEAR (12 bars)`).
- **Macro Trend Filter**: `CTF_SMA_Slow` (`SMA 150`) provides structural trend context.

### 4.4 WaveTrend-Scaled True Strength Index (TSI)
- **Parameters**: Long Length $= 25$, Short Length $= 13$, Signal Length $= 13$.
- Double-smoothed momentum $\text{PC}_t = \text{Close}_t - \text{Close}_{t-1}$ divided by double-smoothed absolute momentum $|\text{PC}_t|$:
  $$\text{TSI}_t = 100 \times \frac{\text{EMA}(\text{EMA}(\text{PC}, 25), 13)}{\text{EMA}(\text{EMA}(|\text{PC}|, 25), 13)}$$
- **Dynamic WaveTrend Range Normalization**: Over a rolling 100-bar window, $\text{TSI}$ and $\text{TSI}_{\text{Signal}}$ are scaled by the ratio $\frac{\max(\text{WT}_1) - \min(\text{WT}_1)}{\max(\text{TSI}) - \min(\text{TSI})}$ so TSI and WaveTrend share a unified oscillator scale.

### 4.5 Non-Repainting Higher-Timeframe Mapping (`mapHTFIndicator`)
To prevent lookahead bias when projecting `HTF1` and `HTF2` indicators onto Current Timeframe (`CTF`) bars, `mapHTFIndicator` aligns each CTF candle timestamp $t_{\text{CTF}}$ with the most recently completed HTF bar whose timestamp satisfies $t_{\text{HTF}} \le t_{\text{CTF}}$.

### 4.6 Markov Chain Regime Engine (`src/lib/markov-engine.ts`)
Models market action as a discrete 3-state Markov process:
- **States**: `Bull` (State 0), `Bear` (State 1), `Side` / Chop (State 2).
- **State Classification**: Each historical candle is classified using normalized return vs. rolling volatility and EMA slope.
- **Transition Probability Matrix ($3 \times 3$)**: Counts empirical state-to-state transitions $P(S_t = j \mid S_{t-1} = i)$ across the lookback window with Laplace smoothing.
- **Output (`MarkovSignalResult`)**:
  - `direction`: `"LONG"` | `"SHORT"` | `"WAIT"`
  - `regime`: `"Bull"` | `"Bear"` | `"Side"`
  - `score`: Net directional edge $(-100 \text{ to } +100)$
  - `confidence`: Probability of regime continuation $(0 \text{ to } 100\%)$

### 4.7 Adaptive Reversal Engine (`src/lib/reversal-engine.ts`)
Identifies mean-reversion and trend-pullback entries before full trend-following indicators flip:
- **`getRowReversalTrade`**: Evaluates WaveTrend extreme stretch ($\text{WT}_1 \le -45$ or $\ge +45$), $\text{WT}_1 - \text{WT}_2$ convergence velocity, HTF WaveTrend divergence, and SuperTrend band proximity to emit `REV BUY`, `REV SELL`, `B-Early Rev`, `S-Early Rev`, or `WAIT`.
- **`getAdvancedAdaptiveReversal`**: Combines multi-timeframe WaveTrend regimes, EMA exhaustion counts (`emaBarsSinceCross > 8`), and TSI fresh crosses (`tsiBarsSinceCross <= 3`) to separate **Trend Pullback Continuations** ("Buy the Dip" / "Sell the Rally") from **Counter-Trend Climax Reversals** (`RC Bull` / `RC bear`).

### 4.8 MWUA Self-Learning Engine & EOD Audit Loop
The platform incorporates an online machine learning weight optimizer based on the **Multiplicative Weights Update Algorithm (MWUA)**:
- **Indicator Weight Buckets (`DEFAULT_MWUA_WEIGHTS`)**:
  - **Trend Bucket (Normalized to 135 total points)**: `hmaWeight` (20), `stWeight` (20), `wtBase` (15), `wtZero` (5), `wtExtreme` (5), `tsiBase` (15), `tsiZero` (5), `htfWt` (10), `htfSt` (10), `htfHma` (10), `htfGc` (10), `crossBonus` (10).
  - **Reversal Bucket (Normalized to 185 total points)**: `wtDeep` (20), `wtSevere` (20), `wtCross` (30), `tsiDeep` (15), `tsiSevere` (15), `tsiCross` (20), `stFlip` (15), `hmaShift` (20), `htfDiv` (15), `baseMomentum` (15).
- **Exponential Time-Weighted Decay**:
  Historical audit logs in `historical_assessments_FNO.json` are evaluated with learning rate $\eta = 0.2$ and exponential time decay:
  $$\eta_{\text{effective}} = \eta \cdot e^{-0.15 \cdot \text{daysOld}}$$
  Each indicator family ($k \in \{\text{HMA}, \text{ST}, \text{WT}, \text{TSI}, \text{HTF}\}$) has its weight multiplied by $\exp\left(-\eta_{\text{effective}} \cdot \frac{\text{Errors}_k}{\text{Fired}_k}\right)$ and re-normalized, heavily favoring indicator families that have outperformed over the most recent 3–5 trading sessions.

---

## 5. Signal Taxonomy & Priority Hierarchy

### 5.1 Core Quantitative Engine Modes
The screener supports two selectable Pine computation engines:
1. **`quant_swt` (Quant SWT Core Engine)**: Full multi-timeframe SuperTrend + WaveTrend + HMA/SMA confluence engine.
2. **`wt_cross_htf` (WaveTrend HTF Cross Engine)**: Specialized WaveTrend multiplier and HTF synchronization engine (`B`, `S`, `2XB`, `4XB`, `$2XB`, `HB`, `HS`, `SYNC BUY/SELL`, `POI BUY/SELL`).

### 5.2 Signal Reference Table (`SignalType`)

| Signal Code | Direction | Priority | Trigger Condition |
| :--- | :--- | :--- | :--- |
| **`HTF FLIP L` / `H1 Flip Long`** | Bullish | Highest (Overrides CTF) | Higher Timeframe (`HTF1` or `HTF2`) WaveTrend crosses bullish ($\text{WT}_1 > \text{WT}_2$) |
| **`HTF FLIP S` / `H1 Flip Short`** | Bearish | Highest (Overrides CTF) | Higher Timeframe (`HTF1` or `HTF2`) WaveTrend crosses bearish ($\text{WT}_1 < \text{WT}_2$) |
| **`R1 LONG`** | Bullish | High | CTF SuperTrend flips bullish while HTF SuperTrend is bullish (or in reversal zone) after recent WT oversold ($\le -60$) |
| **`R1 SHORT`** | Bearish | High | CTF SuperTrend flips bearish while HTF SuperTrend is bearish (or in reversal zone) after recent WT overbought ($\ge +60$) |
| **`R3 LONG`** | Bullish | Medium-High | Projected CTF WaveTrend ($\text{proj\_wt}_1$) crosses above Projected HTF1 WaveTrend with trend permission |
| **`R3 SHORT`** | Bearish | Medium-High | Projected CTF WaveTrend ($\text{proj\_wt}_1$) crosses below Projected HTF1 WaveTrend with trend permission |
| **`E1 LONG`** | Bullish | Medium | Early extreme oversold WaveTrend bullish cross ($\text{WT}_1 < -53$) confirmed by HTF HMA > SMA or price reclaiming HTF HMA |
| **`E1 SHORT`** | Bearish | Medium | Early extreme overbought WaveTrend bearish cross ($\text{WT}_1 > +53$) confirmed by HTF HMA < SMA or price losing HTF HMA |
| **`DIV LONG`** | Bullish | Medium | Bullish Hidden/Regular Divergence: Price makes a lower low below prior `E1 LONG` entry while $\text{WT}_1 > \text{WT}_2$ |
| **`DIV SHORT`** | Bearish | Medium | Bearish Hidden/Regular Divergence: Price makes a higher high above prior `E1 SHORT` entry while $\text{WT}_1 < \text{WT}_2$ |
| **`2XB` / `4XB` / `$2XB` / `$4XB`** | Bullish | Engine 2 (`wt_cross_htf`) | Multi-factor WaveTrend + Money Flow / Volume institutional buy crosses |
| **`2XS` / `4XS` / `$2XS` / `$4XS`** | Bearish | Engine 2 (`wt_cross_htf`) | Multi-factor WaveTrend + Money Flow / Volume institutional sell crosses |
| **`SYNC BUY` / `SYNC SELL`** | Bull / Bear | Engine 2 (`wt_cross_htf`) | Simultaneous CTF and HTF WaveTrend crossover synchronization |
| **`POI BUY` / `POI SELL`** | Bull / Bear | Engine 2 (`wt_cross_htf`) | Point-of-Interest projected WaveTrend convergence entry |

---

## 6. Dashboards & Workspace Modules

The top navigation bar provides access to **12 specialized analytical modules**:

1. **Next Day Smart Dashboard (`src/components/NextDaySmartDashboard.tsx`)** *(Default Landing View)*
   - Ranks the entire active watchlist for **Next-Day Trend Continuation** and **Next-Day Reversal** setups.
   - Integrates dynamic MWUA learned weights (`/api/dynamic-weights`), live session change quotes (`/api/live-quotes`), and a 50-day EOD Historical Audit Trail (`/api/historical-audit`) showing verified win rates and PnL percentages.
2. **Main Quant SWT Screener & Chart Workspace (`src/App.tsx` + `src/components/SWTChart.tsx`)**
   - Interactive split-pane or full-screen screener table with customizable columns (`NextDayTrade`, `LearnedEdge`, `ConfActionAI`, `ConflActionStack`, `ReversalAI`, `Price`, `ChangePercent`, `BestEntry`), multi-dimensional filters, direct TradingView chart launcher (with custom per-symbol URL overrides), and an interactive Plotly dual-pane candlestick + WaveTrend chart.
3. **Top 10 High-Conviction Dashboard (`src/components/Top10Dashboard.tsx`)**
   - Distills the universe into curated Top 10 Longs, Top 10 Shorts, Top 10 Reversal Longs, and Top 10 Reversal Shorts across multi-timeframe confluence scores.
4. **WaveTrend Multi-Timeframe Matrix (`src/components/WtDashboard.tsx`)**
   - Displays an 8-timeframe heatmap (`5m`, `15m`, `1H`, `3H`, `4H`, `1D`, `3D`, `1W`) of $\text{WT}_1/\text{WT}_2$ values, bars since crossover, consecutive momentum bars, `WT Strength %`, and `Reversal Strength %` (`RC Bull` / `RC bear`).
5. **WT + EMA Confluence Matrix (`src/components/WtEmaDashboard.tsx`)**
   - Combines WaveTrend, EMA 10/20, and TSI with bar-age decay multipliers ($1.2\times$ for fresh crosses $\le 3$ bars, $0.7\times$ for aged crosses $\ge 15$ bars) into a unified `wtEmaStrength` score.
6. **WT + HMA Confluence Matrix (`src/components/WtHmaDashboard.tsx`)**
   - Pairs WaveTrend and TSI with Hull Moving Average (`HMA(Close, 21)` vs `HMA(Open, 21)`) across all 8 timeframes.
7. **EMA 10/20 Multi-Timeframe Dashboard (`src/components/EmaDashboard.tsx`)**
   - Tracks EMA 10/20 bullish/bearish state and exact bar count since crossover across all timeframes, plus Higher-Timeframe EMA cross states (`HXB` / `HXS`).
8. **SuperTrend Channel Dashboard (`src/components/StDashboard.tsx`)** *(Available via Screener / Matrix integration)*
   - Monitors CTF and HTF1 SuperTrend (10, 3.0) direction and bars since flip across `5m`–`1W`.
9. **TSI Multi-Timeframe Dashboard (`src/components/TsiDashboard.tsx`)**
   - Tracks WaveTrend-scaled True Strength Index (`TSI 13, 25, 13`), fresh signal crosses, Golden Cross Bull/Bear (`GCB`/`GCS`), and `tsiRevStrength`.
10. **HMA 21 Open/Close Matrix (`src/components/HmaDashboard.tsx`)**
    - Dedicated Hull Moving Average crossover matrix comparing CTF HMA(21) and HTF1 HMA(21) trend duration.
11. **D7 & D8 Institutional Screeners (`src/components/ScreenerD7.tsx`, `src/components/D8Screener.tsx`)**
    - **D7 Screener**: Tracks multi-timeframe `CB`/`CS` (Confluence Buy/Sell where WaveTrend cross aligns with Price > HTF1 EMA20 & HTF2 EMA20), `HXB`/`HXS` (HTF EMA 10/20 cross), `GCB`/`GCS` (HTF TSI cross), and `H1B`/`H1S` (HTF WaveTrend cross).
    - **D8 Screener**: Multi-bucket institutional trend & reversal matrix with configurable max-row limits.
12. **Technical Indicators Deep-Dive & Backtest Learning Hub (`src/components/TechnicalIndicators.tsx`, `Notifications` tab)**
    - Runs 300-bar historical walk-forward backtests per symbol/timeframe, computing Win Rate, Total Trades, Maximum Favorable Excursion (`MFE`), Maximum Adverse Excursion (`MAE`), `ChopRisk`, and persisting `BacktestLearnedProfile` records to boost live screener rankings.

---

## 7. Backend REST API Reference

All endpoints are served by `server.ts` on port `3000`.

### `POST /api/screener-data` (also supports `GET`)
Computes full Pine Script indicators, Markov regime metrics, and trade levels for a list of symbols.
- **Request Body / Query Params**:
  - `timeframe`: `Timeframe` (`"1m"` | `"5m"` | `"15m"` | `"1H"` | `"3H"` | `"4H"` | `"1D"` | `"3D"` | `"1W"` | `"1M"`, default `"1H"`)
  - `selected`: `string` (Symbol currently focused in chart; uses a fast 15s cache TTL vs. 120s background TTL)
  - `symbols`: `string` (Comma-separated NSE symbols; defaults to `BASE_SYMBOLS`)
  - `engine`: `"quant_swt"` | `"wt_cross_htf"`
- **Response**: `{ status: "ok", timeframe, timestamp, data: ScreenerMetrics[] }`

### `GET /api/wt-dashboard`
Computes the 8-timeframe (`5m` to `1W`) matrix of WaveTrend, EMA 10/20, TSI (13,25,13), HMA 21, SuperTrend (10,3), and D7/D8 HTF confluence states (`CB/CS`, `HXB/HXS`, `GCB/GCS`, `H1B/H1S`).
- **Query Params**: `symbols` (required, comma-separated symbol list)
- **Response**: `{ status: "ok", data: WtDashboardRow[] }`

### `GET /api/symbol-history/:symbol`
Returns the last 50 bars of historical OHLCV candles along with aligned CTF, HTF1, and HTF2 SuperTrend, WaveTrend, HMA, SMA, EMA 10/20, and bar-by-bar historical signal markers for charting.
- **Route Params**: `:symbol` (e.g., `RELIANCE`, `NIFTY`, `CNXFINANCE`)
- **Query Params**: `timeframe` (default `"1H"`), `engine` (default `"quant_swt"`)
- **Response**: `{ status: "ok", symbol, timeframe, data: HistoricalCandle[] }`

### `GET /api/live-quotes`
Fetches real-time `regularMarketChangePercent` from Yahoo Finance using `yahoo-finance2` with automatic index ETF ticker resolution.
- **Query Params**: `symbols` (comma-separated symbol list)
- **Response**: `{ status: "ok", data: Record<string, number> }`

### `GET /api/historical-audit`
Returns the 50-day historical End-of-Day prediction audit log (`historical_assessments_FNO.json`). Automatically hides the current day's entry prior to 4:00 PM IST (`currentHourIST < 16`) so ongoing intraday sessions do not prematurely display as settled EOD outcomes.
- **Response**: `{ status: "ok", data: HistoricalAssessmentEntry[] }`

### `GET /api/dynamic-weights`
Runs the Multiplicative Weights Update Algorithm (MWUA) with exponential time decay ($\lambda = 0.15$) over the historical audit log and returns the recalibrated `trend` and `reversal` indicator weights.
- **Response**: `{ status: "ok", weights: { trend: Record<string, number>, reversal: Record<string, number> } }`

### `POST /api/finalize-eod`
Persists or updates today's EOD `Trend` or `Reversal` top bullish/bearish picks in `historical_assessments.json`.
- **Request Body**: `{ type: "Trend" | "Reversal", bullishPicks: Pick[], bearishPicks: Pick[] }`

---

## 8. Caching, Batch Concurrency & Resilience

To scan hundreds of symbols across 8+ timeframes without triggering Yahoo Finance HTTP 429 rate limits or exhausting sockets:
1. **Promise Deduplication & Candle Cache (`candleCacheRegistry`)**: Concurrent requests for the same `(ticker, timeframe)` pair within a **45-second TTL** share the exact same in-flight `Promise<Candle[]>`.
2. **Processed Symbol Cache (`cacheRegistry`)**: Caches full MTF `PineResults` + `MarkovSignalResult` for **15 seconds** on the actively selected symbol and **120 seconds** on background watchlist symbols.
3. **Chunked Batch Processing (`processInBatches`)**: Processes screener symbols in controlled batches of `10–15` symbols at a time.
4. **Deterministic High-Fidelity Offline Fallback (`generateHighFidelityFallbackCandles`)**: If Yahoo Finance is unreachable or rate-limited for any symbol, the engine falls back to a deterministic 150-bar PRNG series seeded by `(symbol, timeframe, currentHourWindow)` anchored to the symbol's NSE baseline price in `BASE_SYMBOLS`.

---

## 9. Repository File Structure

```text
├── .env.example                     # Environment variable template (GEMINI_API_KEY, MINIMAX_API_KEY)
├── historical_assessments_FNO.json  # 50-day EOD historical prediction & PnL audit dataset for MWUA learning
├── index.html                       # SPA entry point with global Plotly 2.35.0 script & SEO meta tags
├── metadata.json                    # Application metadata and capability declarations
├── package.json                     # Dependencies and dev/build/start scripts
├── server.ts                        # Express backend, Yahoo Finance client, MTF engines, & MWUA endpoints
├── tsconfig.json                    # TypeScript compiler configuration
├── vite.config.ts                   # Vite bundler and React/Tailwind plugin configuration
└── src/
    ├── main.tsx                     # React 19 DOM root mount
    ├── App.tsx                      # Primary application shell, navigation, screener table, & backtester
    ├── index.css                    # Tailwind CSS v4 entry stylesheet
    ├── types.ts                     # Shared TypeScript interfaces (Timeframe, SignalType, ScreenerMetrics)
    ├── components/
    │   ├── AgentWorkspace.tsx       # Multi-agent quantitative analysis & trade thesis panel
    │   ├── D8Screener.tsx           # D8 multi-bucket institutional screener view
    │   ├── EmaDashboard.tsx         # Multi-timeframe EMA 10/20 crossover & bar-count matrix
    │   ├── HmaDashboard.tsx         # Multi-timeframe HMA 21 Open/Close trend matrix
    │   ├── NextDaySmartDashboard.tsx# MWUA-powered Next-Day Trend/Reversal picks & 50-day audit UI
    │   ├── SWTChart.tsx             # Interactive Plotly candlestick, SuperTrend, & WaveTrend chart
    │   ├── ScreenerD7.tsx           # D7 HTF confluence screener (CB/CS, HXB/HXS, GCB/GCS, H1B/H1S)
    │   ├── StDashboard.tsx          # Multi-timeframe SuperTrend (10, 3.0) CTF & HTF1 dashboard
    │   ├── TechnicalIndicators.tsx  # Deep-dive multi-indicator inspection & walk-forward backtester
    │   ├── Top10Dashboard.tsx       # Curated Top 10 Long/Short & Reversal leaderboards
    │   ├── TsiDashboard.tsx         # Multi-timeframe WaveTrend-scaled TSI (13, 25, 13) dashboard
    │   ├── WtDashboard.tsx          # Multi-timeframe WaveTrend regime & RC reversal matrix
    │   ├── WtEmaDashboard.tsx       # Combined WaveTrend + EMA + TSI decay-weighted dashboard
    │   └── WtHmaDashboard.tsx       # Combined WaveTrend + HMA + TSI decay-weighted dashboard
    ├── data/
    │   ├── symbols-dataset.ts       # Base 143 NSE symbols with company descriptions & baseline prices
    │   └── watchlists.ts            # Personal, Nifty F&O (220+), and Nifty 500 symbol universes
    └── lib/
        ├── markov-engine.ts         # 3-state Markov Chain transition matrix & regime classifier
        ├── pine-math.ts             # Core Pine Script v5 math (WT, ST, HMA, SMA, EMA, WMA, MTF mapping)
        └── reversal-engine.ts       # Adaptive reversal scoring & pullback vs. climax detection
```

---

## 10. Installation, Configuration & Deployment

### Prerequisites
- **Node.js**: v20+ (v22 recommended)
- **npm**: v10+

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Variables
Copy `.env.example` to `.env` if using optional AI agent synthesis features (all core quantitative screening, charting, Markov regime analysis, and MWUA learning run 100% deterministically without any API keys):
```env
GEMINI_API_KEY=your_gemini_api_key_optional
MINIMAX_API_KEY=your_minimax_api_key_optional
```

### 3. Run in Development Mode
Starts the Express + Vite middleware server on `http://localhost:3000`:
```bash
npm run dev
```

### 4. Type-Check / Lint
```bash
npm run lint
```

### 5. Production Build & Start
Compiles the React frontend into `dist/` via Vite and bundles `server.ts` into `dist/server.cjs` via `esbuild`:
```bash
npm run build
npm run start
```

---

## 11. Client-Side Persistence (`localStorage` Keys)

The frontend persists user customizations and learned backtest profiles in the browser's `localStorage`:

| `localStorage` Key | Description |
| :--- | :--- |
| `personal_watchlist_symbols` | Custom array of NSE symbols in the user's Personal Watchlist |
| `personal_watchlist_migrated_v2` | Migration flag ensuring default personal symbols are seeded cleanly |
| `custom_tradingview_links` | Per-symbol custom TradingView chart layout URLs |
| `backtest_learned_records_v1` | Cached `BacktestLearnedProfile` objects from walk-forward backtests |
| `high_win_rate_edge_alerts_v2` | High-conviction alerts captured during backtest and live scanning |
| `toasts_enabled` | Boolean preference for real-time signal toast notifications |
