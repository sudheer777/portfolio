import { useEffect, useState, useMemo } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    Legend
} from 'recharts';
import { api } from '../api';

const EPFCalculator = () => {
    // Inputs
    const [monthlyContribution, setMonthlyContribution] = useState<number>(0);
    const [yearlyIncrement, setYearlyIncrement] = useState<number>(10);
    const [interestRate, setInterestRate] = useState<number>(8.25);
    const [years, setYears] = useState<number>(15);
    const [currentBalance, setCurrentBalance] = useState<number>(0);
    const [accruedInterest, setAccruedInterest] = useState<number>(0); // New Input

    // Loading states
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDefaults = async () => {
            try {
                // 1. Get Rates to find current EPF rate
                const rates = await api.getRates();
                const epfRateObj = rates.find(r => r.fd_type === 'EPF');
                if (epfRateObj) {
                    setInterestRate(epfRateObj.rate);
                }

                // 2. Get Last EPF Transaction and Calculate Defaults
                const txs = await api.getTransactions();
                // Filter for EPF
                const epfTxs = txs.filter(t => t.fd_type === 'EPF');
                if (epfTxs.length > 0) {
                    // Sort by date desc
                    epfTxs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                    const lastTx = epfTxs[0];
                    setMonthlyContribution(lastTx.amount);

                    // --- Proper EPF balance calculation ---
                    // EPF credits interest annually at end of FY (March 31).
                    // We need to add all past FY credited interest to the principal.
                    const now = new Date();
                    const rateVal = epfRateObj ? epfRateObj.rate : 8.25;
                    const monthlyRate = rateVal / 100 / 12;

                    // Determine the current FY start (April 1)
                    let fyStartYear = now.getFullYear();
                    if (now.getMonth() < 3) fyStartYear--;
                    const currentFyStart = new Date(fyStartYear, 3, 1);

                    // Find the earliest transaction year to know when EPF started
                    const sortedByDate = [...epfTxs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                    const firstDate = new Date(sortedByDate[0].date);
                    // FY of first transaction
                    let firstFyYear = firstDate.getFullYear();
                    if (firstDate.getMonth() < 3) firstFyYear--;

                    // Simulate FY-by-FY: add contributions month-by-month, credit interest at end of each FY
                    let runningBalance = 0;

                    for (let fy = firstFyYear; fy < fyStartYear; fy++) {
                        let fyInterest = 0;

                        for (let m = 0; m < 12; m++) {
                            const monthStart = new Date(fy, 3 + m, 1);
                            const monthEnd = new Date(fy, 3 + m + 1, 0); // last day of month

                            // Add contributions that arrived in this calendar month
                            epfTxs.forEach(t => {
                                const d = new Date(t.date);
                                if (d >= monthStart && d <= monthEnd) {
                                    runningBalance += t.amount;
                                }
                            });

                            // Interest accrues on the closing balance of each month
                            fyInterest += runningBalance * monthlyRate;
                        }

                        // Credit all FY interest at end (March 31)
                        runningBalance += fyInterest;
                    }

                    // Add current FY contributions to the balance (principal only, interest not yet credited)
                    const currentFyContributions = epfTxs.filter(t => new Date(t.date) >= currentFyStart);
                    currentFyContributions.forEach(t => { runningBalance += t.amount; });

                    setCurrentBalance(Math.round(runningBalance));

                    // Accrued interest for CURRENT FY: only count COMPLETED months
                    // EPF credits interest on closing balance of each month; mid-month means 0 for that month
                    const openingBalance = runningBalance - currentFyContributions.reduce((s, t) => s + t.amount, 0);
                    // monthsElapsed = completed months since April 1 (April 5 → 0, May 5 → 1, etc.)
                    const monthsElapsed = (now.getFullYear() - fyStartYear) * 12 + (now.getMonth() - 3);
                    let estimatedInterest = openingBalance * monthlyRate * Math.max(0, monthsElapsed);

                    currentFyContributions.forEach(t => {
                        const tDate = new Date(t.date);
                        const monthsHeld = (now.getFullYear() - tDate.getFullYear()) * 12 + (now.getMonth() - tDate.getMonth());
                        if (monthsHeld > 0) {
                            estimatedInterest += t.amount * monthlyRate * monthsHeld;
                        }
                    });

                    setAccruedInterest(Math.round(estimatedInterest));

                } else {
                    setMonthlyContribution(5000); // Fallback
                }
            } catch (err) {
                console.error("Failed to fetch defaults", err);
            } finally {
                setLoading(false);
            }
        };

        fetchDefaults();
    }, []);

    const projection = useMemo(() => {
        const data = [];
        let balance = currentBalance;
        let invested = currentBalance;
        let totalInterestEarned = 0; // Total interest accumulated over time

        let accumulatedInterestForFY = accruedInterest; // Buffer for interest to be credited in March

        let currentMonthly = monthlyContribution;
        const monthlyRate = interestRate / 100 / 12;

        const totalMonths = years * 12;
        const startDate = new Date();

        for (let i = 0; i <= totalMonths; i++) {
            const d = new Date(startDate);
            d.setMonth(d.getMonth() + i);

            // Log data point (Every month)
            data.push({
                month: i,
                year: d.getFullYear(),
                formattedDate: d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
                invested: Math.round(invested),
                interest: Math.round(totalInterestEarned + accumulatedInterestForFY),
                total: Math.round(balance + accumulatedInterestForFY),
            });

            if (i < totalMonths) {
                // Annual Increment Logic
                // If we align with FY, increment happens in April (Month 3).
                if (i > 0 && d.getMonth() === 3) { // April
                    currentMonthly = currentMonthly * (1 + yearlyIncrement / 100);
                }

                // Interest Calculation: On Running Balance
                // Opening Balance + Contribution
                const monthlyInterest = (balance + currentMonthly) * monthlyRate;

                accumulatedInterestForFY += monthlyInterest;
                totalInterestEarned += monthlyInterest;

                balance += currentMonthly;
                invested += currentMonthly;

                // Credit Interest on March 31st (Month 2)
                if (d.getMonth() === 2) { // March
                    balance += accumulatedInterestForFY;
                    accumulatedInterestForFY = 0;
                }
            }
        }
        return data;
    }, [monthlyContribution, yearlyIncrement, interestRate, years, currentBalance, accruedInterest]);

    const finalResult = projection[projection.length - 1] || { total: 0, invested: 0, interest: 0 };

    if (loading) return <div>Loading...</div>;

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-8">
            <h1 className="text-3xl font-bold text-gray-800">EPF Projection Calculator</h1>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Inputs */}
                <div className="bg-white p-6 rounded-lg shadow-md space-y-6 lg:col-span-1 h-fit">
                    <h2 className="text-xl font-semibold text-gray-700">Configuration</h2>

                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Current EPF Balance</label>
                        <div className="flex items-center border rounded-md px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500">
                            <span className="text-gray-500 mr-2">₹</span>
                            <input
                                type="number"
                                value={currentBalance}
                                onChange={(e) => setCurrentBalance(Number(e.target.value))}
                                className="w-full outline-none font-semibold text-gray-700"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Accrued Interest (Current FY)</label>
                        <div className="flex items-center border rounded-md px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500">
                            <span className="text-gray-500 mr-2">₹</span>
                            <input
                                type="number"
                                value={accruedInterest}
                                onChange={(e) => setAccruedInterest(Number(e.target.value))}
                                className="w-full outline-none font-semibold text-gray-700"
                            />
                        </div>
                        <p className="text-xs text-gray-400 mt-1">Interest earned so far this year, not yet credited.</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Monthly Contribution (Start)</label>
                        <div className="flex items-center border rounded-md px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500">
                            <span className="text-gray-500 mr-2">₹</span>
                            <input
                                type="number"
                                value={Math.round(monthlyContribution)}
                                onChange={(e) => setMonthlyContribution(Number(e.target.value))}
                                className="w-full outline-none font-semibold text-gray-700"
                            />
                        </div>
                        <p className="text-xs text-gray-400 mt-1">Based on your last EPF transaction</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Yearly Increment (%)</label>
                        <div className="flex items-center border rounded-md px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500">
                            <input
                                type="number"
                                value={yearlyIncrement}
                                onChange={(e) => setYearlyIncrement(Number(e.target.value))}
                                className="w-full outline-none font-semibold text-gray-700"
                            />
                            <span className="text-gray-500 ml-2">%</span>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Interest Rate (%)</label>
                        <div className="flex items-center border rounded-md px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500">
                            <input
                                type="number"
                                step="0.05"
                                value={interestRate}
                                onChange={(e) => setInterestRate(Number(e.target.value))}
                                className="w-full outline-none font-semibold text-gray-700"
                            />
                            <span className="text-gray-500 ml-2">%</span>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Projection Period</label>
                        <input
                            type="range"
                            min="1" max="40"
                            value={years}
                            onChange={(e) => setYears(Number(e.target.value))}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                        />
                        <div className="text-right font-bold text-blue-600">{years} Years</div>
                    </div>
                </div>

                {/* Results & Chart */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                            <p className="text-sm text-blue-600 font-medium uppercase">Total Invested</p>
                            <p className="text-2xl font-bold text-gray-800">₹{finalResult.invested.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                        </div>
                        <div className="bg-green-50 p-4 rounded-lg border border-green-100">
                            <p className="text-sm text-green-600 font-medium uppercase">Interest Earned</p>
                            <p className="text-2xl font-bold text-gray-800">₹{finalResult.interest.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                        </div>
                        <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100">
                            <p className="text-sm text-indigo-600 font-medium uppercase">Final Corpus</p>
                            <p className="text-3xl font-bold text-indigo-700">₹{finalResult.total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                        </div>
                    </div>

                    {/* Chart */}
                    <div className="bg-white p-4 rounded-lg shadow-md border border-gray-100 h-[400px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={projection} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorInvested" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#93c5fd" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="#93c5fd" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis
                                    dataKey="formattedDate"
                                    tick={{ fontSize: 10 }}
                                    minTickGap={30}
                                />
                                <YAxis
                                    tickFormatter={(val) => {
                                        if (val >= 10000000) return `₹${(val / 10000000).toFixed(1)}Cr`;
                                        if (val >= 100000) return `₹${(val / 100000).toFixed(0)}L`;
                                        return `₹${val / 1000}k`;
                                    }}
                                    tick={{ fontSize: 12 }}
                                />
                                <Tooltip formatter={(val: any) => `₹${val.toLocaleString('en-IN')}`} />
                                <Legend />
                                <Area type="monotone" dataKey="total" name="Total Corpus" stroke="#4f46e5" fillOpacity={1} fill="url(#colorTotal)" />
                                <Area type="monotone" dataKey="invested" name="Invested Amount" stroke="#3b82f6" fillOpacity={0.6} fill="url(#colorInvested)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Milestones */}
            {(() => {
                const milestones = [];
                let nextMilestone = 10000000; // 1 Cr
                for (const p of projection) {
                    if (p.total >= nextMilestone) {
                        while (p.total >= nextMilestone) {
                            milestones.push({
                                value: nextMilestone,
                                date: p.formattedDate
                            });
                            nextMilestone += 10000000;
                        }
                    }
                }

                if (milestones.length === 0) return null;

                return (
                    <div className="bg-white p-6 rounded-lg shadow-md border border-gray-100">
                        <h3 className="text-xl font-semibold text-gray-700 mb-4 text-center">Crore Club Milestones</h3>
                        <div className="flex flex-wrap gap-4 justify-center">
                            {milestones.map((m) => (
                                <div key={m.value} className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-center min-w-[120px]">
                                    <div className="text-indigo-600 font-bold text-lg">₹{m.value / 10000000} Cr</div>
                                    <div className="text-xs text-gray-500 uppercase tracking-wide">Projected</div>
                                    <div className="text-sm font-medium text-gray-700">{m.date}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};

export default EPFCalculator;
