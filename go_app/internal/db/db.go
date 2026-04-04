package db

import (
	"database/sql"
	"time"

	"portfolio/internal/models"

	_ "github.com/tursodatabase/libsql-client-go/libsql"
)

var DB *sql.DB

func Init(dataSourceName string) error {
	var err error
	DB, err = sql.Open("libsql", dataSourceName)
	if err != nil {
		return err
	}
	return createTables()
}

func createTables() error {
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
		if _, err := DB.Exec(q); err != nil {
			return err
		}
	}

	// Migrations for existing DBs
	DB.Exec(`ALTER TABLE users ADD COLUMN date_of_birth DATETIME;`) // Ignores error if column already exists
	DB.Exec(`ALTER TABLE users ADD COLUMN yearly_expense REAL;`)
	DB.Exec(`ALTER TABLE users ADD COLUMN inflation_rate REAL;`)
	DB.Exec(`ALTER TABLE users ADD COLUMN life_expectancy REAL;`)
	DB.Exec(`ALTER TABLE portfolio_history ADD COLUMN asset_summary_json TEXT;`)

	return nil
}

func CreateUser(name, email, passwordHash string) (int64, error) {
	res, err := DB.Exec("INSERT INTO users (name, email, password) VALUES (?, ?, ?)", name, email, passwordHash)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func GetUserByEmail(email string) (models.User, error) {
	var u models.User
	var dobStr sql.NullString
	err := DB.QueryRow("SELECT id, name, email, password, date_of_birth, yearly_expense, inflation_rate, life_expectancy FROM users WHERE email = ?", email).Scan(
		&u.ID, &u.Name, &u.Email, &u.Password, &dobStr, &u.YearlyExpense, &u.InflationRate, &u.LifeExpectancy)

	if dobStr.Valid && dobStr.String != "" {
		parsedDate, parseErr := time.Parse(time.RFC3339, dobStr.String)
		if parseErr == nil {
			u.DateOfBirth = &parsedDate
		}
	}
	return u, err
}

func GetUserByID(id int64) (models.User, error) {
	var u models.User
	var dobStr sql.NullString
	err := DB.QueryRow("SELECT id, name, email, password, date_of_birth, yearly_expense, inflation_rate, life_expectancy FROM users WHERE id = ?", id).Scan(
		&u.ID, &u.Name, &u.Email, &u.Password, &dobStr, &u.YearlyExpense, &u.InflationRate, &u.LifeExpectancy)

	if dobStr.Valid && dobStr.String != "" {
		parsedDate, parseErr := time.Parse(time.RFC3339, dobStr.String)
		if parseErr == nil {
			u.DateOfBirth = &parsedDate
		}
	}
	return u, err
}

func UpdateUserDOB(userID int64, dob time.Time) error {
	_, err := DB.Exec("UPDATE users SET date_of_birth = ? WHERE id = ?", dob.Format(time.RFC3339), userID)
	return err
}

func UpdateFireSettings(userID int64, yearlyExpense, inflationRate, lifeExpectancy float64) error {
	_, err := DB.Exec("UPDATE users SET yearly_expense = ?, inflation_rate = ?, life_expectancy = ? WHERE id = ?",
		yearlyExpense, inflationRate, lifeExpectancy, userID)
	return err
}

func AddUser(user models.User) error {
	// Legacy or simple add, adapted for new schema if needed, but CreateUser is preferred for auth
	dob := sql.NullString{}
	if user.DateOfBirth != nil {
		dob.String = user.DateOfBirth.Format(time.RFC3339)
		dob.Valid = true
	}
	_, err := DB.Exec("INSERT OR IGNORE INTO users (id, name, email, password, date_of_birth, yearly_expense, inflation_rate, life_expectancy) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
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

func AddTransaction(t models.Transaction) error {
	_, err := DB.Exec("INSERT INTO transactions (transaction_type, fd_type, amount, date, user_id, customer_name, asset_type) VALUES (?, ?, ?, ?, ?, ?, ?)",
		t.TransactionType, t.FDType, t.Amount, t.Date, t.UserID, t.CustomerName, t.AssetType)
	return err
}

func GetAllTransactions() ([]models.Transaction, error) {
	rows, err := DB.Query("SELECT id, transaction_type, fd_type, amount, date, user_id, customer_name, asset_type FROM transactions")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var txs []models.Transaction
	for rows.Next() {
		var t models.Transaction
		var dateStr string
		var cName sql.NullString
		if err := rows.Scan(&t.ID, &t.TransactionType, &t.FDType, &t.Amount, &dateStr, &t.UserID, &cName, &t.AssetType); err != nil {
			return nil, err
		}
		t.Date, _ = time.Parse(time.RFC3339, dateStr)
		t.CustomerName = cName.String
		txs = append(txs, t)
	}
	return txs, nil
}

func AddInterestRate(r models.InterestRate) error {
	_, err := DB.Exec("INSERT INTO interest_rates (fd_type, date, rate) VALUES (?, ?, ?)",
		r.FDType, r.Date, r.Rate)
	return err
}

func UpdateInterestRate(r models.InterestRate) error {
	_, err := DB.Exec("UPDATE interest_rates SET fd_type = ?, date = ?, rate = ? WHERE id = ?",
		r.FDType, r.Date, r.Rate, r.ID)
	return err
}

func DeleteInterestRate(id int64) error {
	_, err := DB.Exec("DELETE FROM interest_rates WHERE id = ?", id)
	return err
}

func GetAllInterestRates() ([]models.InterestRate, error) {
	rows, err := DB.Query("SELECT id, fd_type, date, rate FROM interest_rates ORDER BY date")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var rates []models.InterestRate
	for rows.Next() {
		var r models.InterestRate
		var dateStr string
		if err := rows.Scan(&r.ID, &r.FDType, &dateStr, &r.Rate); err != nil {
			return nil, err
		}
		r.Date, _ = time.Parse(time.RFC3339, dateStr)
		rates = append(rates, r)
	}
	return rates, nil
}

func GetTransactionsByUserID(userID int64) ([]models.Transaction, error) {
	rows, err := DB.Query("SELECT id, transaction_type, fd_type, amount, date, user_id, customer_name, asset_type FROM transactions WHERE user_id = ?", userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanTransactions(rows)
}

func GetTransactionsByCustomer(userID int64, customerName string) ([]models.Transaction, error) {
	rows, err := DB.Query("SELECT id, transaction_type, fd_type, amount, date, user_id, customer_name, asset_type FROM transactions WHERE user_id = ? AND customer_name = ?", userID, customerName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanTransactions(rows)
}

func scanTransactions(rows *sql.Rows) ([]models.Transaction, error) {
	var txs []models.Transaction
	for rows.Next() {
		var t models.Transaction
		var dateStr string
		var cName sql.NullString
		if err := rows.Scan(&t.ID, &t.TransactionType, &t.FDType, &t.Amount, &dateStr, &t.UserID, &cName, &t.AssetType); err != nil {
			return nil, err
		}
		t.Date, _ = time.Parse(time.RFC3339, dateStr)
		t.CustomerName = cName.String
		txs = append(txs, t)
	}
	return txs, nil
}

func UpdateTransaction(t models.Transaction) error {
	_, err := DB.Exec("UPDATE transactions SET transaction_type = ?, asset_type = ?, fd_type = ?, amount = ?, date = ?, customer_name = ? WHERE id = ?",
		t.TransactionType, t.AssetType, t.FDType, t.Amount, t.Date, t.CustomerName, t.ID)
	return err
}

func DeleteTransaction(id int64) error {
	_, err := DB.Exec("DELETE FROM transactions WHERE id = ?", id)
	return err
}

func GetUniqueCustomers(userID int64) ([]string, error) {
	rows, err := DB.Query("SELECT DISTINCT customer_name FROM transactions WHERE user_id = ? ORDER BY customer_name", userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var customers []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		if name != "" {
			customers = append(customers, name)
		}
	}
	return customers, nil
}

func AddPortfolioHistory(h models.PortfolioHistory) error {
	_, err := DB.Exec("INSERT INTO portfolio_history (date, total_amount, user_id, asset_summary_json) VALUES (?, ?, ?, ?)", h.Date, h.TotalAmount, h.UserID, h.AssetSummaryJSON)
	return err
}

func GetPortfolioHistory(userID int64) ([]models.PortfolioHistory, error) {
	rows, err := DB.Query("SELECT id, date, total_amount, user_id, asset_summary_json FROM portfolio_history WHERE user_id = ? ORDER BY date", userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var history []models.PortfolioHistory
	for rows.Next() {
		var h models.PortfolioHistory
		var dateStr string
		var assetSummary sql.NullString
		if err := rows.Scan(&h.ID, &dateStr, &h.TotalAmount, &h.UserID, &assetSummary); err != nil {
			return nil, err
		}
		h.Date, _ = time.Parse(time.RFC3339, dateStr)
		if assetSummary.Valid && assetSummary.String != "" {
			h.AssetSummaryJSON = &assetSummary.String
		}
		history = append(history, h)
	}
	return history, nil
}

func UpdatePortfolioHistory(h models.PortfolioHistory) error {
	_, err := DB.Exec("UPDATE portfolio_history SET date = ?, total_amount = ?, asset_summary_json = ? WHERE id = ? AND user_id = ?", h.Date, h.TotalAmount, h.AssetSummaryJSON, h.ID, h.UserID)
	return err
}

func DeletePortfolioHistory(id, userID int64) error {
	_, err := DB.Exec("DELETE FROM portfolio_history WHERE id = ? AND user_id = ?", id, userID)
	return err
}

func SaveRebalancerConfig(userID int64, configJSON string) error {
	_, err := DB.Exec(`INSERT INTO rebalancer_config (user_id, config_json, updated_at) VALUES (?, ?, datetime('now'))
		ON CONFLICT(user_id) DO UPDATE SET config_json = excluded.config_json, updated_at = datetime('now')`,
		userID, configJSON)
	return err
}

func GetRebalancerConfig(userID int64) (string, error) {
	var configJSON string
	err := DB.QueryRow("SELECT config_json FROM rebalancer_config WHERE user_id = ?", userID).Scan(&configJSON)
	if err != nil {
		if err.Error() == "sql: no rows in result set" {
			return "", nil
		}
		return "", err
	}
	return configJSON, nil
}

func SaveJobDetails(details models.JobDetails) error {
	_, err := DB.Exec(`INSERT INTO job_details (user_id, joining_date, current_ctc) VALUES (?, ?, ?)
		ON CONFLICT(user_id) DO UPDATE SET joining_date = excluded.joining_date, current_ctc = excluded.current_ctc`,
		details.UserID, details.JoiningDate, details.CurrentCTC)
	return err
}

func GetJobDetails(userID int64) (models.JobDetails, error) {
	var jd models.JobDetails
	var dateStr string
	err := DB.QueryRow("SELECT id, user_id, joining_date, current_ctc FROM job_details WHERE user_id = ?", userID).
		Scan(&jd.ID, &jd.UserID, &dateStr, &jd.CurrentCTC)
	if err != nil {
		if err.Error() == "sql: no rows in result set" {
			return jd, nil // Not found is fine, return empty
		}
		return jd, err
	}
	jd.JoiningDate, _ = time.Parse(time.RFC3339, dateStr)
	return jd, nil
}

func AddSalaryHistory(h models.SalaryHistory) error {
	_, err := DB.Exec("INSERT INTO salary_history (user_id, date, ctc, event_type) VALUES (?, ?, ?, ?)",
		h.UserID, h.Date, h.CTC, h.EventType)
	return err
}

func GetSalaryHistory(userID int64) ([]models.SalaryHistory, error) {
	rows, err := DB.Query("SELECT id, user_id, date, ctc, event_type FROM salary_history WHERE user_id = ? ORDER BY date", userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var history []models.SalaryHistory
	for rows.Next() {
		var h models.SalaryHistory
		var dateStr string
		if err := rows.Scan(&h.ID, &h.UserID, &dateStr, &h.CTC, &h.EventType); err != nil {
			return nil, err
		}
		h.Date, _ = time.Parse(time.RFC3339, dateStr)
		history = append(history, h)
	}
	return history, nil
}

func DeleteSalaryHistory(id, userID int64) error {
	_, err := DB.Exec("DELETE FROM salary_history WHERE id = ? AND user_id = ?", id, userID)
	return err
}
