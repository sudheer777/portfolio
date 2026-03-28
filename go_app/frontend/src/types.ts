export interface User {
    id: number;
    name: string;
}

export interface Transaction {
    id: number;
    transaction_type: string;
    asset_type: string;
    fd_type: string;
    amount: number;
    date: string;
    user_id?: number;
    customer_name?: string;
}

export interface Amount {
    principal: number;
    interest: number;
    day_change: number;
    final_amount: number;
}

export interface UserSummary {
    user_name: string;
    user_id: number;
    fds: Record<string, Amount>;
    asset_types: Record<string, Amount>;
    total: Amount;
}

export interface PortfolioSummary {
    user_summaries: UserSummary[];
    total: Amount;
    asset_types: Record<string, Amount>;
}

export interface InterestRate {
    id: number;
    fd_type: string;
    date: string;
    rate: number;
}
