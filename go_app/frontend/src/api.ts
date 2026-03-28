import type { InterestRate, PortfolioSummary, Transaction, User } from "./types";

const API_BASE = "/api";
const AUTH_BASE = "";

// Helper to add auth header
const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    const token = localStorage.getItem("token");
    const headers = {
        ...options.headers,
        "Authorization": token ? `Bearer ${token}` : "",
    };
    return fetch(url, { ...options, headers: headers as any }).then(res => {
        if (res.status === 401) {
            // Token expired or invalid
            localStorage.removeItem("token");
            window.location.reload(); // Reload triggers App.tsx to see !token and show Login
        }
        return res;
    });
};

export const api = {
    checkAuth: () => {
        return !!localStorage.getItem("token");
    },

    login: async (email: string, password: string): Promise<any> => {
        const res = await fetch(`${AUTH_BASE}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });
        if (!res.ok) throw new Error("Login failed");
        const data = await res.json();
        localStorage.setItem("token", data.token);
        return data;
    },

    register: async (name: string, email: string, password: string): Promise<any> => {
        const res = await fetch(`${AUTH_BASE}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, password }),
        });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || "Registration failed");
        }
        return res.json();
    },

    logout: () => {
        localStorage.removeItem("token");
    },

    getPortfolio: async (): Promise<PortfolioSummary> => {
        const res = await fetchWithAuth(`${API_BASE}/portfolio`);
        if (!res.ok) throw new Error("Failed to fetch portfolio");
        return res.json();
    },

    getUsers: async (): Promise<User[]> => {
        const res = await fetchWithAuth(`${API_BASE}/users`);
        if (!res.ok) throw new Error("Failed to fetch users");
        return res.json();
    },

    getCustomers: async (): Promise<string[]> => {
        const res = await fetchWithAuth(`${API_BASE}/customers`);
        if (!res.ok) throw new Error("Failed to fetch customers");
        return res.json();
    },

    addTransaction: async (tx: Omit<Transaction, "id">): Promise<Transaction> => {
        const res = await fetchWithAuth(`${API_BASE}/transactions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(tx),
        });
        if (!res.ok) throw new Error("Failed to add transaction");
        return res.json().then(data => data.transaction);
    },

    getTransactions: async (customerName?: string): Promise<Transaction[]> => {
        let url = `${API_BASE}/transactions`;
        if (customerName) {
            url += `?customer_name=${encodeURIComponent(customerName)}`;
        }
        const res = await fetchWithAuth(url);
        if (!res.ok) throw new Error("Failed to fetch transactions");
        return res.json();
    },

    updateTransaction: async (tx: Transaction): Promise<void> => {
        const res = await fetchWithAuth(`${API_BASE}/transactions/${tx.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                transaction_type: tx.transaction_type,
                asset_type: tx.asset_type,
                fd_type: tx.fd_type,
                amount: tx.amount,
                date: new Date(tx.date).toISOString().split('T')[0],
                customer_name: tx.customer_name,
            }),
        });
        if (!res.ok) throw new Error("Failed to update transaction");
    },

    deleteTransaction: async (id: number): Promise<void> => {
        const res = await fetchWithAuth(`${API_BASE}/transactions/${id}`, {
            method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to delete transaction");
    },

    async saveSnapshot(): Promise<any> {
        const res = await fetchWithAuth(`${API_BASE}/portfolio/snapshot`, {
            method: 'POST',
        });
        if (!res.ok) throw new Error("Failed to save snapshot");
        return res.json();
    },

    async addHistory(date: string, amount: number): Promise<any> {
        const res = await fetchWithAuth(`${API_BASE}/history`, {
            method: 'POST',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ date, amount }),
        });
        if (!res.ok) throw new Error("Failed to save history");
        return res.json();
    },

    async getHistory(): Promise<{ id: number; date: string; total_amount: number }[]> {
        const res = await fetchWithAuth(`${API_BASE}/history`);
        if (!res.ok) throw new Error("Failed to fetch history");
        return res.json();
    },

    async updateHistory(id: number, date: string, amount: number): Promise<void> {
        const res = await fetchWithAuth(`${API_BASE}/history/${id}`, {
            method: 'PUT',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ date, amount }),
        });
        if (!res.ok) throw new Error("Failed to update history");
    },

    async deleteHistory(id: number): Promise<void> {
        const res = await fetchWithAuth(`${API_BASE}/history/${id}`, {
            method: 'DELETE',
        });
        if (!res.ok) throw new Error("Failed to delete history");
    },

    async getRates(): Promise<InterestRate[]> {
        const res = await fetchWithAuth(`${API_BASE}/rates`);
        if (!res.ok) throw new Error("Failed to fetch rates");
        return res.json();
    },

    async addRate(rate: Omit<InterestRate, "id">): Promise<void> {
        const res = await fetchWithAuth(`${API_BASE}/rates`, {
            method: 'POST',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(rate),
        });
        if (!res.ok) throw new Error("Failed to add rate");
    },

    async updateRate(rate: InterestRate): Promise<void> {
        const res = await fetchWithAuth(`${API_BASE}/rates/${rate.id}`, {
            method: 'PUT',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(rate),
        });
        if (!res.ok) throw new Error("Failed to update rate");
    },

    async deleteRate(id: number): Promise<void> {
        const res = await fetchWithAuth(`${API_BASE}/rates/${id}`, {
            method: 'DELETE',
        });
        if (!res.ok) throw new Error("Failed to delete rate");
    },

    getExchangeRate: async (): Promise<number> => {
        try {
            const res = await fetch("https://open.er-api.com/v6/latest/USD");
            if (!res.ok) return 84; // Fallback
            const data = await res.json();
            return data.rates.INR || 84;
        } catch (e) {
            console.error("Failed to fetch exchange rate", e);
            return 84; // Fallback
        }
    },

    async getRebalancerConfig(): Promise<string> {
        const res = await fetchWithAuth(`${API_BASE}/rebalancer-config`);
        if (!res.ok) throw new Error("Failed to fetch rebalancer config");
        const data = await res.json();
        return data.config || "";
    },

    async saveRebalancerConfig(config: string): Promise<void> {
        const res = await fetchWithAuth(`${API_BASE}/rebalancer-config`, {
            method: 'POST',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ config }),
        });
        if (!res.ok) throw new Error("Failed to save rebalancer config");
    },
};
