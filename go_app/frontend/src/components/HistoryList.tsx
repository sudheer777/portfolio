import React, { useState } from 'react';
import { api } from '../api';
import { SnapshotComparator, type FullHistoryPoint } from './SnapshotComparator';
import type { PortfolioSummary } from '../types';

interface HistoryListProps {
    history: FullHistoryPoint[];
    onUpdate: () => void;
    livePortfolio?: PortfolioSummary | null; // Present-day live data for vs Today comparison
}

export const HistoryList: React.FC<HistoryListProps> = ({ history, onUpdate, livePortfolio }) => {
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editDate, setEditDate] = useState("");
    const [editAmount, setEditAmount] = useState("");
    const [isExpanded, setIsExpanded] = useState(false);
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [selectedSnapshots, setSelectedSnapshots] = useState<FullHistoryPoint[]>([]);

    // Synthesize a FullHistoryPoint for today using the live portfolio data
    const todaySnapshot: FullHistoryPoint | null = livePortfolio ? {
        id: -1, // sentinel id for live
        date: new Date().toISOString(),
        total_amount: livePortfolio.total.final_amount,
        asset_summary_json: JSON.stringify(livePortfolio),
    } : null;

    const compareWithToday = (item: FullHistoryPoint, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!todaySnapshot) return;
        setSelectedSnapshots([item, todaySnapshot]);
    };

    const startEdit = (item: FullHistoryPoint) => {
        setEditingId(item.id);
        const dateStr = new Date(item.date).toISOString().split('T')[0];
        setEditDate(dateStr);
        setEditAmount(item.total_amount.toString());
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditDate("");
        setEditAmount("");
    };

    const toggleSelection = (item: FullHistoryPoint, e: React.MouseEvent) => {
        e.stopPropagation();
        if (selectedSnapshots.find(s => s.id === item.id)) {
            setSelectedSnapshots(selectedSnapshots.filter(s => s.id !== item.id));
        } else {
            if (selectedSnapshots.length >= 2) {
                setSelectedSnapshots([selectedSnapshots[1], item]);
            } else {
                setSelectedSnapshots([...selectedSnapshots, item]);
            }
        }
    };

    const isSelected = (id: number) => {
        return selectedSnapshots.some(s => s.id === id);
    };

    const handleUpdate = async (id: number) => {
        try {
            await api.updateHistory(id, editDate, parseFloat(editAmount));
            onUpdate();
            cancelEdit();
        } catch (e: any) {
            alert(`Failed to update history: ${e.message}`);
        }
    };

    const confirmDelete = async () => {
        if (!deletingId) return;
        try {
            await api.deleteHistory(deletingId);
            onUpdate();
            setDeletingId(null);
        } catch (e: any) {
            alert(`Failed to delete history: ${e.message}`);
        }
    };

    if (history.length === 0) return null;

    return (
        <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-100">
            {/* Delete Confirmation Modal */}
            {deletingId && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50">
                    <div className="bg-white p-5 rounded-md shadow-lg w-80">
                        <h3 className="text-lg font-bold mb-4">Confirm Delete</h3>
                        <p className="text-gray-700 mb-6">Are you sure you want to delete this history entry?</p>
                        <div className="flex justify-end space-x-2">
                            <button
                                onClick={() => setDeletingId(null)}
                                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDelete}
                                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div
                className="bg-gray-50 px-6 py-3 border-b border-gray-200 flex justify-between items-center cursor-pointer hover:bg-gray-100"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex flex-col items-start">
                    <h4 className="font-semibold text-gray-700">History Entries ({history.length})</h4>
                    <p className="text-xs text-gray-400">☑ Select 2 full snapshots or use <strong>vs Today</strong> to compare</p>
                </div>
                <button className="text-gray-500 text-sm focus:outline-none">
                    {isExpanded ? "Collapse ▲" : "Expand ▼"}
                </button>
            </div>

            {isExpanded && (
                <div className="overflow-x-auto">
                    {selectedSnapshots.length === 2 && (
                        <div className="p-4 border-b">
                            <SnapshotComparator
                                snapshotA={selectedSnapshots[0]}
                                snapshotB={selectedSnapshots[1]}
                                onClose={() => setSelectedSnapshots([])}
                            />
                        </div>
                    )}
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left"></th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {history.map((item) => (
                                <tr key={item.id} className={`hover:bg-gray-50 ${isSelected(item.id) ? 'bg-indigo-50/50' : ''}`}>
                                    {editingId === item.id ? (
                                        <>
                                            <td className="px-6 py-4"></td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <input
                                                    type="date"
                                                    value={editDate}
                                                    onChange={e => setEditDate(e.target.value)}
                                                    className="border border-gray-300 rounded px-2 py-1 text-sm w-full"
                                                />
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right">
                                                <input
                                                    type="number"
                                                    value={editAmount}
                                                    onChange={e => setEditAmount(e.target.value)}
                                                    className="border border-gray-300 rounded px-2 py-1 text-sm w-full text-right"
                                                />
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm space-x-2">
                                                <button onClick={() => handleUpdate(item.id)} className="text-green-600 hover:text-green-900 font-medium">Save</button>
                                                <button onClick={cancelEdit} className="text-gray-600 hover:text-gray-900">Cancel</button>
                                            </td>
                                        </>
                                    ) : (
                                        <>
                                            <td className="px-3 py-4 whitespace-nowrap text-center">
                                                {item.asset_summary_json ? (
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected(item.id)}
                                                        onChange={() => { }}
                                                        onClick={(e) => toggleSelection(item, e)}
                                                        className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer"
                                                        title="Select to compare"
                                                    />
                                                ) : (
                                                    <span title="Legacy snapshot — no asset detail available" className="text-gray-300 text-sm select-none">🔒</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-gray-500 text-sm">
                                                {new Date(item.date).toLocaleDateString()}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                                                ₹{item.total_amount.toLocaleString('en-IN')}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                                                {todaySnapshot && (
                                                    <button
                                                        onClick={(e) => compareWithToday(item, e)}
                                                        className="text-emerald-600 hover:text-emerald-800 font-medium"
                                                        title="Compare this snapshot against today's live portfolio"
                                                    >
                                                        vs Today
                                                    </button>
                                                )}
                                                <button onClick={() => startEdit(item)} className="text-indigo-600 hover:text-indigo-900">Edit</button>
                                                <button onClick={() => setDeletingId(item.id)} className="text-red-600 hover:text-red-900">Delete</button>
                                            </td>
                                        </>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};
