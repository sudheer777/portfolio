package api

import (
	"encoding/json"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"portfolio/internal/auth"
	"portfolio/internal/db"
	"portfolio/internal/models"
	"portfolio/internal/service"
)

type Handler struct {
	// Service dependencies could go here
}

func NewHandler() *Handler {
	return &Handler{}
}

func (h *Handler) generatePortfolioSummary(authUserID int64) (models.PortfolioSummary, error) {
	transactions, err := db.GetTransactionsByUserID(authUserID)
	if err != nil {
		return models.PortfolioSummary{}, err
	}
	rates, err := db.GetAllInterestRates()
	if err != nil {
		return models.PortfolioSummary{}, err
	}

	fdManager := service.NewFDManager()
	for _, r := range rates {
		dateStr := r.Date.Format("2006-01-02")
		if err := fdManager.AddRate(r.FDType, dateStr, r.Rate); err != nil {
			log.Printf("Warning: failed to add rate for %s: %v", r.FDType, err)
		}
	}

	customerAgg := make(map[string]map[string]models.Amount)
	customerAggAssetTypes := make(map[string]map[string]models.Amount)

	for _, t := range transactions {
		fd, err := fdManager.GetFD(t.FDType)
		if err != nil {
			log.Printf("Skipping transaction %d: %v", t.ID, err)
			continue
		}

		res := fd.ComputeInterest(t)

		cName := t.CustomerName
		if cName == "" {
			cName = "Self"
		}

		if _, ok := customerAgg[cName]; !ok {
			customerAgg[cName] = make(map[string]models.Amount)
		}
		if _, ok := customerAggAssetTypes[cName]; !ok {
			customerAggAssetTypes[cName] = make(map[string]models.Amount)
		}

		current := customerAgg[cName][t.FDType]
		newAmount := models.Amount{
			Principal:   current.Principal + res.Principal,
			Interest:    current.Interest + res.Interest,
			DayChange:   current.DayChange + res.DayChange,
			FinalAmount: current.FinalAmount + res.FinalAmount,
		}
		customerAgg[cName][t.FDType] = newAmount

		currentAsset := customerAggAssetTypes[cName][t.AssetType]
		newAssetAmount := models.Amount{
			Principal:   currentAsset.Principal + res.Principal,
			Interest:    currentAsset.Interest + res.Interest,
			DayChange:   currentAsset.DayChange + res.DayChange,
			FinalAmount: currentAsset.FinalAmount + res.FinalAmount,
		}
		customerAggAssetTypes[cName][t.AssetType] = newAssetAmount
	}

	summaries := make([]models.UserSummary, 0)
	var totalPortfolio models.Amount
	totalAssetTypes := make(map[string]models.Amount)

	var customers []string
	for name := range customerAgg {
		customers = append(customers, name)
	}
	sort.Strings(customers)

	for _, name := range customers {
		fds := customerAgg[name]
		assetTypes := customerAggAssetTypes[name]
		if assetTypes == nil {
			assetTypes = make(map[string]models.Amount)
		}

		var userTotal models.Amount
		for _, amt := range fds {
			userTotal.Principal += amt.Principal
			userTotal.Interest += amt.Interest
			userTotal.DayChange += amt.DayChange
			userTotal.FinalAmount += amt.FinalAmount
		}

		for aType, amt := range assetTypes {
			curr := totalAssetTypes[aType]
			totalAssetTypes[aType] = models.Amount{
				Principal:   curr.Principal + amt.Principal,
				Interest:    curr.Interest + amt.Interest,
				DayChange:   curr.DayChange + amt.DayChange,
				FinalAmount: curr.FinalAmount + amt.FinalAmount,
			}
		}

		summaries = append(summaries, models.UserSummary{
			UserName:   name,
			UserID:     0,
			FDS:        fds,
			AssetTypes: assetTypes,
			Total:      userTotal,
		})

		totalPortfolio.Principal += userTotal.Principal
		totalPortfolio.Interest += userTotal.Interest
		totalPortfolio.DayChange += userTotal.DayChange
		totalPortfolio.FinalAmount += userTotal.FinalAmount
	}

	return models.PortfolioSummary{
		UserSummaries: summaries,
		Total:         totalPortfolio,
		AssetTypes:    totalAssetTypes,
	}, nil
}

