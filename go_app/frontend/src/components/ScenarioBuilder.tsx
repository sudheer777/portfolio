import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

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
                        newScenarios[1] = { ...newScenarios[1], sip: savedSip * 1.2, stepUpPct: savedStepUp + 2, expectedReturnPct: baseReturn + 2 };
                        newScenarios[2] = { ...newScenarios[2], sip: savedSip * 0.8, stepUpPct: savedStepUp - 2, expectedReturnPct: baseReturn - 2 };
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

            </div>
        </div>
    );
};
