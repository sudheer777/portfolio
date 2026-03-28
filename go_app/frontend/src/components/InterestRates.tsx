import React, { useEffect, useState } from 'react';
import { api } from '../api';
import type { InterestRate } from '../types';

const InterestRates = () => {
    const [rates, setRates] = useState<InterestRate[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState(''); // New state for success message

    // Form state
    const [fdType, setFdType] = useState('EPF');
    const [customFdType, setCustomFdType] = useState('');
    const [date, setDate] = useState('');
    const [rate, setRate] = useState('');
    const [editingId, setEditingId] = useState<number | null>(null);

    // Filter state
    const [filterType, setFilterType] = useState('All');

    useEffect(() => {
        fetchRates();
    }, []);

    // Clear success message after 3 seconds
    useEffect(() => {
        if (successMessage) {
            const timer = setTimeout(() => {
                setSuccessMessage('');
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [successMessage]);

    const fetchRates = async () => {
        try {
            setLoading(true);
            const data = await api.getRates();
            setRates(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccessMessage(''); // Clear previous message
        try {
            const type = fdType === 'Other' ? customFdType : fdType;
            if (!type) {
                setError("Please specify FD Type");
                return;
            }

            const payload = {
                fd_type: type,
                date,
                rate: parseFloat(rate),
            };

            if (editingId) {
                await api.updateRate({ id: editingId, ...payload });
                setSuccessMessage("Rate updated successfully!");
                setEditingId(null);
            } else {
                await api.addRate(payload);
                setSuccessMessage("Rate added successfully!");
            }

            // Reset form
            setFdType('EPF');
            setCustomFdType('');
            setDate('');
            setRate('');
            fetchRates();
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleEdit = (r: InterestRate) => {
        setEditingId(r.id);
        if (['EPF', 'PPF'].includes(r.fd_type)) {
            setFdType(r.fd_type);
            setCustomFdType('');
        } else {
            setFdType('Other');
            setCustomFdType(r.fd_type);
        }
        // Format date to YYYY-MM-DD for input
        const d = new Date(r.date);
        setDate(d.toISOString().split('T')[0]);
        setRate(r.rate.toString());
        // Scroll to form (optional)
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = async (id: number) => {
        if (!confirm("Are you sure you want to delete this rate?")) return;
        try {
            await api.deleteRate(id);
            setSuccessMessage("Rate deleted successfully!");
            fetchRates();
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setFdType('EPF');
        setCustomFdType('');
        setDate('');
        setRate('');
    };

    // Derived state for filtering
    const filteredRates = filterType === 'All'
        ? rates
        : rates.filter(r => r.fd_type === filterType);

    // Get unique types for filter
    const uniqueTypes = Array.from(new Set(rates.map(r => r.fd_type))).sort();

    if (loading && rates.length === 0) return <div className="p-4">Loading...</div>;

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold mb-6 text-gray-800">Manage Interest Rates</h1>

            {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4">{error}</div>}
            {successMessage && <div className="bg-green-100 text-green-700 p-3 rounded mb-4 animate-pulse">{successMessage}</div>}

            {/* Add/Edit Form */}
            <div className="bg-white p-6 rounded-lg shadow-md mb-8">
                <h2 className="text-xl font-semibold mb-4">{editingId ? 'Edit Rate' : 'Add New Rate'}</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                            <select
                                value={fdType}
                                onChange={(e) => setFdType(e.target.value)}
                                className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            >
                                <option value="EPF">EPF</option>
                                <option value="PPF">PPF</option>
                                <option value="Other">Other</option>
                            </select>
                            {fdType === 'Other' && (
                                <input
                                    type="text"
                                    placeholder="Enter Type"
                                    value={customFdType}
                                    onChange={(e) => setCustomFdType(e.target.value)}
                                    className="w-full border rounded p-2 mt-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                    required
                                />
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Effective Date</label>
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Rate (%)</label>
                            <input
                                type="number"
                                step="0.01"
                                value={rate}
                                onChange={(e) => setRate(e.target.value)}
                                className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="8.25"
                                required
                            />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="submit"
                            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition"
                        >
                            {editingId ? 'Update Rate' : 'Add Rate'}
                        </button>
                        {editingId && (
                            <button
                                type="button"
                                onClick={handleCancelEdit}
                                className="bg-gray-300 text-gray-700 px-6 py-2 rounded hover:bg-gray-400 transition"
                            >
                                Cancel
                            </button>
                        )}
                    </div>
                </form>
            </div>

            {/* List */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                    <h2 className="text-xl font-semibold">Current Rates</h2>
                    <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className="border rounded p-1 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="All">All Types</option>
                        {uniqueTypes.map(t => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </select>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="p-4 border-b font-medium text-gray-600">Type</th>
                                <th className="p-4 border-b font-medium text-gray-600">Effective Date</th>
                                <th className="p-4 border-b font-medium text-gray-600">Rate (%)</th>
                                <th className="p-4 border-b font-medium text-gray-600 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRates.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="p-8 text-center text-gray-500">
                                        No rates found. Add one above!
                                    </td>
                                </tr>
                            ) : (
                                filteredRates.map((r) => (
                                    <tr key={r.id} className="hover:bg-gray-50 transition border-b last:border-0">
                                        <td className="p-4 font-medium text-gray-800">{r.fd_type}</td>
                                        <td className="p-4 text-gray-600">
                                            {new Date(r.date).toLocaleDateString()}
                                        </td>
                                        <td className="p-4 font-bold text-green-600">{r.rate}%</td>
                                        <td className="p-4 text-right space-x-2">
                                            <button
                                                onClick={() => handleEdit(r)}
                                                className="text-blue-600 hover:text-blue-800 font-medium text-sm"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => handleDelete(r.id)}
                                                className="text-red-600 hover:text-red-800 font-medium text-sm"
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default InterestRates;
