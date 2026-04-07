package db

import (
	"time"
)

// DeleteAllUserData hard-deletes all records (except the user account itself) for the given UserID.
func (s *Store) DeleteAllUserData(userID int64) error {
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	queries := []string{
		"DELETE FROM transactions WHERE user_id = ?",
		"DELETE FROM portfolio_history WHERE user_id = ?",
		"DELETE FROM rebalancer_config WHERE user_id = ?",
		"DELETE FROM job_details WHERE user_id = ?",
		"DELETE FROM salary_history WHERE user_id = ?",
	}

	for _, q := range queries {
		if _, err := tx.Exec(q, userID); err != nil {
			return err
		}
	}

	return tx.Commit()
}

// CopyUserData copies all data from source DB into this store (target) for the given user.
func (s *Store) CopyUserData(source *Store, userID int64) error {
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var name, email string
	_ = source.DB.QueryRow("SELECT name, email FROM users WHERE id = ?", userID).Scan(&name, &email)
	if name != "" && email != "" {
		if _, err := tx.Exec("INSERT OR IGNORE INTO users (id, name, email) VALUES (?, ?, ?)", userID, name, email); err != nil {
			return err
		}
	}

	// 1. Job Details
	if jd, err := source.GetJobDetails(userID); err == nil && jd.ID != 0 {
		_, err = tx.Exec(
			`INSERT INTO job_details (user_id, joining_date, current_ctc) VALUES (?, ?, ?)
			 ON CONFLICT(user_id) DO UPDATE SET joining_date = excluded.joining_date, current_ctc = excluded.current_ctc`,
			userID, jd.JoiningDate.Format(time.RFC3339), jd.CurrentCTC)
		if err != nil {
			return err
		}
	}

	// 2. Rebalancer Config
	if cfg, err := source.GetRebalancerConfig(userID); err == nil && cfg != "" {
		_, err = tx.Exec(
			`INSERT INTO rebalancer_config (user_id, config_json, updated_at) VALUES (?, ?, datetime('now'))
			 ON CONFLICT(user_id) DO UPDATE SET config_json = excluded.config_json, updated_at = datetime('now')`,
			userID, cfg)
		if err != nil {
			return err
		}
	}

	// 3. Transactions
	if txs, err := source.GetTransactionsByUserID(userID); err == nil {
		stmt, _ := tx.Prepare("INSERT INTO transactions (transaction_type, asset_type, fd_type, amount, date, user_id, customer_name) VALUES (?, ?, ?, ?, ?, ?, ?)")
		if stmt != nil {
			for _, t := range txs {
				if _, err := stmt.Exec(t.TransactionType, t.AssetType, t.FDType, t.Amount, t.Date.Format(time.RFC3339), userID, t.CustomerName); err != nil {
					stmt.Close()
					return err
				}
			}
			stmt.Close()
		}
	}

	// 4. Portfolio History
	if hist, err := source.GetPortfolioHistory(userID); err == nil {
		stmt, _ := tx.Prepare("INSERT INTO portfolio_history (date, total_amount, user_id, asset_summary_json) VALUES (?, ?, ?, ?)")
		if stmt != nil {
			for _, h := range hist {
				if _, err := stmt.Exec(h.Date.Format(time.RFC3339), h.TotalAmount, userID, h.AssetSummaryJSON); err != nil {
					stmt.Close()
					return err
				}
			}
			stmt.Close()
		}
	}

	// 5. Salary History
	if sal, err := source.GetSalaryHistory(userID); err == nil {
		stmt, _ := tx.Prepare("INSERT INTO salary_history (user_id, date, ctc, event_type) VALUES (?, ?, ?, ?)")
		if stmt != nil {
			for _, sh := range sal {
				if _, err := stmt.Exec(userID, sh.Date.Format(time.RFC3339), sh.CTC, sh.EventType); err != nil {
					stmt.Close()
					return err
				}
			}
			stmt.Close()
		}
	}

	return tx.Commit()
}
