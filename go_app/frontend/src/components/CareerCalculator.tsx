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
import { FICrossoverCard, calculateTaxesNewRegime, calculateTaxOnLumpSum } from './FICrossoverCard';

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

    // Hike Comparator states
    const [hikeA, setHikeA] = useState('10');
    const [hikeB, setHikeB] = useState('15');
    const [compareYears, setCompareYears] = useState('5');

    // Historical What-If states
    const [selectedHistId, setSelectedHistId] = useState('');
    const [hypoHistHike, setHypoHistHike] = useState('10');

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
    const taxWithLeave = calculateTaxOnLumpSum(taxData.taxableIncome, currentLeaveEncashment);
    const inHandLeaveEncashment = currentLeaveEncashment - (taxWithLeave - taxData.totalTax);

    const taxableGratuity = Math.max(0, currentGratuity - 2000000); // Exclude first 20 Lakhs
    const taxWithGrat = calculateTaxOnLumpSum(taxData.taxableIncome, taxableGratuity);
    const inHandGratuity = currentGratuity - (taxWithGrat - taxData.totalTax);

    // Projections
    const hikeRate = (parseFloat(expectedHike) || 0) / 100;
    const projYears = parseInt(yearsToProject) || 5;

    const combinedData: any[] = [];
    const chartData: any[] = [];

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

    // Construct History Data
    let prevHistCtc = 0;
    let prevHistTaxData: any = null;

    history.forEach((h, idx) => {
        const ctc = h.ctc;
        const curDate = new Date(h.date);

        chartData.push({
            year: curDate.getFullYear().toString() + '-' + (curDate.getMonth() + 1),
            actual_ctc: ctc,
            cagr_since_join: idx === 0 ? null : getPointCAGR(ctc, curDate)
        });

        const yos = jobDetails ? (curDate.getTime() - new Date(jobDetails.joining_date).getTime()) / (1000 * 60 * 60 * 24 * 365.25) : 0;
        const taxData = calculateTaxesNewRegime(ctc);

        const monBase = ctc / 24;
        const daily = monBase / 30;

        const grat = yos >= 4.8 ? Math.round(monBase * (15 / 26) * Math.round(yos)) : 0;
        const leave = daily * (parseFloat(accruedLeaves) || 0);

        const taxWithLeave = calculateTaxOnLumpSum(taxData.taxableIncome, leave);
        const inHandLeave = leave - (taxWithLeave - taxData.totalTax);

        const taxableGrat = Math.max(0, grat - 2000000);
        const taxWithGrat = calculateTaxOnLumpSum(taxData.taxableIncome, taxableGrat);
        const inHandGrat = grat - (taxWithGrat - taxData.totalTax);

        let row: any = {
            year: `Act. ${curDate.getFullYear()}-${(curDate.getMonth() + 1).toString().padStart(2, '0')}`,
            event: h.event_type,
            ctc: ctc,
            inHand: taxData.monthlyInHand,
            tax: taxData.totalTax,
            epf: taxData.epf,
            gratuity: grat,
            inHandGratuity: inHandGrat,
            leave: leave,
            inHandLeave: inHandLeave,
            isFirst: false,
            isPast: true,
        };

        if (idx === 0 || !prevHistTaxData) {
            row.isFirst = true;
            row.grossIncrease = 0;
            row.inHandIncrease = 0;
            row.taxIncrease = 0;
            row.epfIncrease = 0;
            row.gratuityIncrease = 0;
            row.gratuityNetIncrease = 0;
            row.leaveIncrease = 0;
            row.leaveNetIncrease = 0;
            row.totalGrossIncrease = 0;
            row.totalNetIncrease = 0;
        } else {
            row.grossIncrease = ctc - prevHistCtc;
            row.inHandIncrease = taxData.monthlyInHand - prevHistTaxData.monthlyInHand;
            row.taxIncrease = taxData.totalTax - prevHistTaxData.totalTax;
            row.epfIncrease = taxData.epf - prevHistTaxData.epf;

            const prevMonBase = prevHistCtc / 24;
            const prevDaily = prevMonBase / 30;
            const gratAtZeroHike = yos >= 4.8 ? Math.round(prevMonBase * (15 / 26) * Math.round(yos)) : 0;
            const leaveAtZeroHike = prevDaily * (parseFloat(accruedLeaves) || 0);

            const taxWithGrat0 = calculateTaxOnLumpSum(prevHistTaxData.taxableIncome, Math.max(0, gratAtZeroHike - 2000000));
            const inHandGrat0 = gratAtZeroHike - (taxWithGrat0 - prevHistTaxData.totalTax);

            const taxWithLeave0 = calculateTaxOnLumpSum(prevHistTaxData.taxableIncome, leaveAtZeroHike);
            const inHandLeave0 = leaveAtZeroHike - (taxWithLeave0 - prevHistTaxData.totalTax);

            row.gratuityIncrease = grat - gratAtZeroHike;
            row.gratuityNetIncrease = inHandGrat - inHandGrat0;
            row.leaveIncrease = leave - leaveAtZeroHike;
            row.leaveNetIncrease = inHandLeave - inHandLeave0;

            row.totalGrossIncrease = row.grossIncrease + row.gratuityIncrease + row.leaveIncrease;
            row.totalNetIncrease = (row.inHandIncrease * 12) + row.gratuityNetIncrease + row.leaveNetIncrease;
        }

        combinedData.push(row);

        prevHistCtc = ctc;
        prevHistTaxData = taxData;
    });

    const lastActCtc = history.length > 0 ? history[history.length - 1].ctc : currentCtcVal;
    const lastDate = history.length > 0 ? new Date(history[history.length - 1].date) : new Date();

    // Create simulated future
    let simCtc = lastActCtc || currentCtcVal;
    let simYos = yearsOfService;

    // Track previous values for YoY delta calculation
    let prevCtc = simCtc;
    let prevSimTaxData = calculateTaxesNewRegime(simCtc);
    let prevInHandMonthly = prevSimTaxData.monthlyInHand;
    let prevTaxYearly = prevSimTaxData.totalTax;
    let prevEpfYearly = prevSimTaxData.epf;

    for (let i = 1; i <= projYears; i++) {
        simCtc = prevCtc * (1 + hikeRate);
        simYos += 1;

        const projDate = new Date(lastDate);
        projDate.setFullYear(projDate.getFullYear() + i);

        const simMonBase = simCtc / 24;
        const simDaily = simMonBase / 30;
        const simTaxData = calculateTaxesNewRegime(simCtc);

        const simGrat = simYos >= 4.8 ? Math.round(simMonBase * (15 / 26) * Math.round(simYos)) : 0;
        const simLeave = simDaily * (parseFloat(accruedLeaves) || 0);

        const simTaxWithLeave = calculateTaxOnLumpSum(simTaxData.taxableIncome, simLeave);
        const simInHandLeave = simLeave - (simTaxWithLeave - simTaxData.totalTax);

        const simTaxableGrat = Math.max(0, simGrat - 2000000);
        const simTaxWithGrat = calculateTaxOnLumpSum(simTaxData.taxableIncome, simTaxableGrat);
        const simInHandGrat = simGrat - (simTaxWithGrat - simTaxData.totalTax);

        const grossIncrease = simCtc - prevCtc;
        const inhandIncreaseMonthly = simTaxData.monthlyInHand - prevInHandMonthly;

        const taxIncreaseYearly = simTaxData.totalTax - prevTaxYearly;
        const epfIncreaseYearly = simTaxData.epf - prevEpfYearly;

        const prevMonBase = prevCtc / 24;
        const prevDaily = prevMonBase / 30;
        const gratAtZeroHike = simYos >= 4.8 ? Math.round(prevMonBase * (15 / 26) * Math.round(simYos)) : 0;
        const leaveAtZeroHike = prevDaily * (parseFloat(accruedLeaves) || 0);

        const taxWithGrat0 = calculateTaxOnLumpSum(prevSimTaxData.taxableIncome, Math.max(0, gratAtZeroHike - 2000000));
        const inHandGrat0 = gratAtZeroHike - (taxWithGrat0 - prevTaxYearly);

        const taxWithLeave0 = calculateTaxOnLumpSum(prevSimTaxData.taxableIncome, leaveAtZeroHike);
        const inHandLeave0 = leaveAtZeroHike - (taxWithLeave0 - prevTaxYearly);

        const gratuityIncrease = simGrat - gratAtZeroHike;
        const gratuityNetIncrease = simInHandGrat - inHandGrat0;
        const leaveIncrease = simLeave - leaveAtZeroHike;
        const leaveNetIncrease = simInHandLeave - inHandLeave0;

        const totalGrossIncrease = grossIncrease + gratuityIncrease + leaveIncrease;
        const totalNetIncrease = (inhandIncreaseMonthly * 12) + gratuityNetIncrease + leaveNetIncrease;

        combinedData.push({
            year: `Proj. +${i} Yr`,
            ctc: simCtc,
            grossIncrease: grossIncrease,
            inHand: simTaxData.monthlyInHand,
            inHandIncrease: inhandIncreaseMonthly,
            tax: simTaxData.totalTax,
            taxIncrease: taxIncreaseYearly,
            epf: simTaxData.epf,
            epfIncrease: epfIncreaseYearly,
            gratuity: simGrat,
            gratuityIncrease: gratuityIncrease,
            gratuityNetIncrease: gratuityNetIncrease,
            inHandGratuity: simInHandGrat,
            leave: simLeave,
            leaveIncrease: leaveIncrease,
            leaveNetIncrease: leaveNetIncrease,
            inHandLeave: simInHandLeave,
            totalGrossIncrease,
            totalNetIncrease,
            isFirst: false,
            isPast: false
        });

        chartData.push({
            year: `+${i} Yr`,
            projected_ctc: Math.round(simCtc),
            cagr_since_join: getPointCAGR(simCtc, projDate)
        });

        prevCtc = simCtc;
        prevSimTaxData = simTaxData;
        prevInHandMonthly = simTaxData.monthlyInHand;
        prevTaxYearly = simTaxData.totalTax;
        prevEpfYearly = simTaxData.epf;
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
                                        <div className="p-3 bg-indigo-50 rounded border border-indigo-100 shadow-sm flex flex-col justify-center">
                                            <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-1">True Working Rate</p>
                                            <div className="grid grid-cols-2 gap-1 mt-1 text-xs">
                                                <div>
                                                    <p className="text-[10px] text-indigo-400">Net/Day</p>
                                                    <p className="font-bold text-indigo-900">{formatCurrency((sim.monthlyInHand * 12) / 251)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] text-indigo-400">Gross/Day</p>
                                                    <p className="font-bold text-indigo-900">{formatCurrency(ctcVal / 251)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] text-indigo-400">Net/Hour</p>
                                                    <p className="font-bold text-indigo-900">{formatCurrency((sim.monthlyInHand * 12) / 2008)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] text-indigo-400">Gross/Hour</p>
                                                    <p className="font-bold text-indigo-900">{formatCurrency(ctcVal / 2008)}</p>
                                                </div>
                                            </div>
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
                                    <div className="flex justify-between items-end mb-4">
                                        <div>
                                            <p className="text-2xl font-bold text-orange-700">{formatCurrency(taxData.monthlyInHand)}<span className="text-sm font-normal text-gray-600"> /mo</span></p>
                                            <p className="text-xs text-gray-500 mt-1">Standard Daily: {formatCurrency(dailyInHand)} | Hourly: {formatCurrency(dailyInHand / 8)} | Tax: {formatCurrency(taxData.totalTax)}</p>
                                        </div>
                                    </div>
                                    <div className="bg-white/60 rounded p-3 text-sm text-gray-700 space-y-2 border border-orange-200 shadow-sm">
                                        <p className="font-semibold border-b border-orange-200 pb-1 mb-2 text-xs text-orange-800 uppercase tracking-wide">True Working Rate (251 Days / 2008 Hrs)</p>
                                        <div className="flex justify-between items-center">
                                            <span className="text-gray-600 text-xs font-medium">Net In-Hand</span>
                                            <span className="font-bold text-orange-800">{formatCurrency((taxData.monthlyInHand * 12) / 251)}/day <span className="text-gray-400 mx-1">|</span> {formatCurrency((taxData.monthlyInHand * 12) / 2008)}/hr</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-gray-600 text-xs font-medium">Gross CTC</span>
                                            <span className="font-bold text-gray-800">{formatCurrency(currentCtcVal / 251)}/day <span className="text-gray-400 mx-1">|</span> {formatCurrency(currentCtcVal / 2008)}/hr</span>
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
                                            <th className="p-2">CTC</th>
                                            <th className="p-2">In-Hand Salary/mo</th>
                                            <th className="p-2">Yearly Tax</th>
                                            <th className="p-2">Yearly PF</th>
                                            <th className="p-2">Gratuity Value</th>
                                            <th className="p-2">{accruedLeaves} Leaves Value</th>
                                            <th className="p-2 bg-indigo-50 border-l border-indigo-100">Total Increment (Gross)</th>
                                            <th className="p-2 bg-indigo-50">Total Increment (Net)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {combinedData.filter((d: any) => !d.isPast).map((pd: any, index: number) => (
                                            <tr key={index} className={`border-b ${pd.isPast ? 'bg-orange-50/30' : ''}`}>
                                                <td className={`p-2 font-medium ${pd.isPast ? 'text-orange-700' : 'text-indigo-600'}`}>
                                                    {pd.year}
                                                    {pd.event && <div className="text-[10px] text-gray-500">{pd.event}</div>}
                                                </td>
                                                <td className="p-2 font-bold">
                                                    {formatCurrency(pd.ctc)}
                                                    {!pd.isFirst && <div className="text-[10px] text-green-600 font-semibold mt-0.5 whitespace-nowrap">▲ {formatCurrency(pd.grossIncrease)} Gross</div>}
                                                </td>
                                                <td className="p-2 text-orange-600 font-medium">
                                                    {formatCurrency(pd.inHand)}
                                                    {!pd.isFirst && <div className="text-[10px] text-green-600 font-semibold mt-0.5 whitespace-nowrap">▲ {formatCurrency(pd.inHandIncrease)} /mo In-Hand</div>}
                                                </td>
                                                <td className="p-2 text-red-600">
                                                    {formatCurrency(pd.tax)}
                                                    {!pd.isFirst && <div className="text-[10px] text-red-400 font-semibold mt-0.5 whitespace-nowrap">{pd.taxIncrease > 0 ? '▼ -' : '▲ +'}{formatCurrency(Math.abs(pd.taxIncrease))} Tax Heat</div>}
                                                </td>
                                                <td className="p-2 text-teal-600">
                                                    {formatCurrency(pd.epf)}
                                                    {!pd.isFirst && <div className="text-[10px] text-teal-500 font-semibold mt-0.5 whitespace-nowrap">▲ {formatCurrency(pd.epfIncrease)} Forced EPF</div>}
                                                </td>
                                                <td className="p-2 font-medium text-green-600">
                                                    {formatCurrency(pd.inHandGratuity)}
                                                    <div className="text-[10px] text-gray-400 font-normal mt-0.5">Gross: {formatCurrency(pd.gratuity)}</div>
                                                    {!pd.isFirst && (
                                                        <>
                                                            <div className="text-[10px] text-green-700 font-semibold mt-0.5">▲ {formatCurrency(pd.gratuityNetIncrease)} Net Incr</div>
                                                            <div className="text-[10px] text-gray-500 font-normal mt-0.5">▲ {formatCurrency(pd.gratuityIncrease)} Gross Incr</div>
                                                        </>
                                                    )}
                                                </td>
                                                <td className="p-2 font-medium text-blue-600">
                                                    {formatCurrency(pd.inHandLeave)}
                                                    <div className="text-[10px] text-gray-400 font-normal mt-0.5">Gross: {formatCurrency(pd.leave)}</div>
                                                    {!pd.isFirst && (
                                                        <>
                                                            <div className="text-[10px] text-green-700 font-semibold mt-0.5">▲ {formatCurrency(pd.leaveNetIncrease)} Net Incr</div>
                                                            <div className="text-[10px] text-gray-500 font-normal mt-0.5">▲ {formatCurrency(pd.leaveIncrease)} Gross Incr</div>
                                                        </>
                                                    )}
                                                </td>
                                                <td className="p-2 font-extrabold text-gray-900 bg-indigo-50 border-l border-indigo-100">
                                                    {!pd.isFirst ? (
                                                        <>
                                                            <span className="text-green-700">+ {formatCurrency(pd.totalGrossIncrease)}</span>
                                                            <div className="text-[10px] text-gray-500 font-normal mt-1 whitespace-nowrap">
                                                                <div>CTC <span className="text-green-600 font-medium">+{formatCurrency(pd.grossIncrease)}</span></div>
                                                                <div>Grat <span className="text-green-600 font-medium">+{formatCurrency(pd.gratuityIncrease)}</span></div>
                                                                <div>Leave <span className="text-green-600 font-medium">+{formatCurrency(pd.leaveIncrease)}</span></div>
                                                            </div>
                                                        </>
                                                    ) : <span className="text-gray-400 italic font-medium">Baseline</span>}
                                                </td>
                                                <td className="p-2 font-extrabold text-gray-900 bg-indigo-50">
                                                    {!pd.isFirst ? (
                                                        <>
                                                            <span className="text-green-700">+ {formatCurrency(pd.totalNetIncrease)}</span>
                                                            <div className="text-[10px] text-gray-500 font-normal mt-1 whitespace-nowrap">
                                                                <div>Salary (Yr) <span className="text-green-600 font-medium">+{formatCurrency(pd.inHandIncrease * 12)}</span></div>
                                                                <div>Grat <span className="text-green-600 font-medium">+{formatCurrency(pd.gratuityNetIncrease)}</span></div>
                                                                <div>Leave <span className="text-green-600 font-medium">+{formatCurrency(pd.leaveNetIncrease)}</span></div>
                                                            </div>
                                                        </>
                                                    ) : <span className="text-gray-400 italic font-medium">Baseline</span>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* 3.5 Hike Comparator */}
                        <div className="bg-white rounded-lg shadow p-6 border-t-4 border-purple-500">
                            <h3 className="text-xl font-bold border-b pb-2 mb-4 text-gray-800">Hike % Comparator</h3>
                            <div className="flex flex-wrap gap-4 mb-4">
                                <div>
                                    <label className="text-xs text-gray-500 block">Scenario A Hike (%)</label>
                                    <input type="number" value={hikeA} onChange={e => setHikeA(e.target.value)} className="w-full p-2 border rounded border-gray-300 focus:border-purple-500 focus:ring-purple-500" />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500 block">Scenario B Hike (%)</label>
                                    <input type="number" value={hikeB} onChange={e => setHikeB(e.target.value)} className="w-full p-2 border rounded border-gray-300 focus:border-purple-500 focus:ring-purple-500" />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500 block">Years to Compare</label>
                                    <input type="number" value={compareYears} onChange={e => setCompareYears(e.target.value)} className="w-full p-2 border rounded border-gray-300 focus:border-purple-500 focus:ring-purple-500" min="1" max="20" />
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm text-left">
                                    <thead className="bg-gray-100 text-gray-600">
                                        <tr>
                                            <th className="p-2">Timeline</th>
                                            <th className="p-2 border-l border-indigo-100 bg-indigo-50/30">Scenario A ({hikeA}%)</th>
                                            <th className="p-2 border-l border-green-100 bg-green-50/30">Scenario B ({hikeB}%)</th>
                                            <th className="p-2 border-l border-purple-100 bg-purple-50">Total Gross Diff (B-A)</th>
                                            <th className="p-2 border-l border-orange-100 bg-orange-50">Total Net Diff (B-A)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(() => {
                                            const comparatorData = [];
                                            let simCtcA = lastActCtc || currentCtcVal;
                                            let simCtcB = lastActCtc || currentCtcVal;
                                            let cA = parseFloat(hikeA) || 0;
                                            let cB = parseFloat(hikeB) || 0;
                                            let cYears = parseInt(compareYears) || 5;
                                            let yosA = yearsOfService;
                                            let yosB = yearsOfService;

                                            for (let i = 1; i <= cYears; i++) {
                                                simCtcA = simCtcA * (1 + (cA / 100));
                                                simCtcB = simCtcB * (1 + (cB / 100));
                                                yosA += 1;
                                                yosB += 1;

                                                const taxA = calculateTaxesNewRegime(simCtcA);
                                                const taxB = calculateTaxesNewRegime(simCtcB);

                                                // Gross components
                                                const gratA = yosA >= 4.8 ? Math.round((simCtcA / 24) * (15 / 26) * Math.round(yosA)) : 0;
                                                const gratB = yosB >= 4.8 ? Math.round((simCtcB / 24) * (15 / 26) * Math.round(yosB)) : 0;

                                                const leaveA = ((simCtcA / 24) / 30) * (parseFloat(accruedLeaves) || 0);
                                                const leaveB = ((simCtcB / 24) / 30) * (parseFloat(accruedLeaves) || 0);

                                                // Net components
                                                const taxWithGratA = calculateTaxOnLumpSum(taxA.taxableIncome, Math.max(0, gratA - 2000000));
                                                const inHandGratA = gratA - (taxWithGratA - taxA.totalTax);

                                                const taxWithGratB = calculateTaxOnLumpSum(taxB.taxableIncome, Math.max(0, gratB - 2000000));
                                                const inHandGratB = gratB - (taxWithGratB - taxB.totalTax);

                                                const taxWithLeaveA = calculateTaxOnLumpSum(taxA.taxableIncome, leaveA);
                                                const inHandLeaveA = leaveA - (taxWithLeaveA - taxA.totalTax);

                                                const taxWithLeaveB = calculateTaxOnLumpSum(taxB.taxableIncome, leaveB);
                                                const inHandLeaveB = leaveB - (taxWithLeaveB - taxB.totalTax);

                                                comparatorData.push({
                                                    year: `+${i} Yr`,
                                                    ctcA: simCtcA,
                                                    ctcB: simCtcB,
                                                    inHandA: taxA.monthlyInHand,
                                                    inHandB: taxB.monthlyInHand,
                                                    gratA, gratB, inHandGratA, inHandGratB,
                                                    leaveA, leaveB, inHandLeaveA, inHandLeaveB
                                                });
                                            }

                                            return comparatorData.map((d, index) => {
                                                const diffCtc = d.ctcB - d.ctcA;
                                                const diffGrat = d.gratB - d.gratA;
                                                const diffLeave = d.leaveB - d.leaveA;
                                                const totalGrossDiff = diffCtc + diffGrat + diffLeave;

                                                const inHandYearlyA = d.inHandA * 12;
                                                const inHandYearlyB = d.inHandB * 12;
                                                const diffInHandYearly = inHandYearlyB - inHandYearlyA;
                                                const diffInHandGrat = d.inHandGratB - d.inHandGratA;
                                                const diffInHandLeave = d.inHandLeaveB - d.inHandLeaveA;
                                                const totalNetDiff = diffInHandYearly + diffInHandGrat + diffInHandLeave;

                                                const isGrossBetter = totalGrossDiff >= 0;
                                                const isNetBetter = totalNetDiff >= 0;

                                                return (
                                                    <tr key={index} className="border-b hover:bg-gray-50">
                                                        <td className="p-2 font-medium text-gray-700">{d.year}</td>
                                                        <td className="p-2 border-l border-indigo-100 bg-indigo-50/10">
                                                            <div className="font-bold text-gray-800">{formatCurrency(d.ctcA)}</div>
                                                            <div className="text-xs text-orange-600 mt-1">Net: {formatCurrency(d.inHandA)} /mo</div>
                                                            <div className="text-[10px] text-gray-500 mt-0.5">Grat: {formatCurrency(d.gratA)} | Leave: {formatCurrency(d.leaveA)}</div>
                                                        </td>
                                                        <td className="p-2 border-l border-green-100 bg-green-50/10">
                                                            <div className="font-bold text-gray-800">{formatCurrency(d.ctcB)}</div>
                                                            <div className="text-xs text-orange-600 mt-1">Net: {formatCurrency(d.inHandB)} /mo</div>
                                                            <div className="text-[10px] text-gray-500 mt-0.5">Grat: {formatCurrency(d.gratB)} | Leave: {formatCurrency(d.leaveB)}</div>
                                                        </td>
                                                        <td className={`p-2 border-l border-purple-100 bg-purple-50/30 ${isGrossBetter ? 'text-green-700' : 'text-red-600'}`}>
                                                            <div className="font-bold">
                                                                {isGrossBetter ? '+ ' : '- '}{formatCurrency(Math.abs(totalGrossDiff))}
                                                            </div>
                                                            <div className="text-[10px] text-gray-500 mt-1">
                                                                CTC: {diffCtc >= 0 ? '+' : '-'}{formatCurrency(Math.abs(diffCtc))}
                                                            </div>
                                                            <div className="text-[10px] text-gray-500">
                                                                Grat: {diffGrat >= 0 ? '+' : '-'}{formatCurrency(Math.abs(diffGrat))}
                                                            </div>
                                                            <div className="text-[10px] text-gray-500">
                                                                Leave: {diffLeave >= 0 ? '+' : '-'}{formatCurrency(Math.abs(diffLeave))}
                                                            </div>
                                                        </td>
                                                        <td className={`p-2 border-l border-orange-100 bg-orange-50/30 ${isNetBetter ? 'text-green-700' : 'text-red-600'}`}>
                                                            <div className="font-bold">
                                                                {isNetBetter ? '+ ' : '- '}{formatCurrency(Math.abs(totalNetDiff))}
                                                            </div>
                                                            <div className="text-[10px] text-gray-500 mt-1">
                                                                Salary/yr: {diffInHandYearly >= 0 ? '+' : '-'}{formatCurrency(Math.abs(diffInHandYearly))}
                                                            </div>
                                                            <div className="text-[10px] text-gray-500">
                                                                Grat: {diffInHandGrat >= 0 ? '+' : '-'}{formatCurrency(Math.abs(diffInHandGrat))}
                                                            </div>
                                                            <div className="text-[10px] text-gray-500">
                                                                Leave: {diffInHandLeave >= 0 ? '+' : '-'}{formatCurrency(Math.abs(diffInHandLeave))}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            });
                                        })()}
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

                    {/* 5. Salary History Unified Table */}
                    <div className="mt-8">
                        <h3 className="text-xl font-bold border-b pb-2 mb-4 text-gray-800">Historical Growth Metrics</h3>
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm text-left">
                                <thead className="bg-gray-100 text-gray-600">
                                    <tr>
                                        <th className="p-2">Timeline</th>
                                        <th className="p-2">CTC</th>
                                        <th className="p-2">In-Hand Salary/mo</th>
                                        <th className="p-2">Yearly Tax</th>
                                        <th className="p-2">Yearly PF</th>
                                        <th className="p-2">Gratuity Value</th>
                                        <th className="p-2">{accruedLeaves} Leaves Value</th>
                                        <th className="p-2 bg-indigo-50 border-l border-indigo-100">Total Increment (Gross)</th>
                                        <th className="p-2 bg-indigo-50">Total Increment (Net)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {combinedData.filter((d: any) => d.isPast).reverse().map((pd: any, index: number) => (
                                        <tr key={index} className={`border-b ${pd.isPast ? 'bg-orange-50/30' : ''}`}>
                                            <td className={`p-2 font-medium ${pd.isPast ? 'text-orange-700' : 'text-indigo-600'}`}>
                                                {pd.year}
                                                {pd.event && <div className="text-[10px] text-gray-500">{pd.event}</div>}
                                            </td>
                                            <td className="p-2 font-bold">
                                                {formatCurrency(pd.ctc)}
                                                {!pd.isFirst && <div className="text-[10px] text-green-600 font-semibold mt-0.5 whitespace-nowrap">▲ {formatCurrency(pd.grossIncrease)} Gross</div>}
                                            </td>
                                            <td className="p-2 text-orange-600 font-medium">
                                                {formatCurrency(pd.inHand)}
                                                {!pd.isFirst && <div className="text-[10px] text-green-600 font-semibold mt-0.5 whitespace-nowrap">▲ {formatCurrency(pd.inHandIncrease)} /mo In-Hand</div>}
                                            </td>
                                            <td className="p-2 text-red-600">
                                                {formatCurrency(pd.tax)}
                                                {!pd.isFirst && <div className="text-[10px] text-red-400 font-semibold mt-0.5 whitespace-nowrap">{pd.taxIncrease > 0 ? '▼ -' : '▲ +'}{formatCurrency(Math.abs(pd.taxIncrease))} Tax Heat</div>}
                                            </td>
                                            <td className="p-2 text-teal-600">
                                                {formatCurrency(pd.epf)}
                                                {!pd.isFirst && <div className="text-[10px] text-teal-500 font-semibold mt-0.5 whitespace-nowrap">▲ {formatCurrency(pd.epfIncrease)} Forced EPF</div>}
                                            </td>
                                            <td className="p-2 font-medium text-green-600">
                                                {formatCurrency(pd.inHandGratuity)}
                                                <div className="text-[10px] text-gray-400 font-normal mt-0.5">Gross: {formatCurrency(pd.gratuity)}</div>
                                                {!pd.isFirst && (
                                                    <>
                                                        <div className="text-[10px] text-green-700 font-semibold mt-0.5">▲ {formatCurrency(pd.gratuityNetIncrease)} Net Incr</div>
                                                        <div className="text-[10px] text-gray-500 font-normal mt-0.5">▲ {formatCurrency(pd.gratuityIncrease)} Gross Incr</div>
                                                    </>
                                                )}
                                            </td>
                                            <td className="p-2 font-medium text-blue-600">
                                                {formatCurrency(pd.inHandLeave)}
                                                <div className="text-[10px] text-gray-400 font-normal mt-0.5">Gross: {formatCurrency(pd.leave)}</div>
                                                {!pd.isFirst && (
                                                    <>
                                                        <div className="text-[10px] text-green-700 font-semibold mt-0.5">▲ {formatCurrency(pd.leaveNetIncrease)} Net Incr</div>
                                                        <div className="text-[10px] text-gray-500 font-normal mt-0.5">▲ {formatCurrency(pd.leaveIncrease)} Gross Incr</div>
                                                    </>
                                                )}
                                            </td>
                                            <td className="p-2 font-extrabold text-gray-900 bg-indigo-50 border-l border-indigo-100">
                                                {!pd.isFirst ? (
                                                    <>
                                                        <span className="text-green-700">+ {formatCurrency(pd.totalGrossIncrease)}</span>
                                                        <div className="text-[10px] text-gray-500 font-normal mt-1 whitespace-nowrap">
                                                            <div>CTC <span className="text-green-600 font-medium">+{formatCurrency(pd.grossIncrease)}</span></div>
                                                            <div>Grat <span className="text-green-600 font-medium">+{formatCurrency(pd.gratuityIncrease)}</span></div>
                                                            <div>Leave <span className="text-green-600 font-medium">+{formatCurrency(pd.leaveIncrease)}</span></div>
                                                        </div>
                                                    </>
                                                ) : <span className="text-gray-400 italic font-medium">Baseline</span>}
                                            </td>
                                            <td className="p-2 font-extrabold text-gray-900 bg-indigo-50">
                                                {!pd.isFirst ? (
                                                    <>
                                                        <span className="text-green-700">+ {formatCurrency(pd.totalNetIncrease)}</span>
                                                        <div className="text-[10px] text-gray-500 font-normal mt-1 whitespace-nowrap">
                                                            <div>Salary (Yr) <span className="text-green-600 font-medium">+{formatCurrency(pd.inHandIncrease * 12)}</span></div>
                                                            <div>Grat <span className="text-green-600 font-medium">+{formatCurrency(pd.gratuityNetIncrease)}</span></div>
                                                            <div>Leave <span className="text-green-600 font-medium">+{formatCurrency(pd.leaveNetIncrease)}</span></div>
                                                        </div>
                                                    </>
                                                ) : <span className="text-gray-400 italic font-medium">Baseline</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* 6. Historical What-If Analyzer */}
                    {history.length > 1 && (
                        <div className="mt-8 bg-white rounded-lg shadow p-6 border-t-4 border-pink-500">
                            <h3 className="text-xl font-bold border-b pb-2 mb-4 text-gray-800">Historical Hike "What-If"</h3>
                            <div className="flex flex-wrap gap-4 mb-6">
                                <div className="w-full md:w-1/3">
                                    <label className="text-xs text-gray-500 block">Select Historical Event</label>
                                    <select value={selectedHistId} onChange={e => setSelectedHistId(e.target.value)} className="w-full p-2 border rounded border-gray-300 focus:border-pink-500 focus:ring-pink-500">
                                        <option value="">-- Select an Event --</option>
                                        {history.map((h, i) => i > 0 && (
                                            <option key={h.id} value={h.id.toString()}>
                                                {new Date(h.date).toLocaleDateString()} - {h.event_type} (Actual: {formatCurrency(h.ctc)})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                {selectedHistId && (
                                    <div className="w-full md:w-1/4">
                                        <label className="text-xs text-gray-500 block">Hypothetical Hike (%)</label>
                                        <input type="number" value={hypoHistHike} onChange={e => setHypoHistHike(e.target.value)} className="w-full p-2 border rounded border-gray-300 focus:border-pink-500 focus:ring-pink-500" />
                                    </div>
                                )}
                            </div>

                            {selectedHistId && (() => {
                                const histIdx = history.findIndex(h => h.id.toString() === selectedHistId);
                                if (histIdx <= 0) return null;

                                const baselineCtc = history[histIdx - 1].ctc;
                                const actualEventCtc = history[histIdx].ctc;
                                const eventDate = new Date(history[histIdx].date);
                                const yosAtEvent = jobDetails ? (eventDate.getTime() - new Date(jobDetails.joining_date).getTime()) / (1000 * 60 * 60 * 24 * 365.25) : 0;

                                // Actual Math
                                const actualHikePct = ((actualEventCtc / baselineCtc) - 1) * 100;
                                const actualTax = calculateTaxesNewRegime(actualEventCtc);
                                const actualGrat = yosAtEvent >= 4.8 ? Math.round((actualEventCtc / 24) * (15 / 26) * Math.round(yosAtEvent)) : 0;
                                const actualLeave = ((actualEventCtc / 24) / 30) * (parseFloat(accruedLeaves) || 0);

                                // Hypothetical Math
                                const hypoPct = parseFloat(hypoHistHike) || 0;
                                const hypoCtc = baselineCtc * (1 + (hypoPct / 100));
                                const hypoTax = calculateTaxesNewRegime(hypoCtc);
                                const hypoGrat = yosAtEvent >= 4.8 ? Math.round((hypoCtc / 24) * (15 / 26) * Math.round(yosAtEvent)) : 0;
                                const hypoLeave = ((hypoCtc / 24) / 30) * (parseFloat(accruedLeaves) || 0);

                                const diffCtc = hypoCtc - actualEventCtc;
                                const diffInHand = hypoTax.monthlyInHand - actualTax.monthlyInHand;
                                const diffGrat = hypoGrat - actualGrat;
                                const diffLeave = hypoLeave - actualLeave;
                                const actualTotalGross = actualEventCtc + actualGrat + actualLeave;
                                const hypoTotalGross = hypoCtc + hypoGrat + hypoLeave;
                                const diffTotalGross = hypoTotalGross - actualTotalGross;

                                return (
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div className="p-4 bg-gray-50 rounded border border-gray-200">
                                            <p className="text-xs text-gray-500 uppercase font-semibold">Baseline (Before Event)</p>
                                            <p className="text-xl font-bold text-gray-800 mt-1">{formatCurrency(baselineCtc)}</p>
                                        </div>
                                        <div className="p-4 bg-orange-50 rounded border border-orange-100">
                                            <p className="text-xs text-orange-600 uppercase font-semibold">What Actually Happened</p>
                                            <div className="mt-2">
                                                <p className="text-2xl font-bold text-gray-900">{formatCurrency(actualEventCtc)}</p>
                                                <p className="text-sm font-medium text-orange-700 mt-1">Hike Received: {actualHikePct.toFixed(2)}%</p>
                                                <p className="text-xs text-gray-600 mt-1">In-Hand: {formatCurrency(actualTax.monthlyInHand)} /mo</p>
                                                <p className="text-[10px] text-gray-500 mt-0.5">Gross Grat: {formatCurrency(actualGrat)} | Gross Leave: {formatCurrency(actualLeave)}</p>
                                            </div>
                                        </div>
                                        <div className="p-4 bg-pink-50 rounded border border-pink-200 shadow-sm relative">
                                            <p className="text-xs text-pink-600 uppercase font-semibold">Hypothetical Scenario</p>
                                            <div className="mt-2">
                                                <p className="text-2xl font-bold text-pink-900">{formatCurrency(hypoCtc)}</p>
                                                <p className="text-sm font-medium text-pink-700 mt-1">If you got {hypoPct.toFixed(2)}%</p>
                                                <p className="text-xs text-gray-600 mt-1">In-Hand: {formatCurrency(hypoTax.monthlyInHand)} /mo</p>
                                                <p className="text-[10px] text-gray-500 mt-0.5">Gross Grat: {formatCurrency(hypoGrat)} | Gross Leave: {formatCurrency(hypoLeave)}</p>
                                            </div>

                                            <div className="mt-4 pt-3 border-t border-pink-200">
                                                <p className="text-[10px] uppercase font-bold text-gray-500">Difference vs Reality</p>
                                                <p className={`font-bold text-sm mt-1 ${diffTotalGross >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                    {diffTotalGross >= 0 ? '+' : ''}{formatCurrency(diffTotalGross)} Total Gross Diff
                                                </p>
                                                <p className={`font-semibold text-xs ${diffInHand >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                    {diffInHand >= 0 ? '+' : ''}{formatCurrency(diffInHand)} /mo Net In-Hand
                                                </p>
                                                <p className={`font-semibold text-[10px] ${diffInHand >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                    {diffInHand >= 0 ? '+' : ''}{formatCurrency(diffInHand * 12)} /yr Net In-Hand
                                                </p>
                                                <p className={`text-[10px] font-medium mt-1 ${diffCtc >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                    CTC Diff: {diffCtc >= 0 ? '+' : ''}{formatCurrency(diffCtc)} Gross
                                                </p>
                                                <p className={`text-[10px] font-medium ${diffGrat >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                    Gratuity Diff: {diffGrat >= 0 ? '+' : ''}{formatCurrency(diffGrat)} Gross
                                                </p>
                                                <p className={`text-[10px] font-medium ${diffLeave >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                    Leave Diff: {diffLeave >= 0 ? '+' : ''}{formatCurrency(diffLeave)} Gross
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
