import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { api } from '../api';
import type { PortfolioSummary } from '../types';

const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
    }).format(val);

export default function ExpenseFICalculator() {
    const [loading, setLoading] = useState(true);
    const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
    const [monthlySip, setMonthlySip] = useState(0);
    const [yearlySipIncrementPct, setYearlySipIncrementPct] = useState(0);
    const [expectedReturns, setExpectedReturns] = useState<Record<string, string>>({});

    // User inputs for FIRE
    const [yearlyExpense, setYearlyExpense] = useState('1200000'); // 1L/mo default
    const [inflationRate, setInflationRate] = useState('6'); // 6% default inflation
    const [currentAge, setCurrentAge] = useState('30');
    const [lifeExpectancy, setLifeExpectancy] = useState('90');
    const [dob, setDob] = useState('');
    const [savingDob, setSavingDob] = useState(false);
    const [savingSettings, setSavingSettings] = useState(false);
    useEffect(() => {
        Promise.all([
            api.getPortfolio().catch(() => null),
            api.getRebalancerConfig().catch(() => null),
            api.getMe().catch(() => null)
        ]).then(([port, configStr, userProfile]) => {
            if (port) {
                setPortfolio(port);
            }
            if (configStr) {
                try {
                    const config = JSON.parse(configStr);
                    if (config.monthlyAddition) {
                        setMonthlySip(parseFloat(config.monthlyAddition));
                    }
                    if (config.yearlyIncreasePct) {
                        setYearlySipIncrementPct(parseFloat(config.yearlyIncreasePct));
                    }
                    if (config.expectedReturns) {
                        setExpectedReturns(config.expectedReturns);
                    }
                } catch (e) { }
            }
            if (userProfile) {
                if (userProfile.date_of_birth) {
                    const dobStr = userProfile.date_of_birth.split('T')[0];
                    setDob(dobStr);
                    const dobDate = new Date(dobStr);
                    if (!isNaN(dobDate.getTime())) {
                        const diffMs = Date.now() - dobDate.getTime();
                        setCurrentAge((diffMs / (1000 * 60 * 60 * 24 * 365.25)).toFixed(1));
                    }
                }
                if (userProfile.yearly_expense) {
                    setYearlyExpense(userProfile.yearly_expense.toString());
                }
                if (userProfile.inflation_rate) {
                    setInflationRate(userProfile.inflation_rate.toString());
                }
                if (userProfile.life_expectancy) {
                    setLifeExpectancy(userProfile.life_expectancy.toString());
                }
            }
            setLoading(false);
        });
    }, []);

    const handleDobChange = async (newDob: string) => {
        setDob(newDob);
        const dobDate = new Date(newDob);
        if (!isNaN(dobDate.getTime())) {
            const diffMs = Date.now() - dobDate.getTime();
            setCurrentAge((diffMs / (1000 * 60 * 60 * 24 * 365.25)).toFixed(1));

            // Save to Backend automatically
            setSavingDob(true);
            try {
                await api.updateUserDOB(newDob);
            } catch (e) {
                console.error("Failed to update DOB", e);
            }
            setSavingDob(false);
        }
    };

    const handleSaveSettings = async () => {
        setSavingSettings(true);
        try {
            await api.updateFireSettings(
                parseFloat(yearlyExpense) || 1200000,
                parseFloat(inflationRate) || 6,
                parseFloat(lifeExpectancy) || 90
            );
        } catch (e) {
            console.error("Failed to save fire settings", e);
        }
        setSavingSettings(false);
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Loading FIRE Setup...</div>;

    // Calculate baseline portfolio yield
    let yearlyGrowthLive = 0;
    if (portfolio && portfolio.asset_types) {
        Object.entries(portfolio.asset_types).forEach(([key, amt]) => {
            const expectedReturnPct = parseFloat(expectedReturns[key]) || 0;
            yearlyGrowthLive += (amt.final_amount * (expectedReturnPct / 100));
        });
    }

    const dailyPortfolioGrowth = yearlyGrowthLive / 365;
    const currentPortfolioSize = portfolio ? portfolio.total.final_amount : 0;

    let impliedAnnualReturn = 0;
    if (currentPortfolioSize > 0 && yearlyGrowthLive > 0) {
        impliedAnnualReturn = yearlyGrowthLive / currentPortfolioSize;
    }

    // Mathematical Depletion Engine — iterates month-by-month for exactness
    const isSustainedRetirement = (
        corpus: number,
        firstYearExpense: number,
        annualReturn: number,
        inflation: number,
        remainingMonths: number  // exact months, not years
    ) => {
        let balance = corpus;
        let currentYearExpense = firstYearExpense;
        let monthlyReturn = annualReturn / 12;
        let monthsInSim = 0;

        for (let mo = 0; mo < remainingMonths; mo++) {
            let monthlyExpense = currentYearExpense / 12;
            balance -= monthlyExpense;
            if (balance <= 0) return false;
            balance += (balance * monthlyReturn);
            monthsInSim++;
            // inflate every 12 months counting from retirement start
            if (monthsInSim % 12 === 0) {
                currentYearExpense = currentYearExpense * (1 + inflation / 100);
            }
        }
        return true;
    };



    // Set up Math Simulation Engine
    let m = 0;
    let expectedHike = parseFloat(inflationRate) || 0;
    let activeYearlyExpense = parseFloat(yearlyExpense) || 1200000;
    let activeMonthlySip = monthlySip;
    let fiSimBalance = currentPortfolioSize;
    let monthlyRate = impliedAnnualReturn / 12;

    // Independent Ultra-Safe FI Tracking Variables
    let ultraSimBalance = currentPortfolioSize;
    let ultraActiveYearlyExpense = activeYearlyExpense;
    let ultraActiveMonthlySip = monthlySip;

    let startAge = parseFloat(currentAge) || 30;
    let endAge = parseFloat(lifeExpectancy) || 90;
    let maxMonths = Math.round((endAge - startAge) * 12);
    if (maxMonths <= 0) maxMonths = 120; // 10 years min safety

    let isRetired = false;
    let hit = false;
    let fiYearsVal = 0;
    let fiMonthsVal = 0;
    let targetPortfolioVal = 0;
    let activeYearlyExpenseAtCrossover = 0;
    let monthsInRetirement = 0; // tracks months since retirement for expense inflation

    let ultraHit = false;
    let ultraFiYearsVal = 0;
    let ultraFiMonthsVal = 0;
    let ultraTargetCorpusVal = 0;
    let ultraExpenseAtCrossover = 0;
    let monthsInUltraRetirement = 0;

    const chartData = [];
    const startDate = new Date();

    while (m <= maxMonths) {
        const d = new Date(startDate);
        d.setMonth(d.getMonth() + m);

        let projectedAge = startAge + (m / 12);

        // Dynamically compute the Required Corpus Multiplier exactly for the REMAINING lifetime
        let dynamicRequiredMultiplier = Infinity;

        if (!isRetired) {
            let remainingMonths = maxMonths - m; // exact remaining months

            // Standard FI Binary Search
            let low = 0;
            let high = 1000;
            if (remainingMonths > 0 &&
                isSustainedRetirement(high * 100000, 100000, impliedAnnualReturn, expectedHike, remainingMonths)) {
                for (let i = 0; i < 50; i++) {
                    let mid = (low + high) / 2;
                    if (isSustainedRetirement(mid * 100000, 100000, impliedAnnualReturn, expectedHike, remainingMonths)) {
                        dynamicRequiredMultiplier = mid;
                        high = mid;
                    } else {
                        low = mid;
                    }
                }
            }
        }

        const requiredCorpusToSurvive = activeYearlyExpense * dynamicRequiredMultiplier;

        // Exact mathematical formula for "Never Dips" (Ultra-Safe FI)
        let ultraRequiredCorpusToSurvive = Infinity;
        if (impliedAnnualReturn > (expectedHike / 100)) {
            ultraRequiredCorpusToSurvive = ultraActiveYearlyExpense / (impliedAnnualReturn - (expectedHike / 100));
        }

        chartData.push({
            month: m,
            formattedDate: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
            "Age": projectedAge.toFixed(1),
            "Standard FI Corpus": Math.round(fiSimBalance),
            "Ultra-Safe FI Corpus": Math.round(ultraSimBalance),
            "Monthly Withdrawal": isRetired ? Math.round(activeYearlyExpense / 12) : null,
            "Ultra-Safe FI Target": isFinite(ultraRequiredCorpusToSurvive) ? Math.round(ultraRequiredCorpusToSurvive) : null,
        });

        // The exact moment portfolio can securely sustain depletion exactly until Life Expectancy
        if (!isRetired && fiSimBalance >= requiredCorpusToSurvive && fiSimBalance > 0) {
            isRetired = true;
            hit = true;
            fiYearsVal = Math.floor(m / 12);
            fiMonthsVal = m % 12;
            targetPortfolioVal = fiSimBalance;
            activeYearlyExpenseAtCrossover = activeYearlyExpense;
        }

        // Ultra-Safe FI: independent crossover check
        if (!ultraHit && isFinite(ultraRequiredCorpusToSurvive) && ultraSimBalance >= ultraRequiredCorpusToSurvive && ultraSimBalance > 0) {
            ultraHit = true;
            ultraFiYearsVal = Math.floor(m / 12);
            ultraFiMonthsVal = m % 12;
            ultraTargetCorpusVal = ultraSimBalance;
            ultraExpenseAtCrossover = ultraActiveYearlyExpense;
        }

        m++;

        // Branch 1: Standard FI lifecycle (Accumulate -> Retire & Deplete)
        if (isRetired) {
            monthsInRetirement++;
            let monthlyExpense = activeYearlyExpense / 12;
            fiSimBalance -= monthlyExpense;
            if (fiSimBalance < 0) fiSimBalance = 0;
            fiSimBalance += (fiSimBalance * monthlyRate);
            if (monthsInRetirement % 12 === 0) {
                activeYearlyExpense = activeYearlyExpense * (1 + (expectedHike / 100));
            }
        } else {
            fiSimBalance = fiSimBalance * (1 + monthlyRate) + activeMonthlySip;
            if (m > 0 && m % 12 === 0) {
                activeYearlyExpense = activeYearlyExpense * (1 + (expectedHike / 100));
                activeMonthlySip = activeMonthlySip * (1 + (yearlySipIncrementPct / 100));
            }
        }

        // Branch 2: Ultra-Safe FI Independent Lifecycle
        if (ultraHit) {
            monthsInUltraRetirement++;
            let ultraMonthlyExpense = ultraActiveYearlyExpense / 12;
            ultraSimBalance -= ultraMonthlyExpense;
            if (ultraSimBalance < 0) ultraSimBalance = 0;
            ultraSimBalance += (ultraSimBalance * monthlyRate);
            if (monthsInUltraRetirement % 12 === 0) {
                ultraActiveYearlyExpense = ultraActiveYearlyExpense * (1 + (expectedHike / 100));
            }
        } else {
            ultraSimBalance = ultraSimBalance * (1 + monthlyRate) + ultraActiveMonthlySip;
            if (m > 0 && m % 12 === 0) {
                ultraActiveYearlyExpense = ultraActiveYearlyExpense * (1 + (expectedHike / 100));
                ultraActiveMonthlySip = ultraActiveMonthlySip * (1 + (yearlySipIncrementPct / 100));
            }
        }
    }

    const fiYears = fiYearsVal;
    const fiMonths = fiMonthsVal;
    const targetPortfolio = targetPortfolioVal;
    const ultraFiYears = ultraFiYearsVal;
    const ultraFiMonths = ultraFiMonthsVal;
    const ultraTargetCorpus = ultraTargetCorpusVal;
    return (
        <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6 border-t-4 border-red-500">
                <div className="flex justify-between items-start mb-2">
                    <h2 className="text-2xl font-bold">FIRE Simulator (Financial Independence)</h2>
                </div>
                <p className="text-gray-500 text-sm mb-6">Calculate when your portfolio's passive income absolutely eclipses your exact living expenses (adjusted dynamically for standard inflation).</p>

                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8 bg-gray-50 p-4 rounded border">
                    <div>
                        <label className="block text-xs font-medium text-gray-700">
                            Yearly Expense (₹)
                            {savingSettings && <span className="ml-2 text-green-600 text-[10px]">Saving...</span>}
                        </label>
                        <input
                            type="number"
                            value={yearlyExpense}
                            onChange={e => setYearlyExpense(e.target.value)}
                            onBlur={handleSaveSettings}
                            className="mt-1 w-full rounded-md border-gray-300 focus:border-red-500 focus:ring-red-500 p-2 border text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700">
                            Annual Inflation (%)
                        </label>
                        <input
                            type="number"
                            value={inflationRate}
                            onChange={e => setInflationRate(e.target.value)}
                            onBlur={handleSaveSettings}
                            className="mt-1 w-full rounded-md border-gray-300 focus:border-red-500 focus:ring-red-500 p-2 border text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700">
                            Date of Birth (Optional)
                            {savingDob && <span className="ml-2 text-green-600 text-[10px]">Saving...</span>}
                        </label>
                        <input
                            type="date"
                            value={dob}
                            onChange={e => handleDobChange(e.target.value)}
                            className="mt-1 w-full rounded-md border-gray-300 focus:border-red-500 focus:ring-red-500 p-2 border text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700">Current Age</label>
                        <input
                            type="number"
                            value={currentAge}
                            onChange={e => setCurrentAge(e.target.value)}
                            className="mt-1 w-full rounded-md border-gray-300 focus:border-red-500 focus:ring-red-500 p-2 border text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700">
                            Life Expectancy
                        </label>
                        <input
                            type="number"
                            value={lifeExpectancy}
                            onChange={e => setLifeExpectancy(e.target.value)}
                            onBlur={handleSaveSettings}
                            className="mt-1 w-full rounded-md border-gray-300 focus:border-red-500 focus:ring-red-500 p-2 border text-sm"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="col-span-1 border rounded p-5 shadow-sm bg-white flex flex-col justify-center">
                        <h3 className="text-gray-500 font-semibold text-xs tracking-wider uppercase mb-3">Live Portfolio Engine</h3>
                        <div className="space-y-3">
                            <div className="flex justify-between border-b pb-1">
                                <span className="text-sm">Current Corpus</span>
                                <span className="font-bold text-gray-800">{formatCurrency(currentPortfolioSize)}</span>
                            </div>
                            <div className="flex justify-between border-b pb-1">
                                <span className="text-sm">Monthly SIP</span>
                                <span className="font-bold text-gray-800">
                                    {formatCurrency(monthlySip)}
                                    {yearlySipIncrementPct > 0 && <span className="ml-1 text-xs text-green-600 font-medium">(+{yearlySipIncrementPct}%/yr)</span>}
                                </span>
                            </div>
                            <div className="flex justify-between border-b pb-1">
                                <span className="text-sm">Blended Yield (APY)</span>
                                <span className="font-bold text-green-700">{(impliedAnnualReturn * 100).toFixed(2)}%</span>
                            </div>
                            <div className="flex justify-between pt-1">
                                <span className="text-sm font-medium text-gray-700">Passive Daily Growth</span>
                                <span className="font-bold text-green-700">{formatCurrency(dailyPortfolioGrowth)}/day</span>
                            </div>
                        </div>
                    </div>

                    {/* Standard FI Card */}
                    <div className="col-span-1 border rounded p-5 shadow-sm bg-red-50 border-red-100 flex flex-col justify-center relative overflow-hidden">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="inline-block w-3 h-3 rounded-full bg-red-500"></span>
                            <h3 className="text-red-700 font-bold text-base">Standard FI</h3>
                        </div>
                        <p className="text-xs text-red-400 mb-3">Corpus survives withdrawals until life expectancy</p>
                        {!hit && currentPortfolioSize > 0 ? (
                            <p className="text-red-600 font-medium text-sm">Not achievable at current SIP &amp; inflation. Increase SIP or reduce expenses.</p>
                        ) : (
                            <>
                                <div className="flex space-x-1 items-baseline mb-3">
                                    <span className="text-3xl font-extrabold text-red-700">{fiYears}</span>
                                    <span className="text-gray-500 font-semibold text-sm">Yrs</span>
                                    <span className="text-3xl font-extrabold text-red-700 ml-1">{fiMonths}</span>
                                    <span className="text-gray-500 font-semibold text-sm">Mo</span>
                                </div>
                                <div className="space-y-1 text-sm border-t border-red-200 pt-3">
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Crossover Corpus</span>
                                        <span className="font-bold text-gray-800">{formatCurrency(targetPortfolio)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Yearly Expense then</span>
                                        <span className="font-bold text-gray-800">{formatCurrency(activeYearlyExpenseAtCrossover)}</span>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Ultra-Safe FI Card */}
                    <div className="col-span-1 border rounded p-5 shadow-sm bg-purple-50 border-purple-100 flex flex-col justify-center relative overflow-hidden">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="inline-block w-3 h-3 rounded-full bg-purple-500"></span>
                            <h3 className="text-purple-700 font-bold text-base">Ultra-Safe FI</h3>
                        </div>
                        <p className="text-xs text-purple-400 mb-3">Yield ≥ expense — corpus never decreases, ever</p>
                        {!ultraHit && currentPortfolioSize > 0 ? (
                            <p className="text-purple-600 font-medium text-sm">Not achievable within life expectancy at current settings.</p>
                        ) : (
                            <>
                                <div className="flex space-x-1 items-baseline mb-3">
                                    <span className="text-3xl font-extrabold text-purple-700">{ultraFiYears}</span>
                                    <span className="text-gray-500 font-semibold text-sm">Yrs</span>
                                    <span className="text-3xl font-extrabold text-purple-700 ml-1">{ultraFiMonths}</span>
                                    <span className="text-gray-500 font-semibold text-sm">Mo</span>
                                </div>
                                <div className="space-y-1 text-sm border-t border-purple-200 pt-3">
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Crossover Corpus</span>
                                        <span className="font-bold text-gray-800">{formatCurrency(ultraTargetCorpus)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Yearly Expense then</span>
                                        <span className="font-bold text-gray-800">{formatCurrency(ultraExpenseAtCrossover)}</span>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {chartData.length > 1 && (
                <div className="bg-white rounded-lg shadow p-6 border-t border-gray-200">
                    <h3 className="text-lg font-bold mb-4 text-gray-800">Visual Timeline to Independence</h3>
                    <div className="h-[400px] w-full mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                <XAxis
                                    dataKey="formattedDate"
                                    tick={{ fontSize: 12, fill: '#6B7280' }}
                                    tickLine={false}
                                    axisLine={{ stroke: '#E5E7EB' }}
                                    minTickGap={40}
                                />
                                <YAxis
                                    tick={{ fontSize: 12, fill: '#6B7280' }}
                                    tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`}
                                    tickLine={false}
                                    axisLine={{ stroke: '#E5E7EB' }}
                                />
                                <Tooltip
                                    formatter={(value: any, name: any) => [`₹${formatCurrency(Number(value))}`, name]}
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                />
                                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                                <Line type="monotone" dataKey="Standard FI Corpus" name="Portfolio Corpus (Standard FI)" stroke="#10B981" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
                                <Line type="monotone" dataKey="Ultra-Safe FI Corpus" name="Portfolio Corpus (Ultra-Safe FI)" stroke="#6D28D9" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
                                <Line type="monotone" dataKey="Ultra-Safe FI Target" name="Ultra-Safe FI Target (Yield = Expense)" stroke="#8B5CF6" strokeWidth={2} strokeDasharray="6 3" dot={false} activeDot={{ r: 5 }} />
                                <Line type="monotone" dataKey="Monthly Withdrawal" name="Monthly Withdrawal (Post-FI)" stroke="#F59E0B" strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 5 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}
        </div>
    );
}
