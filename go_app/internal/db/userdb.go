package db

import (
	"database/sql"
	"fmt"

	_ "github.com/tursodatabase/libsql-client-go/libsql"
)

// ConnectUserDB opens a connection to the user's personal Turso database.
// tursoURL is the full libsql:// URL; tursoToken is the Turso auth token.
func ConnectUserDB(tursoURL, tursoToken string) (*Store, error) {
	// Build the full DSN: tursoURL?authToken=tursoToken
	dsn := fmt.Sprintf("%s?authToken=%s", tursoURL, tursoToken)
	conn, err := sql.Open("libsql", dsn)
	if err != nil {
		return nil, fmt.Errorf("ConnectUserDB: %w", err)
	}
	// Ping to verify connectivity
	if err := conn.Ping(); err != nil {
		conn.Close()
		return nil, fmt.Errorf("ConnectUserDB ping: %w", err)
	}
	return &Store{DB: conn}, nil
}

// MigrateUserDB ensures all required tables exist in the user's personal DB.
// It is idempotent — safe to call on every login.
func MigrateUserDB(s *Store) error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY,
			name TEXT,
			email TEXT UNIQUE,
			password TEXT,
			date_of_birth DATETIME,
			yearly_expense REAL,
			inflation_rate REAL,
			life_expectancy REAL
		);`,
		`CREATE TABLE IF NOT EXISTS transactions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			transaction_type TEXT,
			asset_type TEXT DEFAULT 'debt',
			fd_type TEXT,
			amount REAL,
			date DATETIME,
			user_id INTEGER,
			customer_name TEXT,
			FOREIGN KEY(user_id) REFERENCES users(id)
		);`,
		`CREATE TABLE IF NOT EXISTS interest_rates (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			fd_type TEXT,
			date DATETIME,
			rate REAL
		);`,
		`CREATE TABLE IF NOT EXISTS portfolio_history (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			date DATETIME,
			total_amount REAL,
			user_id INTEGER,
			asset_summary_json TEXT,
			FOREIGN KEY(user_id) REFERENCES users(id)
		);`,
		`CREATE TABLE IF NOT EXISTS rebalancer_config (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER UNIQUE,
			config_json TEXT,
			updated_at DATETIME,
			FOREIGN KEY(user_id) REFERENCES users(id)
		);`,
		`CREATE TABLE IF NOT EXISTS job_details (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER UNIQUE,
			joining_date DATETIME,
			current_ctc REAL,
			FOREIGN KEY(user_id) REFERENCES users(id)
		);`,
		`CREATE TABLE IF NOT EXISTS salary_history (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER,
			date DATETIME,
			ctc REAL,
			event_type TEXT,
			FOREIGN KEY(user_id) REFERENCES users(id)
		);`,
	}
	for _, q := range queries {
		if _, err := s.DB.Exec(q); err != nil {
			return fmt.Errorf("MigrateUserDB: %w", err)
		}
	}
	return nil
}
