package db

import (
	"database/sql"
	"time"

	"portfolio/internal/models"

	_ "github.com/tursodatabase/libsql-client-go/libsql"
)

// DB is kept for backward compatibility. Use Default.DB directly in new code.
var DB *sql.DB

// Init opens the admin database and initialises the Default store.
func Init(dataSourceName string) error {
	var err error
	DB, err = sql.Open("libsql", dataSourceName)
	if err != nil {
		return err
	}
	Default = &Store{DB: DB}
	return createAdminTables()
}

func createAdminTables() error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY,
			name TEXT,
			email TEXT UNIQUE,
			password TEXT,
			date_of_birth DATETIME,
			yearly_expense REAL,
			inflation_rate REAL,
			life_expectancy REAL,
			kdf_salt BLOB,
			encrypted_turso_url BLOB,
			encrypted_turso_token BLOB
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
			rebalancer_config_json TEXT,
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
		if _, err := DB.Exec(q); err != nil {
			return err
		}
	}
	// Migrations for existing DBs (errors safely ignored — column may already exist)
	DB.Exec(`ALTER TABLE users ADD COLUMN date_of_birth DATETIME;`)
	DB.Exec(`ALTER TABLE users ADD COLUMN yearly_expense REAL;`)
	DB.Exec(`ALTER TABLE users ADD COLUMN inflation_rate REAL;`)
	DB.Exec(`ALTER TABLE users ADD COLUMN life_expectancy REAL;`)
	DB.Exec(`ALTER TABLE users ADD COLUMN kdf_salt BLOB;`)
	DB.Exec(`ALTER TABLE users ADD COLUMN encrypted_turso_url BLOB;`)
	DB.Exec(`ALTER TABLE users ADD COLUMN encrypted_turso_token BLOB;`)
	DB.Exec(`ALTER TABLE portfolio_history ADD COLUMN asset_summary_json TEXT;`)
	DB.Exec(`ALTER TABLE portfolio_history ADD COLUMN rebalancer_config_json TEXT;`)
	return nil
}

// ── Package-level shims (delegate to Default store) ──────────────────────────
// These keep existing callers working without changes.

func CreateUser(name, email, passwordHash string) (int64, error) {
	return Default.CreateUser(name, email, passwordHash)
}

func GetUserByEmail(email string) (models.User, error) {
	return Default.GetUserByEmail(email)
}

func GetUserByID(id int64) (models.User, error) {
	return Default.GetUserByID(id)
}

func UpdateUserDOB(userID int64, dob time.Time) error {
	return Default.UpdateUserDOB(userID, dob)
}

func UpdateUserPassword(userID int64, passwordHash string) error {
	return Default.UpdateUserPassword(userID, passwordHash)
}

func UpdateFireSettings(userID int64, yearlyExpense, inflationRate, lifeExpectancy float64) error {
	return Default.UpdateFireSettings(userID, yearlyExpense, inflationRate, lifeExpectancy)
}

func AddUser(user models.User) error {
	dob := sql.NullString{}
	if user.DateOfBirth != nil {
		dob.String = user.DateOfBirth.Format(time.RFC3339)
		dob.Valid = true
	}
	_, err := DB.Exec(
		"INSERT OR IGNORE INTO users (id, name, email, password, date_of_birth, yearly_expense, inflation_rate, life_expectancy) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
		user.ID, user.Name, user.Email, user.Password, dob, user.YearlyExpense, user.InflationRate, user.LifeExpectancy)
	return err
}

func GetAllUsers() (map[int64]models.User, error) {
	rows, err := DB.Query("SELECT id, name FROM users")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	users := make(map[int64]models.User)
	for rows.Next() {
		var u models.User
		if err := rows.Scan(&u.ID, &u.Name); err != nil {
			return nil, err
		}
		users[u.ID] = u
	}
	return users, nil
}

func AddTransaction(t models.Transaction) error         { return Default.AddTransaction(t) }
func GetAllTransactions() ([]models.Transaction, error) { return Default.GetTransactionsByUserID(0) }
func GetTransactionsByUserID(userID int64) ([]models.Transaction, error) {
	return Default.GetTransactionsByUserID(userID)
}
func GetTransactionsByCustomer(userID int64, name string) ([]models.Transaction, error) {
	return Default.GetTransactionsByCustomer(userID, name)
}
func UpdateTransaction(t models.Transaction) error { return Default.UpdateTransaction(t) }
func DeleteTransaction(id int64) error             { return Default.DeleteTransaction(id) }
func GetUniqueCustomers(userID int64) ([]string, error) {
	return Default.GetUniqueCustomers(userID)
}

func AddInterestRate(r models.InterestRate) error    { return Default.AddInterestRate(r) }
func UpdateInterestRate(r models.InterestRate) error { return Default.UpdateInterestRate(r) }
func DeleteInterestRate(id int64) error              { return Default.DeleteInterestRate(id) }
func GetAllInterestRates() ([]models.InterestRate, error) {
	return Default.GetAllInterestRates()
}

func AddPortfolioHistory(h models.PortfolioHistory) error { return Default.AddPortfolioHistory(h) }
func GetPortfolioHistory(userID int64) ([]models.PortfolioHistory, error) {
	return Default.GetPortfolioHistory(userID)
}
func UpdatePortfolioHistory(h models.PortfolioHistory) error {
	return Default.UpdatePortfolioHistory(h)
}
func DeletePortfolioHistory(id, userID int64) error {
	return Default.DeletePortfolioHistory(id, userID)
}

func SaveRebalancerConfig(userID int64, cfg string) error {
	return Default.SaveRebalancerConfig(userID, cfg)
}
func GetRebalancerConfig(userID int64) (string, error) { return Default.GetRebalancerConfig(userID) }

func SaveJobDetails(d models.JobDetails) error              { return Default.SaveJobDetails(d) }
func GetJobDetails(userID int64) (models.JobDetails, error) { return Default.GetJobDetails(userID) }

func AddSalaryHistory(h models.SalaryHistory) error { return Default.AddSalaryHistory(h) }
func GetSalaryHistory(userID int64) ([]models.SalaryHistory, error) {
	return Default.GetSalaryHistory(userID)
}
func DeleteSalaryHistory(id, userID int64) error { return Default.DeleteSalaryHistory(id, userID) }

// scanTransactions kept for any legacy code referencing it
func scanTransactions(rows *sql.Rows) ([]models.Transaction, error) {
	return scanTransactionRows(rows)
}
