package db

import (
	"encoding/csv"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"
	"time"

	"portfolio/internal/auth"
	"portfolio/internal/models"
)

func Seed(usersPath, ratesPath, txPath string) error {
	// 1. Seed Single User
	userID, err := seedUser()
	if err != nil {
		return fmt.Errorf("failed to seed user: %v", err)
	}

	// 2. Seed Rates
	if err := seedRates(ratesPath); err != nil {
		fmt.Printf("Warning: failed to seed rates: %v\n", err)
	}

	// 3. Seed Transactions
	if err := seedTransactions(txPath, usersPath, userID); err != nil {
		fmt.Printf("Warning: failed to seed transactions: %v\n", err)
	}

	return nil
}

func seedUser() (int64, error) {
	// Check if user exists
	u, err := GetUserByEmail("sudheerpendyala7@gmail.com")
	if err == nil && u.ID != 0 {
		return u.ID, nil
	}

	// Create user
	hash, err := auth.HashPassword("Sudheer@7")
	if err != nil {
		return 0, err
	}
	return CreateUser("Sudheer Pendyala", "sudheerpendyala7@gmail.com", hash)
}

func seedRates(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()

	reader := csv.NewReader(f)
	records, err := reader.ReadAll()
	if err != nil {
		return err
	}

	for i, row := range records {
		if i == 0 {
			continue
		} // Header
		// fd_type,date,rate
		fdType := row[0]
		dateStr := row[1]
		rate, _ := strconv.ParseFloat(row[2], 64)

		t, err := time.Parse("2006-01-02", dateStr)
		if err != nil {
			return err
		}

		if err := AddInterestRate(models.InterestRate{
			FDType: fdType,
			Date:   t,
			Rate:   rate,
		}); err != nil {
			return err
		}
	}
	return nil
}

// Helper to read users.csv and get map of ID -> Name
func getLegacyUserMap(usersPath string) (map[int64]string, error) {
	file, err := os.Open(usersPath)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	reader := csv.NewReader(file)
	// Skip header
	if _, err := reader.Read(); err != nil {
		return nil, err
	}

	m := make(map[int64]string)
	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			continue
		}
		if len(record) < 2 {
			continue
		}
		id, _ := strconv.ParseInt(record[0], 10, 64)
		name := record[1]
		// Capitalize first letter? Sudheer, Manasa are already nice, but just in case.
		if len(name) > 0 {
			name = strings.Title(name)
		}
		m[id] = name
	}
	return m, nil
}

func seedTransactions(txPath string, usersPath string, authUserID int64) error {
	// 1. Get legacy user map
	legacyUsers, err := getLegacyUserMap(usersPath)
	if err != nil {
		return fmt.Errorf("failed to read legacy users: %v", err)
	}

	f, err := os.Open(txPath)
	if err != nil {
		return err
	}
	defer f.Close()

	reader := csv.NewReader(f)
	records, err := reader.ReadAll()
	if err != nil {
		return err
	}

	for i, row := range records {
		if i == 0 {
			continue
		} // Header
		// transaction_type,fd_type,date,amount,user_id (legacy ID)
		txType := row[0]
		fdType := row[1]
		dateStr := row[2]
		amount, _ := strconv.ParseFloat(row[3], 64)
		legacyUserID, _ := strconv.ParseInt(row[4], 10, 64)

		customerName := legacyUsers[legacyUserID]
		if customerName == "" {
			customerName = "Self" // Fallback
		}

		t, err := time.Parse("2006-01-02", dateStr)
		if err != nil {
			return err
		}

		var assetType string
		if fdType == "Stocks" || fdType == "Mutual Funds" {
			assetType = "equity"
		} else if fdType == "Gold" {
			assetType = "gold"
		} else if fdType == "Real Estate" {
			assetType = "real_estate"
		} else {
			assetType = "debt"
		}

		if err := AddTransaction(models.Transaction{
			TransactionType: txType,
			AssetType:       assetType,
			FDType:          fdType,
			Amount:          amount,
			Date:            t,
			UserID:          authUserID, // Unified UserID
			CustomerName:    customerName,
		}); err != nil {
			return err
		}
	}
	return nil
}
