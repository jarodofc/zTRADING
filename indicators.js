'use strict';
(() => {
  function calcEMA(values, period) {
    const out = new Array(values.length).fill(null);
    if (values.length < period) return out;
    let sum = 0;
    for (let i = 0; i < period; i++) sum += values[i];
    let prev = sum / period;
    out[period - 1] = prev;
    const k = 2 / (period + 1);
    for (let i = period; i < values.length; i++) {
      prev = values[i] * k + prev * (1 - k);
      out[i] = prev;
    }
    return out;
  }

  function calcSMA(values, period) {
    const out = new Array(values.length).fill(null);
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      sum += values[i];
      if (i >= period) sum -= values[i - period];
      if (i >= period - 1) out[i] = sum / period;
    }
    return out;
  }

  function calcRSI(closes, period = 14) {
    const out = new Array(closes.length).fill(null);
    if (closes.length <= period) return out;

    let gains = 0;
    let losses = 0;
    for (let i = 1; i <= period; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;
    out[period] = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss);

    for (let i = period + 1; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      const gain = diff > 0 ? diff : 0;
      const loss = diff < 0 ? -diff : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      out[i] = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss);
    }
    return out;
  }

  function calcMACD(closes, fast = 12, slow = 26, signal = 9) {
    const emaFast = calcEMA(closes, fast);
    const emaSlow = calcEMA(closes, slow);
    const macdLine = closes.map((_, i) =>
      emaFast[i] !== null && emaSlow[i] !== null ? emaFast[i] - emaSlow[i] : null
    );

    const validMacd = [];
    const validIdx = [];
    macdLine.forEach((v, i) => {
      if (v !== null) {
        validMacd.push(v);
        validIdx.push(i);
      }
    });

    const sigCompact = calcEMA(validMacd, signal);
    const signalLine = new Array(closes.length).fill(null);
    const histogram = new Array(closes.length).fill(null);

    sigCompact.forEach((v, idx) => {
      if (v !== null) {
        const realIdx = validIdx[idx];
        signalLine[realIdx] = v;
        histogram[realIdx] = macdLine[realIdx] - v;
      }
    });

    return { macdLine, signalLine, histogram };
  }


  globalThis.TradingIndicators = Object.freeze({calcEMA,calcSMA,calcRSI,calcMACD});
})();