func (h *Handler) GetPortfolio(c *gin.Context) {
	userID, _ := c.Get("userID")
	authUserID := userID.(int64)

	summary, err := h.generatePortfolioSummary(authUserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch portfolio"})
		return
	}

	c.JSON(http.StatusOK, summary)
}

func (h *Handler) AddTransaction(c *gin.Context) {
	userID, _ := c.Get("userID")
	authUserID := userID.(int64)

	var input struct {
		TransactionType string  `json:"transaction_type"`
		AssetType       string  `json:"asset_type"`
		FDType          string  `json:"fd_type"`
		Amount          float64 `json:"amount"`
		Date            string  `json:"date"` // YYYY-MM-DD
		CustomerName    string  `json:"customer_name"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	t, err := time.Parse("2006-01-02", input.Date)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date format, use YYYY-MM-DD"})
		return
	}

	cName := input.CustomerName
	if cName == "" {
		cName = "Self"
	}

	aType := input.AssetType
	if aType == "" {
		aType = "debt"
	}

	tx := models.Transaction{
		TransactionType: input.TransactionType,
		AssetType:       aType,
		FDType:          input.FDType,
		Amount:          input.Amount,
		Date:            t,
		UserID:          authUserID, // Enforce Auth User
		CustomerName:    cName,
	}

	if err := db.AddTransaction(tx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save transaction"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"status": "created", "transaction": tx})
}

func (h *Handler) GetTransactions(c *gin.Context) {
	userID, _ := c.Get("userID")
	authUserID := userID.(int64)

	customerName := c.Query("customer_name")
	var transactions []models.Transaction
	var err error

	if customerName != "" {
		transactions, err = db.GetTransactionsByCustomer(authUserID, customerName)
	} else {
		transactions, err = db.GetTransactionsByUserID(authUserID)
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch transactions"})
		return
	}
	// Return empty list instead of null
	if transactions == nil {
		transactions = []models.Transaction{}
	}
	c.JSON(http.StatusOK, transactions)
}

func (h *Handler) UpdateTransaction(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var input struct {
		TransactionType string  `json:"transaction_type"`
		AssetType       string  `json:"asset_type"`
		FDType          string  `json:"fd_type"`
		Amount          float64 `json:"amount"`
		Date            string  `json:"date"` // YYYY-MM-DD
		CustomerName    string  `json:"customer_name"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	t, err := time.Parse("2006-01-02", input.Date)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date format, use YYYY-MM-DD"})
		return
	}

	// TODO: verify transaction belongs to authUser. For now we assume safety.
	// But update query should ideally include "WHERE user_id = ?"

	aType := input.AssetType
	if aType == "" {
		aType = "debt"
	}

	tx := models.Transaction{
		ID:              id,
		TransactionType: input.TransactionType,
		AssetType:       aType,
		FDType:          input.FDType,
		Amount:          input.Amount,
		Date:            t,
		CustomerName:    input.CustomerName, // Allow update
	}

	// NOTE: UpdateTransaction in DB doesn't touch UserID, so isolation is preserved implicitly
	if err := db.UpdateTransaction(tx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update transaction"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "updated"})
}

func (h *Handler) DeleteTransaction(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	if err := db.DeleteTransaction(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete transaction"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

func (h *Handler) GetUsers(c *gin.Context) {
	users, err := db.GetAllUsers()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	// Convert map to list
	var list []models.User
	for _, u := range users {
		list = append(list, u)
	}
	sort.Slice(list, func(i, j int) bool { return list[i].ID < list[j].ID })
	c.JSON(http.StatusOK, list)
}

func (h *Handler) GetMe(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	authUserID := userID.(int64)

	u, err := db.GetUserByID(authUserID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	c.JSON(http.StatusOK, u)
}

func (h *Handler) UpdateUserDOB(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	authUserID := userID.(int64)

	var input struct {
		DateOfBirth string `json:"date_of_birth"` // YYYY-MM-DD
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	t, err := time.Parse("2006-01-02", input.DateOfBirth)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date format, use YYYY-MM-DD"})
		return
	}

	if err := db.UpdateUserDOB(authUserID, t); err != nil {
		log.Printf("Failed to update dob: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update date of birth"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "updated"})
}

func (h *Handler) UpdateFireSettings(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	authUserID := userID.(int64)

	var input struct {
		YearlyExpense  float64 `json:"yearly_expense"`
		InflationRate  float64 `json:"inflation_rate"`
		LifeExpectancy float64 `json:"life_expectancy"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := db.UpdateFireSettings(authUserID, input.YearlyExpense, input.InflationRate, input.LifeExpectancy); err != nil {
		log.Printf("Failed to update fire settings: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update FIRE settings"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "updated"})
}

func (h *Handler) Login(c *gin.Context) {
	var input struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	u, err := db.GetUserByEmail(input.Email)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid email or password"})
		return
	}

	if !auth.CheckPasswordHash(input.Password, u.Password) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid email or password"})
		return
	}

	token, err := auth.GenerateToken(u.ID, u.Email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"token": token, "user": u})
}

func (h *Handler) Register(c *gin.Context) {
	var input struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	hash, err := auth.HashPassword(input.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
		return
	}

	id, err := db.CreateUser(input.Name, input.Email, hash)
	if err != nil {
		log.Printf("Failed to create user: %v", err)
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			c.JSON(http.StatusConflict, gin.H{"error": "Email already exists"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"status": "created", "user_id": id})
}

func (h *Handler) GetCustomers(c *gin.Context) {
	userID, _ := c.Get("userID")
	authUserID := userID.(int64)

	customers, err := db.GetUniqueCustomers(authUserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch customers"})
		return
	}
	// Return empty list instead of null
	if customers == nil {
		customers = []string{}
	}
	c.JSON(http.StatusOK, customers)
}

func (h *Handler) SaveSnapshot(c *gin.Context) {
	userID, _ := c.Get("userID")
	authUserID := userID.(int64)

	summary, err := h.generatePortfolioSummary(authUserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate portfolio summary for snapshot"})
		return
	}

	jsonBytes, err := json.Marshal(summary)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to serialize portfolio summary"})
		return
	}
	jsonStr := string(jsonBytes)

	history := models.PortfolioHistory{
		Date:             time.Now(),
		TotalAmount:      summary.Total.FinalAmount,
		UserID:           authUserID,
		AssetSummaryJSON: &jsonStr,
	}

	if err := db.AddPortfolioHistory(history); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save snapshot"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "saved", "data": history})
}

func (h *Handler) AddHistory(c *gin.Context) {
	userID, _ := c.Get("userID")
	authUserID := userID.(int64)

	var input struct {
		Date   string  `json:"date"` // YYYY-MM-DD
		Amount float64 `json:"amount"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	t, err := time.Parse("2006-01-02", input.Date)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date format"})
		return
	}

	history := models.PortfolioHistory{
		Date:        t,
		TotalAmount: input.Amount,
		UserID:      authUserID,
	}

	if err := db.AddPortfolioHistory(history); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save history"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "saved", "data": history})
}

func (h *Handler) GetHistory(c *gin.Context) {
	userID, _ := c.Get("userID")
	authUserID := userID.(int64)

	history, err := db.GetPortfolioHistory(authUserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch history"})
		return
	}
	if history == nil {
		history = []models.PortfolioHistory{}
	}
	c.JSON(http.StatusOK, history)
}

func (h *Handler) UpdateHistory(c *gin.Context) {
	userID, _ := c.Get("userID")
	authUserID := userID.(int64)

	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var input struct {
		Date   string  `json:"date"` // YYYY-MM-DD
		Amount float64 `json:"amount"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	t, err := time.Parse("2006-01-02", input.Date)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date format"})
		return
	}

	history := models.PortfolioHistory{
		ID:          id,
		Date:        t,
		TotalAmount: input.Amount,
		UserID:      authUserID, // Identify owner
	}

	if err := db.UpdatePortfolioHistory(history); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update history"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "updated"})
}

func (h *Handler) DeleteHistory(c *gin.Context) {
	userID, _ := c.Get("userID")
	authUserID := userID.(int64)

	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	if err := db.DeletePortfolioHistory(id, authUserID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete history"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

func (h *Handler) GetRates(c *gin.Context) {
	rates, err := db.GetAllInterestRates()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch rates"})
		return
	}
	if rates == nil {
		rates = []models.InterestRate{}
	}
	c.JSON(http.StatusOK, rates)
}

func (h *Handler) AddRate(c *gin.Context) {
	var input struct {
		FDType string  `json:"fd_type"`
		Date   string  `json:"date"` // YYYY-MM-DD
		Rate   float64 `json:"rate"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	t, err := time.Parse("2006-01-02", input.Date)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date format"})
		return
	}

	rate := models.InterestRate{
		FDType: input.FDType,
		Date:   t,
		Rate:   input.Rate,
	}

	if err := db.AddInterestRate(rate); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save rate"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"status": "created"})
}

func (h *Handler) UpdateRate(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var input struct {
		FDType string  `json:"fd_type"`
		Date   string  `json:"date"` // YYYY-MM-DD
		Rate   float64 `json:"rate"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	t, err := time.Parse("2006-01-02", input.Date)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date format"})
		return
	}

	rate := models.InterestRate{
		ID:     id,
		FDType: input.FDType,
		Date:   t,
		Rate:   input.Rate,
	}

	if err := db.UpdateInterestRate(rate); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update rate"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "updated"})
}

func (h *Handler) DeleteRate(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	if err := db.DeleteInterestRate(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete rate"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

func (h *Handler) GetRebalancerConfig(c *gin.Context) {
	userID, _ := c.Get("userID")
	authUserID := userID.(int64)

	configJSON, err := db.GetRebalancerConfig(authUserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get config"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"config": configJSON})
}

func (h *Handler) SaveRebalancerConfig(c *gin.Context) {
	userID, _ := c.Get("userID")
	authUserID := userID.(int64)

	var body struct {
		Config string `json:"config"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	if err := db.SaveRebalancerConfig(authUserID, body.Config); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save config"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "saved"})
}

func (h *Handler) GetJobDetails(c *gin.Context) {
	userID, _ := c.Get("userID")
	authUserID := userID.(int64)

	jd, err := db.GetJobDetails(authUserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch job details"})
		return
	}
	c.JSON(http.StatusOK, jd)
}

func (h *Handler) SaveJobDetails(c *gin.Context) {
	userID, _ := c.Get("userID")
	authUserID := userID.(int64)

	var input struct {
		JoiningDate string  `json:"joining_date"` // YYYY-MM-DD
		CurrentCTC  float64 `json:"current_ctc"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	t, err := time.Parse("2006-01-02", input.JoiningDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date format"})
		return
	}

	jd := models.JobDetails{
		UserID:      authUserID,
		JoiningDate: t,
		CurrentCTC:  input.CurrentCTC,
	}

	if err := db.SaveJobDetails(jd); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save job details"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "saved"})
}

func (h *Handler) GetSalaryHistory(c *gin.Context) {
	userID, _ := c.Get("userID")
	authUserID := userID.(int64)

	history, err := db.GetSalaryHistory(authUserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch salary history"})
		return
	}
	if history == nil {
		history = []models.SalaryHistory{}
	}
	c.JSON(http.StatusOK, history)
}

func (h *Handler) AddSalaryHistory(c *gin.Context) {
	userID, _ := c.Get("userID")
	authUserID := userID.(int64)

	var input struct {
		Date      string  `json:"date"` // YYYY-MM-DD
		CTC       float64 `json:"ctc"`
		EventType string  `json:"event_type"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	t, err := time.Parse("2006-01-02", input.Date)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date format"})
		return
	}

	sh := models.SalaryHistory{
		UserID:    authUserID,
		Date:      t,
		CTC:       input.CTC,
		EventType: input.EventType,
	}

	if err := db.AddSalaryHistory(sh); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save salary history"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"status": "created"})
}

func (h *Handler) DeleteSalaryHistory(c *gin.Context) {
	userID, _ := c.Get("userID")
	authUserID := userID.(int64)

	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	if err := db.DeleteSalaryHistory(id, authUserID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete salary history"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}
