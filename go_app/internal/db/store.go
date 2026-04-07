package db

import (
	"database/sql"
	"time"

	"portfolio/internal/models"
)

// Store wraps a *sql.DB and provides all data-access methods.
// Using Store allows per-user DB connections: each user gets their own Store
// pointing to their personal Turso database. The admin's Store (Default) is
// used for users who haven't set up BYODB.
type Store struct {
	DB *sql.DB
}

// Default is the admin's shared store, initialized by Init().
var Default *Store

// ── User methods ────────────────────────────────────────────────────────────

func (s *Store) CreateUser(name, email, passwordHash string) (int64, error) {
	res, err := s.DB.Exec("INSERT INTO users (name, email, password) VALUES (?, ?, ?)", name, email, passwordHash)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (s *Store) StoreUserTursoCredentials(userID int64, salt, encURL, encToken []byte) error {
	_, err := s.DB.Exec(
		"UPDATE users SET kdf_salt = ?, encrypted_turso_url = ?, encrypted_turso_token = ? WHERE id = ?",
		salt, encURL, encToken, userID,
	)
	return err
}

func (s *Store) GetUserByEmail(email string) (models.User, error) {
	var u models.User
	var dobStr sql.NullString
	var kdfSalt, encURL, encToken []byte
	err := s.DB.QueryRow(
		`SELECT id, name, email, password, date_of_birth, yearly_expense, inflation_rate, life_expectancy,
		        kdf_salt, encrypted_turso_url, encrypted_turso_token
		 FROM users WHERE email = ?`, email,
	).Scan(&u.ID, &u.Name, &u.Email, &u.Password, &dobStr,
		&u.YearlyExpense, &u.InflationRate, &u.LifeExpectancy,
		&kdfSalt, &encURL, &encToken)
	if err != nil {
		return u, err
	}
	if dobStr.Valid && dobStr.String != "" {
		if t, e := time.Parse(time.RFC3339, dobStr.String); e == nil {
			u.DateOfBirth = &t
		}
	}
	u.KDFSalt = kdfSalt
	u.EncryptedTursoURL = encURL
	u.EncryptedTursoToken = encToken
	return u, nil
}

func (s *Store) GetUserByID(id int64) (models.User, error) {
	var u models.User
	var dobStr sql.NullString
	err := s.DB.QueryRow(
		"SELECT id, name, email, password, date_of_birth, yearly_expense, inflation_rate, life_expectancy FROM users WHERE id = ?", id,
	).Scan(&u.ID, &u.Name, &u.Email, &u.Password, &dobStr,
		&u.YearlyExpense, &u.InflationRate, &u.LifeExpectancy)
	if err != nil {
		return u, err
	}
	if dobStr.Valid && dobStr.String != "" {
		if t, e := time.Parse(time.RFC3339, dobStr.String); e == nil {
			u.DateOfBirth = &t
		}
	}
	return u, nil
}

func (s *Store) UpdateUserDOB(userID int64, dob time.Time) error {
	_, err := s.DB.Exec("UPDATE users SET date_of_birth = ? WHERE id = ?", dob.Format(time.RFC3339), userID)
	return err
}

func (s *Store) UpdateUserPassword(userID int64, passwordHash string) error {
	_, err := s.DB.Exec("UPDATE users SET password = ? WHERE id = ?", passwordHash, userID)
	return err
}

func (s *Store) UpdateUserPasswordWithTurso(userID int64, passwordHash string, salt, encURL, encToken []byte) error {
	_, err := s.DB.Exec(
		"UPDATE users SET password = ?, kdf_salt = ?, encrypted_turso_url = ?, encrypted_turso_token = ? WHERE id = ?",
		passwordHash, salt, encURL, encToken, userID)
	return err
}

func (s *Store) UpdateFireSettings(userID int64, yearlyExpense, inflationRate, lifeExpectancy float64) error {
	_, err := s.DB.Exec("UPDATE users SET yearly_expense = ?, inflation_rate = ?, life_expectancy = ? WHERE id = ?",
		yearlyExpense, inflationRate, lifeExpectancy, userID)
	return err
}

// ── Transaction methods ──────────────────────────────────────────────────────

func (s *Store) AddTransaction(t models.Transaction) error {
	_, err := s.DB.Exec(
		"INSERT INTO transactions (transaction_type, fd_type, amount, date, user_id, customer_name, asset_type) VALUES (?, ?, ?, ?, ?, ?, ?)",
		t.TransactionType, t.FDType, t.Amount, t.Date, t.UserID, t.CustomerName, t.AssetType)
	return err
}

func (s *Store) GetTransactionsByUserID(userID int64) ([]models.Transaction, error) {
	rows, err := s.DB.Query(
		"SELECT id, transaction_type, fd_type, amount, date, user_id, customer_name, asset_type FROM transactions WHERE user_id = ?", userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanTransactionRows(rows)
}

func (s *Store) GetTransactionsByCustomer(userID int64, customerName string) ([]models.Transaction, error) {
	rows, err := s.DB.Query(
		"SELECT id, transaction_type, fd_type, amount, date, user_id, customer_name, asset_type FROM transactions WHERE user_id = ? AND customer_name = ?",
		userID, customerName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanTransactionRows(rows)
}

func (s *Store) UpdateTransaction(t models.Transaction) error {
	_, err := s.DB.Exec(
		"UPDATE transactions SET transaction_type = ?, asset_type = ?, fd_type = ?, amount = ?, date = ?, customer_name = ? WHERE id = ?",
		t.TransactionType, t.AssetType, t.FDType, t.Amount, t.Date, t.CustomerName, t.ID)
	return err
}

func (s *Store) DeleteTransaction(id int64) error {
	_, err := s.DB.Exec("DELETE FROM transactions WHERE id = ?", id)
	return err
}

func (s *Store) GetUniqueCustomers(userID int64) ([]string, error) {
	rows, err := s.DB.Query(
		"SELECT DISTINCT customer_name FROM transactions WHERE user_id = ? ORDER BY customer_name", userID)
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

// ── Interest Rate methods ────────────────────────────────────────────────────

func (s *Store) AddInterestRate(r models.InterestRate) error {
	_, err := s.DB.Exec("INSERT INTO interest_rates (fd_type, date, rate) VALUES (?, ?, ?)", r.FDType, r.Date, r.Rate)
	return err
}

func (s *Store) UpdateInterestRate(r models.InterestRate) error {
	_, err := s.DB.Exec("UPDATE interest_rates SET fd_type = ?, date = ?, rate = ? WHERE id = ?", r.FDType, r.Date, r.Rate, r.ID)
	return err
}

func (s *Store) DeleteInterestRate(id int64) error {
	_, err := s.DB.Exec("DELETE FROM interest_rates WHERE id = ?", id)
	return err
}

func (s *Store) GetAllInterestRates() ([]models.InterestRate, error) {
	rows, err := s.DB.Query("SELECT id, fd_type, date, rate FROM interest_rates ORDER BY date")
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

// ── Portfolio History methods ─────────────────────────────────────────────────

func (s *Store) AddPortfolioHistory(h models.PortfolioHistory) error {
	_, err := s.DB.Exec(
		"INSERT INTO portfolio_history (date, total_amount, user_id, asset_summary_json) VALUES (?, ?, ?, ?)",
		h.Date, h.TotalAmount, h.UserID, h.AssetSummaryJSON)
	return err
}

func (s *Store) GetPortfolioHistory(userID int64) ([]models.PortfolioHistory, error) {
	rows, err := s.DB.Query(
		"SELECT id, date, total_amount, user_id, asset_summary_json FROM portfolio_history WHERE user_id = ? ORDER BY date", userID)
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

func (s *Store) UpdatePortfolioHistory(h models.PortfolioHistory) error {
	_, err := s.DB.Exec(
		"UPDATE portfolio_history SET date = ?, total_amount = ?, asset_summary_json = ? WHERE id = ? AND user_id = ?",
		h.Date, h.TotalAmount, h.AssetSummaryJSON, h.ID, h.UserID)
	return err
}

func (s *Store) DeletePortfolioHistory(id, userID int64) error {
	_, err := s.DB.Exec("DELETE FROM portfolio_history WHERE id = ? AND user_id = ?", id, userID)
	return err
}

// ── Rebalancer config ─────────────────────────────────────────────────────────

func (s *Store) SaveRebalancerConfig(userID int64, configJSON string) error {
	_, err := s.DB.Exec(
		`INSERT INTO rebalancer_config (user_id, config_json, updated_at) VALUES (?, ?, datetime('now'))
		 ON CONFLICT(user_id) DO UPDATE SET config_json = excluded.config_json, updated_at = datetime('now')`,
		userID, configJSON)
	return err
}

func (s *Store) GetRebalancerConfig(userID int64) (string, error) {
	var configJSON string
	err := s.DB.QueryRow("SELECT config_json FROM rebalancer_config WHERE user_id = ?", userID).Scan(&configJSON)
	if err != nil {
		if err.Error() == "sql: no rows in result set" {
			return "", nil
		}
		return "", err
	}
	return configJSON, nil
}

// ── Job Details ───────────────────────────────────────────────────────────────

func (s *Store) SaveJobDetails(details models.JobDetails) error {
	_, err := s.DB.Exec(
		`INSERT INTO job_details (user_id, joining_date, current_ctc) VALUES (?, ?, ?)
		 ON CONFLICT(user_id) DO UPDATE SET joining_date = excluded.joining_date, current_ctc = excluded.current_ctc`,
		details.UserID, details.JoiningDate, details.CurrentCTC)
	return err
}

func (s *Store) GetJobDetails(userID int64) (models.JobDetails, error) {
	var jd models.JobDetails
	var dateStr string
	err := s.DB.QueryRow(
		"SELECT id, user_id, joining_date, current_ctc FROM job_details WHERE user_id = ?", userID,
	).Scan(&jd.ID, &jd.UserID, &dateStr, &jd.CurrentCTC)
	if err != nil {
		if err.Error() == "sql: no rows in result set" {
			return jd, nil
		}
		return jd, err
	}
	jd.JoiningDate, _ = time.Parse(time.RFC3339, dateStr)
	return jd, nil
}

// ── Salary History ────────────────────────────────────────────────────────────

func (s *Store) AddSalaryHistory(h models.SalaryHistory) error {
	_, err := s.DB.Exec(
		"INSERT INTO salary_history (user_id, date, ctc, event_type) VALUES (?, ?, ?, ?)",
		h.UserID, h.Date, h.CTC, h.EventType)
	return err
}

func (s *Store) GetSalaryHistory(userID int64) ([]models.SalaryHistory, error) {
	rows, err := s.DB.Query(
		"SELECT id, user_id, date, ctc, event_type FROM salary_history WHERE user_id = ? ORDER BY date", userID)
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

func (s *Store) DeleteSalaryHistory(id, userID int64) error {
	_, err := s.DB.Exec("DELETE FROM salary_history WHERE id = ? AND user_id = ?", id, userID)
	return err
}

// ── Helper ────────────────────────────────────────────────────────────────────

func scanTransactionRows(rows *sql.Rows) ([]models.Transaction, error) {
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
