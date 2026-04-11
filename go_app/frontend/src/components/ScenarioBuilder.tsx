import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import type { PortfolioSummary } from '../types';

type Scenario = {
    id: string;
    name: string;
    color: string;
    sip: number;
    stepUpPct: number;
    expectedReturnPct: number;
};

export const ScenarioBuilder: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [currentCorpus, setCurrentCorpus] = useState(0);
    const [fullPortfolio, setFullPortfolio] = useState<PortfolioSummary | null>(null);
    const [shockPercents, setShockPercents] = useState<Record<string, string>>({});
    const [stepUpMonth, setStepUpMonth] = useState(1);

    // Core state array holding dynamic scenarios
    const [scenarios, setScenarios] = useState<Scenario[]>([
        { id: '1', name: 'Base Plan', color: '#6366f1', sip: 0, stepUpPct: 0, expectedReturnPct: 12 },
        { id: '2', name: 'Aggressive', color: '#10b981', sip: 0, stepUpPct: 0, expectedReturnPct: 14 },
        { id: '3', name: 'Conservative', color: '#f59e0b', sip: 0, stepUpPct: 0, expectedReturnPct: 10 }
    ]);

    // Years to simulate
    const [simulationYears, setSimulationYears] = useState(30);

    useEffect(() => {
        // Fetch Live Total Corpus
        api.getPortfolio().then(port => {
            if (port) {
                setFullPortfolio(port);
                setCurrentCorpus(port.total.final_amount);
            }
        }).catch(() => { });

        // Fetch Live Rebalancer Config to seed "Base Plan"
        api.getRebalancerConfig().then(configStr => {
            if (configStr) {
                try {
                    const config = JSON.parse(configStr);
                    const savedSip = parseFloat(config.monthlyAddition) || 0;
                    const savedStepUp = parseFloat(config.yearlyIncreasePct) || 0;
                    const savedStepUpMonth = parseInt(config.stepUpMonth) || 1;
                    setStepUpMonth(savedStepUpMonth);

                    // Compute blended expected return from targeted configs (simplified generic base)
                    let baseReturn = 12;
                    if (config.expectedReturns && config.targets) {
                        let weightedSum = 0;
                        let weightTotal = 0;
                        for (const key in config.targets) {
                            const t = parseFloat(config.targets[key]) || 0;
                            const r = parseFloat(config.expectedReturns[key]) || 0;
                            weightedSum += (t * r);
                            weightTotal += t;
                        }
                        if (weightTotal > 0) baseReturn = weightedSum / weightTotal;
                    }

                    setScenarios(current => {
                        const newScenarios = [...current];
                        // Auto-seed baseline metrics into all default scenarios based on what they were currently set to do
                        newScenarios[0] = { ...newScenarios[0], sip: savedSip, stepUpPct: savedStepUp, expectedReturnPct: baseReturn };
                        newScenarios[1] = { ...newScenarios[1], sip: savedSip, stepUpPct: savedStepUp, expectedReturnPct: 12 };
                        newScenarios[2] = { ...newScenarios[2], sip: savedSip, stepUpPct: savedStepUp, expectedReturnPct: 8 };
                        return newScenarios;
                    });
                } catch (e) {
                    console.error("Failed to parse rebalancer config", e);
                }
            }
            setLoading(false);
        }).catch(() => setLoading(false));
    }, []);

    const handleUpdateScenario = (id: string, field: keyof Scenario, value: any) => {
        setScenarios(scenarios.map(s => {
            if (s.id === id) {
                return { ...s, [field]: value };
            }
            return s;
        }));
    };

    const handleAddScenario = () => {
        const newId = Date.now().toString();
        const colors = ['#ef4444', '#8b5cf6', '#ec4899', '#0ea5e9'];
        const randomColor = colors[scenarios.length % colors.length];
        setScenarios([...scenarios, {
            id: newId,
            name: `Scenario ${scenarios.length + 1}`,
            color: randomColor,
            sip: scenarios[0].sip,
            stepUpPct: scenarios[0].stepUpPct,
            expectedReturnPct: scenarios[0].expectedReturnPct
        }]);
    };

    const handleRemoveScenario = (id: string) => {
        setScenarios(scenarios.filter(s => s.id !== id));
    };

    const formatCurrencyShort = (val: number) => {
        if (val >= 10000000) return `₹${(val / 10000000).toFixed(2)} Cr`;
        if (val >= 100000) return `₹${(val / 100000).toFixed(2)} L`;
        return `₹${val.toLocaleString('en-IN')}`;
    };

    // Physics Engine
    const { chartData, finalValues } = useMemo(() => {
        const data: any[] = [];
        const finalVals: Record<string, number> = {};

        // To map active SIP state exactly per scenario
        const activeSips = scenarios.map(s => ({
            id: s.id,
            currentSip: s.sip,
            monthlyRate: s.expectedReturnPct / 100 / 12,
            stepUpMultiplier: 1 + (s.stepUpPct / 100),
            balance: currentCorpus
        }));

        const startGameDate = new Date();
        const maxMonths = simulationYears * 12;

        data.push({
            month: 0,
            dateLabel: "Today",
            ...Object.fromEntries(activeSips.map(s => [s.id, s.balance]))
        });

        for (let m = 1; m <= maxMonths; m++) {
            const simDate = new Date(startGameDate);
            simDate.setMonth(simDate.getMonth() + m);

            activeSips.forEach(s => {
                // Apply calendar-aligned SIP Step-Up
                if ((simDate.getMonth() + 1) === stepUpMonth) {
                    s.currentSip *= s.stepUpMultiplier;
                }
                // Compound
                s.balance = (s.balance * (1 + s.monthlyRate)) + s.currentSip;
            });

            // To avoid rendering 360 individual points, we can sample data points (Quarterly or Yearly)
            if (m % 12 === 0 || m === maxMonths) {
                const point: any = {
                    month: m,
                    dateLabel: simDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                };
                activeSips.forEach(s => {
                    point[s.id] = s.balance;
                });
                data.push(point);
            }
        }

        activeSips.forEach(s => {
            finalVals[s.id] = s.balance;
        });

        return { chartData: data, finalValues: finalVals };
    }, [scenarios, currentCorpus, stepUpMonth, simulationYears]);

    const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7f50', '#00C49F', '#FFBB28'];

    const formatCurrencyStandard = (val: number) => val.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

    const shockData = useMemo(() => {
        if (!fullPortfolio || !fullPortfolio.asset_types) return null;
        const currentData = Object.entries(fullPortfolio.asset_types).map(([type, amount]) => ({
            name: type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' '),
            rawName: type,
            value: amount.final_amount,
        })).filter(d => d.value > 0);

        const currentTotal = currentData.reduce((sum, d) => sum + d.value, 0);

        const afterData = currentData.map(d => {
            const pct = parseFloat(shockPercents[d.rawName]) || 0;
            const shockMultiplier = 1 + (pct / 100);
            return {
                name: d.name,
                rawName: d.rawName,
                value: d.value * shockMultiplier
            };
        });

        const afterTotal = afterData.reduce((sum, d) => sum + d.value, 0);

        return { currentData, currentTotal, afterData, afterTotal };
    }, [fullPortfolio, shockPercents]);

    if (loading) return <div className="text-center p-8 text-gray-500">Loading metrics...</div>;

    return (
        <div className="space-y-8">
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl shadow-lg p-6">
                <div className="flex justify-between items-center mb-6 border-b border-indigo-200 pb-4">
                    <div>
                        <h2 className="text-2xl font-bold text-indigo-900">What-If Scenarios</h2>
                        <p className="text-indigo-600 mt-1">Visualize alternative parallel timelines for your portfolio over a {simulationYears} year horizon.</p>
                    </div>
                    <div className="flex bg-white rounded-md shadow-sm border border-indigo-200 px-3 py-2 items-center">
                        <label className="text-xs font-semibold text-gray-500 mr-2 uppercase">Horizon (Yrs)</label>
                        <select
                            value={simulationYears}
                            onChange={(e) => setSimulationYears(parseInt(e.target.value))}
                            className="bg-transparent font-bold text-indigo-700 text-lg border-none focus:ring-0 p-0 cursor-pointer"
                        >
                            <option value={10}>10</option>
                            <option value={15}>15</option>
                            <option value={20}>20</option>
                            <option value={30}>30</option>
                            <option value={40}>40</option>
                        </select>
                    </div>
                </div>

                {/* Scenario Parameter Input Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    {scenarios.map((scenario) => (
                        <div key={scenario.id} className="bg-white border rounded-xl overflow-hidden shadow-sm" style={{ borderColor: scenario.color }}>
                            <div className="px-3 py-2 text-white font-semibold flex justify-between items-center" style={{ backgroundColor: scenario.color }}>
                                <input
                                    className="bg-transparent border-none focus:ring-0 p-0 font-bold text-sm text-white w-full overflow-hidden whitespace-nowrap placeholder-white"
                                    value={scenario.name}
                                    onChange={(e) => handleUpdateScenario(scenario.id, 'name', e.target.value)}
                                />
                                {scenarios.length > 1 && (
                                    <button onClick={() => handleRemoveScenario(scenario.id)} className="text-white opacity-80 hover:opacity-100 font-bold ml-2">×</button>
                                )}
                            </div>
                            <div className="p-4 space-y-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Monthly SIP (₹)</label>
                                    <input
                                        type="number"
                                        value={scenario.sip}
                                        onChange={(e) => handleUpdateScenario(scenario.id, 'sip', parseFloat(e.target.value) || 0)}
                                        className="w-full border-gray-300 rounded text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">SIP Step-Up (%)</label>
                                    <input
                                        type="number"
                                        value={scenario.stepUpPct}
                                        onChange={(e) => handleUpdateScenario(scenario.id, 'stepUpPct', parseFloat(e.target.value) || 0)}
                                        className="w-full border-gray-300 rounded text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Expected CAGR (%)</label>
                                    <input
                                        type="number"
                                        value={scenario.expectedReturnPct}
                                        onChange={(e) => handleUpdateScenario(scenario.id, 'expectedReturnPct', parseFloat(e.target.value) || 0)}
                                        className="w-full border-gray-300 rounded text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                </div>

                                <div className="pt-2 border-t mt-4 border-gray-100 flex justify-between font-bold text-sm">
                                    <span className="text-gray-600">Final:</span>
                                    <span style={{ color: scenario.color }}>{formatCurrencyShort(finalValues[scenario.id] || 0)}</span>
                                </div>
                            </div>
                        </div>
                    ))}

                    {scenarios.length < 6 && (
                        <button
                            onClick={handleAddScenario}
                            className="bg-white border-2 border-dashed border-indigo-200 rounded-xl flex flex-col items-center justify-center p-6 text-indigo-400 hover:text-indigo-600 hover:border-indigo-400 transition-colors h-full min-h-[220px]"
                        >
                            <span className="text-3xl font-light mb-2">+</span>
                            <span className="font-semibold text-sm">Add Scenario</span>
                        </button>
                    )}
                </div>

                {/* Unified Trajectory Chart */}
                <div className="bg-white p-6 border border-gray-200 rounded-xl shadow-inner">
                    <h3 className="font-bold text-gray-700 mb-6 text-center text-lg">{simulationYears}-Year Corpus Compounding Trajectories</h3>
                    <div className="w-full h-[500px]">
                        <ResponsiveContainer>
                            <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                <XAxis
                                    dataKey="dateLabel"
                                    tick={{ fontSize: 12, fill: '#6b7280' }}
                                    axisLine={{ stroke: '#D1D5DB' }}
                                    tickLine={false}
                                />
                                <YAxis
                                    tickFormatter={(val) => `₹${(val / 10000000).toFixed(0)} Cr`}
                                    tick={{ fontSize: 12, fill: '#6b7280' }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <Tooltip
                                    formatter={(value: any) => formatCurrencyShort(value as number)}
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' }}
                                />
                                <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="circle" />
                                {scenarios.map(scenario => (
                                    <Line
                                        key={scenario.id}
                                        type="monotone"
                                        dataKey={scenario.id}
                                        name={scenario.name}
                                        stroke={scenario.color}
                                        strokeWidth={3}
                                        activeDot={{ r: 6, strokeWidth: 0 }}
                                        dot={false}
                                    />
                                ))}
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Asset Shock Simulator */}
                {shockData && (
                    <div className="bg-white p-6 border border-gray-200 rounded-xl shadow-inner mt-8">
                        <h3 className="font-bold text-gray-700 mb-2 text-center text-lg">Instant Asset Shock Simulator</h3>
                        <p className="text-sm text-gray-500 text-center mb-6">See how a sudden jump or crash in a specific asset class instantly alters your Portfolio Asset Allocation and Total Net Worth.</p>
                        
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-8 bg-gray-50 p-4 rounded-lg border border-gray-200">
                            {shockData.currentData.map((d: any) => {
                                const val = shockPercents[d.rawName] || '';
                                const parsed = parseFloat(val);
                                const isPositive = parsed > 0;
                                const isNegative = parsed < 0;
                                return (
                                    <div key={d.rawName} className="flex flex-col gap-1">
                                        <label className="text-xs font-semibold text-gray-600 truncate bg-white px-1 -mb-2 z-10 w-max ml-2">{d.name} Shock (%)</label>
                                        <div className="relative">
                                            <input 
                                                type="number"
                                                value={val}
                                                placeholder="0"
                                                onChange={(e) => setShockPercents({ ...shockPercents, [d.rawName]: e.target.value })}
                                                className={`w-full border rounded-md px-3 pt-3 pb-2 text-sm font-bold focus:ring-indigo-500 focus:border-indigo-500 shadow-sm ${isPositive ? 'text-green-600 border-green-300' : isNegative ? 'text-red-600 border-red-300' : 'text-gray-700 border-gray-300'}`}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Before Chart */}
                            <div className="flex flex-col items-center p-4 bg-gray-50 rounded-lg border border-gray-100">
                                <h4 className="font-semibold text-gray-700 text-center">Before Shock</h4>
                                <div className="text-xl font-bold text-indigo-900 mt-1">{formatCurrencyStandard(shockData.currentTotal)}</div>
                                <div className="w-full h-[250px] mt-4">
                                    <ResponsiveContainer>
                                        <PieChart>
                                            <Pie
                                                data={shockData.currentData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={50}
                                                outerRadius={80}
                                                fill="#8884d8"
                                                paddingAngle={5}
                                                dataKey="value"
                                            >
                                                {shockData.currentData.map((_: any, index: number) => (
                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip formatter={(value: any) => formatCurrencyStandard(Number(value))} />
                                            <Legend />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* After Chart */}
                            <div className="flex flex-col items-center p-4 bg-indigo-50 rounded-lg border border-indigo-100">
                                <h4 className="font-semibold text-indigo-900 text-center">After Shock</h4>
                                <div className="text-xl font-bold text-indigo-900 mt-1 flex items-center gap-2">
                                    {formatCurrencyStandard(shockData.afterTotal)}
                                    {shockData.afterTotal !== shockData.currentTotal && (
                                        <span className={`text-sm ${shockData.afterTotal > shockData.currentTotal ? 'text-green-600' : 'text-red-600'}`}>
                                            ({shockData.afterTotal > shockData.currentTotal ? '+' : '-'}{formatCurrencyStandard(Math.abs(shockData.afterTotal - shockData.currentTotal))})
                                        </span>
                                    )}
                                </div>
                                <div className="w-full h-[250px] mt-4">
                                    <ResponsiveContainer>
                                        <PieChart>
                                            <Pie
                                                data={shockData.afterData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={50}
                                                outerRadius={80}
                                                fill="#82ca9d"
                                                paddingAngle={5}
                                                dataKey="value"
                                            >
                                                {shockData.afterData.map((_: any, index: number) => (
                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip formatter={(value: any) => formatCurrencyStandard(Number(value))} />
                                            <Legend />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>

                        {/* Summary Table */}
                        <div className="mt-8 overflow-x-auto">
                            <table className="min-w-full text-sm text-center">
                                <thead className="bg-gray-100 text-gray-600 font-semibold">
                                    <tr>
                                        <th className="p-2 border-b text-left">Asset Class</th>
                                        <th className="p-2 border-b">Before Value</th>
                                        <th className="p-2 border-b">Before %</th>
                                        <th className="p-2 border-b bg-indigo-100">After Value</th>
                                        <th className="p-2 border-b bg-indigo-100">After %</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {shockData.currentData.map((d: any, i: number) => {
                                        const afterD = shockData.afterData[i];
                                        const currentPct = ((d.value / shockData.currentTotal) * 100).toFixed(1);
                                        const afterPct = ((afterD.value / shockData.afterTotal) * 100).toFixed(1);
                                        const activeShock = parseFloat(shockPercents[d.rawName]) || 0;
                                        const isTarget = activeShock !== 0;
                                        
                                        return (
                                            <tr key={d.rawName} className={`border-b ${isTarget ? 'bg-yellow-50' : 'hover:bg-gray-50'}`}>
                                                <td className="p-2 text-left font-medium">
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: COLORS[i % COLORS.length] }}></span>
                                                        {d.name} {isTarget && <span className="text-xs bg-yellow-200 text-yellow-800 px-1 rounded ml-1">Target</span>}
                                                    </div>
                                                </td>
                                                <td className="p-2 text-gray-600">{formatCurrencyStandard(d.value)}</td>
                                                <td className="p-2 font-mono text-xs">{currentPct}%</td>
                                                <td className={`p-2 font-bold ${isTarget ? (activeShock > 0 ? 'text-green-600' : 'text-red-600') : 'text-gray-900'}`}>
                                                    {formatCurrencyStandard(afterD.value)}
                                                </td>
                                                <td className="p-2 font-mono text-xs font-semibold">{afterPct}%</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
