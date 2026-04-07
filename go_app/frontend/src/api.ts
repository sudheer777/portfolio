import type { InterestRate, PortfolioSummary, Transaction, User, JobDetails, SalaryHistory, PortfolioHistory } from "./types";

const API_BASE = "/api";
const AUTH_BASE = "";

// Helper to add auth header
const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    const token = localStorage.getItem("token");
    const tursoURL = localStorage.getItem("turso_url") || "";
    const tursoToken = localStorage.getItem("turso_token") || "";
    const headers: Record<string, string> = {
        ...(options.headers as Record<string, string>),
        "Authorization": token ? `Bearer ${token}` : "",
    };
    if (tursoURL) headers["X-Turso-URL"] = tursoURL;
    if (tursoToken) headers["X-Turso-Token"] = tursoToken;
    return fetch(url, { ...options, headers }).then(res => {
        if (res.status === 401) {
            localStorage.removeItem("token");
            localStorage.removeItem("turso_url");
            localStorage.removeItem("turso_token");
            window.location.reload();
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
        // BYODB: store Turso credentials if the user has their own DB configured
        if (data.turso_url) localStorage.setItem("turso_url", data.turso_url);
        else localStorage.removeItem("turso_url");
        if (data.turso_token) localStorage.setItem("turso_token", data.turso_token);
        else localStorage.removeItem("turso_token");
        return data;
    },

    register: async (name: string, email: string, password: string, tursoUrl?: string, tursoToken?: string): Promise<any> => {
        const res = await fetch(`${AUTH_BASE}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, password, turso_url: tursoUrl || "", turso_token: tursoToken || "" }),
        });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || "Registration failed");
        }
        return res.json();
    },

    migrateDB: async (currentPassword: string, tursoUrl: string, tursoToken: string, deleteOldData: boolean): Promise<any> => {
        const res = await fetchWithAuth(`${API_BASE}/user/migrate-db`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                current_password: currentPassword,
                turso_url: tursoUrl,
                turso_token: tursoToken,
                delete_old_data: deleteOldData
            }),
        });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || "Migration failed");
        }
        return res.json();
    },

    changePassword: async (currentPassword: string, newPassword: string): Promise<any> => {
        const res = await fetchWithAuth(`${API_BASE}/user/password`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                current_password: currentPassword,
                new_password: newPassword,
            }),
        });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || "Password change failed");
        }
        return res.json();
    },

    logout: () => {
        localStorage.removeItem("token");
        localStorage.removeItem("turso_url");
        localStorage.removeItem("turso_token");
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

    getMe: async (): Promise<User> => {
        const res = await fetchWithAuth(`${API_BASE}/me`);
        if (!res.ok) throw new Error("Failed to fetch current user");
        return res.json();
    },

    updateUserDOB: async (date_of_birth: string): Promise<void> => {
        const res = await fetchWithAuth(`${API_BASE}/user/dob`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ date_of_birth }),
        });
        if (!res.ok) throw new Error("Failed to update date of birth");
    },

    updateFireSettings: async (yearly_expense: number, inflation_rate: number, life_expectancy: number): Promise<void> => {
        const res = await fetchWithAuth(`${API_BASE}/user/fire-settings`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ yearly_expense, inflation_rate, life_expectancy }),
        });
        if (!res.ok) throw new Error("Failed to update fire settings");
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

    async getHistory(): Promise<PortfolioHistory[]> {
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

    getJobDetails: async (): Promise<JobDetails | null> => {
        const res = await fetchWithAuth(`${API_BASE}/job-details`);
        if (!res.ok) throw new Error("Failed to fetch job details");
        const data = await res.json();
        if (!data.id) return null; // empty response indicates not set
        return data;
    },

    saveJobDetails: async (joining_date: string, current_ctc: number): Promise<void> => {
        const res = await fetchWithAuth(`${API_BASE}/job-details`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ joining_date, current_ctc }),
        });
        if (!res.ok) throw new Error("Failed to save job details");
    },

    getSalaryHistory: async (): Promise<SalaryHistory[]> => {
        const res = await fetchWithAuth(`${API_BASE}/salary-history`);
        if (!res.ok) throw new Error("Failed to fetch salary history");
        return res.json();
    },

    addSalaryHistory: async (date: string, ctc: number, event_type: string): Promise<void> => {
        const res = await fetchWithAuth(`${API_BASE}/salary-history`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ date, ctc, event_type }),
        });
        if (!res.ok) throw new Error("Failed to save salary history");
    },

    deleteSalaryHistory: async (id: number): Promise<void> => {
        const res = await fetchWithAuth(`${API_BASE}/salary-history/${id}`, {
            method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to delete salary history");
    },
};
