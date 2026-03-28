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

	var tDate string
	err = db.QueryRow("SELECT date FROM transactions LIMIT 1").Scan(&tDate)
	if err != nil {
		log.Fatalf("failed to scan date into string: %v", err)
	}

	fmt.Printf("Successfully scanned date: %s\n", tDate)
}
