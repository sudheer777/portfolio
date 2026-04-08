package models

import (
	"time"
)

type User struct {
	ID             int64      `json:"id"`
	Name           string     `json:"name"`
	Email          string     `json:"email"`
	Password       string     `json:"-"` // Never send password in JSON
	DateOfBirth    *time.Time `json:"date_of_birth"`
	YearlyExpense  *float64   `json:"yearly_expense"`
	InflationRate  *float64   `json:"inflation_rate"`
	LifeExpectancy *float64   `json:"life_expectancy"`
	// BYODB fields — never sent to client
	KDFSalt             []byte `json:"-"`
	EncryptedTursoURL   []byte `json:"-"`
	EncryptedTursoToken []byte `json:"-"`
}

type Transaction struct {
	ID              int64     `json:"id"`
	TransactionType string    `json:"transaction_type"`
	AssetType       string    `json:"asset_type"` // e.g., debt, equity, gold, real_estate
	FDType          string    `json:"fd_type"`
	Amount          float64   `json:"amount"`
	Date            time.Time `json:"date"`
	UserID          int64     `json:"user_id"`
	CustomerName    string    `json:"customer_name"` // For multi-customer support under one user
}

type InterestRate struct {
	ID     int64     `json:"id"`
	FDType string    `json:"fd_type"`
	Date   time.Time `json:"date"`
	Rate   float64   `json:"rate"`
}

type Amount struct {
	Principal   float64 `json:"principal"`
	Interest    float64 `json:"interest"`
	DayChange   float64 `json:"day_change"`
	FinalAmount float64 `json:"final_amount"`
}

type PortfolioSummary struct {
	UserSummaries []UserSummary     `json:"user_summaries"`
	Total         Amount            `json:"total"`
	AssetTypes    map[string]Amount `json:"asset_types"`
}

type UserSummary struct {
	UserName   string            `json:"user_name"`
	UserID     int64             `json:"user_id"`
	FDS        map[string]Amount `json:"fds"`
	AssetTypes map[string]Amount `json:"asset_types"`
	Total      Amount            `json:"total"`
}

type PortfolioHistory struct {
	ID                   int64     `json:"id"`
	Date                 time.Time `json:"date"`
	TotalAmount          float64   `json:"total_amount"`
	UserID               int64     `json:"user_id"`
	AssetSummaryJSON     *string   `json:"asset_summary_json"`
	RebalancerConfigJSON *string   `json:"rebalancer_config_json"`
}

type JobDetails struct {
	ID          int64     `json:"id"`
	UserID      int64     `json:"user_id"`
	JoiningDate time.Time `json:"joining_date"`
	CurrentCTC  float64   `json:"current_ctc"`
}

type SalaryHistory struct {
	ID        int64     `json:"id"`
	UserID    int64     `json:"user_id"`
	Date      time.Time `json:"date"`
	CTC       float64   `json:"ctc"`
	EventType string    `json:"event_type"` // e.g., "Joining", "Hike", "Promotion"
}
