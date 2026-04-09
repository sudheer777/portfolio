import React, { useEffect, useState, useCallback } from "react";
import { api } from "../api";
import { TransactionList } from "./TransactionList";
import { PortfolioCharts } from "./PortfolioCharts";
import { AssetAllocationCharts } from "./AssetAllocationCharts";
import { HistoryChart } from "./HistoryChart";
import { HistoryList } from "./HistoryList";
import { HistoryAnalysis, type Milestone } from "./HistoryAnalysis";
import { FICrossoverCard } from "./FICrossoverCard";
import { SnapshotComparator } from "./SnapshotComparator";
import type { PortfolioSummary, UserSummary, Amount, PortfolioHistory } from "../types";

export const Dashboard: React.FC<{ refreshKey: number; onTransactionChange: () => void }> = ({ refreshKey, onTransactionChange }) => {
    const [data, setData] = useState<PortfolioSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [selectedCustomerName, setSelectedCustomerName] = useState<string | null>(null);

    const [liveData, setLiveData] = useState<PortfolioSummary | null>(null);
    const [selectedSnapshotId, setSelectedSnapshotId] = useState<number | null>(null);
    const [compareSnapshotId, setCompareSnapshotId] = useState<number | null>(null);

    const [history, setHistory] = useState<PortfolioHistory[]>([]);
    const [manualDate, setManualDate] = useState("");
    const [manualAmount, setManualAmount] = useState("");
    const [showHistoryForm, setShowHistoryForm] = useState(false);

    // Lifted state from HistoryAnalysis for use in Rebalancer
    const [avgMonthlyAddition, setAvgMonthlyAddition] = useState<number>(0);
    const [pastMilestones, setPastMilestones] = useState<Milestone[]>([]);
    const [pastUSDMilestones, setPastUSDMilestones] = useState<Milestone[]>([]);

    const hasSavedSip = React.useRef(false);
    const [savedSipValue, setSavedSipValue] = useState<number | undefined>(undefined);

    // Load saved SIP from rebalancer config on mount
    useEffect(() => {
        api.getRebalancerConfig().then(configStr => {
            if (configStr) {
                try {
                    const config = JSON.parse(configStr);
                    if (config.monthlyAddition) {
                        const v = parseFloat(config.monthlyAddition) || 0;
                        setAvgMonthlyAddition(v);
                        setSavedSipValue(v);
                        hasSavedSip.current = true;
                    }
                } catch (e) { /* ignore parse errors */ }
            }
        }).catch(() => { });
    }, []);

    // Stable callback — only sets avgMonthlyAddition if no saved SIP exists
    const handleAvgCalculated = useCallback((avg: number) => {
        if (!hasSavedSip.current) setAvgMonthlyAddition(avg);
    }, []);

    const loadHistory = () => {
        api.getHistory()
            .then(setHistory);
    };

    useEffect(() => {
        setLoading(true);
        api.getPortfolio()
            .then(res => {
                setData(res);
                setLiveData(res);
                if (res && res.user_summaries.length > 0 && selectedCustomerName === null) {
                    setSelectedCustomerName(res.user_summaries[0].user_name);
                }
            })
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));

        loadHistory();
    }, [refreshKey]); // Removed selectedCustomerId from deps to avoid reset on every refresh if unwanted, but we do want to set init.

    const handleSaveSnapshot = async () => {
        try {
            await api.saveSnapshot();
            alert("Snapshot saved successfully!");
            loadHistory();
        } catch (e: any) {
            alert(`Failed to save snapshot: ${e.message} `);
            console.error(e);
        }
    };

    const handleManualHistory = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.addHistory(manualDate, parseFloat(manualAmount));
            alert("History entry added!");
            setManualDate("");
            setManualAmount("");
            setShowHistoryForm(false);
            loadHistory();
        } catch (e: any) {
            alert(`Failed to add history entry: ${e.message} `);
            console.error(e);
        }
    };

    const handleSnapshotSelect = (idStr: string) => {
        if (!idStr) {
            setSelectedSnapshotId(null);
            if (liveData) {
                setData(liveData);
            }
            return;
        }

        const id = parseInt(idStr);
        setSelectedSnapshotId(id);
        const snapshot = history.find(h => h.id === id);

        if (snapshot) {
            if (snapshot.asset_summary_json) {
                try {
                    const parsed: PortfolioSummary = JSON.parse(snapshot.asset_summary_json);
                    setData(parsed);
                } catch (e) {
                    console.error("Failed to parse historical snapshot:", e);
                    alert("Failed to load rich snapshot data. It might be corrupted.");
                }
            } else {
                alert("This is a Legacy Snapshot! It was created before the Time Machine feature was implemented, so it only contains a Total Amount and cannot graphically rewind the dashboard.");
            }
        }
    };

    if (loading) return <div className="text-center p-4">Loading stats...</div>;
    if (error) return <div className="text-red-500 p-4">{error}</div>;
    if (!data) return null;

    // Aggregate FDs for Grand Total
    const aggregateFds: Record<string, Amount> = {};
    if (data) {
        data.user_summaries.forEach(u => {
            Object.entries(u.fds).forEach(([type, amt]) => {
                if (!aggregateFds[type]) {
                    aggregateFds[type] = { principal: 0, interest: 0, day_change: 0, final_amount: 0 };
                }
                const agg = aggregateFds[type];
                agg.principal += amt.principal;
                agg.interest += amt.interest;
                agg.day_change += amt.day_change;
                agg.final_amount += amt.final_amount;
            });
        });
    }

    const selectedUser = data.user_summaries.find(u => u.user_name === selectedCustomerName);

    const validHistoryOptions = history
        .filter(h => h.asset_summary_json)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // All history entries sorted descending (for the Compare dropdown — any entry works since Today is always full)
    const allHistorySorted = [...history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Construct snapshots for the top-level comparator
    const compareSnap = compareSnapshotId !== null ? history.find(h => h.id === compareSnapshotId) : null;
    const todaySnapForCompare = liveData ? {
        id: -1,
        date: new Date().toISOString(),
        total_amount: liveData.total.final_amount,
        asset_summary_json: JSON.stringify(liveData),
    } : null;

    return (
        <div className="space-y-8">
            {/* Print-only Report Header */}
            <div className="hidden print:block mb-8 text-center border-b-2 border-indigo-200 pb-6 w-full">
                <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Financial Health Report</h1>
                <p className="text-gray-500 font-medium text-lg">Generated on {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>

            <div className="bg-indigo-50 rounded-lg shadow border border-indigo-100 p-6">
                <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="text-xl font-bold text-indigo-900">Grand Total (All Users)</h3>
                        {validHistoryOptions.length > 0 && (
                            <div className="flex items-center gap-2 bg-white border border-indigo-200 rounded-md p-1.5 shadow-sm print:hidden">
                                <span className="text-lg">⏳</span>
                                <div className="flex flex-col">
                                    <label className="text-[9px] font-bold text-indigo-800 uppercase tracking-wider leading-none mb-0.5">Time Machine</label>
                                    <select
                                        className="bg-transparent text-xs font-semibold text-indigo-900 border-none focus:ring-0 p-0 cursor-pointer w-48 leading-none"
                                        value={selectedSnapshotId?.toString() || ""}
                                        onChange={(e) => handleSnapshotSelect(e.target.value)}
                                    >
                                        <option value="">Present Day (Live)</option>
                                        {validHistoryOptions.map(h => (
                                            <option key={h.id} value={h.id.toString()}>
                                                {new Date(h.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })} Snapshot (₹{(h.total_amount / 100000).toFixed(1)}L)
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}
                        {allHistorySorted.length > 0 && (
                            <div className="flex items-center gap-2 bg-white border border-emerald-200 rounded-md p-1.5 shadow-sm print:hidden">
                                <span className="text-lg">📊</span>
                                <div className="flex flex-col">
                                    <label className="text-[9px] font-bold text-emerald-700 uppercase tracking-wider leading-none mb-0.5">Compare With Today</label>
                                    <select
                                        className="bg-transparent text-xs font-semibold text-emerald-900 border-none focus:ring-0 p-0 cursor-pointer w-48 leading-none"
                                        value={compareSnapshotId?.toString() || ""}
                                        onChange={(e) => setCompareSnapshotId(e.target.value ? parseInt(e.target.value) : null)}
                                    >
                                        <option value="">Select a snapshot…</option>
                                        {allHistorySorted.map(h => (
                                            <option key={h.id} value={h.id.toString()}>
                                                {new Date(h.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })} — ₹{(h.total_amount / 100000).toFixed(1)}L{h.asset_summary_json ? '' : ' (legacy)'}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="space-x-2 flex items-center print:hidden">
                        <button
                            onClick={() => window.print()}
                            className="bg-gray-100 text-gray-700 font-medium px-3 py-1 rounded border border-gray-300 hover:bg-gray-200 text-sm flex items-center gap-1 shadow-sm"
                        >
                            🖨️ Export PDF
                        </button>
                        <button
                            onClick={() => setShowHistoryForm(!showHistoryForm)}
                            className="bg-white text-indigo-600 px-3 py-1 rounded border border-indigo-200 hover:bg-indigo-50 text-sm font-medium"
                        >
                            {showHistoryForm ? "Cancel Entry" : "Add History Entry"}
                        </button>
                        <button
                            onClick={handleSaveSnapshot}
                            className="bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700 text-sm font-medium"
                        >
                            Save Snapshot
                        </button>
                    </div>
                </div>

                {showHistoryForm && (
                    <form onSubmit={handleManualHistory} className="mb-6 bg-white p-4 rounded border border-indigo-100 flex gap-4 items-end">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
                            <input
                                type="date"
                                required
                                value={manualDate}
                                onChange={e => setManualDate(e.target.value)}
                                className="border border-gray-300 rounded px-2 py-1 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Total Amount</label>
                            <input
                                type="number"
                                required
                                value={manualAmount}
                                onChange={e => setManualAmount(e.target.value)}
                                className="border border-gray-300 rounded px-2 py-1 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>
                        <button type="submit" className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 text-sm">Save Entry</button>
                    </form>
                )}

                {/* Top-level Snapshot Comparator — renders when a snapshot is chosen from the dropdown */}
                {compareSnap && todaySnapForCompare && (
                    <div className="mb-6">
                        <SnapshotComparator
                            snapshotA={compareSnap}
                            snapshotB={todaySnapForCompare}
                            onClose={() => setCompareSnapshotId(null)}
                        />
                    </div>
                )}

                <StatCard title="Portfolio Total" amount={data.total} isTotal />
                <PortfolioCharts data={aggregateFds} />
                {data.asset_types && <AssetAllocationCharts
                    data={data.asset_types}
                    defaultMonthlyAddition={avgMonthlyAddition}
                    pastMilestones={pastMilestones}
                    pastUSDMilestones={pastUSDMilestones}
                />}

                <div className="mt-8">
                    <FICrossoverCard portfolioData={data} />
                </div>

                <div className="mt-8 border-t border-indigo-200 pt-6 space-y-8">
                    <HistoryChart data={history} />
                    <HistoryAnalysis
                        history={history}
                        currentTotal={data.total.final_amount}
                        onAvgCalculated={handleAvgCalculated}
                        onMilestonesCalculated={(past, pastUSD) => {
                            setPastMilestones(past);
                            setPastUSDMilestones(pastUSD);
                        }}
                        savedMonthlyAddition={savedSipValue}
                    />
                    <HistoryList history={history} onUpdate={loadHistory} livePortfolio={liveData} />
                </div>
            </div>

            {/* Customer Dropdown */}
            <div className="flex justify-start px-2 py-4 print:hidden">
                <div className="inline-flex items-center gap-4 bg-white px-6 py-3 rounded-xl shadow-md border border-gray-100 ring-1 ring-gray-200/50">
                    <label htmlFor="customer-select" className="text-lg font-semibold text-gray-600 tracking-wide">
                        View Portfolio For:
                    </label>
                    <div className="relative">
                        <select
                            id="customer-select"
                            value={selectedCustomerName || ""}
                            onChange={(e) => setSelectedCustomerName(e.target.value)}
                            className="appearance-none cursor-pointer block w-96 rounded-lg border-gray-200 bg-gray-50 text-gray-900 py-2 pl-4 pr-10 text-lg font-medium shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 hover:bg-white hover:border-indigo-300 transition-all duration-200"
                        >
                            {data.user_summaries.map(u => (
                                <option key={u.user_name} value={u.user_name}>{u.user_name}</option>
                            ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-500">
                            <svg className="h-5 w-5 fill-current" viewBox="0 0 20 20">
                                <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" fillRule="evenodd" />
                            </svg>
                        </div>
                    </div>
                </div>
            </div>

            {selectedUser && (
                <UserCard
                    key={selectedUser.user_name}
                    user={selectedUser}
                    onUpdate={onTransactionChange}
                />
            )}
        </div>
    );
};


const UserCard: React.FC<{ user: UserSummary; onUpdate: () => void; }> = ({ user, onUpdate }) => {
    const [showTransactions, setShowTransactions] = useState(false);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const loadTransactions = async () => {
        setLoading(true);
        try {
            // Use user.user_name (Customer Name) as filter
            const txs = await api.getTransactions(user.user_name);
            setTransactions(txs);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const toggleTransactions = () => {
        if (!showTransactions) {
            loadTransactions();
        }
        setShowTransactions(!showTransactions);
    };

    return (
        <div className="bg-white rounded-lg shadow-lg overflow-hidden mb-8">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900">Customer: {user.user_name}</h3>
                <button
                    onClick={toggleTransactions}
                    className="text-sm bg-indigo-100 text-indigo-700 px-3 py-1 rounded hover:bg-indigo-200 transition"
                >
                    {showTransactions ? "Hide Transactions" : "View Transactions"}
                </button>
            </div>
            <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {Object.entries(user.fds).map(([fdType, amt]) => (
                        <StatCard key={fdType} title={fdType.toUpperCase()} amount={amt} />
                    ))}
                </div>
                <div className="mt-6 border-t pt-4">
                    <StatCard key="total" title="Total Across All FDs" amount={user.total} isTotal />
                </div>

                <PortfolioCharts data={user.fds} />
                {user.asset_types && <AssetAllocationCharts data={user.asset_types} showRebalancer={false} />}

                {showTransactions && (
                    <div className="mt-6 border-t pt-4">
                        <h4 className="font-semibold text-gray-700 mb-2">Transactions</h4>
                        {loading ? (
                            <div>Loading transactions...</div>
                        ) : (
                            <TransactionList
                                transactions={transactions}
                                onUpdate={() => {
                                    loadTransactions();
                                    onUpdate(); // Propagate update to parent (refresh dashboard)
                                }}
                            />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

const StatCard: React.FC<{ title: string; amount: Amount; isTotal?: boolean }> = ({ title, amount, isTotal }) => {
    const format = (n: number) => n.toLocaleString('en-IN', { style: 'currency', currency: 'INR' });

    return (
        <div className={`p - 4 rounded - md border ${isTotal ? "bg-indigo-100 border-indigo-200" : "bg-white border-gray-200"} `}>
            <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">{title}</h4>
            <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                    <span>Invested:</span>
                    <span className="font-medium">{format(amount.principal)}</span>
                </div>
                <div className="flex justify-between">
                    <span>Interest:</span>
                    <span className="font-medium text-green-600">+{format(amount.interest)}</span>
                </div>
                <div className="flex justify-between">
                    <span>Day Change:</span>
                    <span className={`font - medium ${amount.day_change >= 0 ? "text-green-600" : "text-red-600"} `}>
                        {amount.day_change >= 0 ? "+" : ""}{format(amount.day_change)}
                    </span>
                </div>
                <div className="pt-2 mt-2 border-t border-gray-300 flex justify-between text-base font-bold">
                    <span>Total:</span>
                    <span>{format(amount.final_amount)}</span>
                </div>
            </div>
        </div>
    );
};
