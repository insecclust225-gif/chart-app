import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  CrosshairMode,
  LineStyle,
} from 'lightweight-charts';
import { fetchKlines, subscribeKlines } from '../lib/binance.js';
import { sma, ema, rsi } from '../lib/indicators.js';

const UP = '#26a69a';
const DOWN = '#ef5350';

export const formatPrice = (p) => {
  if (p == null || Number.isNaN(p)) return '-';
  const digits = p >= 1000 ? 2 : p >= 1 ? 4 : 8;
  return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: digits });
};

const volumePoint = (b) => ({ time: b.time, value: b.volume, color: b.close >= b.open ? UP + '80' : DOWN + '80' });

export default function Chart({ symbol, interval, indicators, lines, drawMode, onAddLine, onPrice }) {
  const containerRef = useRef(null);
  const candleRef = useRef(null);
  const priceLinesRef = useRef([]);
  const drawModeRef = useRef(drawMode);
  const onAddLineRef = useRef(onAddLine);
  const onPriceRef = useRef(onPrice);
  const [legend, setLegend] = useState(null);
  const [status, setStatus] = useState('Memuat…');
  const [chartVersion, setChartVersion] = useState(0);

  drawModeRef.current = drawMode;
  onAddLineRef.current = onAddLine;
  onPriceRef.current = onPrice;

  const indicatorKey = JSON.stringify(indicators);

  // Buat ulang chart setiap simbol, timeframe, atau pengaturan indikator berubah.
  useEffect(() => {
    const ind = JSON.parse(indicatorKey);
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: { background: { color: '#131722' }, textColor: '#b2b5be', panes: { separatorColor: '#2a2e39' } },
      grid: { vertLines: { color: '#1e222d' }, horzLines: { color: '#1e222d' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#2a2e39' },
      timeScale: { borderColor: '#2a2e39', timeVisible: interval !== '1d' && interval !== '1w', secondsVisible: false },
    });

    const candle = chart.addSeries(CandlestickSeries, {
      upColor: UP, downColor: DOWN, borderVisible: false, wickUpColor: UP, wickDownColor: DOWN,
    });
    candleRef.current = candle;

    let volume = null;
    if (ind.volume.on) {
      volume = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
      chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    }

    const overlays = [];
    if (ind.sma.on) overlays.push({ fn: (b) => sma(b, ind.sma.period), s: chart.addSeries(LineSeries, { color: '#f7a600', lineWidth: 2, priceLineVisible: false, lastValueVisible: false }) });
    if (ind.ema.on) overlays.push({ fn: (b) => ema(b, ind.ema.period), s: chart.addSeries(LineSeries, { color: '#2962ff', lineWidth: 2, priceLineVisible: false, lastValueVisible: false }) });
    if (ind.rsi.on) {
      const s = chart.addSeries(LineSeries, { color: '#ab47bc', lineWidth: 2, priceLineVisible: false }, 1);
      s.createPriceLine({ price: 70, color: '#787b86', lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false });
      s.createPriceLine({ price: 30, color: '#787b86', lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false });
      chart.panes()[1]?.setStretchFactor(0.3);
      overlays.push({ fn: (b) => rsi(b, ind.rsi.period), s });
    }

    let bars = [];
    let cancelled = false;
    let unsubscribe = () => {};

    const showLast = () => {
      const b = bars[bars.length - 1];
      if (b) setLegend(b);
    };

    setStatus('Memuat…');
    setLegend(null);
    fetchKlines(symbol, interval)
      .then((data) => {
        if (cancelled) return;
        bars = data;
        candle.setData(bars);
        volume?.setData(bars.map(volumePoint));
        overlays.forEach((o) => o.s.setData(o.fn(bars)));
        chart.timeScale().scrollToRealTime();
        showLast();
        setStatus('');
        onPriceRef.current?.(symbol, bars[bars.length - 1]?.close);
        setChartVersion((v) => v + 1);

        unsubscribe = subscribeKlines(symbol, interval, (bar) => {
          const last = bars[bars.length - 1];
          if (last && bar.time < last.time) return;
          if (last && bar.time === last.time) bars[bars.length - 1] = bar;
          else bars.push(bar);
          candle.update(bar);
          volume?.update(volumePoint(bar));
          overlays.forEach((o) => {
            const vals = o.fn(bars);
            const v = vals[vals.length - 1];
            if (v) o.s.update(v);
          });
          onPriceRef.current?.(symbol, bar.close);
        });
      })
      .catch((e) => !cancelled && setStatus(e.message));

    chart.subscribeCrosshairMove((param) => {
      const d = param.seriesData?.get(candle);
      if (d) setLegend({ ...d, volume: bars.find((b) => b.time === d.time)?.volume });
      else showLast();
    });

    chart.subscribeClick((param) => {
      if (!drawModeRef.current || !param.point) return;
      const price = candle.coordinateToPrice(param.point.y);
      if (price != null) onAddLineRef.current?.(price);
    });

    return () => {
      cancelled = true;
      unsubscribe();
      priceLinesRef.current = [];
      candleRef.current = null;
      chart.remove();
    };
  }, [symbol, interval, indicatorKey]);

  // Gambar garis horizontal / alert pada seri candlestick.
  useEffect(() => {
    const candle = candleRef.current;
    if (!candle) return;
    priceLinesRef.current.forEach((pl) => candle.removePriceLine(pl));
    priceLinesRef.current = lines.map((l) =>
      candle.createPriceLine({
        price: l.price,
        color: l.alert ? (l.triggered ? '#787b86' : '#f7a600') : '#2962ff',
        lineWidth: 1,
        lineStyle: l.alert ? LineStyle.Dashed : LineStyle.Solid,
        axisLabelVisible: true,
        title: l.alert ? (l.triggered ? 'alert ✓' : 'alert') : '',
      }),
    );
  }, [lines, chartVersion]);

  const change = legend ? legend.close - legend.open : 0;

  return (
    <div className="chart-wrap">
      <div className="legend">
        <strong>{symbol}</strong> <span className="muted">{interval}</span>
        {legend && (
          <span className={change >= 0 ? 'up' : 'down'}>
            {' '}O {formatPrice(legend.open)} H {formatPrice(legend.high)} L {formatPrice(legend.low)} C {formatPrice(legend.close)}
            {legend.volume != null && <> V {legend.volume.toLocaleString('en-US', { maximumFractionDigits: 2 })}</>}
          </span>
        )}
        {indicators.sma.on && <span style={{ color: '#f7a600' }}> SMA {indicators.sma.period}</span>}
        {indicators.ema.on && <span style={{ color: '#2962ff' }}> EMA {indicators.ema.period}</span>}
        {indicators.rsi.on && <span style={{ color: '#ab47bc' }}> RSI {indicators.rsi.period}</span>}
      </div>
      {status && <div className="status">{status}</div>}
      <div ref={containerRef} className={`chart ${drawMode ? 'drawing' : ''}`} />
    </div>
  );
}
