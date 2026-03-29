import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { api } from '../api';
import type { JobDetails, PortfolioSummary } from '../types';

const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
    }).format(val);

const getBasicTax = (taxableIncome: number) => {
    if (taxableIncome <= 1200000) return 0; // Section 87A rebate up to 12 Lakhs

    let tax = 0;
    let income = taxableIncome;
    if (income > 2400000) { tax += (income - 2400000) * 0.30; income = 2400000; }
    if (income > 2000000) { tax += (income - 2000000) * 0.25; income = 2000000; }
    if (income > 1600000) { tax += (income - 1600000) * 0.20; income = 1600000; }
    if (income > 1200000) { tax += (income - 1200000) * 0.15; income = 1200000; }
    if (income > 800000) { tax += (income - 800000) * 0.10; income = 800000; }
    if (income > 400000) { tax += (income - 400000) * 0.05; }
    return Math.min(tax, taxableIncome - 1200000);
};

const getSurchargeWithRelief = (taxableIncome: number, basicTax: number) => {
    if (taxableIncome <= 5000000) return 0;
    if (taxableIncome <= 10000000) {
        const surcharge = basicTax * 0.10;
        const taxAt50L = getBasicTax(5000000);
        const maxAcceptableTotalTax = taxAt50L + (taxableIncome - 5000000);
        return (basicTax + surcharge) > maxAcceptableTotalTax ? (maxAcceptableTotalTax - basicTax) : surcharge;
    }
    if (taxableIncome <= 20000000) {
        const surcharge = basicTax * 0.15;
        const taxAt1Cr = getBasicTax(10000000);
        const taxWithSurchargeAt1Cr = taxAt1Cr + (taxAt1Cr * 0.10);
        const maxAcceptableTotalTax = taxWithSurchargeAt1Cr + (taxableIncome - 10000000);
        return (basicTax + surcharge) > maxAcceptableTotalTax ? (maxAcceptableTotalTax - basicTax) : surcharge;
    }
    const surcharge = basicTax * 0.25;
    const taxAt2Cr = getBasicTax(20000000);
    const taxWithSurchargeAt2Cr = taxAt2Cr + (taxAt2Cr * 0.15);
    const maxAcceptableTotalTax = taxWithSurchargeAt2Cr + (taxableIncome - 20000000);
    return (basicTax + surcharge) > maxAcceptableTotalTax ? (maxAcceptableTotalTax - basicTax) : surcharge;
};

export const calculateTaxesNewRegime = (ctc: number) => {
    const epf = ctc * 0.12;
    const nonTaxableEpf = ctc * 0.06;
    let taxableIncome = ctc - nonTaxableEpf - 75000; // FY 25-26 Standard Deduction
    if (taxableIncome < 0) taxableIncome = 0;

    const basicTax = getBasicTax(taxableIncome);
    const surcharge = getSurchargeWithRelief(taxableIncome, basicTax);
    const cess = (basicTax + Math.max(0, surcharge)) * 0.04;
    const totalTax = basicTax + Math.max(0, surcharge) + cess;
    return { monthlyInHand: (ctc - epf - totalTax) / 12, totalTax, epf, taxableIncome };
};

