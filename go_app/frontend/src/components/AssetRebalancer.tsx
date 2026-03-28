import React, { useState, useMemo, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { Amount } from '../types';
import type { Milestone } from './HistoryAnalysis';
import { GrowthPotentialCalculator } from './GrowthPotentialCalculator';
import { api } from '../api';

interface Props {
    data?: Record<string, Amount>;
    defaultMonthlyAddition?: number;
    pastMilestones?: Milestone[];
    pastUSDMilestones?: Milestone[];
}

export const AssetRebalancer: React.FC<Props> = ({ data: propData, defaultMonthlyAddition: propDefaultMonthlyAddition, pastMilestones: propPastMilestones = [], pastUSDMilestones: propPastUSDMilestones = [] }) => {
    // Self-fetch data if not provided as props (standalone tab mode)
    const [fetchedData, setFetchedData] = useState<Record<string, Amount> | null>(null);
    const [fetchedMilestones, setFetchedMilestones] = useState<Milestone[]>([]);
    const [fetchedUSDMilestones, setFetchedUSDMilestones] = useState<Milestone[]>([]);
    const [fetchLoading, setFetchLoading] = useState(!propData);
    const [usdRate, setUsdRate] = useState<number>(83.5);

    // Fetch USD Rate
    useEffect(() => {
        api.getExchangeRate().then(setUsdRate).catch(console.error);
    }, []);

    useEffect(() => {
        if (!propData) {
            setFetchLoading(true);
            Promise.all([api.getPortfolio(), api.getHistory()])
                .then(([portfolioRes, historyRes]) => {
                    if (portfolioRes && portfolioRes.asset_types) {
                        setFetchedData(portfolioRes.asset_types);
                    } else {
                        setFetchedData({});
                    }

                    if (historyRes && historyRes.length > 0) {
                        // Calculate Milestones from history
                        const sortedHistory = [...historyRes].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

                        const pastM: Milestone[] = [];
                        let nextMCheck = 10000000; // 1 Crore
                        for (const entry of sortedHistory) {
                            if (entry.total_amount >= nextMCheck) {
                                const entryDate = new Date(entry.date);
                                while (entry.total_amount >= nextMCheck) {
                                    pastM.push({
                                        value: nextMCheck,
                                        date: entry.date,
                                        formattedDate: entryDate.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
                                    });
                                    nextMCheck += 10000000;
                                }
                            }
                        }

                        const ONE_MILLION_USD = 1000000 * usdRate;
                        const pastUSDM: Milestone[] = [];
                        let nextUSDMCheck = ONE_MILLION_USD;
                        for (const entry of sortedHistory) {
                            if (entry.total_amount >= nextUSDMCheck) {
                                const entryDate = new Date(entry.date);
                                while (entry.total_amount >= nextUSDMCheck) {
                                    pastUSDM.push({
                                        value: nextUSDMCheck,
                                        valueUSD: nextUSDMCheck / usdRate,
                                        date: entry.date,
                                        formattedDate: entryDate.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
                                    });
                                    nextUSDMCheck += ONE_MILLION_USD;
                                }
                            }
                        }

                        setFetchedMilestones(pastM);
                        setFetchedUSDMilestones(pastUSDM);
                    }
                })
                .catch(() => setFetchedData({}))
                .finally(() => setFetchLoading(false));
        }
    }, [propData, usdRate]);

    const data = propData ?? fetchedData ?? {};
    const defaultMonthlyAddition = propDefaultMonthlyAddition ?? 0;
    const pastMilestones = propPastMilestones.length > 0 ? propPastMilestones : fetchedMilestones;
    const pastUSDMilestones = propPastUSDMilestones.length > 0 ? propPastUSDMilestones : fetchedUSDMilestones;

    const [monthlyAddition, setMonthlyAddition] = useState<string>(Math.round(defaultMonthlyAddition).toString());
    const [months, setMonths] = useState<string>("12");
    const [customAdditions, setCustomAdditions] = useState<Record<string, string>>({});

    // Track if user has manually edited the SIP so we don't overwrite it later
    const [isSipModified, setIsSipModified] = useState(false);
    const [saveStatus, setSaveStatus] = useState<string>("");

    // Default Targets
    const [targets, setTargets] = useState<Record<string, string>>({
        equity: "65",
        debt: "25",
        gold: "10",
        real_estate: "0"
    });

    // Default Expected Returns
    const [expectedReturns, setExpectedReturns] = useState<Record<string, string>>({
        equity: "12",
        debt: "7.5",
        gold: "10",
        real_estate: "8"
    });

    useEffect(() => {
        if (!isSipModified && defaultMonthlyAddition > 0) {
            setMonthlyAddition(Math.round(defaultMonthlyAddition).toString());
        }
    }, [defaultMonthlyAddition, isSipModified]);

    // Load saved config on mount
    useEffect(() => {
        api.getRebalancerConfig().then(configStr => {
            if (configStr) {
                try {
                    const config = JSON.parse(configStr);
                    if (config.targets) setTargets(config.targets);
                    if (config.months) setMonths(config.months);
                    if (config.customAdditions) setCustomAdditions(config.customAdditions);
                    if (config.monthlyAddition) {
                        setMonthlyAddition(config.monthlyAddition);
                        setIsSipModified(true); // Prevent the useEffect from overwriting with the computed avg
                    }
                    if (config.expectedReturns) setExpectedReturns(config.expectedReturns);
                } catch (e) {
                    console.error("Failed to parse rebalancer config", e);
                }
            }
        }).catch(() => { /* no saved config yet */ });
    }, []);

    const handleTargetChange = (asset: string, val: string) => {
        setTargets(prev => ({ ...prev, [asset]: val }));
    };

    const handleExpectedReturnChange = (asset: string, val: string) => {
        setExpectedReturns(prev => ({ ...prev, [asset]: val }));
    };

    const handleCustomAdditionChange = (asset: string, val: string) => {
        setCustomAdditions(prev => ({ ...prev, [asset]: val }));
    };

    const rebalanceData = useMemo(() => {
        // 1. Calculate Current Total
        let currentTotal = 0;
        const currentValues: Record<string, number> = {};

        // Ensure all possible asset types from data are captured even if they don't have a strict target yet
        const allAssetKeys = new Set([...Object.keys(data), ...Object.keys(targets)]);

        allAssetKeys.forEach(key => {
            const val = data[key]?.final_amount || 0;
            currentTotal += val;
            currentValues[key] = val;
        });

        // 2. Parse Inputs
        const sip = parseFloat(monthlyAddition) || 0;
        const targetPct: Record<string, number> = {};
        let totalTargetPct = 0;

        allAssetKeys.forEach(key => {
            const pct = parseFloat(targets[key]) || 0;
            targetPct[key] = pct;
            totalTargetPct += pct;
        });

        // Normalize if target > 100 or < 100 to avoid wild swings, 
        // but typically users want it strictly applied. We will flag if != 100.

        // 3. Calculate New Total & Shortfalls
        const newTotal = currentTotal + sip;
        const shortfalls: Record<string, number> = {};
        let totalShortfall = 0;

        allAssetKeys.forEach(key => {
            const idealValue = newTotal * (targetPct[key] / 100);
            const currentValue = currentValues[key];
            const shortfall = Math.max(0, idealValue - currentValue);
            shortfalls[key] = shortfall;
            totalShortfall += shortfall;
        });

        // 4. Calculate Suggested Additions
        const suggestions: Record<string, number> = {};
        allAssetKeys.forEach(key => {
            if (totalTargetPct === 0) {
                // Prevent / 0
                suggestions[key] = 0;
            } else if (totalShortfall > 0) {
                // Distribute SIP proportionally based on magnitude of shortfall
                suggestions[key] = sip * (shortfalls[key] / totalShortfall);
            } else {
                // If perfect already (No shortfalls at all), just distribute by target %
                suggestions[key] = sip * (targetPct[key] / 100);
            }
        });

        // 5. Build View Models
        return Array.from(allAssetKeys).map(key => {
            return {
                name: key.charAt(0).toUpperCase() + key.slice(1).replace('_', ' '),
                key: key,
                currentValue: currentValues[key],
                targetPct: targetPct[key],
                suggestedAddition: suggestions[key],
                currentPct: currentTotal > 0 ? (currentValues[key] / currentTotal) * 100 : 0
            };
        }).sort((a, b) => b.targetPct - a.targetPct); // Sort by highest target first

    }, [data, monthlyAddition, targets]);

    const nMonths = parseInt(months) || 0;

    // Calculate effective additions and projections using compound growth
    let totalProjected = 0;
    let totalEffectiveAddition = 0;
    const projectedData = rebalanceData.map(item => {
        const custom = customAdditions[item.key];
        const effectiveAddition = (custom !== undefined && custom !== "") ? parseFloat(custom) || 0 : item.suggestedAddition;

        // Compound growth formula: FV = PV*(1+r)^n + PMT*((1+r)^n - 1)/r
        // where r = monthly return rate, n = number of months
        const monthlyRate = (parseFloat(expectedReturns[item.key]) || 0) / 100 / 12;
        let projectedValue: number;
        if (nMonths <= 0) {
            projectedValue = item.currentValue;
        } else if (monthlyRate === 0) {
            // No return: simple linear
            projectedValue = item.currentValue + (effectiveAddition * nMonths);
        } else {
            const growth = Math.pow(1 + monthlyRate, nMonths);
            projectedValue = item.currentValue * growth + effectiveAddition * (growth - 1) / monthlyRate;
        }

        totalProjected += projectedValue;
        totalEffectiveAddition += effectiveAddition;

        return {
            ...item,
            effectiveAddition,
            projectedValue
        };
    });

    // 2nd Pass: Simulate month-by-month compound growth to find ETA for each asset
    const ETA_MAX_MONTHS = 600; // cap search at 50 years

    // Build per-asset monthly rates and additions for the simulation
    const etaRates: Record<string, number> = {};
    const etaAdditions: Record<string, number> = {};
    rebalanceData.forEach(item => {
        etaRates[item.key] = (parseFloat(expectedReturns[item.key]) || 0) / 100 / 12;
        etaAdditions[item.key] = projectedData.find(p => p.key === item.key)?.effectiveAddition || 0;
    });

    // Find assets still below their target
    const etaMap: Record<string, number | string> = {};
    rebalanceData.forEach(item => {
        etaMap[item.key] = item.currentPct >= item.targetPct ? "Achieved" : "Never";
    });

    const pendingETA = new Set(rebalanceData.filter(item => item.currentPct < item.targetPct).map(item => item.key));

    if (pendingETA.size > 0) {
        const simVals: Record<string, number> = {};
        rebalanceData.forEach(item => { simVals[item.key] = item.currentValue; });

        for (let m = 1; m <= ETA_MAX_MONTHS && pendingETA.size > 0; m++) {
            // Advance all assets one month using compound growth
            let monthTotal = 0;
            rebalanceData.forEach(item => {
                simVals[item.key] = simVals[item.key] * (1 + etaRates[item.key]) + etaAdditions[item.key];
                monthTotal += simVals[item.key];
            });

            // Check each pending asset
            for (const key of Array.from(pendingETA)) {
                const targetPct = rebalanceData.find(i => i.key === key)!.targetPct;
                const pct = monthTotal > 0 ? (simVals[key] / monthTotal) * 100 : 0;
                if (pct >= targetPct) {
                    etaMap[key] = m;
                    pendingETA.delete(key);
                }
            }
        }
        // Remaining still in pendingETA never hit target within 50 yrs → "Never"
    }

    const finalProjectedData = projectedData.map(item => ({
        ...item,
        monthsToTarget: etaMap[item.key]
    }));

    const format = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
    const totalTargetSum = Object.values(targets).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);

    // Calculate Growth Projections month-by-month
    const growthProjectionData = useMemo(() => {
        if (nMonths <= 0) return [];
        const dataPoints = [];

        // Initial values at Month 0
        const currentVals: Record<string, number> = {};
        rebalanceData.forEach(item => {
            currentVals[item.key] = item.currentValue;
        });

        // Add Month 0
        let initialTotal = 0;
        const now = new Date();
        const initialPoint: any = { month: 0, monthLabel: now.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) };
        rebalanceData.forEach(item => {
            initialPoint[item.name] = currentVals[item.key];
            initialTotal += currentVals[item.key];
        });
        initialPoint.total = initialTotal;
        dataPoints.push(initialPoint);

        const activeAssets = rebalanceData.map(item => ({
            key: item.key,
            name: item.name,
            monthlyRate: (parseFloat(expectedReturns[item.key]) || 0) / 100 / 12,
            addition: finalProjectedData.find(d => d.key === item.key)?.effectiveAddition || 0
        }));

        // Project month by month
        for (let m = 1; m <= nMonths; m++) {
            const futureDate = new Date();
            futureDate.setMonth(futureDate.getMonth() + m);
            const point: any = { month: m, monthLabel: futureDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) };
            let monthlyTotal = 0;

            activeAssets.forEach(asset => {
                const prevVal = currentVals[asset.key];
                // New value = Previous Value * (1 + monthly return) + monthly addition
                const newVal = prevVal * (1 + asset.monthlyRate) + asset.addition;
                currentVals[asset.key] = newVal;
                point[asset.name] = newVal;
                monthlyTotal += newVal;
            });

            point.total = monthlyTotal;
            dataPoints.push(point);
        }

        return dataPoints;
    }, [nMonths, rebalanceData, expectedReturns, finalProjectedData]);

    const finalProjectedPoint = growthProjectionData.length > 0 ? growthProjectionData[growthProjectionData.length - 1] : null;

    // Calculate Future Milestones (project up to nMonths)
    const milestoneProjections = useMemo(() => {
        const ONE_MILLION_USD = 1000000 * usdRate;
        const futureMilestones: { value: number; date: string; formattedDate: string }[] = [];
        const futureUSDMilestones: { value: number; valueUSD: number; date: string; formattedDate: string }[] = [];

        // Determine starting amounts
        let currentTotal = 0;
        const currentVals: Record<string, number> = {};
        rebalanceData.forEach(item => {
            currentVals[item.key] = item.currentValue;
            currentTotal += item.currentValue;
        });

        let nextMilestone = 10000000;
        while (currentTotal >= nextMilestone) nextMilestone += 10000000;

        let nextUSDMilestone = ONE_MILLION_USD;
        while (currentTotal >= nextUSDMilestone) nextUSDMilestone += ONE_MILLION_USD;

        const activeAssets = rebalanceData.map(item => ({
            key: item.key,
            monthlyRate: (parseFloat(expectedReturns[item.key]) || 0) / 100 / 12,
            addition: finalProjectedData.find(d => d.key === item.key)?.effectiveAddition || 0
        }));

        let runningTotal = currentTotal;
        const startDate = new Date();

        // Project up to nMonths to match the projection chart length
        for (let m = 1; m <= nMonths; m++) {
            let monthlyTotal = 0;
            activeAssets.forEach(asset => {
                const newVal = currentVals[asset.key] * (1 + asset.monthlyRate) + asset.addition;
                currentVals[asset.key] = newVal;
                monthlyTotal += newVal;
            });
            runningTotal = monthlyTotal;

            const d = new Date(startDate);
            d.setMonth(d.getMonth() + m);

            while (runningTotal >= nextMilestone) {
                futureMilestones.push({
                    value: nextMilestone,
                    date: d.toISOString(),
                    formattedDate: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                });
                nextMilestone += 10000000;
            }

            while (runningTotal >= nextUSDMilestone) {
                futureUSDMilestones.push({
                    value: nextUSDMilestone,
                    valueUSD: nextUSDMilestone / usdRate,
                    date: d.toISOString(),
                    formattedDate: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                });
                nextUSDMilestone += ONE_MILLION_USD;
            }
        }

        return {
            futureMilestones,
            futureUSDMilestones
        };
    }, [nMonths, rebalanceData, expectedReturns, finalProjectedData, usdRate]);

    if (fetchLoading) return <div className="text-center p-8 text-gray-500">Loading portfolio data...</div>;

    return (
        <div className="bg-indigo-50 mt-8 p-6 rounded-lg shadow border border-indigo-100">
            <div className="flex justify-between items-center mb-4">
                <h4 className="text-gray-800 font-bold text-lg">Portfolio Rebalancer</h4>
                <div className="flex items-center gap-3">
                    {saveStatus && (
                        <span className={`text-xs font-medium px-2 py-1 rounded ${saveStatus === 'Saved!' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {saveStatus}
                        </span>
                    )}
                    <button
                        onClick={async () => {
                            try {
                                const config = JSON.stringify({ targets, months, customAdditions, monthlyAddition, expectedReturns });
                                await api.saveRebalancerConfig(config);
                                setSaveStatus('Saved!');
                                setTimeout(() => setSaveStatus(''), 3000);
                            } catch (e) {
                                setSaveStatus('Failed to save');
                                setTimeout(() => setSaveStatus(''), 3000);
                            }
                        }}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-md shadow-sm transition-colors"
                    >
                        💾 Save Configuration
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Inputs */}
                <div className="bg-white p-4 rounded border border-indigo-200">
                    <h5 className="font-semibold text-gray-700 mb-4 border-b pb-2">Configuration</h5>

                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Addition (SIP)</label>
                        <div className="flex items-center">
                            <span className="text-gray-500 mr-2">₹</span>
                            <input
                                type="number"
                                value={monthlyAddition}
                                onChange={(e) => {
                                    setMonthlyAddition(e.target.value);
                                    setIsSipModified(true);
                                }}
                                className="block w-full border border-gray-300 rounded-md shadow-sm p-2 text-gray-900 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Total budget you want to invest. Suggestions recalculate automatically.</p>
                    </div>

                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Projection Duration (Months)</label>
                        <div className="flex items-center">
                            <input
                                type="number"
                                value={months}
                                onChange={(e) => setMonths(e.target.value)}
                                min="1"
                                className="block w-32 border border-gray-300 rounded-md shadow-sm p-2 text-gray-900 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                            <span className="ml-2 text-gray-600 text-sm">months</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Duration to project your final allocation percentages.</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Ideal Allocation Targets (%)</label>
                        <div className="space-y-2">
                            {rebalanceData.map(item => (
                                <div key={item.key} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b sm:border-b-0 pb-2 sm:pb-0">
                                    <span className="text-sm font-medium text-gray-700 w-24">{item.name}</span>
                                    <div className="flex gap-4">
                                        <div className="flex items-center text-sm gap-2">
                                            <span className="text-gray-500 w-12 text-right">Target</span>
                                            <input
                                                type="number"
                                                value={targets[item.key] ?? "0"}
                                                onChange={(e) => handleTargetChange(item.key, e.target.value)}
                                                className="w-16 border border-gray-300 rounded px-2 py-1 text-sm text-right focus:ring-1 focus:ring-indigo-500 bg-indigo-50/30 font-bold"
                                            />
                                            <span className="text-gray-500">%</span>
                                        </div>
                                        <div className="flex items-center text-sm gap-2">
                                            <span className="text-gray-500 w-12 text-right">Return</span>
                                            <input
                                                type="number"
                                                value={expectedReturns[item.key] ?? "0"}
                                                onChange={(e) => handleExpectedReturnChange(item.key, e.target.value)}
                                                className="w-16 border border-gray-300 rounded px-2 py-1 text-sm text-right focus:ring-1 focus:ring-green-500 bg-green-50/30"
                                            />
                                            <span className="text-gray-500">%</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="mt-3 pt-2 border-t flex justify-between text-sm">
                            <span className="font-semibold text-gray-700">Total</span>
                            <span className={`font-bold ${totalTargetSum !== 100 ? 'text-red-500' : 'text-green-600'}`}>
                                {totalTargetSum}%
                            </span>
                        </div>
                        {totalTargetSum !== 100 && (
                            <p className="text-xs text-red-500 mt-1 border border-red-200 bg-red-50 p-1 rounded">Targets should equal 100% for accurate allocation.</p>
                        )}
                    </div>
                </div>

                {/* Suggestions Table */}
                <div className="bg-white p-4 rounded border border-indigo-200 flex flex-col">
                    <div className="flex justify-between items-center mb-4 border-b pb-2">
                        <h5 className="font-semibold text-gray-700">Action Plan & Projection</h5>
                        {(Object.keys(customAdditions).length > 0) && (
                            <button
                                onClick={() => setCustomAdditions({})}
                                className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                            >
                                Reset to Suggested
                            </button>
                        )}
                    </div>

                    <div className="flex-grow overflow-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Asset</th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Target</th>
                                    <th className="px-3 py-2 text-right text-xs font-bold text-indigo-700 uppercase bg-indigo-50">Planned Addition</th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-orange-600 uppercase bg-orange-50">Proj % ({months}m)</th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-teal-600 uppercase bg-teal-50">ETA to Target</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {finalProjectedData.map(row => {
                                    const projPct = totalProjected > 0 ? (row.projectedValue / totalProjected) * 100 : 0;
                                    const isCustom = customAdditions[row.key] !== undefined && customAdditions[row.key] !== "";

                                    // Format Time
                                    let etaDisplay = "-";
                                    if (row.monthsToTarget === "Achieved") {
                                        etaDisplay = "Achieved";
                                    } else if (row.monthsToTarget === "Never") {
                                        etaDisplay = "Need Higher SIP";
                                    } else if (typeof row.monthsToTarget === 'number') {
                                        const y = Math.floor(row.monthsToTarget / 12);
                                        const m = row.monthsToTarget % 12;
                                        if (y > 0 && m > 0) etaDisplay = `${y}y ${m}m`;
                                        else if (y > 0) etaDisplay = `${y} yrs`;
                                        else etaDisplay = `${m} mos`;

                                        // Cap display if it's ridiculously long
                                        if (y > 50) etaDisplay = "> 50 yrs";
                                    }

                                    return (
                                        <tr key={row.name} className="hover:bg-gray-50">
                                            <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-900">
                                                {row.name}
                                                <div className="text-[10px] text-gray-400 font-normal mt-0.5">Cur: {row.currentPct.toFixed(1)}%</div>
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap text-right text-gray-900 font-semibold align-middle">
                                                {row.targetPct.toFixed(1)}%
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap text-right align-middle bg-indigo-50/30">
                                                <div className="flex items-center justify-end">
                                                    <span className="text-gray-500 mr-1">₹</span>
                                                    <input
                                                        type="number"
                                                        value={customAdditions[row.key] ?? Math.round(row.suggestedAddition)}
                                                        onChange={(e) => handleCustomAdditionChange(row.key, e.target.value)}
                                                        className={`w-28 border rounded px-2 py-1 text-right text-sm focus:ring-1 focus:ring-indigo-500 ${isCustom ? 'border-indigo-400 bg-indigo-50 font-bold text-indigo-900' : 'border-gray-200 bg-white text-gray-700'}`}
                                                    />
                                                </div>
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap text-right align-middle bg-orange-50/30">
                                                <span className={`font-bold ${Math.abs(projPct - row.targetPct) < 1 ? 'text-green-600' : 'text-orange-600'}`}>
                                                    {projPct.toFixed(1)}%
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap text-right align-middle bg-teal-50/30">
                                                <span className={`font-medium ${row.monthsToTarget === 'Achieved' ? 'text-green-600' : row.monthsToTarget === 'Never' ? 'text-red-500 text-xs' : 'text-teal-700'}`}>
                                                    {etaDisplay}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="bg-gray-50 font-bold border-t-2 border-gray-300">
                                <tr>
                                    <td className="px-3 py-2 text-left text-gray-700">Total</td>
                                    <td className="px-3 py-2 text-right text-gray-700">{totalTargetSum}%</td>
                                    <td className="px-3 py-2 text-right text-indigo-800 bg-indigo-50">
                                        ₹{format(totalEffectiveAddition)}
                                    </td>
                                    <td className="px-3 py-2 text-right text-orange-800 bg-orange-50">
                                        100%
                                    </td>
                                    <td className="px-3 py-2 text-right text-teal-800 bg-teal-50">
                                        -
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            </div>

            {/* Growth Potential Calculator rendering driven by specific asset return rates */}
            <div className="mt-8">
                <GrowthPotentialCalculator
                    yearlyGrowthLive={rebalanceData.reduce((acc, asset) => acc + (asset.currentValue * ((parseFloat(expectedReturns[asset.key]) || 0) / 100)), 0)}
                    yearlyGrowthSaved={null}
                />
            </div>

            {/* Growth Projection Chart */}
            {growthProjectionData.length > 0 && finalProjectedPoint && (
                <div className="mt-8 bg-white p-4 rounded border border-indigo-200">
                    <div className="flex justify-between items-end mb-4 border-b pb-2">
                        <div>
                            <h5 className="font-semibold text-gray-700">Portfolio Growth Projection</h5>
                            <p className="text-xs text-gray-500 mt-1">
                                Assuming current values, planned monthly additions, and expected returns over {months} months.
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-gray-500 uppercase tracking-wide">Final Value</p>
                            <p className="text-2xl font-bold text-indigo-700">₹{format(finalProjectedPoint.total)}</p>
                        </div>
                    </div>

                    <div className="h-[300px] w-full mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={growthProjectionData} margin={{ top: 10, right: 30, left: 20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                <XAxis
                                    dataKey="monthLabel"
                                    tick={{ fontSize: 12, fill: '#6B7280' }}
                                    tickLine={false}
                                    axisLine={{ stroke: '#E5E7EB' }}
                                />
                                <YAxis
                                    tick={{ fontSize: 12, fill: '#6B7280' }}
                                    tickFormatter={(val) => `₹${(val / 100000).toFixed(0)}L`}
                                    tickLine={false}
                                    axisLine={{ stroke: '#E5E7EB' }}
                                />
                                <Tooltip
                                    formatter={(value: any, name: any) => [`₹${format(Number(value))}`, name]}
                                    labelFormatter={(label, payload) => {
                                        if (payload && payload.length > 0 && payload[0].payload) {
                                            return `${label} - Total: ₹${format(payload[0].payload.total)}`;
                                        }
                                        return label;
                                    }}
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
                                />
                                <Legend />
                                <Line
                                    type="monotone"
                                    dataKey="total"
                                    name="Total Portfolio"
                                    stroke="#4F46E5"
                                    strokeWidth={3}
                                    dot={false}
                                />
                                {/* Colors for the line chart matching generally the pie chart order but dynamically mapped */}
                                {rebalanceData.map((item, index) => {
                                    const colors = ['#8884d8', '#82ca9d', '#ffc658', '#ff7f50', '#00C49F', '#FFBB28'];
                                    const color = colors[index % colors.length];
                                    return (
                                        <Line
                                            key={item.key}
                                            type="monotone"
                                            dataKey={item.name}
                                            stroke={color}
                                            strokeWidth={2}
                                            dot={false}
                                        />
                                    );
                                })}
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* Milestones Card */}
            {(pastMilestones.length > 0 || milestoneProjections.futureMilestones.length > 0) && (
                <div className="mt-8 bg-white p-6 rounded-lg shadow border border-indigo-200">
                    <h4 className="text-gray-700 font-semibold mb-4 text-center">Crore Club Milestones</h4>
                    <div className="flex flex-wrap gap-4 justify-center">
                        {/* Achieved */}
                        {pastMilestones.map((m) => (
                            <div key={m.value} className="bg-green-50 border border-green-200 rounded-lg p-3 text-center min-w-[120px]">
                                <div className="text-green-600 font-bold text-lg">₹{m.value / 10000000} Cr</div>
                                <div className="text-xs text-gray-500 uppercase tracking-wide">Achieved</div>
                                <div className="text-sm font-medium text-gray-700">{m.formattedDate}</div>
                            </div>
                        ))}
                        {/* Projected */}
                        {milestoneProjections.futureMilestones.map((m) => (
                            <div key={m.value} className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-center min-w-[120px]">
                                <div className="text-indigo-600 font-bold text-lg">₹{m.value / 10000000} Cr</div>
                                <div className="text-xs text-gray-500 uppercase tracking-wide">Projected</div>
                                <div className="text-sm font-medium text-gray-700">{m.formattedDate}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* USD Milestones Card */}
            {(pastUSDMilestones.length > 0 || milestoneProjections.futureUSDMilestones.length > 0) && (
                <div className="mt-8 bg-white p-6 rounded-lg shadow border border-indigo-200">
                    <h4 className="text-gray-700 font-semibold mb-4 text-center">Million USD Club Milestones</h4>
                    <div className="flex flex-wrap gap-4 justify-center">
                        {/* Achieved */}
                        {pastUSDMilestones.map((m) => (
                            <div key={m.value} className="bg-green-50 border border-green-200 rounded-lg p-3 text-center min-w-[120px]">
                                <div className="text-green-600 font-bold text-lg">${(m.valueUSD! / 1000000).toLocaleString(undefined, { maximumFractionDigits: 2 })} M</div>
                                <div className="text-xs text-gray-500 uppercase tracking-wide">Achieved</div>
                                <div className="text-sm font-medium text-gray-700">{m.formattedDate}</div>
                            </div>
                        ))}
                        {/* Projected */}
                        {milestoneProjections.futureUSDMilestones.map((m) => (
                            <div key={m.value} className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-center min-w-[120px]">
                                <div className="text-indigo-600 font-bold text-lg">${(m.valueUSD! / 1000000).toLocaleString(undefined, { maximumFractionDigits: 2 })} M</div>
                                <div className="text-xs text-gray-500 uppercase tracking-wide">Projected</div>
                                <div className="text-sm font-medium text-gray-700">{m.formattedDate}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
