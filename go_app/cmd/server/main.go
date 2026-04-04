package main

import (
	"log"
	"os"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"portfolio/internal/api"
	"portfolio/internal/auth"
	"portfolio/internal/db"
)

func main() {
	// 1. Init DB
	// Initialize Database with WAL mode and busy timeout to prevent locking
	dbUrl := os.Getenv("TURSO_DATABASE_URL")
	if dbUrl == "" {
		log.Fatal("TURSO_DATABASE_URL environment variable is not set")
	}
	if err := db.Init(dbUrl); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

	// 2. Seed if needed (rudimentary check: if no users)
	users, _ := db.GetAllUsers()
	if len(users) == 0 {
		log.Println("Seeding database...")
		// Paths are relative to where binary is run. Assuming root of go_app
		// But in dev mode, we might be in cmd/server or root.
		// Let's assume we run from 'go_app' root.
		if err := db.Seed("../users.csv", "../fd_interest_rate.csv", "../transactions.csv"); err != nil {
			log.Printf("Error seeding: %v", err)
		} else {
			log.Println("Seeding complete.")
		}
	}

	// 3. Setup Router
	r := gin.Default()

	// CORS
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"}, // For dev
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	}))

	h := api.NewHandler()

	// Public API Routes
	r.POST("/login", h.Login)
	r.POST("/register", h.Register)

	// Serve Frontend Static SPA
	r.Static("/assets", "./frontend/dist/assets")
	r.NoRoute(func(c *gin.Context) {
		path := c.Request.URL.Path
		filePath := "./frontend/dist" + path
		if _, err := os.Stat(filePath); err == nil {
			c.File(filePath)
			return
		}
		c.File("./frontend/dist/index.html")
	})

	// Protected Routes
	apiGroup := r.Group("/api")
	apiGroup.Use(auth.AuthMiddleware())
	{
		apiGroup.GET("/portfolio", h.GetPortfolio)
		apiGroup.POST("/transactions", h.AddTransaction)
		apiGroup.GET("/transactions", h.GetTransactions)
		apiGroup.PUT("/transactions/:id", h.UpdateTransaction)
		apiGroup.DELETE("/transactions/:id", h.DeleteTransaction)
		apiGroup.GET("/users", h.GetUsers)
		apiGroup.GET("/me", h.GetMe)
		apiGroup.PUT("/user/dob", h.UpdateUserDOB)
		apiGroup.PUT("/user/fire-settings", h.UpdateFireSettings)
		apiGroup.GET("/customers", h.GetCustomers)
		apiGroup.POST("/portfolio/snapshot", h.SaveSnapshot)
		apiGroup.POST("/history", h.AddHistory)
		apiGroup.GET("/history", h.GetHistory)
		apiGroup.PUT("/history/:id", h.UpdateHistory)
		apiGroup.DELETE("/history/:id", h.DeleteHistory)

		// Interest Rates
		apiGroup.GET("/rates", h.GetRates)
		apiGroup.POST("/rates", h.AddRate)
		apiGroup.PUT("/rates/:id", h.UpdateRate)
		apiGroup.DELETE("/rates/:id", h.DeleteRate)

		// Rebalancer Config
		apiGroup.GET("/rebalancer-config", h.GetRebalancerConfig)
		apiGroup.POST("/rebalancer-config", h.SaveRebalancerConfig)

		// Career Calculator
		apiGroup.GET("/job-details", h.GetJobDetails)
		apiGroup.POST("/job-details", h.SaveJobDetails)
		apiGroup.GET("/salary-history", h.GetSalaryHistory)
		apiGroup.POST("/salary-history", h.AddSalaryHistory)
		apiGroup.DELETE("/salary-history/:id", h.DeleteSalaryHistory)
	}

	log.Println("Server starting on :8080")
	if err := r.Run(":8080"); err != nil {
		log.Fatal(err)
	}
}
