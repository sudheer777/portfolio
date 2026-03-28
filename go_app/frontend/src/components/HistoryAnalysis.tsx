
import React, { useMemo, useState, useEffect } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
    AreaChart, Area
} from 'recharts';
import { api } from '../api';

interface HistoryPoint {
    id: number;
    date: string;
    total_amount: number;
}

export interface Milestone {
    value: number;
    date: string;
    formattedDate: string;
    valueUSD?: number;
}

interface HistoryAnalysisProps {
    history: HistoryPoint[];
    currentTotal: number;
    onAvgCalculated?: (avg: number) => void;
    onMilestonesCalculated?: (past: Milestone[], pastUSD: Milestone[]) => void;
    savedMonthlyAddition?: number;
}



export const HistoryAnalysis: React.FC<HistoryAnalysisProps> = ({ history, currentTotal, onAvgCalculated, onMilestonesCalculated, savedMonthlyAddition }) => {
    const [manualAddition, setManualAddition] = useState<string | null>(null);
    const [manualCAGR, setManualCAGR] = useState<string | null>(null);
    const [manualYears, setManualYears] = useState<string | null>(null);
    const [useLiveTotal, setUseLiveTotal] = useState(true); // Default to Live Total
    const [usdRate, setUsdRate] = useState<number>(84); // Default 84


    useEffect(() => {
        api.getExchangeRate().then(rate => {
            setUsdRate(rate);
        });
    }, []);


    // Memoize historical calculations (independent of manual addition)
    const historyStats = useMemo(() => {
        if (history.length < 2) return null;

        // Sort history by date just in case
        const sortedHistory = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // FILTER: Keep only the latest entry for each month
        const monthlyHistory: HistoryPoint[] = [];
        if (sortedHistory.length > 0) {
            let currentMonth = -1;
            let currentYear = -1;
            let lastEntryForMonth = sortedHistory[0];

            sortedHistory.forEach((entry, index) => {
                const date = new Date(entry.date);
                const month = date.getMonth();
                const year = date.getFullYear();

                if (index === 0) {
                    currentMonth = month;
                    currentYear = year;
                    lastEntryForMonth = entry;
                } else if (month === currentMonth && year === currentYear) {
                    // Update last entry for same month
                    lastEntryForMonth = entry;
                } else {
                    // Push previous month's last entry
                    monthlyHistory.push(lastEntryForMonth);
                    // Start new month
                    currentMonth = month;
                    currentYear = year;
                    lastEntryForMonth = entry;
                }
            });
            // Push the final month's last entry
            monthlyHistory.push(lastEntryForMonth);
        }

        // 1. Calculate MoM Growth
        const growthData = [];
        // Default CAGR 10% for historical reference (Net Addition Calc uses it below)
        const annualCAGR = 0.10;
        const monthlyRate = Math.pow(1 + annualCAGR, 1 / 12) - 1;

        for (let i = 1; i < monthlyHistory.length; i++) {
            const prev = monthlyHistory[i - 1];
            const curr = monthlyHistory[i];

            const currDate = new Date(curr.date);

            // Percentage change for the chart
            let pctChange = 0;
            if (prev.total_amount > 0) {
                pctChange = ((curr.total_amount - prev.total_amount) / prev.total_amount) * 100;
            }

            growthData.push({
                date: curr.date,
                formattedDate: currDate.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
                pctChange: pctChange
            });
        }

        // 2. MILESTONE CALCULATION (PAST)
        // Milestones: 1Cr, 2Cr, ...
        // We iterate through raw sorted history to find first occurrences
        const pastMilestones: { value: number; date: string; formattedDate: string }[] = [];
        let nextMilestoneCheck = 10000000; // 1 Crore

        for (const entry of sortedHistory) {
            if (entry.total_amount >= nextMilestoneCheck) {
                const entryDate = new Date(entry.date);
                // Handle cases where multiple milestones might be crossed at once (unlikely but possible with lumpsum)
                while (entry.total_amount >= nextMilestoneCheck) {
                    pastMilestones.push({
                        value: nextMilestoneCheck,
                        date: entry.date,
                        formattedDate: entryDate.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
                    });
                    nextMilestoneCheck += 10000000;
                }
            }
        }

        // 3. USD MILESTONE CALCULATION (PAST)
        // 1 Million USD = usdRate * 1,000,000 INR
        const ONE_MILLION_USD = 1000000 * usdRate;

        const pastUSDMilestones: { value: number; valueUSD: number; date: string; formattedDate: string }[] = [];
        let nextUSDMilestoneCheck = ONE_MILLION_USD;

        for (const entry of sortedHistory) {
            if (entry.total_amount >= nextUSDMilestoneCheck) {
                const entryDate = new Date(entry.date);
                while (entry.total_amount >= nextUSDMilestoneCheck) {
                    pastUSDMilestones.push({
                        value: nextUSDMilestoneCheck,
                        valueUSD: nextUSDMilestoneCheck / usdRate,
                        date: entry.date,
                        formattedDate: entryDate.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
                    });
                    nextUSDMilestoneCheck += ONE_MILLION_USD;
                }
            }
        }


        // REVISED: Calculate average from LAST 6 MONTHS (Time-based, not count-based)
        // Find snapshot closest to 6 months ago
        let avgMonthlyAddition = 0;
        if (sortedHistory.length >= 2) {
            const lastEntry = sortedHistory[sortedHistory.length - 1];
            const lastDate = new Date(lastEntry.date);
            const targetDate = new Date(lastDate);
            targetDate.setMonth(targetDate.getMonth() - 6);

            // Find closest snapshot <= targetDate
            // Or if all are newer, take the first one
            let startEntry = sortedHistory[0];
            for (let i = sortedHistory.length - 2; i >= 0; i--) {
                const d = new Date(sortedHistory[i].date);
                if (d <= targetDate) {
                    startEntry = sortedHistory[i];
                    break;
                }
                // If we hit the beginning and still d > targetDate, we just keep startEntry as index 0 (oldest available)
                startEntry = sortedHistory[i];
            }

            const startDate = new Date(startEntry.date);

            // Calculate time difference in months
            const diffTime = Math.abs(lastDate.getTime() - startDate.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            const months = diffDays / 30.4375; // Average month length

            if (months > 0.5) { // Only calculate if we have at least ~2 weeks of data
                // Financial Formula for SIP/PMT
                // FV = P * (1+r)^n + PMT * [((1+r)^n - 1) / r]
                // We solve for PMT:
                // PMT = (FV - P * (1+r)^n) * r / ((1+r)^n - 1)

                const P = startEntry.total_amount;
                const FV = lastEntry.total_amount;
                const r = monthlyRate; // 10% annual -> monthly
                const n = months;

                const futureValueOfPrincipal = P * Math.pow(1 + r, n);
                const gap = FV - futureValueOfPrincipal;

                // If gap is negative (withdrawal or poor performance), simpler calc or allow negative
                // Formula works for negative PMT too.

                const denominator = (Math.pow(1 + r, n) - 1) / r;

                avgMonthlyAddition = gap / denominator;
            } else {
                // Fallback to simple diff for very short periods
                avgMonthlyAddition = (lastEntry.total_amount - startEntry.total_amount);
            }
        }

        return {
            growthData,
            avgMonthlyAddition,
            sortedHistory,
            lastEntry: sortedHistory[sortedHistory.length - 1],
            defaultCAGR: annualCAGR,
            pastMilestones,
            nextMilestoneCheck,
            pastUSDMilestones,
            nextUSDMilestoneCheck,
            USD_RATE: usdRate,
            ONE_MILLION_USD
        };
    }, [history, usdRate]);

    useEffect(() => {
        if (historyStats && onAvgCalculated) {
            onAvgCalculated(historyStats.avgMonthlyAddition);
        }
    }, [historyStats, onAvgCalculated]);

    useEffect(() => {
        if (historyStats && onMilestonesCalculated) {
            onMilestonesCalculated(historyStats.pastMilestones, historyStats.pastUSDMilestones);
        }
    }, [historyStats, onMilestonesCalculated]);

    // Memoize projection calculations (depend on historyStats + manual inputs)
    const projections = useMemo(() => {
        if (!historyStats) return null;

        // 1. Effective Addition
        let effectiveAddition = savedMonthlyAddition ?? historyStats.avgMonthlyAddition;
        if (manualAddition !== null) {
            if (manualAddition === "") {
                effectiveAddition = 0;
            } else {
                const parsed = parseFloat(manualAddition);
                if (!isNaN(parsed)) {
                    effectiveAddition = parsed;
                }
            }
        }

        // 2. Effective CAGR & Monthly Rate
        let effectiveCAGR = historyStats.defaultCAGR;
        if (manualCAGR !== null) {
            if (manualCAGR === "") {
                effectiveCAGR = 0;
            } else {
                const parsed = parseFloat(manualCAGR);
                if (!isNaN(parsed)) {
                    effectiveCAGR = parsed / 100;
                }
            }
        }
        // Use Geometric Monthly Rate (CAGR based) to ensure Lumpsum accuracy (1 year = CAGR%)
        const monthlyRate = Math.pow(1 + effectiveCAGR, 1 / 12) - 1;

        // 3. Effective Years
        let effectiveYears = 10;
        if (manualYears !== null && manualYears !== "") {
            const parsed = parseInt(manualYears);
            if (!isNaN(parsed) && parsed > 0 && parsed <= 50) { // Cap at 50
                effectiveYears = parsed;
            }
        }

        const projectionData = [];

        // STARTING POINT LOGIC
        let currentAmount = 0;
        let startDate = new Date();

        if (useLiveTotal) {
            currentAmount = currentTotal;
            startDate = new Date(); // Start from Today
        } else {
            currentAmount = historyStats.lastEntry.total_amount;
            startDate = new Date(historyStats.lastEntry.date);
        }

        const totalMonths = effectiveYears * 12;

        // Project
        for (let i = 0; i <= totalMonths; i++) {
            const d = new Date(startDate);
            d.setMonth(d.getMonth() + i);

            projectionData.push({
                month: i,
                formattedDate: d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
                amount: currentAmount,
                role: i === 0 ? "Actual" : "Projected"
            });

            if (i < totalMonths) {
                // Apply growth + addition for next month
                // Standard SIP Logic: Investment at start of month
                // (Balance + Addition) * (1 + r)
                currentAmount = (currentAmount + effectiveAddition) * (1 + monthlyRate);
            }
        }

        // Dynamic Interval for Chart XAxis
        // Try to show ~10-12 ticks
        let chartInterval = 11; // Default for 10 years (every year)
        if (effectiveYears > 15) {
            chartInterval = 23; // Every 2 years
        } else if (effectiveYears < 5) {
            chartInterval = 2; // Every 3 months approx
        }


        return {
            projectionData,
            effectiveAddition,
            effectiveCAGR,
            effectiveYears,
            chartInterval,
            projected5Year: projectionData[60] ? projectionData[60].amount : 0, // 5 years = 60 months
            projectedFinal: projectionData[projectionData.length - 1].amount
        };
    }, [historyStats, manualAddition, manualCAGR, manualYears, useLiveTotal, currentTotal]);

    if (!historyStats || !projections) return null;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* MoM Growth Chart */}
                <div className="bg-white p-6 rounded-lg shadow border border-gray-100">
                    <h4 className="text-gray-700 font-semibold mb-4 text-center">Month-over-Month Growth %</h4>
                    <div className="h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={historyStats.growthData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="formattedDate" />
                                <YAxis unit="%" />
                                <Tooltip formatter={(val: any) => `${Number(val).toFixed(2)}%`} />
                                <Bar dataKey="pctChange" name="Growth %" fill="#8884d8" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Future Projection Chart */}
                <div className="bg-white p-6 rounded-lg shadow border border-gray-100 relative">
                    <div className="flex flex-col md:flex-row justify-between items-center mb-4">
                        <h4 className="text-gray-700 font-semibold text-center md:text-left">Future Value Projection ({projections.effectiveYears} Years)</h4>

                        {/* Source Toggle */}
                        <div className="flex bg-gray-100 p-1 rounded-lg text-xs font-medium mt-2 md:mt-0">
                            <button
                                onClick={() => setUseLiveTotal(false)}
                                className={`px-3 py-1 rounded-md transition-all ${!useLiveTotal
                                    ? "bg-white text-indigo-600 shadow-sm border border-gray-200"
                                    : "text-gray-500 hover:text-gray-700"
                                    }`}
                            >
                                Last Saved
                            </button>
                            <button
                                onClick={() => setUseLiveTotal(true)}
                                className={`px-3 py-1 rounded-md transition-all ${useLiveTotal
                                    ? "bg-white text-indigo-600 shadow-sm border border-gray-200"
                                    : "text-gray-500 hover:text-gray-700"
                                    }`}
                            >
                                Live Total
                            </button>
                        </div>
                    </div>
                    <div className="h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={projections.projectionData}>
                                <defs>
                                    <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="#82ca9d" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="formattedDate" tick={{ fontSize: 10 }} interval={projections.chartInterval} />
                                <YAxis tickFormatter={(val) => `₹${(val / 100000).toFixed(0)}L`} />
                                <Tooltip formatter={(val: any) => `₹${Number(val).toLocaleString('en-IN')}`} />
                                <Area type="monotone" dataKey="amount" stroke="#82ca9d" fillOpacity={1} fill="url(#colorAmount)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Milestone tracking moved to AssetRebalancer */}


            <div className="bg-indigo-900 text-white p-6 rounded-lg shadow">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8 text-center divide-y md:divide-y-0 md:divide-x divide-indigo-700 items-center">
                    <div className="pb-4 md:pb-0 px-2">
                        <p className="text-indigo-200 text-sm uppercase tracking-wide mb-2">Assumed CAGR</p>
                        <div className="flex justify-center items-center">
                            <input
                                type="number"
                                value={manualCAGR ?? (projections.effectiveCAGR * 100).toFixed(0)}
                                onChange={(e) => setManualCAGR(e.target.value)}
                                className="w-16 text-center text-xl font-bold bg-indigo-800 border border-indigo-600 rounded px-2 py-1 text-white placeholder-indigo-400 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
                            />
                            <span className="text-xl font-bold ml-1">%</span>
                        </div>
                        {manualCAGR !== null && (
                            <button
                                onClick={() => setManualCAGR(null)}
                                className="text-xs text-indigo-300 hover:text-white mt-1 underline"
                            >
                                Reset to 10%
                            </button>
                        )}
                    </div>
                    <div className="py-4 md:py-0 px-2">
                        <p className="text-indigo-200 text-sm uppercase tracking-wide mb-2">Avg. Monthly Addition</p>
                        <div className="flex justify-center items-center">
                            <span className="text-xl font-bold mr-1">₹</span>
                            <input
                                type="number"
                                value={manualAddition ?? (savedMonthlyAddition ? Math.round(savedMonthlyAddition) : Math.round(historyStats.avgMonthlyAddition))}
                                onChange={(e) => setManualAddition(e.target.value)}
                                className="w-32 text-center text-xl font-bold bg-indigo-800 border border-indigo-600 rounded px-2 py-1 text-white placeholder-indigo-400 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
                            />
                        </div>
                        {manualAddition !== null && (
                            <button
                                onClick={() => setManualAddition(null)}
                                className="text-xs text-indigo-300 hover:text-white mt-1 underline"
                            >
                                Reset to Average
                            </button>
                        )}
                    </div>
                    <div className="py-4 md:py-0">
                        <p className="text-indigo-200 text-sm uppercase tracking-wide mb-1">Projected 5 Years</p>
                        <p className="text-2xl font-bold">{projections.projected5Year ? `₹${projections.projected5Year.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '-'}</p>
                    </div>
                    <div className="pt-4 md:pt-0 px-2">
                        <div className="flex justify-center items-center gap-2 mb-2">
                            <p className="text-indigo-200 text-sm uppercase tracking-wide">Projected</p>
                            <input
                                type="number"
                                value={manualYears ?? 10}
                                onChange={(e) => setManualYears(e.target.value)}
                                className="w-12 text-center text-sm font-bold bg-indigo-800 border border-indigo-600 rounded px-1 text-white"
                            />
                            <p className="text-indigo-200 text-sm uppercase tracking-wide">Years</p>
                        </div>
                        <p className="text-2xl font-bold">₹{projections.projectedFinal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                        {manualYears !== null && (
                            <button
                                onClick={() => setManualYears(null)}
                                className="text-xs text-indigo-300 hover:text-white mt-1 underline block w-full"
                            >
                                Reset to 10
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div >
    );
};
