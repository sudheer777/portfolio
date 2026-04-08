import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import type { PortfolioSummary } from '../types';

export interface FullHistoryPoint {
    id: number;
    date: string;
    total_amount: number;
    asset_summary_json?: string;
    rebalancer_config_json?: string; // Rebalancer config captured at snapshot time
}

interface SnapshotComparatorProps {
    snapshotA: FullHistoryPoint;
    snapshotB: FullHistoryPoint;
    onClose: () => void;
}

const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
    }).format(val);

const ASSET_COLORS: Record<string, string> = {
    Equity: '#6366f1',
    FD: '#f59e0b',
    Gold: '#d97706',
    Debt: '#14b8a6',
    RealEstate: '#ec4899',
    Crypto: '#8b5cf6',
    Mutual_Fund: '#3b82f6',
};

export const SnapshotComparator: React.FC<SnapshotComparatorProps> = ({ snapshotA, snapshotB, onClose }) => {
    // Ensure A ≡ older, B ≡ newer
    const aTime = new Date(snapshotA.date).getTime();
    const bTime = new Date(snapshotB.date).getTime();

    const olderSnap = aTime <= bTime ? snapshotA : snapshotB;
    const newerSnap = aTime <= bTime ? snapshotB : snapshotA;

    const dOlder = new Date(olderSnap.date);
    const dNewer = new Date(newerSnap.date);

    const diffTimeMs = dNewer.getTime() - dOlder.getTime();
    const exactMonths = diffTimeMs / (1000 * 60 * 60 * 24 * 30.4375);
    const exactYears = exactMonths / 12;

    // Parse the full asset summary from the older snapshot
    const parsedOlderSummary: PortfolioSummary | null = useMemo(() => {
        if (!olderSnap.asset_summary_json) return null;
        try { return JSON.parse(olderSnap.asset_summary_json); } catch { return null; }
    }, [olderSnap]);

    // Per-asset expected returns — sourced from older snapshot's saved config, fallback to live config
    const [expectedReturns, setExpectedReturns] = useState<Record<string, number>>({});
    const [expectedSip, setExpectedSip] = useState<string>("0");
    const [stepUpPct, setStepUpPct] = useState<string>("0");
    const [configSource, setConfigSource] = useState<'snapshot' | 'live'>('live');

    useEffect(() => {
        // First, try to use the point-in-time config saved with the older snapshot
        if (olderSnap.rebalancer_config_json) {
            try {
                const cfg = JSON.parse(olderSnap.rebalancer_config_json);
                if (cfg.monthlyAddition) setExpectedSip(cfg.monthlyAddition);
                if (cfg.yearlyIncreasePct) setStepUpPct(cfg.yearlyIncreasePct);
                if (cfg.expectedReturns) {
                    const rates: Record<string, number> = {};
                    Object.entries(cfg.expectedReturns).forEach(([k, v]) => {
                        rates[k] = parseFloat(v as string) || 0;
                    });
                    setExpectedReturns(rates);
                }
                setConfigSource('snapshot');
                return; // done — snapshot config takes priority
            } catch (_) { }
        }
        // Fallback: fetch the current live Rebalancer config
        api.getRebalancerConfig().then(configStr => {
            if (!configStr) return;
            try {
                const config = JSON.parse(configStr);
                if (config.monthlyAddition) setExpectedSip(config.monthlyAddition);
                if (config.yearlyIncreasePct) setStepUpPct(config.yearlyIncreasePct);
                if (config.expectedReturns) {
                    const rates: Record<string, number> = {};
                    Object.entries(config.expectedReturns).forEach(([k, v]) => {
                        rates[k] = parseFloat(v as string) || 0;
                    });
                    setExpectedReturns(rates);
                }
                setConfigSource('live');
            } catch (_) { }
        }).catch(() => null);
    }, [olderSnap]);

    const stats = useMemo(() => {
        const valA = olderSnap.total_amount;
        const valB = newerSnap.total_amount;

        const absoluteGrowth = valB - valA;
        const pctGrowth = valA > 0 ? (absoluteGrowth / valA) * 100 : 0;
        // Only compute annualized CAGR if window is >= 30 days, otherwise show the raw % gain
        const exactDays = diffTimeMs / (1000 * 60 * 60 * 24);
        const isShortWindow = exactDays < 30;
        const actualCAGR = exactYears > 0 && valA > 0
            ? isShortWindow
                ? pctGrowth // For very short windows, show actual % gain, not annualized CAGR
                : (Math.pow(valB / valA, 1 / exactYears) - 1) * 100
            : 0;

        // ── Asset-weighted expected trajectory ────────────────────────────────
        let expectedVal = 0;
        const assetExpectedBreakdown: { key: string; aVal: number; expectedVal: number; rate: number; isDefault: boolean }[] = [];

        if (parsedOlderSummary?.asset_types) {
            const intMonths = Math.floor(exactMonths);
            const fraction = exactMonths - intMonths;

            Object.entries(parsedOlderSummary.asset_types).forEach(([key, amount]) => {
                const configuredRate = expectedReturns[key];
                // Use configured rate if available; otherwise fall back to 10% (not 0%) as a market assumption
                const isDefault = configuredRate === undefined || configuredRate === 0;
                const cagr = isDefault ? 10 : configuredRate;
                const monthlyRate = Math.pow(1 + (cagr / 100), 1 / 12) - 1;

                // Lump-sum asset growth (exact fractional months)
                const lumpFV = amount.final_amount * Math.pow(1 + monthlyRate, exactMonths);
                assetExpectedBreakdown.push({
                    key,
                    aVal: amount.final_amount,
                    expectedVal: lumpFV,
                    rate: cagr,
                    isDefault,
                });
                expectedVal += lumpFV;
            });

            // Add SIP only if window is >= 1 full month (SIPs are monthly transactions)
            if (intMonths >= 1) {
                const blendedCAGR = valA > 0
                    ? Object.entries(parsedOlderSummary.asset_types).reduce((acc, [key, amt]) => {
                        const r = (expectedReturns[key] === undefined || expectedReturns[key] === 0) ? 10 : expectedReturns[key];
                        return acc + ((amt.final_amount / valA) * r);
                    }, 0)
                    : 10;
                const blendedMonthlyRate = Math.pow(1 + (blendedCAGR / 100), 1 / 12) - 1;

                let sipPmt = parseFloat(expectedSip) || 0;
                const stepUp = parseFloat(stepUpPct) || 0;
                let sipFV = 0;

                for (let m = 1; m <= intMonths; m++) {
                    sipFV = (sipFV + sipPmt) * (1 + blendedMonthlyRate);
                    if (m % 12 === 0) {
                        sipPmt = sipPmt * (1 + (stepUp / 100));
                    }
                }
                // Partial final month SIP
                if (fraction > 0) {
                    sipFV = (sipFV + sipPmt * fraction) * (1 + blendedMonthlyRate * fraction);
                }
                expectedVal += sipFV;
            }
            // else: window < 1 month — no SIP expected in this window
        } else {
            // Fallback: no asset breakdown — use 10% CAGR
            const mRate = Math.pow(1 + 0.10, 1 / 12) - 1;
            let pmt = parseFloat(expectedSip) || 0;
            const step = parseFloat(stepUpPct) || 0;
            let simVal = valA;
            const intMonths = Math.floor(exactMonths);
            for (let m = 1; m <= intMonths; m++) {
                simVal = simVal * (1 + mRate) + pmt;
                if (m % 12 === 0) pmt = pmt * (1 + (step / 100));
            }
            // Only fractional SIP if >= 1 month elapsed
            if (intMonths >= 1) {
                const frac = exactMonths - intMonths;
                if (frac > 0) simVal = simVal * (1 + mRate * frac) + pmt * frac;
            }
            expectedVal = simVal;
        }

        const delta = valB - expectedVal;

        return { valA, valB, absoluteGrowth, pctGrowth, actualCAGR, expectedVal, delta, assetExpectedBreakdown, isShortWindow, exactDays };
    }, [olderSnap, newerSnap, exactMonths, exactYears, diffTimeMs, parsedOlderSummary, expectedReturns, expectedSip, stepUpPct]);

    return (
        <div className="bg-white border-2 border-indigo-200 rounded-xl shadow-md mb-4 p-5">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <h3 className="text-lg font-bold text-indigo-900">Snapshot Comparator</h3>
                    <p className="text-xs text-indigo-400">Asset-weighted expected growth vs reality</p>
                </div>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none">&times;</button>
            </div>

            {/* Short window advisory */}
            {stats.isShortWindow && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4 text-xs text-amber-700">
                    ⚠️ <strong>Short window ({Math.round(stats.exactDays)} days):</strong> CAGR is shown as raw % gain (not annualized). SIP contributions are excluded since no monthly cycle completed. Asset CAGR rates shown as <em>italicized defaults</em> are using 10% as a baseline — configure them in Rebalancer for accuracy.
                </div>
            )}

            {/* Timeline header */}
            <div className="flex items-center justify-between bg-indigo-50 rounded-lg p-3 mb-5">
                <div className="text-center w-2/5">
                    <p className="text-[10px] text-indigo-400 uppercase font-bold tracking-wider">Snapshot A (Base)</p>
                    <p className="text-sm font-semibold">{dOlder.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    <p className="text-base font-bold text-indigo-800">{formatCurrency(stats.valA)}</p>
                </div>
                <div className="flex flex-col items-center w-1/5 text-center">
                    <div className="h-[2px] w-full bg-indigo-200 my-1 relative">
                        <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[9px] font-bold text-indigo-500 whitespace-nowrap">{exactMonths.toFixed(1)} mo</span>
                    </div>
                    <p className="text-[10px] text-gray-400">{exactYears.toFixed(2)} yrs</p>
                </div>
                <div className="text-center w-2/5">
                    <p className="text-[10px] text-indigo-400 uppercase font-bold tracking-wider">Snapshot B (Actual)</p>
                    <p className="text-sm font-semibold">{dNewer.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    <p className="text-base font-bold text-indigo-800">{formatCurrency(stats.valB)}</p>
                </div>
            </div>

            {/* Key stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                <div className="bg-gray-50 rounded-lg p-3 text-center border">
                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Absolute Return</p>
                    <p className={`text-lg font-bold ${stats.absoluteGrowth >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {stats.absoluteGrowth >= 0 ? '+' : ''}{formatCurrency(stats.absoluteGrowth)}
                    </p>
                    <p className={`text-xs ${stats.pctGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {stats.pctGrowth >= 0 ? '+' : ''}{stats.pctGrowth.toFixed(2)}%
                    </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center border">
                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">{stats.isShortWindow ? 'Actual Return' : 'Realized CAGR'}</p>
                    <p className={`text-2xl font-bold ${stats.actualCAGR >= 0 ? 'text-indigo-700' : 'text-red-700'}`}>
                        {stats.actualCAGR.toFixed(2)}%
                    </p>
                    <p className="text-[10px] text-gray-400">{stats.isShortWindow ? 'Raw % over window' : 'Implied annual growth'}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center border">
                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Expected Value</p>
                    <p className="text-lg font-bold text-blue-700">{formatCurrency(stats.expectedVal)}</p>
                    <p className="text-[10px] text-gray-400">Per your asset CAGR config</p>
                </div>
                <div className={`rounded-lg p-3 text-center border-2 ${stats.delta >= 0 ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Performance Delta</p>
                    <p className={`text-lg font-black ${stats.delta >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {stats.delta >= 0 ? '+' : ''}{formatCurrency(stats.delta)}
                    </p>
                    <p className={`text-xs font-bold ${stats.delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {stats.delta >= 0 ? '🎉 Beat Target' : '⚠️ Missed Target'}
                    </p>
                </div>
            </div>

            {/* Asset class breakdown table */}
            {stats.assetExpectedBreakdown.length > 0 && (
                <div className="mb-5">
                    <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">Asset-Class Expected Growth (from Snapshot A)</h4>
                    <div className="rounded-lg border overflow-hidden">
                        <table className="w-full text-xs">
                            <thead className="bg-gray-100">
                                <tr>
                                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Asset</th>
                                    <th className="px-3 py-2 text-right font-semibold text-gray-600">Value at A</th>
                                    <th className="px-3 py-2 text-right font-semibold text-gray-600">Expected CAGR</th>
                                    <th className="px-3 py-2 text-right font-semibold text-gray-600">Expected at B</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {stats.assetExpectedBreakdown.map(row => (
                                    <tr key={row.key} className="hover:bg-gray-50">
                                        <td className="px-3 py-2 font-medium flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: ASSET_COLORS[row.key] || '#94a3b8' }}></span>
                                            {row.key}
                                        </td>
                                        <td className="px-3 py-2 text-right">{formatCurrency(row.aVal)}</td>
                                        <td className="px-3 py-2 text-right">
                                            {row.rate > 0 ? (
                                                <span className={`font-semibold ${row.isDefault ? 'text-amber-500 italic' : 'text-green-600'}`}>
                                                    {row.rate.toFixed(1)}%{row.isDefault ? ' *' : ''}
                                                </span>
                                            ) : (
                                                <span className="text-gray-400">Not set</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-right font-medium text-blue-700">{formatCurrency(row.expectedVal)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">* SIP accumulation is added on top using blended asset-weighted CAGR</p>
                </div>
            )}

            {/* Benchmark assumptions */}
            <div className="border-t pt-4">
                <div className="flex items-center gap-2 mb-3">
                    <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wider">SIP Assumptions (Adjustable)</h4>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${configSource === 'snapshot' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                        {configSource === 'snapshot' ? 'From saved snapshot' : 'Current Rebalancer config'}
                    </span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Monthly SIP (₹)</label>
                        <input type="number" value={expectedSip} onChange={e => setExpectedSip(e.target.value)}
                            className="w-full border p-2 rounded text-sm focus:ring-indigo-500 focus:border-indigo-500" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">SIP Yearly Step-Up (%)</label>
                        <input type="number" step="0.1" value={stepUpPct} onChange={e => setStepUpPct(e.target.value)}
                            className="w-full border p-2 rounded text-sm focus:ring-indigo-500 focus:border-indigo-500" />
                    </div>
                </div>
                <p className="text-[10px] text-gray-400 mt-2">Asset CAGR rates come from your Rebalancer config. Adjust them there to recalculate.</p>
            </div>
        </div>
    );
};
