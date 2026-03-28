import { useEffect, useState, useMemo } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    Legend
} from 'recharts';
import { api } from '../api';

const PPFCalculator = () => {
    // Inputs
    const [yearlyInvestment, setYearlyInvestment] = useState<number>(150000); // Max 1.5L default
    const [interestRate, setInterestRate] = useState<number>(7.1); // Current PPF rate
    const [years, setYears] = useState<number>(15); // PPF Maturity is 15 years
    const [currentBalance, setCurrentBalance] = useState<number>(0);
    const [accruedInterest, setAccruedInterest] = useState<number>(0);

    // Loading states
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDefaults = async () => {
            try {
                // 1. Get Rates to find current PPF rate
                const rates = await api.getRates();
                const ppfRateObj = rates.find(r => r.fd_type === 'PPF');
                if (ppfRateObj) {
                    setInterestRate(ppfRateObj.rate);
                }

                // 2. Get Last PPF Transaction and Calculate Defaults
                const txs = await api.getTransactions();
                // Filter for PPF
                const ppfTxs = txs.filter(t => t.fd_type === 'PPF');

                if (ppfTxs.length > 0) {
                    // Approximate Current Balance (Sum of past)
                    const totalPrincipal = ppfTxs.reduce((sum, t) => sum + t.amount, 0);
                    setCurrentBalance(totalPrincipal);

                    // Calculate Accrued Interest for Current FY
                    // FY starts April 1st
                    const now = new Date();
                    let fyStartYear = now.getFullYear();
                    if (now.getMonth() < 3) { // Jan, Feb, Mar
                        fyStartYear--;
                    }
                    const fyStart = new Date(fyStartYear, 3, 1); // April 1st

                    const fyTxs = ppfTxs.filter(t => new Date(t.date).getTime() >= fyStart.getTime());
                    const fyContributions = fyTxs.reduce((sum, t) => sum + t.amount, 0);

                    // Assume currentBalance (which is total Principal from txs right now) 
                    // is strictly Principal. If user edits this to include past interest, 
                    // this logic tries to back-calculate Opening Balance.
                    // Opening Balance = Current Balance - contributions made this year.
                    const openingBalance = Math.max(0, totalPrincipal - fyContributions);

                    // Calculate Interest
                    const rateVal = ppfRateObj ? ppfRateObj.rate : 7.1;
                    const monthlyRate = rateVal / 100 / 12;
                    let estimatedInterest = 0;

                    // 1. Interest on Opening Balance
                    // It earns interest for every completed month + current month in FY so far
                    // Months elapsed from April to Now (inclusive of current month for calculation)
                    // If we are in April (Month 3), elapsed = 1 (April).
                    // If we are in May (Month 4), elapsed = 2 (April, May).
                    const monthsElapsed = (now.getFullYear() - fyStartYear) * 12 + (now.getMonth() - 3) + 1;

                    if (monthsElapsed > 0) {
                        estimatedInterest += openingBalance * monthlyRate * monthsElapsed;
                    }

                    // 2. Interest on FY Contributions
                    // Rule: Deposit by 5th gets interest for that month.
                    fyTxs.forEach(t => {
                        const tDate = new Date(t.date);
                        const dayOfDeposit = tDate.getDate();

                        // Months from deposit month to now (inclusive)
                        // e.g. Deposit in April (3), Now is August (7).
                        // Potential months: Apr, May, Jun, Jul, Aug = 5 months.
                        // Diff = 7 - 3 = 4.  Inclusive count = 5.
                        let monthsEarningInterest = (now.getFullYear() - tDate.getFullYear()) * 12 + (now.getMonth() - tDate.getMonth()) + 1;

                        // If deposited after 5th, lose interest for that specific month
                        if (dayOfDeposit > 5) {
                            monthsEarningInterest -= 1;
                        }

                        if (monthsEarningInterest > 0) {
                            estimatedInterest += t.amount * monthlyRate * monthsEarningInterest;
                        }
                    });

                    setAccruedInterest(Math.round(estimatedInterest));

                    // 3. Set Yearly Increment based on user count
                    // Count unique users (customer_name) for PPF transactions
                    const uniqueUsers = new Set(ppfTxs.map(t => t.customer_name)).size;
                    const defaultInvestment = (uniqueUsers || 1) * 150000;
                    setYearlyInvestment(defaultInvestment);

                }
            } catch (err) {
                console.error("Failed to fetch defaults", err);
            } finally {
                setLoading(false);
            }
        };

        fetchDefaults();
    }, []);

    // Better: Store user count in state if needed for UI validation.
    // For now, let's just update the initial state logic and relax the UI max constraint 
    // or update the placeholder text.

    const projection = useMemo(() => {
        const data = [];
        let balance = currentBalance + accruedInterest; // Start with balance including accrued
        let invested = currentBalance;
        let totalInterestEarned = 0;

        // PPF compounds annually. We can show monthly data for the chart but update interest annually.
        // OR better: Show yearly steps for PPF since it's a long term yearly scheme.
        // Let's stick to monthly granularity for chart smoothness but only credit interest in March.

        const totalMonths = years * 12;
        const startDate = new Date();

        // Annual investment logic: 
        // User provides "Yearly Addition". 
        // Simplification: Assume this is deposited in April (start of FY) to maximize interest, 
        // or we can divide by 12. 
        // PPF Standard: Best to invest before 5th April. Let's assume Lump Sum in April.

        let currentFyInterest = 0;

        for (let i = 0; i <= totalMonths; i++) {
            const d = new Date(startDate);
            d.setMonth(d.getMonth() + i);
            const monthIndex = d.getMonth(); // 0=Jan, 3=April

            // Data Point
            data.push({
                month: i,
                year: d.getFullYear(),
                formattedDate: d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
                invested: Math.round(invested),
                interest: Math.round(totalInterestEarned + currentFyInterest), // Show accrued
                total: Math.round(balance + currentFyInterest),
            });

            if (i < totalMonths) {
                // Investment Logic: Add yearly amount in April
                if (monthIndex === 3) { // April
                    balance += yearlyInvestment;
                    invested += yearlyInvestment;
                }
                // Also handle the very first month if it happens to be after April but we want to simulate 
                // "Yearly Addition" starting now. 
                // Simplification for Calculator: 
                // Treat 'yearlyInvestment' as being added EVERY April.
                // If we start in say, Oct, do we add now? 
                // Let's assume: Next addition is next April. 

                // Interest Calculation
                // PPF Interest is calculated on the lowest balance between 5th and end of month.
                // Since we update balance in April, that new balance holds for the year.
                // Monthly Interest = Balance * (Rate / 100 / 12)
                const monthlyInt = balance * (interestRate / 100 / 12);
                currentFyInterest += monthlyInt;

                // Compounding: Credit Interest on March 31st (End of FY)
                if (monthIndex === 2) { // March
                    balance += currentFyInterest;
                    totalInterestEarned += currentFyInterest;
                    currentFyInterest = 0;
                }
            }
        }
        return data;
    }, [yearlyInvestment, interestRate, years, currentBalance, accruedInterest]);

    const finalResult = projection[projection.length - 1] || { total: 0, invested: 0, interest: 0 };

    if (loading) return <div>Loading...</div>;

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-8">
            <h1 className="text-3xl font-bold text-gray-800">PPF Projection Calculator</h1>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Inputs */}
                <div className="bg-white p-6 rounded-lg shadow-md space-y-6 lg:col-span-1 h-fit">
                    <h2 className="text-xl font-semibold text-gray-700">Configuration</h2>

                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Current PPF Balance</label>
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
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Yearly Investment (April)</label>
                        <div className="flex items-center border rounded-md px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500">
                            <span className="text-gray-500 mr-2">₹</span>
                            <input
                                type="number"
                                // Remove hard max constraint or make it dynamic. 
                                // max={150000 * uniqueUserCount?} 
                                // Let's simplify and remove strict max, just warn/inform.
                                value={yearlyInvestment}
                                onChange={(e) => setYearlyInvestment(Number(e.target.value))}
                                className="w-full outline-none font-semibold text-gray-700"
                            />
                        </div>
                        <p className="text-xs text-gray-400 mt-1">Deposited annually in April. (Default: 1.5L × Investors)</p>
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
                                    <linearGradient id="colorTotalPPF" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorInvestedPPF" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#c4b5fd" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="#c4b5fd" stopOpacity={0} />
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
                                <Area type="monotone" dataKey="total" name="Total Corpus" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorTotalPPF)" />
                                <Area type="monotone" dataKey="invested" name="Invested Amount" stroke="#c4b5fd" fillOpacity={0.6} fill="url(#colorInvestedPPF)" />
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
                                <div key={m.value} className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-center min-w-[120px]">
                                    <div className="text-purple-600 font-bold text-lg">₹{m.value / 10000000} Cr</div>
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

export default PPFCalculator;
