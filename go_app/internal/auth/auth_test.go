package auth

import (
	"os"
	"testing"
	"time"
)

// TestMain sets up test environment variables before any tests run.
func TestMain(m *testing.M) {
	os.Setenv("JWT_SECRET", "test-secret-key-for-unit-tests-only")
	// Re-init jwtKey for tests (package var is set before TestMain runs,
	// so we patch jwtKey directly)
	jwtKey = []byte(os.Getenv("JWT_SECRET"))
	m.Run()
}

func TestGenerateAndValidateToken(t *testing.T) {
	userID := int64(42)
	email := "test@example.com"

	// 1. Generate Token
	tokenString, err := GenerateToken(userID, email)
	if err != nil {
		t.Fatalf("GenerateToken failed: %v", err)
	}

	if tokenString == "" {
		t.Fatalf("GenerateToken returned empty string")
	}

	// 2. Validate Token
	claims, err := ValidateToken(tokenString)
	if err != nil {
		t.Fatalf("ValidateToken failed: %v", err)
	}

	if claims.UserID != userID {
		t.Errorf("Expected UserID %d, got %d", userID, claims.UserID)
	}

	if claims.Email != email {
		t.Errorf("Expected Email %s, got %s", email, claims.Email)
	}

	// 3. Verify Expiration Time is deep in the future (at least 90 years > 788400 hours)
	ninetyYearsDuration := time.Hour * 788400
	minExpectedExpiry := time.Now().Add(ninetyYearsDuration)
	if claims.ExpiresAt.Time.Before(minExpectedExpiry) {
		t.Errorf("Expected token expiration to be > 90 years in future, but got: %v", claims.ExpiresAt.Time)
	}
}
