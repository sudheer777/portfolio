package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	_ "github.com/tursodatabase/libsql-client-go/libsql"
)

func main() {
	url := os.Getenv("TURSO_DATABASE_URL")
	if url == "" {
		log.Fatal("TURSO_DATABASE_URL environment variable is not set")
	}

	db, err := sql.Open("libsql", url)
	if err != nil {
		log.Fatalf("failed to open: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("failed to ping: %v", err)
	}

	var count int
	err = db.QueryRow("SELECT COUNT(*) FROM users").Scan(&count)
	if err != nil {
		log.Fatalf("failed to query: %v", err)
	}

	fmt.Printf("Successfully connected! Found %d users.\n", count)
}
