import React, { useState } from 'react';
import type { Transaction } from '../types';
import { api } from '../api';

interface TransactionListProps {
    transactions: Transaction[];
    onUpdate: () => void;
}

export const TransactionList: React.FC<TransactionListProps> = ({ transactions, onUpdate }) => {
    const [editingTx, setEditingTx] = useState<Transaction | null>(null);
    const [deletingTxId, setDeletingTxId] = useState<number | null>(null);

    const confirmDelete = async () => {
        if (!deletingTxId) return;
        try {
            await api.deleteTransaction(deletingTxId);
            setDeletingTxId(null);
            onUpdate();
        } catch (e: any) {
            alert(e.message);
        }
    };

    const handleSave = async () => {
        if (!editingTx) return;
        try {
            await api.updateTransaction(editingTx);
            setEditingTx(null);
            onUpdate();
        } catch (e: any) {
            alert(e.message);
        }
    };

    // Sort transactions by date desc
    const sorted = [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return (
        <div className="mt-4">
            {/* Edit Modal */}
            {editingTx && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50">
                    <div className="bg-white p-5 rounded-md shadow-lg w-96 relative">
                        <h3 className="text-lg font-bold mb-4">Edit Transaction</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Type</label>
                                <select
                                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                                    value={editingTx.transaction_type}
                                    onChange={e => setEditingTx({ ...editingTx, transaction_type: e.target.value })}
                                >
                                    <option value="buy">Buy</option>
                                    <option value="sell">Sell</option>
                                    <option value="deposit">Deposit</option>
                                    <option value="withdraw">Withdraw</option>
                                    <option value="credit">Credit</option>
                                    <option value="debit">Debit</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Asset Type</label>
                                <select
                                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                                    value={editingTx.asset_type}
                                    onChange={e => setEditingTx({ ...editingTx, asset_type: e.target.value })}
                                >
                                    <option value="debt">Debt</option>
                                    <option value="equity">Equity</option>
                                    <option value="gold">Gold</option>
                                    <option value="real_estate">Real Estate</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">FD Type</label>
                                <select
                                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                                    value={editingTx.fd_type}
                                    onChange={e => setEditingTx({ ...editingTx, fd_type: e.target.value })}
                                >
                                    <option value="PPF">PPF</option>
                                    <option value="EPF">EPF</option>
                                    <option value="Stocks">Stocks</option>
                                    <option value="Mutual Funds">Mutual Funds</option>
                                    <option value="NPS">NPS</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Amount</label>
                                <input
                                    type="number"
                                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                                    value={editingTx.amount}
                                    onChange={e => setEditingTx({ ...editingTx, amount: parseFloat(e.target.value) })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Date</label>
                                <input
                                    type="date"
                                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                                    value={new Date(editingTx.date).toISOString().split('T')[0]}
                                    onChange={e => setEditingTx({ ...editingTx, date: e.target.value })}
                                />
                            </div>
                            <div className="flex justify-end space-x-2">
                                <button onClick={() => setEditingTx(null)} className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Cancel</button>
                                <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deletingTxId && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50">
                    <div className="bg-white p-5 rounded-md shadow-lg w-80">
                        <h3 className="text-lg font-bold mb-4">Confirm Delete</h3>
                        <p className="text-gray-700 mb-6">Are you sure you want to delete this transaction?</p>
                        <div className="flex justify-end space-x-2">
                            <button
                                onClick={() => setDeletingTxId(null)}
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

            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Asset Type</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {sorted.map(tx => (
                            <tr key={tx.id}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(tx.date).toLocaleDateString()}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">{tx.transaction_type}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">{tx.asset_type ? tx.asset_type.replace('_', ' ') : 'Debt'}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{tx.fd_type}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{tx.amount.toFixed(2)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <button
                                        onClick={() => setEditingTx(tx)}
                                        className="text-indigo-600 hover:text-indigo-900 mr-4"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        onClick={() => setDeletingTxId(tx.id)}
                                        className="text-red-600 hover:text-red-900"
                                    >
                                        Delete
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