export const FICrossoverCard: React.FC<{ expectedHike?: number }> = ({ expectedHike = 10 }) => {
    const [loading, setLoading] = useState(true);
    const [jobDetails, setJobDetails] = useState<JobDetails | null>(null);
    const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
    const [monthlySip, setMonthlySip] = useState(0);
    const [expectedReturns, setExpectedReturns] = useState<Record<string, string>>({});

    useEffect(() => {
        Promise.all([
            api.getJobDetails().catch(() => null),
            api.getPortfolio().catch(() => null),
            api.getRebalancerConfig().catch(() => null)
        ]).then(([jd, port, configStr]) => {
            if (jd) setJobDetails(jd);
            if (port) setPortfolio(port);
            if (configStr) {
                try {
                    const config = JSON.parse(configStr);
                    if (config.monthlyAddition) {
                        setMonthlySip(parseFloat(config.monthlyAddition));
                    }
                    if (config.expectedReturns) {
                        setExpectedReturns(config.expectedReturns);
                    }
                } catch (e) { }
            }
            setLoading(false);
        });
    }, []);

    if (loading) return <div className="p-4 bg-purple-50 rounded animate-pulse">Loading FI Data...</div>;
    if (!jobDetails || !jobDetails.current_ctc) return null; // Can't calculate FI without salary

    const taxData = calculateTaxesNewRegime(jobDetails.current_ctc);
    const dailyInHand = taxData.monthlyInHand / 30; // approx

    let yearlyGrowthLive = 0;
    if (portfolio && portfolio.asset_types) {
        Object.entries(portfolio.asset_types).forEach(([key, amt]) => {
            // Default to 0 if not configured, matching GrowthPotentialCalculator logic exactly
            const expectedReturnPct = parseFloat(expectedReturns[key]) || 0;
            yearlyGrowthLive += (amt.final_amount * (expectedReturnPct / 100));
        });
    }

    const dailyPortfolioGrowth = yearlyGrowthLive / 365;
    const currentPortfolioSize = portfolio ? portfolio.total.final_amount : 0;

    // Extract ACTUAL historical blended portfolio yield from the specific user-defined rates
    let impliedAnnualReturn = 0;
    if (currentPortfolioSize > 0 && yearlyGrowthLive > 0) {
        impliedAnnualReturn = yearlyGrowthLive / currentPortfolioSize;
    }

    // Target Portfolio needed to yield the dailyInHand using the same impliedAnnualReturn
    let m = 0;
    let currentSimCtc = jobDetails.current_ctc;
    let fiSimBalance = currentPortfolioSize;
    let monthlyRate = impliedAnnualReturn / 12;

    let projectedDailyPortfolioGrowth = dailyPortfolioGrowth;
    let activeDailyInHand = dailyInHand;
    let maxMonths = 1200; // 100 years cap
    let hit = false;

    const chartData = [];
    const startDate = new Date();

    // Simulate month by month
    while (m < maxMonths) {
        const d = new Date(startDate);
        d.setMonth(d.getMonth() + m);

        chartData.push({
            month: m,
            formattedDate: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
            "Daily In-Hand": activeDailyInHand,
            "Daily Growth": projectedDailyPortfolioGrowth
        });

        if (projectedDailyPortfolioGrowth >= activeDailyInHand && activeDailyInHand > 0) {
            hit = true;
            break;
        }

        m++;
        // Portfolio grows
        fiSimBalance = fiSimBalance * (1 + monthlyRate) + monthlySip;
        // The NEW daily portfolio growth is the new balance * implied rate / 365
        projectedDailyPortfolioGrowth = (fiSimBalance * impliedAnnualReturn) / 365;

        // Once a year, hike the CTC!
        if (m % 12 === 0) {
            currentSimCtc = currentSimCtc * (1 + (expectedHike / 100));
            const newTaxData = calculateTaxesNewRegime(currentSimCtc);
            activeDailyInHand = newTaxData.monthlyInHand / 30; // approx per day wage
        }
    }

    const fiYears = Math.floor(m / 12);
    const fiMonths = m % 12;
    const targetPortfolio = hit ? fiSimBalance : 0; // The actual corpus achieved at the crossover month

    return (
        <div className="p-4 bg-purple-50 rounded shadow-inner border border-purple-100">
            <div className="flex justify-between items-center mb-2">
                <p className="text-gray-600 text-sm font-semibold">Financial Independence (FI) Target</p>
                <div className="flex items-center space-x-1">
                    <label className="text-xs text-gray-500">Monthly SIP</label>
                    <span className="text-sm font-bold text-gray-700">{formatCurrency(monthlySip)}</span>
                </div>
            </div>

            <div className="flex justify-between items-center mt-3">
                <div>
                    <p className="text-xs text-gray-500">Your Daily Salary</p>
                    <p className="text-lg font-bold text-orange-600">{formatCurrency(dailyInHand)}</p>
                </div>
                <div className="text-center text-xs text-gray-400 font-bold">VS</div>
                <div className="text-right flex flex-col items-end">
                    <p className="text-xs text-gray-500">Actual Daily Avg Growth</p>
                    <p className="text-lg font-bold text-green-600">+{formatCurrency(dailyPortfolioGrowth)}</p>
                    <p className="text-[10px] text-gray-400">Implied CAGR: {(impliedAnnualReturn * 100).toFixed(1)}%</p>
                </div>
            </div>

            <div className="mt-4 pt-3 border-t border-purple-200">
                {currentPortfolioSize >= targetPortfolio ? (
                    <p className="text-sm font-bold text-green-600">🎉 Financially Independent! Your money makes more than your job.</p>
                ) : (
                    <>
                        <p className="text-xs text-gray-600 mb-1">Time to replace salary working: <span className="font-bold text-purple-700">{fiYears > 0 ? `${fiYears} Yrs ` : ''}{fiMonths > 0 ? `${fiMonths} Mos` : ''}</span></p>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                            <div className="bg-purple-600 h-2 rounded-full" style={{ width: `${Math.min((currentPortfolioSize / targetPortfolio) * 100, 100)}%` }}></div>
                        </div>
                        <div className="flex justify-between items-center mt-1">
                            <p className="text-[10px] text-gray-500">
                                Target Daily In-Hand at Crossover: <span className="font-bold text-gray-700">{formatCurrency(activeDailyInHand)}</span>
                            </p>
                            <p className="text-[10px] text-gray-500 text-right">
                                Goal: {formatCurrency(targetPortfolio)} corpus
                            </p>
                        </div>
                    </>
                )}
            </div>

            {chartData.length > 1 && (
                <div className="mt-6 h-[250px] w-full border-t border-purple-200 pt-4">
                    <p className="text-xs text-gray-500 font-semibold mb-2 text-center">Projected Timeline of Independence</p>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                            <XAxis
                                dataKey="formattedDate"
                                tick={{ fontSize: 10, fill: '#6B7280' }}
                                tickLine={false}
                                axisLine={{ stroke: '#E5E7EB' }}
                                minTickGap={30}
                            />
                            <YAxis
                                tick={{ fontSize: 10, fill: '#6B7280' }}
                                tickFormatter={(val) => `₹${val}`}
                                tickLine={false}
                                axisLine={{ stroke: '#E5E7EB' }}
                            />
                            <Tooltip
                                formatter={(value: any, name: any) => [`₹${formatCurrency(Number(value))}`, name]}
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            />
                            <Legend wrapperStyle={{ fontSize: '10px', marginTop: '10px' }} />
                            <Line type="monotone" dataKey="Daily In-Hand" stroke="#EA580C" strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="Daily Growth" stroke="#16A34A" strokeWidth={2} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
};
