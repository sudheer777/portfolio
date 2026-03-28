package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	_ "github.com/mattn/go-sqlite3"
	_ "github.com/tursodatabase/libsql-client-go/libsql"
)

func main() {
	localURL := "./portfolio.db"
	remoteURL := os.Getenv("TURSO_DATABASE_URL")
	if remoteURL == "" {
		log.Fatal("TURSO_DATABASE_URL environment variable is not set")
	}

	localDB, err := sql.Open("sqlite3", localURL)
	if err != nil {
		log.Fatalf("Failed to open local db: %v", err)
	}
	defer localDB.Close()

	remoteDB, err := sql.Open("libsql", remoteURL)
	if err != nil {
		log.Fatalf("Failed to open remote db: %v", err)
	}
	defer remoteDB.Close()

	fmt.Println("Creating tables on remote Turso DB...")
	createTables(remoteDB)

	fmt.Println("Migrating Users...")
	migrateUsers(localDB, remoteDB)

	fmt.Println("Migrating Transactions...")
	migrateTransactions(localDB, remoteDB)

	fmt.Println("Migrating Interest Rates...")
	migrateInterestRates(localDB, remoteDB)

	fmt.Println("Migrating Portfolio History...")
	migratePortfolioHistory(localDB, remoteDB)

	fmt.Println("Migrating Rebalancer Config...")
	migrateRebalancerConfig(localDB, remoteDB)

	fmt.Println("Migration complete!")
}

func createTables(db *sql.DB) {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY,
			name TEXT,
			email TEXT UNIQUE,
			password TEXT
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
			FOREIGN KEY(user_id) REFERENCES users(id)
		);`,
		`CREATE TABLE IF NOT EXISTS rebalancer_config (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER UNIQUE,
			config_json TEXT,
			updated_at DATETIME,
			FOREIGN KEY(user_id) REFERENCES users(id)
		);`,
	}

	for _, q := range queries {
		if _, err := db.Exec(q); err != nil {
			log.Fatalf("Failed to create table: %v\nQuery: %s", err, q)
		}
	}
}

func migrateUsers(local *sql.DB, remote *sql.DB) {
	rows, err := local.Query("SELECT id, name, email, password FROM users")
	if err != nil {
		log.Fatalf("Query users failed: %v", err)
	}
	defer rows.Close()

	for rows.Next() {
		var id int
		var name, email, password sql.NullString
		rows.Scan(&id, &name, &email, &password)
		_, err := remote.Exec("INSERT OR IGNORE INTO users (id, name, email, password) VALUES (?, ?, ?, ?)", id, name, email, password)
		if err != nil {
			log.Printf("Insert user failed for id %d: %v", id, err)
		}
	}
}

func migrateTransactions(local *sql.DB, remote *sql.DB) {
	rows, err := local.Query("SELECT id, transaction_type, asset_type, fd_type, amount, date, user_id, customer_name FROM transactions")
	if err != nil {
		log.Fatalf("Query transactions failed: %v", err)
	}
	defer rows.Close()

	for rows.Next() {
		var id int
		var txType, assetType, fdType, date, customerName sql.NullString
		var amount sql.NullFloat64
		var userID sql.NullInt64
		rows.Scan(&id, &txType, &assetType, &fdType, &amount, &date, &userID, &customerName)
		_, err := remote.Exec("INSERT OR IGNORE INTO transactions (id, transaction_type, asset_type, fd_type, amount, date, user_id, customer_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
			id, txType, assetType, fdType, amount, date, userID, customerName)
		if err != nil {
			log.Printf("Insert transaction failed for id %d: %v", id, err)
		}
	}
}

func migrateInterestRates(local *sql.DB, remote *sql.DB) {
	rows, err := local.Query("SELECT id, fd_type, date, rate FROM interest_rates")
	if err != nil {
		log.Fatalf("Query interest_rates failed: %v", err)
	}
	defer rows.Close()

	for rows.Next() {
		var id int
		var fdType, date sql.NullString
		var rate sql.NullFloat64
		rows.Scan(&id, &fdType, &date, &rate)
		_, err := remote.Exec("INSERT OR IGNORE INTO interest_rates (id, fd_type, date, rate) VALUES (?, ?, ?, ?)", id, fdType, date, rate)
		if err != nil {
			log.Printf("Insert interest_rate failed for id %d: %v", id, err)
		}
	}
}

func migratePortfolioHistory(local *sql.DB, remote *sql.DB) {
	rows, err := local.Query("SELECT id, date, total_amount, user_id FROM portfolio_history")
	if err != nil {
		log.Fatalf("Query portfolio_history failed: %v", err)
	}
	defer rows.Close()

	for rows.Next() {
		var id int
		var date sql.NullString
		var totalAmount sql.NullFloat64
		var userID sql.NullInt64
		rows.Scan(&id, &date, &totalAmount, &userID)
		_, err := remote.Exec("INSERT OR IGNORE INTO portfolio_history (id, date, total_amount, user_id) VALUES (?, ?, ?, ?)", id, date, totalAmount, userID)
		if err != nil {
			log.Printf("Insert history failed for id %d: %v", id, err)
		}
	}
}

func migrateRebalancerConfig(local *sql.DB, remote *sql.DB) {
	rows, err := local.Query("SELECT id, user_id, config_json, updated_at FROM rebalancer_config")
	if err != nil {
		log.Fatalf("Query rebalancer_config failed: %v", err)
	}
	defer rows.Close()

	for rows.Next() {
		var id int
		var userID sql.NullInt64
		var configJson, updatedAt sql.NullString
		rows.Scan(&id, &userID, &configJson, &updatedAt)
		_, err := remote.Exec("INSERT OR IGNORE INTO rebalancer_config (id, user_id, config_json, updated_at) VALUES (?, ?, ?, ?)", id, userID, configJson, updatedAt)
		if err != nil {
			log.Printf("Insert rebalancer_config failed for id %d: %v", id, err)
		}
	}
}
