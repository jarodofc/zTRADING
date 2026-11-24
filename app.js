/* ==========================================================================
   AETHER TERMINAL — Motor de Dados em Tempo Real (Binance REST + WebSocket)
   Gráfico Lightweight Charts + Indicadores Técnicos (RSI, MACD, EMAs, SMA)
   ========================================================================== */

(() => {
  'use strict';

  // ------------------------------------------------------------------------
  // 1. Configuração & Estado Global
  // ------------------------------------------------------------------------
  const BINANCE_REST = 'https://api.binance.com/api/v3';
  const BINANCE_WS = 'wss://stream.binance.com:9443/stream?streams=';

  const WATCHLIST_SYMBOLS = [
    'BTCUSDT',
    'ETHUSDT',
    'SOLUSDT',
    'BNBUSDT',
    'XRPUSDT',
    'AVAXUSDT',
    'ADAUSDT',
    'DOGEUSDT',
    'LINKUSDT',
    'NEARUSDT'
  ];

  const FALLBACK_PRICES = {
    BTCUSDT: 94250.0,
    ETHUSDT: 3340.5,
    SOLUSDT: 218.4,
    BNBUSDT: 652.2,
    XRPUSDT: 1.482,
    AVAXUSDT: 42.85,
    ADAUSDT: 0.945,
    DOGEUSDT: 0.382,
    LINKUSDT: 18.65,
    NEARUSDT: 6.42
  };

  const state = {
    symbol: 'BTCUSDT',
    interval: '1m',
    candles: [],
    lastPrice: null,
    tickerMap: new Map(),
    tradesWindow: [],
    orderBook: { bids: [], asks: [], bidTotal: 0, askTotal: 0 },
    overlays: { ema9: true, ema21: true, sma50: true, markers: true },
    lastVerdictKey: null,
    wsMarket: null,
    wsTicker: null,
    simTimer: null,
    usingSimulation: false,
    reconnectTimer: null
  };

  // Referências do Gráfico Lightweight Charts
  let chart = null;
  let candleSeries = null;
  let volumeSeries = null;
  let ema9Series = null;
  let ema21Series = null;
  let sma50Series = null;

  // ------------------------------------------------------------------------
  // 2. Helpers de Formatação Numérica
  // ------------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);

  function getDecimals(price) {
    if (!Number.isFinite(price)) return 2;
    if (price >= 1000) return 2;
    if (price >= 10) return 3;
    if (price >= 1) return 4;
    return 5;
  }

  function fmtPrice(val) {
    if (!Number.isFinite(val)) return '--';
    return val.toLocaleString('en-US', {
      minimumFractionDigits: getDecimals(val),
      maximumFractionDigits: getDecimals(val)
    });
  }

  function fmtCompactUSD(val) {
    if (!Number.isFinite(val)) return '--';
    if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
    if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
    if (val >= 1e3) return `$${(val / 1e3).toFixed(1)}K`;
    return `$${val.toFixed(2)}`;
  }

  function fmtQty(val) {
    if (!Number.isFinite(val)) return '--';
    if (val >= 1000) return val.toFixed(1);
    if (val >= 1) return val.toFixed(3);
    return val.toFixed(5);
  }

  function fmtTime(tsMs) {
    return new Date(tsMs).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function formatPairLabel(sym) {
    return sym.replace('USDT', ' / USDT');
  }

  function setWsStatus(mode, text) {
    const dot = $('wsStatusDot');
    const lbl = $('wsStatusText');
    dot.className = 'status-dot ' + (mode === 'online' ? 'online' : mode === 'sim' ? 'sim' : '');
    lbl.textContent = text;
  }

  // ------------------------------------------------------------------------
  // 3. Inicialização do Gráfico (TradingView Lightweight Charts)
  // ------------------------------------------------------------------------
  function initChart() {
    const container = $('tvChartContainer');
    container.innerHTML = '';

    chart = LightweightCharts.createChart(container, {
      layout: {
        background: { type: 'solid', color: 'transparent' },
        textColor: '#98a8c3',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.045)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.045)' }
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(56, 189, 248, 0.45)',
          width: 1,
          style: LightweightCharts.LineStyle.Dashed,
          labelBackgroundColor: '#0f172a'
        },
        horzLine: {
          color: 'rgba(56, 189, 248, 0.45)',
          width: 1,
          style: LightweightCharts.LineStyle.Dashed,
          labelBackgroundColor: '#0f172a'
        }
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
        scaleMargins: { top: 0.1, bottom: 0.24 }
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
        barSpacing: 9
      },
      handleScroll: { vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: true }
    });

    // Série de Candles
    candleSeries = chart.addCandlestickSeries({
      upColor: '#00f5a0',
      downColor: '#ff3b6b',
      borderUpColor: '#00f5a0',
      borderDownColor: '#ff3b6b',
      wickUpColor: '#00f5a0',
      wickDownColor: '#ff3b6b'
    });

    // Série de Volume (Histograma na base)
    volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume'
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 }
    });

    // Médias Móveis (EMA 9, EMA 21, SMA 50)
    ema9Series = chart.addLineSeries({
      color: '#38bdf8',
      lineWidth: 1.7,
      priceLineVisible: false,
      lastValueVisible: false
    });

    ema21Series = chart.addLineSeries({
      color: '#f5b731',
      lineWidth: 1.7,
      priceLineVisible: false,
      lastValueVisible: false
    });

    sma50Series = chart.addLineSeries({
      color: '#c084fc',
      lineWidth: 1.7,
      priceLineVisible: false,
      lastValueVisible: false
    });

    // Atualiza legenda OHLCV ao mover o cursor
    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.time) {
        updateLegend(state.candles[state.candles.length - 1]);
        return;
      }
      const c = param.seriesData.get(candleSeries);
      const v = param.seriesData.get(volumeSeries);
      if (c) {
        updateLegend({
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: v ? v.value : 0
        });
      }
    });

    // Responsividade automática do canvas
    const resizeObserver = new ResizeObserver(() => {
      if (chart && container.clientWidth > 0) {
        chart.applyOptions({
          width: container.clientWidth,
          height: container.clientHeight
        });
      }
    });
    resizeObserver.observe(container);
  }

  function updateLegend(bar) {
    if (!bar) return;
    $('legO').textContent = fmtPrice(bar.open);
    $('legH').textContent = fmtPrice(bar.high);
    $('legL').textContent = fmtPrice(bar.low);
    $('legC').textContent = fmtPrice(bar.close);
    $('legV').textContent = fmtQty(bar.volume);
  }

  // ------------------------------------------------------------------------
  // 4. Motor de Indicadores Técnicos (RSI, MACD, EMA, SMA & Cruzamentos)
  // ------------------------------------------------------------------------
  const {calcEMA,calcSMA,calcRSI,calcMACD} = globalThis.TradingIndicators;

  function recalculateIndicatorsAndSignals() {
    if (state.candles.length < 30) return;

    const closes = state.candles.map((c) => c.close);
    const times = state.candles.map((c) => c.time);

    const ema9 = calcEMA(closes, 9);
    const ema21 = calcEMA(closes, 21);
    const sma50 = calcSMA(closes, 50);
    const rsi = calcRSI(closes, 14);
    const macd = calcMACD(closes, 12, 26, 9);

    // Atualiza séries de médias móveis no gráfico
    ema9Series.setData(
      state.overlays.ema9
        ? times.map((t, i) => (ema9[i] !== null ? { time: t, value: ema9[i] } : null)).filter(Boolean)
        : []
    );
    ema21Series.setData(
      state.overlays.ema21
        ? times.map((t, i) => (ema21[i] !== null ? { time: t, value: ema21[i] } : null)).filter(Boolean)
        : []
    );
    sma50Series.setData(
      state.overlays.sma50
        ? times.map((t, i) => (sma50[i] !== null ? { time: t, value: sma50[i] } : null)).filter(Boolean)
        : []
    );

    // Marcadores de sinais de Compra/Venda nos candles
    const markers = [];
    if (state.overlays.markers) {
      for (let i = 22; i < state.candles.length; i++) {
        const bullCross =
          ema9[i - 1] !== null &&
          ema21[i - 1] !== null &&
          ema9[i - 1] <= ema21[i - 1] &&
          ema9[i] > ema21[i];
        const bearCross =
          ema9[i - 1] !== null &&
          ema21[i - 1] !== null &&
          ema9[i - 1] >= ema21[i - 1] &&
          ema9[i] < ema21[i];

        if (bullCross) {
          markers.push({
            time: times[i],
            position: 'belowBar',
            color: '#00f5a0',
            shape: 'arrowUp',
            text: 'COMPRA'
          });
        } else if (bearCross) {
          markers.push({
            time: times[i],
            position: 'aboveBar',
            color: '#ff3b6b',
            shape: 'arrowDown',
            text: 'VENDA'
          });
        }
      }
    }
    candleSeries.setMarkers(markers);

    // Valores mais recentes para o Motor de Decisão
    const last = closes.length - 1;
    const prev = last - 1;
    const price = closes[last];
    const curRsi = rsi[last] ?? 50;
    const curMacd = macd.macdLine[last] ?? 0;
    const curSig = macd.signalLine[last] ?? 0;
    const curHist = macd.histogram[last] ?? 0;
    const prevHist = macd.histogram[prev] ?? 0;
    const curE9 = ema9[last] ?? price;
    const curE21 = ema21[last] ?? price;
    const prevE9 = ema9[prev] ?? price;
    const prevE21 = ema21[prev] ?? price;
    const curS50 = sma50[last] ?? price;

    // Pontuação composta (-100 a +100 -> normalizada 0 a 100)
    let score = 50;
    const reasons = [];

    // 1. RSI (14)
    let rsiState = 'neutral';
    if (curRsi <= 32) {
      score += 20;
      rsiState = 'buy';
      reasons.push(`RSI em sobrevenda (${curRsi.toFixed(1)})`);
    } else if (curRsi < 45) {
      score += 8;
      rsiState = 'buy';
    } else if (curRsi >= 68) {
      score -= 20;
      rsiState = 'sell';
      reasons.push(`RSI em sobrecompra (${curRsi.toFixed(1)})`);
    } else if (curRsi > 55) {
      score -= 8;
      rsiState = 'sell';
    }

    // 2. MACD & Cruzamento de Histograma
    let macdState = 'neutral';
    if (curHist > 0 && prevHist <= 0) {
      score += 18;
      macdState = 'buy';
      reasons.push('MACD cruzou acima da linha de sinal');
    } else if (curHist < 0 && prevHist >= 0) {
      score -= 18;
      macdState = 'sell';
      reasons.push('MACD cruzou abaixo da linha de sinal');
    } else if (curMacd > curSig && curHist > prevHist) {
      score += 12;
      macdState = 'buy';
      reasons.push('Momentum MACD comprador');
    } else if (curMacd < curSig && curHist < prevHist) {
      score -= 12;
      macdState = 'sell';
      reasons.push('Momentum MACD vendedor');
    }

    // 3. Cruzamento EMA 9 x EMA 21 + Tendência SMA 50
    let maState = 'neutral';
    let maCrossLabel = 'Lateralizado';
    if (prevE9 <= prevE21 && curE9 > curE21) {
      score += 22;
      maState = 'buy';
      maCrossLabel = 'Cruzamento Alta';
      reasons.push('Cruzamento de alta EMA 9 > EMA 21');
    } else if (prevE9 >= prevE21 && curE9 < curE21) {
      score -= 22;
      maState = 'sell';
      maCrossLabel = 'Cruzamento Baixa';
      reasons.push('Cruzamento de baixa EMA 9 < EMA 21');
    } else if (curE9 > curE21 && price > curS50) {
      score += 12;
      maState = 'buy';
      maCrossLabel = 'Alta Alinhada';
      reasons.push('Preço acima da EMA 21 e SMA 50');
    } else if (curE9 < curE21 && price < curS50) {
      score -= 12;
      maState = 'sell';
      maCrossLabel = 'Baixa Alinhada';
      reasons.push('Preço abaixo da EMA 21 e SMA 50');
    } else if (curE9 > curE21) {
      score += 5;
      maState = 'buy';
      maCrossLabel = 'EMA 9 > EMA 21';
    } else {
      score -= 5;
      maState = 'sell';
      maCrossLabel = 'EMA 9 < EMA 21';
    }

    // 4. Fluxo de Ordens (Order Book + Negócios Recentes)
    const buyPct = computeFlowBuyPercent();
    let flowState = 'neutral';
    if (buyPct >= 58) {
      score += 10;
      flowState = 'buy';
      reasons.push(`Pressão compradora dominante (${buyPct.toFixed(0)}%)`);
    } else if (buyPct <= 42) {
      score -= 10;
      flowState = 'sell';
      reasons.push(`Pressão vendedora dominante (${(100 - buyPct).toFixed(0)}%)`);
    }

    score = Math.max(0, Math.min(100, Math.round(score)));

    // Atualiza Cards Individuais dos Indicadores
    updateIndicatorCards({
      curRsi,
      rsiState,
      curMacd,
      curSig,
      curHist,
      macdState,
      curE9,
      curE21,
      curS50,
      maState,
      maCrossLabel,
      buyPct,
      flowState
    });

    // Atualiza Veredito Principal ("HORA DE COMPRAR" / "HORA DE VENDER")
    renderMainSignal(score, reasons, price);
  }

  function computeFlowBuyPercent() {
    const bookTot = state.orderBook.bidTotal + state.orderBook.askTotal;
    const bookRatio = bookTot > 0 ? (state.orderBook.bidTotal / bookTot) * 100 : 50;

    let tradeBuy = 0;
    let tradeSell = 0;
    for (const t of state.tradesWindow) {
      if (t.isBuy) tradeBuy += t.quote;
      else tradeSell += t.quote;
    }
    const tradeTot = tradeBuy + tradeSell;
    const tradeRatio = tradeTot > 0 ? (tradeBuy / tradeTot) * 100 : bookRatio;

    return bookRatio * 0.45 + tradeRatio * 0.55;
  }

  function updateIndicatorCards(d) {
    // RSI
    $('rsiValue').textContent = d.curRsi.toFixed(1);
    $('rsiMarker').style.left = `${Math.max(2, Math.min(98, d.curRsi))}%`;
    const rsiBadge = $('rsiBadge');
    rsiBadge.className = `ind-badge ${d.rsiState}`;
    rsiBadge.textContent =
      d.curRsi <= 32 ? 'COMPRA' : d.curRsi >= 68 ? 'VENDA' : d.rsiState === 'buy' ? 'ALTA' : d.rsiState === 'sell' ? 'BAIXA' : 'NEUTRO';
    $('rsiDesc').textContent =
      d.curRsi <= 32
        ? 'Ativo sobrevendido — possível reversão'
        : d.curRsi >= 68
        ? 'Ativo sobrecomprado — risco de correção'
        : 'Força relativa em zona saudável';

    // MACD
    $('macdValue').textContent = d.curMacd.toFixed(getDecimals(Math.abs(d.curMacd) + 1));
    $('macdSignalVal').textContent = d.curSig.toFixed(2);
    $('macdHistVal').textContent = (d.curHist >= 0 ? '+' : '') + d.curHist.toFixed(2);
    $('macdHistVal').className = d.curHist >= 0 ? 'text-buy' : 'text-sell';
    const macdBadge = $('macdBadge');
    macdBadge.className = `ind-badge ${d.macdState}`;
    macdBadge.textContent = d.macdState === 'buy' ? 'COMPRA' : d.macdState === 'sell' ? 'VENDA' : 'NEUTRO';
    $('macdDesc').textContent =
      d.curHist >= 0 ? 'Histograma positivo (impulso altista)' : 'Histograma negativo (impulso baixista)';

    // Médias Móveis
    $('maCrossStatus').textContent = d.maCrossLabel;
    $('ema9Val').textContent = fmtPrice(d.curE9);
    $('ema21Val').textContent = fmtPrice(d.curE21);
    $('sma50Desc').textContent = `SMA 50: ${fmtPrice(d.curS50)}`;
    const maBadge = $('maBadge');
    maBadge.className = `ind-badge ${d.maState}`;
    maBadge.textContent = d.maState === 'buy' ? 'ALTA' : d.maState === 'sell' ? 'BAIXA' : 'NEUTRO';

    // Pressão de Fluxo
    const sellPct = 100 - d.buyPct;
    $('flowRatioVal').textContent = `${d.buyPct.toFixed(0)}% / ${sellPct.toFixed(0)}%`;
    $('flowBuyBar').style.width = `${d.buyPct.toFixed(1)}%`;
    $('flowSellBar').style.width = `${sellPct.toFixed(1)}%`;
    const flowBadge = $('flowBadge');
    flowBadge.className = `ind-badge ${d.flowState}`;
    flowBadge.textContent =
      d.flowState === 'buy' ? 'COMPRADOR' : d.flowState === 'sell' ? 'VENDEDOR' : 'EQUILIBRADO';
    $('flowDesc').textContent =
      d.flowState === 'buy'
        ? 'Fluxo líquido favorecendo compradores'
        : d.flowState === 'sell'
        ? 'Fluxo líquido favorecendo vendedores'
        : 'Disputa equilibrada no book e negócios';
  }

  function renderMainSignal(score, reasons, price) {
    const deck = $('signalDeckCard');
    const iconRing = $('signalIconRing');
    const icon = $('signalIcon');
    const headline = $('signalHeadline');
    const reasonEl = $('signalReason');

    $('signalScoreValue').textContent = `${score} / 100`;
    $('signalNeedle').style.left = `${score}%`;

    let verdictKey = 'NEUTRAL';
    let cls = 'neutral';
    let title = 'NEUTRO — AGUARDAR CONFIRMAÇÃO';
    let iconName = 'balance';

    if (score >= 68) {
      verdictKey = 'STRONG_BUY';
      cls = 'buy';
      title = 'VIÉS TÉCNICO DE ALTA • FORTE';
      iconName = 'trending_up';
    } else if (score >= 58) {
      verdictKey = 'BUY';
      cls = 'buy';
      title = 'VIÉS TÉCNICO DE ALTA';
      iconName = 'north_east';
    } else if (score <= 32) {
      verdictKey = 'STRONG_SELL';
      cls = 'sell';
      title = 'VIÉS TÉCNICO DE BAIXA • FORTE';
      iconName = 'trending_down';
    } else if (score <= 42) {
      verdictKey = 'SELL';
      cls = 'sell';
      title = 'VIÉS TÉCNICO DE BAIXA';
      iconName = 'south_east';
    }

    deck.classList.remove('state-buy', 'state-sell');
    if (cls === 'buy') deck.classList.add('state-buy');
    if (cls === 'sell') deck.classList.add('state-sell');

    iconRing.className = `signal-icon-ring ${cls}`;
    icon.textContent = iconName;
    headline.className = `signal-headline ${cls}`;
    headline.textContent = title;
    reasonEl.textContent = reasons.length
      ? reasons.slice(0, 3).join(' • ')
      : 'Indicadores técnicos em equilíbrio; aguarde rompimento ou cruzamento.';

    // Registra mudança de sinal relevante no log lateral
    if (verdictKey !== state.lastVerdictKey && verdictKey !== 'NEUTRAL') {
      state.lastVerdictKey = verdictKey;
      pushSignalLog(cls, title, `${formatPairLabel(state.symbol)} @ $${fmtPrice(price)} (${score}/100)`);
    } else if (verdictKey === 'NEUTRAL') {
      state.lastVerdictKey = 'NEUTRAL';
    }
  }

  function pushSignalLog(side, title, meta) {
    const list = $('signalLogList');
    const empty = list.querySelector('.log-empty');
    if (empty) empty.remove();

    const el = document.createElement('div');
    el.className = `log-item ${side}`;
    el.innerHTML = `
      <div class="log-item-main">
        <span class="log-item-title ${side === 'buy' ? 'text-buy' : 'text-sell'}">${title}</span>
        <span class="log-item-meta mono">${meta}</span>
      </div>
      <span class="trade-time mono">${fmtTime(Date.now())}</span>
    `;
    list.prepend(el);
    while (list.children.length > 20) list.lastElementChild.remove();
  }

  // ------------------------------------------------------------------------
  // 5. Renderização do Ticker Tape, KPIs, Order Book, Trades e Radar
  // ------------------------------------------------------------------------
  function renderTickerTape() {
    const track = $('tickerTrack');
    const items = WATCHLIST_SYMBOLS.map((sym) => {
      const data = state.tickerMap.get(sym) || {
        symbol: sym,
        price: FALLBACK_PRICES[sym] || 100,
        changePct: 0
      };
      const up = data.changePct >= 0;
      return `
        <div class="ticker-item" data-symbol="${sym}">
          <span class="ticker-sym">${sym.replace('USDT', '')}</span>
          <span class="ticker-prc">$${fmtPrice(data.price)}</span>
          <span class="ticker-chg ${up ? 'up' : 'down'}">${up ? '+' : ''}${data.changePct.toFixed(2)}%</span>
        </div>
      `;
    }).join('');

    // Duplica para rolagem contínua sem cortes
    track.innerHTML = items + items;
    renderWatchlist();
  }

  function renderWatchlist() {
    const container = $('watchlistRows');
    container.innerHTML = WATCHLIST_SYMBOLS.map((sym) => {
      const d = state.tickerMap.get(sym) || {
        price: FALLBACK_PRICES[sym] || 100,
        changePct: 0
      };
      const up = d.changePct >= 0;
      const active = sym === state.symbol ? 'active' : '';
      return `
        <div class="watch-row mono ${active}" data-symbol="${sym}">
          <span class="ticker-sym">${sym.replace('USDT', '')}<small style="color:var(--text-muted)">/USDT</small></span>
          <span>$${fmtPrice(d.price)}</span>
          <span class="${up ? 'text-buy' : 'text-sell'}">${up ? '+' : ''}${d.changePct.toFixed(2)}%</span>
        </div>
      `;
    }).join('');
  }

  function updateKPIsFromTicker(t) {
    if (!t) return;
    const price = t.price;
    const high = t.high;
    const low = t.low;
    const changePct = t.changePct;
    const changeAbs = t.changeAbs;

    const priceEl = $('kpiPrice');
    if (state.lastPrice !== null && price !== state.lastPrice) {
      priceEl.classList.remove('flash-up', 'flash-down');
      void priceEl.offsetWidth;
      priceEl.classList.add(price > state.lastPrice ? 'flash-up' : 'flash-down');
    }
    state.lastPrice = price;

    priceEl.textContent = `$${fmtPrice(price)}`;
    $('kpiPriceDelta').textContent = `${changeAbs >= 0 ? '+' : ''}${fmtPrice(changeAbs)} USD`;
    $('kpiPriceDelta').className = `hero-delta mono ${changeAbs >= 0 ? 'text-buy' : 'text-sell'}`;

    const pill = $('kpiChangePill');
    pill.textContent = `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`;
    pill.className = `change-pill ${changePct > 0 ? 'up' : changePct < 0 ? 'down' : 'neutral'}`;

    $('kpiHigh').textContent = `$${fmtPrice(high)}`;
    $('kpiLow').textContent = `$${fmtPrice(low)}`;
    $('kpiHighLabel').textContent = `$${fmtPrice(high)}`;
    $('kpiLowLabel').textContent = `$${fmtPrice(low)}`;

    const distHigh = high > 0 ? ((price - high) / high) * 100 : 0;
    const distLow = low > 0 ? ((price - low) / low) * 100 : 0;
    $('kpiDistHigh').textContent = `Dist. do topo: ${distHigh.toFixed(2)}%`;
    $('kpiDistLow').textContent = `Acima do fundo: +${distLow.toFixed(2)}%`;

    const rangePct = high > low ? Math.max(0, Math.min(100, ((price - low) / (high - low)) * 100)) : 50;
    $('kpiRangeFill').style.width = `${rangePct.toFixed(1)}%`;
    $('kpiRangeThumb').style.left = `${rangePct.toFixed(1)}%`;

    $('kpiVolumeQuote').textContent = fmtCompactUSD(t.quoteVolume);
    $('kpiVolumeBase').textContent = `${fmtQty(t.volume)} ${state.symbol.replace('USDT', '')}`;

    $('bookMidPrice').textContent = `$${fmtPrice(price)}`;
    $('bookMidPrice').className = `mid-price mono ${changePct >= 0 ? 'text-buy' : 'text-sell'}`;
  }

  function renderOrderBook(bids, asks) {
    const topAsks = asks.slice(0, 9);
    const topBids = bids.slice(0, 9);

    let askTotal = 0;
    let bidTotal = 0;
    const parsedAsks = topAsks.map(([p, q]) => {
      const price = Number(p);
      const qty = Number(q);
      const tot = price * qty;
      askTotal += tot;
      return { price, qty, tot };
    });
    const parsedBids = topBids.map(([p, q]) => {
      const price = Number(p);
      const qty = Number(q);
      const tot = price * qty;
      bidTotal += tot;
      return { price, qty, tot };
    });

    state.orderBook = { bids: parsedBids, asks: parsedAsks, bidTotal, askTotal };

    const maxAsk = Math.max(...parsedAsks.map((r) => r.tot), 1);
    const maxBid = Math.max(...parsedBids.map((r) => r.tot), 1);

    // Exibe Asks em ordem decrescente de preço (melhor venda perto do spread)
    $('asksList').innerHTML = [...parsedAsks]
      .reverse()
      .map(
        (r) => `
      <div class="book-row ask mono">
        <div class="depth-bg" style="width:${Math.min(100, (r.tot / maxAsk) * 100).toFixed(1)}%"></div>
        <span class="price-col">${fmtPrice(r.price)}</span>
        <span class="qty-col">${fmtQty(r.qty)}</span>
        <span class="tot-col">${fmtCompactUSD(r.tot)}</span>
      </div>
    `
      )
      .join('');

    $('bidsList').innerHTML = parsedBids
      .map(
        (r) => `
      <div class="book-row bid mono">
        <div class="depth-bg" style="width:${Math.min(100, (r.tot / maxBid) * 100).toFixed(1)}%"></div>
        <span class="price-col">${fmtPrice(r.price)}</span>
        <span class="qty-col">${fmtQty(r.qty)}</span>
        <span class="tot-col">${fmtCompactUSD(r.tot)}</span>
      </div>
    `
      )
      .join('');

    // Liquidez e Spread
    const totalLiq = bidTotal + askTotal;
    const bidPct = totalLiq > 0 ? (bidTotal / totalLiq) * 100 : 50;
    const askPct = 100 - bidPct;

    $('bookBidPct').textContent = `${bidPct.toFixed(0)}%`;
    $('bookAskPct').textContent = `${askPct.toFixed(0)}%`;
    $('bookBidBar').style.width = `${bidPct.toFixed(1)}%`;
    $('bookAskBar').style.width = `${askPct.toFixed(1)}%`;

    $('kpiLiquidity').textContent = fmtCompactUSD(totalLiq);
    $('kpiLiqBidBar').style.width = `${bidPct.toFixed(1)}%`;
    $('kpiLiqAskBar').style.width = `${askPct.toFixed(1)}%`;

    if (parsedAsks[0] && parsedBids[0]) {
      const spread = parsedAsks[0].price - parsedBids[0].price;
      const spreadPct = (spread / parsedAsks[0].price) * 100;
      const spreadTxt = `Spread: ${fmtPrice(spread)} (${spreadPct.toFixed(3)}%)`;
      $('kpiSpread').textContent = spreadTxt;
      $('bookMidSpread').textContent = spreadTxt;
    }
  }

  function pushLiveTrade(trade) {
    state.tradesWindow.unshift(trade);
    if (state.tradesWindow.length > 45) state.tradesWindow.pop();

    let buySum = 0;
    let sellSum = 0;
    for (const t of state.tradesWindow) {
      if (t.isBuy) buySum += t.quote;
      else sellSum += t.quote;
    }
    $('recentBuyVol').textContent = fmtCompactUSD(buySum);
    $('recentSellVol').textContent = fmtCompactUSD(sellSum);

    const feed = $('tradesFeed');
    const row = document.createElement('div');
    const isWhale = trade.quote >= 25000;
    row.className = `trade-row mono ${isWhale ? 'whale' : ''}`;
    row.innerHTML = `
      <span class="side-tag ${trade.isBuy ? 'buy' : 'sell'}">${trade.isBuy ? 'COMPRA' : 'VENDA'}</span>
      <span class="${trade.isBuy ? 'text-buy' : 'text-sell'}">${fmtPrice(trade.price)}</span>
      <span>${fmtCompactUSD(trade.quote)}</span>
      <span class="trade-time">${fmtTime(trade.time)}</span>
    `;
    feed.prepend(row);
    while (feed.children.length > 32) feed.lastElementChild.remove();
  }

  // ------------------------------------------------------------------------
  // 6. Integração Binance REST + WebSocket (com Failover Automático)
  // ------------------------------------------------------------------------
  async function loadInitialMarketData() {
    stopSimulation();
    closeMarketSocket();
    state.tradesWindow = [];
    $('tradesFeed').innerHTML = '';
    $('activePairTitle').textContent = formatPairLabel(state.symbol);
    setWsStatus('connecting', 'Sincronizando...');

    try {
      const [klinesRes, tickerRes, depthRes] = await Promise.all([
        fetch(`${BINANCE_REST}/klines?symbol=${state.symbol}&interval=${state.interval}&limit=160`),
        fetch(`${BINANCE_REST}/ticker/24hr?symbol=${state.symbol}`),
        fetch(`${BINANCE_REST}/depth?symbol=${state.symbol}&limit=20`)
      ]);

      if (!klinesRes.ok || !tickerRes.ok || !depthRes.ok) {
        throw new Error('Falha na API REST Binance');
      }

      const [klines, ticker, depth] = await Promise.all([
        klinesRes.json(),
        tickerRes.json(),
        depthRes.json()
      ]);

      // Popula Candles & Volume
      state.candles = klines.map((k) => ({
        time: Math.floor(k[0] / 1000),
        open: Number(k[1]),
        high: Number(k[2]),
        low: Number(k[3]),
        close: Number(k[4]),
        volume: Number(k[5])
      }));

      applyCandlesToChart();

      // Popula Ticker 24h
      const parsedTicker = {
        symbol: state.symbol,
        price: Number(ticker.lastPrice),
        high: Number(ticker.highPrice),
        low: Number(ticker.lowPrice),
        volume: Number(ticker.volume),
        quoteVolume: Number(ticker.quoteVolume),
        changePct: Number(ticker.priceChangePercent),
        changeAbs: Number(ticker.priceChange)
      };
      state.tickerMap.set(state.symbol, parsedTicker);
      updateKPIsFromTicker(parsedTicker);

      // Popula Order Book Inicial
      renderOrderBook(depth.bids || [], depth.asks || []);
      recalculateIndicatorsAndSignals();
      chart.timeScale().fitContent();

      // Conecta WebSocket em Tempo Real
      connectMarketSocket();
    } catch (err) {
      activateFallbackSimulation();
    }
  }

  function applyCandlesToChart() {
    candleSeries.setData(
      state.candles.map(({ time, open, high, low, close }) => ({ time, open, high, low, close }))
    );
    volumeSeries.setData(
      state.candles.map((c) => ({
        time: c.time,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(0, 245, 160, 0.34)' : 'rgba(255, 59, 107, 0.34)'
      }))
    );
    updateLegend(state.candles[state.candles.length - 1]);
  }

  function connectMarketSocket() {
    closeMarketSocket();
    const symLower = state.symbol.toLowerCase();
    const streams = [
      `${symLower}@kline_${state.interval}`,
      `${symLower}@ticker`,
      `${symLower}@depth20@100ms`,
      `${symLower}@aggTrade`
    ].join('/');

    const ws = new WebSocket(BINANCE_WS + streams);
    state.wsMarket = ws;

    ws.onopen = () => {
      state.usingSimulation = false;
      setWsStatus('online', 'Binance WS Live');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const stream = msg.stream || '';
        const d = msg.data;
        if (!d) return;

        // 1. Atualização de Candle em Tempo Real
        if (stream.includes('@kline_')) {
          const k = d.k;
          const bar = {
            time: Math.floor(k.t / 1000),
            open: Number(k.o),
            high: Number(k.h),
            low: Number(k.l),
            close: Number(k.c),
            volume: Number(k.v)
          };

          const lastBar = state.candles[state.candles.length - 1];
          if (lastBar && lastBar.time === bar.time) {
            state.candles[state.candles.length - 1] = bar;
          } else {
            state.candles.push(bar);
            if (state.candles.length > 220) state.candles.shift();
          }

          candleSeries.update({
            time: bar.time,
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close
          });
          volumeSeries.update({
            time: bar.time,
            value: bar.volume,
            color: bar.close >= bar.open ? 'rgba(0, 245, 160, 0.34)' : 'rgba(255, 59, 107, 0.34)'
          });

          updateLegend(bar);
          recalculateIndicatorsAndSignals();
        }

        // 2. Ticker 24h do Ativo Atual
        if (stream.endsWith('@ticker')) {
          const tObj = {
            symbol: d.s,
            price: Number(d.c),
            high: Number(d.h),
            low: Number(d.l),
            volume: Number(d.v),
            quoteVolume: Number(d.q),
            changePct: Number(d.P),
            changeAbs: Number(d.p)
          };
          state.tickerMap.set(d.s, tObj);
          updateKPIsFromTicker(tObj);
        }

        // 3. Livro de Ofertas (Depth Top 20)
        if (stream.includes('@depth20')) {
          renderOrderBook(d.bids || [], d.asks || []);
        }

        // 4. Fluxo de Negócios (AggTrade)
        if (stream.endsWith('@aggTrade')) {
          const price = Number(d.p);
          const qty = Number(d.q);
          pushLiveTrade({
            price,
            qty,
            quote: price * qty,
            isBuy: !d.m, // m === true significa vendedor agrediu o comprador
            time: d.T || Date.now()
          });
        }
      } catch (_) {
        // Ignora pacotes malformados
      }
    };

    ws.onerror = () => {
      if (!state.usingSimulation) activateFallbackSimulation();
    };

    ws.onclose = () => {
      if (state.wsMarket === ws && !state.usingSimulation) {
        setWsStatus('connecting', 'Reconectando...');
        clearTimeout(state.reconnectTimer);
        state.reconnectTimer = setTimeout(() => connectMarketSocket(), 4000);
      }
    };
  }

  function closeMarketSocket() {
    clearTimeout(state.reconnectTimer);
    if (state.wsMarket) {
      const old = state.wsMarket;
      state.wsMarket = null;
      old.onclose = null;
      old.onerror = null;
      try { old.close(); } catch (_) {}
    }
  }

  // Stream Global do Ticker Tape & Watchlist
  async function initGlobalTickers() {
    try {
      const res = await fetch(`${BINANCE_REST}/ticker/24hr`);
      if (res.ok) {
        const all = await res.json();
        const set = new Set(WATCHLIST_SYMBOLS);
        for (const item of all) {
          if (set.has(item.symbol)) {
            state.tickerMap.set(item.symbol, {
              symbol: item.symbol,
              price: Number(item.lastPrice),
              high: Number(item.highPrice),
              low: Number(item.lowPrice),
              volume: Number(item.volume),
              quoteVolume: Number(item.quoteVolume),
              changePct: Number(item.priceChangePercent),
              changeAbs: Number(item.priceChange)
            });
          }
        }
      }
    } catch (_) {
      WATCHLIST_SYMBOLS.forEach((sym) => {
        if (!state.tickerMap.has(sym)) {
          state.tickerMap.set(sym, {
            symbol: sym,
            price: FALLBACK_PRICES[sym],
            high: FALLBACK_PRICES[sym] * 1.03,
            low: FALLBACK_PRICES[sym] * 0.97,
            volume: 12000,
            quoteVolume: FALLBACK_PRICES[sym] * 12000,
            changePct: (Math.random() - 0.45) * 6,
            changeAbs: 0
          });
        }
      });
    }

    renderTickerTape();

    const streams = WATCHLIST_SYMBOLS.map((s) => `${s.toLowerCase()}@miniTicker`).join('/');
    try {
      state.wsTicker = new WebSocket(BINANCE_WS + streams);
      let lastPaint = 0;

      state.wsTicker.onmessage = (ev) => {
        const parsed = JSON.parse(ev.data);
        const d = parsed.data;
        if (!d || !d.s) return;
        const close = Number(d.c);
        const open = Number(d.o);
        const changePct = open > 0 ? ((close - open) / open) * 100 : 0;

        const existing = state.tickerMap.get(d.s) || {};
        state.tickerMap.set(d.s, {
          ...existing,
          symbol: d.s,
          price: close,
          high: Number(d.h),
          low: Number(d.l),
          volume: Number(d.v),
          quoteVolume: Number(d.q),
          changePct,
          changeAbs: close - open
        });

        // Limita repintura do DOM a cada 2.5s para manter animação suave
        const now = Date.now();
        if (now - lastPaint > 2500) {
          lastPaint = now;
          updateTickerTapeValues();
          renderWatchlist();
        }
      };
    } catch (_) {}
  }

  function updateTickerTapeValues() {
    document.querySelectorAll('.ticker-item').forEach((el) => {
      const sym = el.dataset.symbol;
      const d = state.tickerMap.get(sym);
      if (!d) return;
      const up = d.changePct >= 0;
      el.querySelector('.ticker-prc').textContent = `$${fmtPrice(d.price)}`;
      const chg = el.querySelector('.ticker-chg');
      chg.textContent = `${up ? '+' : ''}${d.changePct.toFixed(2)}%`;
      chg.className = `ticker-chg ${up ? 'up' : 'down'}`;
    });
  }

  // ------------------------------------------------------------------------
  // 7. Modo Fallback Simulado (Caso rede/Binance esteja indisponível)
  // ------------------------------------------------------------------------
  function intervalToSeconds(iv) {
    const map = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 };
    return map[iv] || 60;
  }

  function activateFallbackSimulation() {
    stopSimulation();
    state.usingSimulation = true;
    setWsStatus('sim', 'Feed Simulado');

    const base = FALLBACK_PRICES[state.symbol] || 100;
    const stepSec = intervalToSeconds(state.interval);
    const nowSec = Math.floor(Date.now() / 1000);
    const startSec = nowSec - 140 * stepSec;

    let price = base * 0.985;
    state.candles = [];
    for (let i = 0; i < 140; i++) {
      const t = startSec + i * stepSec;
      const drift = (Math.random() - 0.492) * base * 0.0045;
      const open = price;
      const close = Math.max(base * 0.5, open + drift);
      const high = Math.max(open, close) + Math.random() * base * 0.002;
      const low = Math.min(open, close) - Math.random() * base * 0.002;
      const volume = Math.random() * 120 + 15;
      state.candles.push({ time: t, open, high, low, close, volume });
      price = close;
    }

    applyCandlesToChart();
    chart.timeScale().fitContent();

    const open24 = state.candles[0].open;
    const tickSim = () => {
      const last = state.candles[state.candles.length - 1];
      const delta = (Math.random() - 0.495) * base * 0.0022;
      const nextPrice = Math.max(base * 0.5, last.close + delta);
      const nowBucket = Math.floor(Date.now() / 1000 / stepSec) * stepSec;

      let bar;
      if (nowBucket > last.time) {
        bar = {
          time: nowBucket,
          open: last.close,
          high: Math.max(last.close, nextPrice),
          low: Math.min(last.close, nextPrice),
          close: nextPrice,
          volume: Math.random() * 40 + 5
        };
        state.candles.push(bar);
      } else {
        bar = {
          ...last,
          close: nextPrice,
          high: Math.max(last.high, nextPrice),
          low: Math.min(last.low, nextPrice),
          volume: last.volume + Math.random() * 6
        };
        state.candles[state.candles.length - 1] = bar;
      }

      candleSeries.update({
        time: bar.time,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close
      });
      volumeSeries.update({
        time: bar.time,
        value: bar.volume,
        color: bar.close >= bar.open ? 'rgba(0, 245, 160, 0.34)' : 'rgba(255, 59, 107, 0.34)'
      });

      const highs = state.candles.map((c) => c.high);
      const lows = state.candles.map((c) => c.low);
      const high24 = Math.max(...highs);
      const low24 = Math.min(...lows);

      updateKPIsFromTicker({
        symbol: state.symbol,
        price: nextPrice,
        high: high24,
        low: low24,
        volume: 18420,
        quoteVolume: 18420 * nextPrice,
        changePct: ((nextPrice - open24) / open24) * 100,
        changeAbs: nextPrice - open24
      });

      // Order Book Sintético
      const asks = [];
      const bids = [];
      for (let i = 1; i <= 9; i++) {
        asks.push([nextPrice * (1 + i * 0.00035), Math.random() * 4 + 0.3]);
        bids.push([nextPrice * (1 - i * 0.00035), Math.random() * 4 + 0.3]);
      }
      renderOrderBook(bids, asks);

      // Negócio Sintético
      const qty = Math.random() * 1.4 + 0.05;
      pushLiveTrade({
        price: nextPrice,
        qty,
        quote: qty * nextPrice,
        isBuy: delta >= 0,
        time: Date.now()
      });

      updateLegend(bar);
      recalculateIndicatorsAndSignals();
    };

    tickSim();
    state.simTimer = setInterval(tickSim, 1400);
  }

  function stopSimulation() {
    if (state.simTimer) {
      clearInterval(state.simTimer);
      state.simTimer = null;
    }
  }

  // ------------------------------------------------------------------------
  // 8. Eventos de Interface & Microinterações
  // ------------------------------------------------------------------------
  function selectSymbol(sym) {
    if (!sym || sym === state.symbol) return;
    state.symbol = sym;
    state.lastPrice = null;
    state.lastVerdictKey = null;

    document.querySelectorAll('.pair-pill').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.symbol === sym);
    });
    renderWatchlist();
    loadInitialMarketData();
  }

  function switchSideTab(tabName) {
    document.querySelectorAll('.seg-tab').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === tabName);
    });
    document.querySelectorAll('.tab-pane').forEach((p) => {
      p.classList.toggle('active', p.id === `pane-${tabName}`);
    });
  }

  function bindUIEvents() {
    // Pílulas de Pares
    $('pairPills').addEventListener('click', (e) => {
      const btn = e.target.closest('.pair-pill');
      if (btn) selectSymbol(btn.dataset.symbol);
    });

    // Clique no Ticker Tape ou Watchlist
    $('tickerTrack').addEventListener('click', (e) => {
      const item = e.target.closest('.ticker-item');
      if (item) selectSymbol(item.dataset.symbol);
    });
    $('watchlistRows').addEventListener('click', (e) => {
      const row = e.target.closest('.watch-row');
      if (row) selectSymbol(row.dataset.symbol);
    });

    // Timeframes
    $('timeframeGroup').addEventListener('click', (e) => {
      const btn = e.target.closest('.tf-btn');
      if (!btn || btn.dataset.interval === state.interval) return;
      state.interval = btn.dataset.interval;
      document.querySelectorAll('.tf-btn').forEach((b) => b.classList.toggle('active', b === btn));
      loadInitialMarketData();
    });

    // Overlays (EMA9, EMA21, SMA50, Sinais)
    document.querySelectorAll('.chip-toggle').forEach((chip) => {
      chip.addEventListener('click', () => {
        const key = chip.dataset.overlay;
        state.overlays[key] = !state.overlays[key];
        chip.classList.toggle('active', state.overlays[key]);
        recalculateIndicatorsAndSignals();
      });
    });

    // Reset Zoom do Gráfico
    $('btnFitChart').addEventListener('click', () => {
      if (chart) chart.timeScale().fitContent();
    });

    // Abas do Painel Lateral
    document.querySelectorAll('.seg-tab').forEach((tab) => {
      tab.addEventListener('click', () => switchSideTab(tab.dataset.tab));
    });

    // Alternar Vidro Líquido / Painéis Sólidos (Acessibilidade)
    $('btnToggleGlass').addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const isSolid = document.documentElement.getAttribute('data-solid-panels') === 'true';
      document.documentElement.setAttribute('data-solid-panels', isSolid ? 'false' : 'true');
      btn.setAttribute('aria-pressed', String(!isSolid));
      btn.querySelector('.material-symbols-rounded').textContent = isSolid ? 'blur_on' : 'blur_off';
    });

    // Reconectar WebSocket manualmente
    $('btnReconnect').addEventListener('click', () => loadInitialMarketData());

    // Limpar Log de Sinais
    $('btnClearLogs').addEventListener('click', () => {
      $('signalLogList').innerHTML = '<div class="log-empty">Log limpo. Monitorando novos cruzamentos...</div>';
    });

    // Mobile Floating Pill Dock
    document.querySelectorAll('.dock-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.dock-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        if (btn.dataset.scroll === 'top') {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (btn.dataset.scroll) {
          $(btn.dataset.scroll)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (btn.dataset.tabJump) {
          switchSideTab(btn.dataset.tabJump);
          document.querySelector('.market-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  // ------------------------------------------------------------------------
  // 9. Boot da Aplicação
  // ------------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', () => {
    initChart();
    bindUIEvents();
    initGlobalTickers();
    loadInitialMarketData();
  });
})();
