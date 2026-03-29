import React, { useState, useEffect } from 'react';
import { api } from '../api';
import type { JobDetails, SalaryHistory } from '../types';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend
} from 'recharts';
import { FICrossoverCard, calculateTaxesNewRegime } from './FICrossoverCard';

// Standard XIRR approximation
const calculateXIRR = (cashFlows: { amount: number; date: Date }[]): number => {
    if (cashFlows.length < 2) return 0;

    // Check if we have both positive and negative. In salary context, we map Initial CTC as negative investment, Current CTC as positive return.
    // Wait, the user wants XIRR of salary growth. CAGR is more mathematically correct: (Final / Initial) ^ (1/Years) - 1
    const sorted = [...cashFlows].sort((a, b) => a.date.getTime() - b.date.getTime());
    const start = sorted[0];
    const end = sorted[sorted.length - 1];

    const years = (end.date.getTime() - start.date.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    if (years <= 0 || start.amount === 0) return 0;

    const cagr = Math.pow(end.amount / start.amount, 1 / years) - 1;
    return cagr * 100; // as percentage
};

const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
    }).format(val);



export default function CareerCalculator() {
    const [loading, setLoading] = useState(true);
    const [jobDetails, setJobDetails] = useState<JobDetails | null>(null);
    const [history, setHistory] = useState<SalaryHistory[]>([]);

    // Form states
    const [joinDate, setJoinDate] = useState('');
    const [ctc, setCtc] = useState('');

    // History states
    const [histDate, setHistDate] = useState('');
    const [histCtc, setHistCtc] = useState('');
    const [histType, setHistType] = useState('Hike');

    // Simulation states
    const [expectedHike, setExpectedHike] = useState('10');
    const [accruedLeaves, setAccruedLeaves] = useState('20');
    const [yearsToProject, setYearsToProject] = useState('5');

    // Quick Simulator state
    const [quickCtc, setQuickCtc] = useState('');

    const loadData = async () => {
        setLoading(true);
        try {
            const [jd, hist] = await Promise.all([
                api.getJobDetails(),
                api.getSalaryHistory()
            ]);
            setJobDetails(jd);
            setHistory(hist.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
            if (jd) {
                setJoinDate(jd.joining_date.split('T')[0]);
                setCtc(jd.current_ctc.toString());
            }
        } catch (err) {
            console.error(err);
        }
        setLoading(false);
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleSaveJob = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!joinDate || !ctc) return;
        await api.saveJobDetails(joinDate, parseFloat(ctc));
        loadData();
    };

    const handleAddHistory = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!histDate || !histCtc) return;
        await api.addSalaryHistory(histDate, parseFloat(histCtc), histType);
        setHistDate('');
        setHistCtc('');
        loadData();
    };

    const handleDeleteHistory = async (id: number) => {
        await api.deleteSalaryHistory(id);
        loadData();
    };

    // Calculations
    const currentCtcVal = jobDetails ? jobDetails.current_ctc : 0;
    const monthlyBase = currentCtcVal / 24; // Base is 50% of CTC
    const dailyBase = monthlyBase / 30;

    // Tax Math for current CTC
    const taxData = calculateTaxesNewRegime(currentCtcVal);
    const dailyInHand = taxData.monthlyInHand / 30;

    let yearsOfService = 0;
    if (jobDetails) {
        const joinDt = new Date(jobDetails.joining_date);
        const now = new Date();
        yearsOfService = (now.getTime() - joinDt.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    }

    const currentGratuity = yearsOfService >= 4.8 ? Math.round(monthlyBase * (15 / 26) * Math.round(yearsOfService)) : 0;
    const currentLeaveEncashment = dailyBase * (parseFloat(accruedLeaves) || 0);

    // Calculate In-Hand values by deducing marginal tax impact at current CTC
    const taxWithLeave = calculateTaxesNewRegime(currentCtcVal + currentLeaveEncashment).totalTax;
    const inHandLeaveEncashment = currentLeaveEncashment - (taxWithLeave - taxData.totalTax);

    const taxableGratuity = Math.max(0, currentGratuity - 2000000); // Exclude first 20 Lakhs
    const taxWithGrat = calculateTaxesNewRegime(currentCtcVal + taxableGratuity).totalTax;
    const inHandGratuity = currentGratuity - (taxWithGrat - taxData.totalTax);

    // Projections
    const hikeRate = (parseFloat(expectedHike) || 0) / 100;
    const projYears = parseInt(yearsToProject) || 5;

    const projectionData = [];
    const chartData = [];

    // Historical chart data
    let baseVal = currentCtcVal;
    let baseDate = jobDetails ? new Date(jobDetails.joining_date) : new Date();

    if (history.length > 0) {
        baseVal = history[0].ctc;
        baseDate = new Date(history[0].date);
    }

    const getPointCAGR = (val: number, date: Date) => {
        const years = (date.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
        if (years <= 0 || baseVal <= 0) return null;
        return ((Math.pow(val / baseVal, 1 / years) - 1) * 100).toFixed(2);
    };

    history.forEach((h, idx) => {
        const ctc = h.ctc;
        const curDate = new Date(h.date);
        chartData.push({
            year: curDate.getFullYear().toString() + '-' + (curDate.getMonth() + 1),
            actual_ctc: ctc,
            cagr_since_join: idx === 0 ? null : getPointCAGR(ctc, curDate)
        });
    });

    const lastActCtc = history.length > 0 ? history[history.length - 1].ctc : currentCtcVal;
    const lastDate = history.length > 0 ? new Date(history[history.length - 1].date) : new Date();

    // Create simulated future
    let simCtc = lastActCtc || currentCtcVal;
    let simYos = yearsOfService;

    for (let i = 1; i <= projYears; i++) {
        simCtc = simCtc * (1 + hikeRate);
        simYos += 1;

        const projDate = new Date(lastDate);
        projDate.setFullYear(projDate.getFullYear() + i);

        const simMonBase = simCtc / 24;
        const simDaily = simMonBase / 30;
        const simTaxData = calculateTaxesNewRegime(simCtc);

        const simGrat = simYos >= 4.8 ? Math.round(simMonBase * (15 / 26) * Math.round(simYos)) : 0;
        const simLeave = simDaily * (parseFloat(accruedLeaves) || 0);

        const simTaxWithLeave = calculateTaxesNewRegime(simCtc + simLeave).totalTax;
        const simInHandLeave = simLeave - (simTaxWithLeave - simTaxData.totalTax);

        const simTaxableGrat = Math.max(0, simGrat - 2000000);
        const simTaxWithGrat = calculateTaxesNewRegime(simCtc + simTaxableGrat).totalTax;
        const simInHandGrat = simGrat - (simTaxWithGrat - simTaxData.totalTax);

        projectionData.push({
            year: `+${i} Year`,
            ctc: simCtc,
            inHand: simTaxData.monthlyInHand, // Per month
            tax: simTaxData.totalTax,         // Per year
            epf: simTaxData.epf,              // Per year
            gratuity: simGrat,
            inHandGratuity: simInHandGrat,
            leave: simLeave,
            inHandLeave: simInHandLeave
        });

        chartData.push({
            year: `+${i} Yr`,
            projected_ctc: Math.round(simCtc),
            cagr_since_join: getPointCAGR(simCtc, projDate)
        });
    }

    // Math for CAGR
    const growthRate = calculateXIRR(history.map(h => ({ amount: h.ctc, date: new Date(h.date) })));

    if (loading) return <div>Loading Salary Data...</div>;

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                <div className="bg-white p-3 border rounded shadow-lg text-sm">
                    <p className="font-bold border-b pb-1 mb-2">{`Timeline: ${label}`}</p>
                    {data.actual_ctc && (
                        <p className="text-indigo-600 font-semibold">
                            Historical CTC: {formatCurrency(data.actual_ctc)}
                        </p>
                    )}
                    {data.projected_ctc && (
                        <p className="text-green-600 font-semibold">
                            Projected CTC: {formatCurrency(data.projected_ctc)}
                        </p>
                    )}
                    {data.cagr_since_join !== null && data.cagr_since_join !== undefined && (
                        <p className="text-purple-600 font-semibold mt-2 pt-2 border-t">
                            CAGR Since Join: {data.cagr_since_join}% p.a.
                        </p>
                    )}
                </div>
            );
        }
        return null;
    };

    return (
        <div className="space-y-6">

            {/* 1. Job details */}
            <div className="bg-white rounded-lg shadow p-6 border-t-4 border-indigo-500">
                <h2 className="text-2xl font-bold mb-4">Current Job Details</h2>
                <form onSubmit={handleSaveJob} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Joining Date</label>
                        <input type="date" value={joinDate} onChange={e => setJoinDate(e.target.value)} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-lg p-2 border" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Current Total CTC (₹)</label>
                        <input type="number" value={ctc} onChange={e => setCtc(e.target.value)} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-lg p-2 border" />
                    </div>
                    <div className="flex items-end">
                        <button type="submit" className="w-full bg-indigo-600 text-white font-medium py-2 px-4 rounded hover:bg-indigo-700">Save Details</button>
                    </div>
                </form>
            </div>

            {/* 1.5 Quick Simulator */}
            <div className="bg-white rounded-lg shadow p-6 border-t-4 border-green-500">
                <h2 className="text-xl font-bold mb-4">Quick Salary Sandbox</h2>
                <div className="flex flex-col md:flex-row gap-4 items-center">
                    <div className="w-full md:w-1/3">
                        <label className="block text-sm font-medium text-gray-700">Enter Any CTC target (₹)</label>
                        <input
                            type="number"
                            value={quickCtc}
                            onChange={e => setQuickCtc(e.target.value)}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 text-lg p-2 border"
                            placeholder="e.g. 2500000"
                        />
                    </div>
                    {parseFloat(quickCtc) > 0 && (
                        <div className="w-full md:w-2/3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {(() => {
                                const ctcVal = parseFloat(quickCtc);
                                const sim = calculateTaxesNewRegime(ctcVal);

                                // Base metrics
                                const monthlyBase = ctcVal / 24;
                                const dailyBase = monthlyBase / 30;

                                // 5 Years Service assumed for Gratuity eligibility in sandbox
                                const currentGratuity = Math.round(monthlyBase * (15 / 26) * 5);
                                const taxableGratuity = Math.max(0, currentGratuity - 2000000);
                                const taxWithGrat = calculateTaxesNewRegime(ctcVal + taxableGratuity).totalTax;
                                const inHandGrat = currentGratuity - (taxWithGrat - sim.totalTax);

                                // 20 Days Leave assumed
                                const currentLeave = dailyBase * 20;
                                const taxWithLeave = calculateTaxesNewRegime(ctcVal + currentLeave).totalTax;
                                const inHandLeave = currentLeave - (taxWithLeave - sim.totalTax);

                                return (
                                    <>
                                        <div className="p-3 bg-orange-50 rounded border border-orange-100 shadow-sm flex flex-col justify-center">
                                            <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-1">In-Hand Salary</p>
                                            <p className="font-bold text-orange-700 text-lg">{formatCurrency(sim.monthlyInHand)}<span className="text-[10px] font-normal text-gray-500"> /mo</span></p>
                                            <p className="text-[10px] text-gray-500 mt-0.5">{formatCurrency(sim.monthlyInHand * 12)} /yr</p>
                                        </div>
                                        <div className="p-3 bg-red-50 rounded border border-red-100 shadow-sm flex flex-col justify-center">
                                            <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-1">Yearly Income Tax</p>
                                            <p className="font-bold text-red-700 text-lg">{formatCurrency(sim.totalTax)}</p>
                                            <p className="text-[10px] text-gray-500 mt-0.5">Under New Regime</p>
                                        </div>
                                        <div className="p-3 bg-teal-50 rounded border border-teal-100 shadow-sm flex flex-col justify-center">
                                            <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-1">Yearly EPF (Total)</p>
                                            <p className="font-bold text-teal-700 text-lg">{formatCurrency(sim.epf)}</p>
                                            <p className="text-[10px] text-gray-500 mt-0.5">{formatCurrency(sim.epf / 12)} /mo matched</p>
                                        </div>
                                        <div className="p-3 bg-green-50 rounded border border-green-100 shadow-sm flex flex-col justify-center">
                                            <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-1">In-Hand Gratuity (5 Yrs)</p>
                                            <p className="font-bold text-green-700 text-lg">{formatCurrency(inHandGrat)}</p>
                                            <p className="text-[10px] text-gray-500 mt-0.5">Gross: {formatCurrency(currentGratuity)}</p>
                                        </div>
                                        <div className="p-3 bg-blue-50 rounded border border-blue-100 shadow-sm flex flex-col justify-center">
                                            <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-1">In-Hand Leave (20 Days)</p>
                                            <p className="font-bold text-blue-700 text-lg">{formatCurrency(inHandLeave)}</p>
                                            <p className="text-[10px] text-gray-500 mt-0.5">Gross: {formatCurrency(currentLeave)}</p>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    )}
                </div>
            </div>

            {jobDetails && (
                <>
                    <div className="grid grid-cols-1 gap-6">
                        {/* 2. Gratuity & Leave */}
                        <div className="bg-white rounded-lg shadow p-6">
                            <h3 className="text-xl font-bold border-b pb-2 mb-4 text-gray-800">Current Accruals</h3>
                            <div className="space-y-4">
                                <div className="p-4 bg-gray-50 rounded shadow-inner">
                                    <p className="text-gray-600 text-sm">Monthly Base (CTC/24)</p>
                                    <p className="text-xl font-bold text-gray-900">{formatCurrency(monthlyBase)}</p>
                                </div>
                                <div className="p-4 bg-green-50 rounded shadow-inner border border-green-100">
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <p className="text-gray-600 text-sm">In-Hand Gratuity {!currentGratuity && '(Eligible after 5 yrs)'}</p>
                                            <p className="text-2xl font-bold text-green-700">{formatCurrency(inHandGratuity)}</p>
                                            <p className="text-xs text-gray-500 mt-1">Gross: {formatCurrency(currentGratuity)} | Tax Marginal Diff: {formatCurrency(currentGratuity - inHandGratuity)}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-gray-500">Years of Service</p>
                                            <p className="font-semibold">{yearsOfService.toFixed(1)} Yrs</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-4 bg-orange-50 rounded shadow-inner border border-orange-100">
                                    <p className="text-gray-600 text-sm mb-2">Estimated In-Hand Salary</p>
                                    <div className="flex justify-between items-end">
                                        <div>
                                            <p className="text-2xl font-bold text-orange-700">{formatCurrency(taxData.monthlyInHand)}<span className="text-sm font-normal text-gray-600"> /mo</span></p>
                                            <p className="text-xs text-gray-500 mt-1">Daily: {formatCurrency(dailyInHand)} | Tax: {formatCurrency(taxData.totalTax)}</p>
                                        </div>
                                    </div>
                                </div>

                                <FICrossoverCard expectedHike={parseFloat(expectedHike) || 0} />

                                <div className="p-4 bg-blue-50 rounded shadow-inner border border-blue-100">
                                    <p className="text-gray-600 text-sm mb-2">In-Hand Leave Encashment Simulator</p>
                                    <div className="flex space-x-2 items-center mb-2">
                                        <input type="number" value={accruedLeaves} onChange={(e) => setAccruedLeaves(e.target.value)} className="w-20 p-1 border rounded" />
                                        <span className="text-sm">Days Accrued</span>
                                    </div>
                                    <p className="text-2xl font-bold text-blue-700">{formatCurrency(inHandLeaveEncashment)}</p>
                                    <p className="text-xs text-gray-500 mt-1">Gross: {formatCurrency(currentLeaveEncashment)} | Tax Marginal Diff: {formatCurrency(currentLeaveEncashment - inHandLeaveEncashment)}</p>
                                </div>
                            </div>
                        </div>

                        {/* 3. Future Projections */}
                        <div className="bg-white rounded-lg shadow p-6">
                            <h3 className="text-xl font-bold border-b pb-2 mb-4 text-gray-800">Future Growth Projections</h3>

                            <div className="flex gap-4 mb-4">
                                <div>
                                    <label className="text-xs text-gray-500 block">Expected Annual Hike (%)</label>
                                    <input type="number" value={expectedHike} onChange={e => setExpectedHike(e.target.value)} className="w-full p-2 border rounded" />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500 block">Project Years</label>
                                    <input type="number" value={yearsToProject} onChange={e => setYearsToProject(e.target.value)} className="w-full p-2 border rounded" min="1" max="50" />
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm text-left">
                                    <thead className="bg-gray-100 text-gray-600">
                                        <tr>
                                            <th className="p-2">Timeline</th>
                                            <th className="p-2">Proj. CTC</th>
                                            <th className="p-2">In-Hand Salary/mo</th>
                                            <th className="p-2">Yearly Tax</th>
                                            <th className="p-2">Yearly PF</th>
                                            <th className="p-2">Gratuity Value</th>
                                            <th className="p-2">{accruedLeaves} Leaves Value</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {projectionData.map((pd, index) => (
                                            <tr key={index} className="border-b">
                                                <td className="p-2 text-indigo-600 font-medium">{pd.year}</td>
                                                <td className="p-2 font-bold">{formatCurrency(pd.ctc)}</td>
                                                <td className="p-2 text-orange-600 font-medium">{formatCurrency(pd.inHand)}</td>
                                                <td className="p-2 text-red-600">{formatCurrency(pd.tax)}</td>
                                                <td className="p-2 text-teal-600">{formatCurrency(pd.epf)}</td>
                                                <td className="p-2 font-medium text-green-600">
                                                    {formatCurrency(pd.inHandGratuity)}
                                                    <div className="text-[10px] text-gray-400 font-normal mt-0.5">Gross: {formatCurrency(pd.gratuity)}</div>
                                                </td>
                                                <td className="p-2 font-medium text-blue-600">
                                                    {formatCurrency(pd.inHandLeave)}
                                                    <div className="text-[10px] text-gray-400 font-normal mt-0.5">Gross: {formatCurrency(pd.leave)}</div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {/* 4. Salary History & XIRR Chart */}
                    <div className="bg-white rounded-lg shadow p-6">
                        <div className="flex justify-between items-center mb-6 border-b pb-2">
                            <h3 className="text-xl font-bold text-gray-800">Salary Growth History</h3>
                            {history.length > 1 && (
                                <div className="text-right">
                                    <p className="text-xs text-gray-500">Historical Annual Growth Rate (CAGR)</p>
                                    <p className="text-lg font-bold text-purple-600">{growthRate.toFixed(2)}% p.a.</p>
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            <div className="lg:col-span-1">
                                <form onSubmit={handleAddHistory} className="bg-gray-50 p-4 rounded shadow-sm mb-6 space-y-3 border">
                                    <h4 className="font-semibold text-gray-700">Log Salary Event</h4>
                                    <div>
                                        <label className="text-xs text-gray-600">Event Date</label>
                                        <input type="date" value={histDate} onChange={e => setHistDate(e.target.value)} required className="w-full p-1.5 border rounded" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-600">New CTC</label>
                                        <input type="number" value={histCtc} onChange={e => setHistCtc(e.target.value)} required className="w-full p-1.5 border rounded" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-600">Event Type</label>
                                        <select value={histType} onChange={e => setHistType(e.target.value)} className="w-full p-1.5 border rounded">
                                            <option>Joining</option>
                                            <option>Hike</option>
                                            <option>Promotion</option>
                                            <option>Market Correction</option>
                                        </select>
                                    </div>
                                    <button type="submit" className="w-full bg-indigo-600 text-white py-1.5 rounded hover:bg-indigo-700">Add Record</button>
                                </form>

                                <div className="max-h-[300px] overflow-y-auto">
                                    {history.map(h => (
                                        <div key={h.id} className="flex justify-between items-center p-2 border-b text-sm hover:bg-gray-50">
                                            <div>
                                                <p className="font-semibold text-gray-800">{new Date(h.date).toLocaleDateString()}</p>
                                                <p className="text-xs text-gray-500">{h.event_type}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-bold text-gray-900">{formatCurrency(h.ctc)}</p>
                                                <button onClick={() => handleDeleteHistory(h.id)} className="text-red-500 text-xs hover:underline mt-1">Delete</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="lg:col-span-2 h-[400px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="year" />
                                        <YAxis tickFormatter={(val) => `₹${(val / 100000).toFixed(1)}L`} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend />
                                        <Line type="monotone" dataKey="actual_ctc" name="Historical CTC" stroke="#8884d8" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 8 }} />
                                        <Line type="monotone" dataKey="projected_ctc" name="Projected CTC" stroke="#82ca9d" strokeWidth={2} strokeDasharray="5 5" />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
