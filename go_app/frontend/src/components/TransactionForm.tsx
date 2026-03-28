import React, { useState, useEffect } from "react";
import { api } from "../api";

export const TransactionForm: React.FC<{ onAdd: () => void }> = ({ onAdd }) => {
    const [customers, setCustomers] = useState<string[]>([]);
    const [isAddingNew, setIsAddingNew] = useState(false);
    const [formData, setFormData] = useState({
        transaction_type: "credit",
        asset_type: "debt",
        fd_type: "EPF",
        amount: 0,
        date: new Date().toISOString().split('T')[0],
        customer_name: "",
    });
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");

    // Load customers on mount
    useEffect(() => {
        loadCustomers();
    }, []);

    const loadCustomers = () => {
        api.getCustomers().then((names) => {
            setCustomers(names);
            // If we have customers, select the first one by default if not set
            if (names.length > 0 && !formData.customer_name) {
                setFormData(f => ({ ...f, customer_name: names[0] }));
            } else if (names.length === 0) {
                // If no customers, maybe force add new or default to "Self"
                setFormData(f => ({ ...f, customer_name: "Self" }));
            }
        }).catch(err => console.error("Failed to load customers", err));
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(f => ({
            ...f,
            [name]: name === "amount" ? parseFloat(value) : value,
        }));
    };

    const handleCustomerSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value;
        if (value === "__NEW__") {
            setIsAddingNew(true);
            setFormData(f => ({ ...f, customer_name: "" }));
        } else {
            setFormData(f => ({ ...f, customer_name: value }));
        }
    };

    const handleCancelAddNew = () => {
        setIsAddingNew(false);
        if (customers.length > 0) {
            setFormData(f => ({ ...f, customer_name: customers[0] }));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage("");
        try {
            await api.addTransaction(formData);
            setMessage("Transaction added successfully!");
            onAdd();
            // If we added a new customer, reload the list and switch back to dropdown
            if (isAddingNew) {
                // Optimistically add to list or reload. Let's reload.
                loadCustomers(); // This might race with next render but okay
                setIsAddingNew(false);
            }
        } catch (error) {
            setMessage("Error adding transaction.");
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-md mb-6">
            <h2 className="text-xl font-bold mb-4">Add Transaction</h2>
            {message && <p className={`mb-4 ${message.includes("Error") ? "text-red-500" : "text-green-500"}`}>{message}</p>}
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Customer Name</label>
                    {isAddingNew ? (
                        <div className="flex gap-2">
                            <input
                                type="text"
                                name="customer_name"
                                value={formData.customer_name}
                                onChange={handleChange}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                                placeholder="Enter new customer name"
                                required
                                autoFocus
                            />
                            <button
                                type="button"
                                onClick={handleCancelAddNew}
                                className="mt-1 px-3 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
                            >
                                Cancel
                            </button>
                        </div>
                    ) : (
                        <select
                            value={formData.customer_name}
                            onChange={handleCustomerSelect}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                        >
                            {customers.map(name => (
                                <option key={name} value={name}>{name}</option>
                            ))}
                            <option value="__NEW__" className="font-bold text-indigo-600">+ Add New Customer</option>
                        </select>
                    )}
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Type</label>
                    <select
                        name="transaction_type"
                        value={formData.transaction_type}
                        onChange={handleChange}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                    >
                        <option value="credit">Credit</option>
                        <option value="debit">Debit</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Asset Type</label>
                    <select
                        name="asset_type"
                        value={formData.asset_type}
                        onChange={handleChange}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
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
                        name="fd_type"
                        value={formData.fd_type}
                        onChange={handleChange}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                    >
                        <option value="PPF">PPF</option>
                        <option value="EPF">EPF</option>
                        <option value="Stocks">Stocks</option>
                        <option value="Mutual Funds">Mutual Funds</option>
                        <option value="NPS">NPS</option>
                        <option value="Gold">Gold</option>
                        <option value="Real Estate">Real Estate</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Amount</label>
                    <input
                        type="number"
                        name="amount"
                        value={formData.amount}
                        onChange={handleChange}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                        required
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Date</label>
                    <input
                        type="date"
                        name="date"
                        value={formData.date}
                        onChange={handleChange}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                        required
                    />
                </div>
                <div className="md:col-span-2">
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
                    >
                        {loading ? "Adding..." : "Add Transaction"}
                    </button>
                </div>
            </form>
        </div>
    );
};
