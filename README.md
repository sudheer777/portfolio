# Portfolio Tracker

A comprehensive financial tracking application designed to help you monitor personal and family financial assets, with a focus on Fixed Deposits (FDs), debt instruments, interest rates, and overall portfolio growth over time. 

This repository contains both a Go backend for data crunching and robust persistence, and a modern React frontend with charts for visualization.

## Detailed Features

### 🏦 Portfolio & Asset Tracking
- **Multi-Asset Support:** Track different asset types like Fixed Deposits (FDs), standard debt, and more, categorized efficiently.
- **Transaction Ledger:** Add, edit, delete, and list all financial transactions (deposits, investments, withdrawals) with associated execution dates.
- **Family & Group Tracking:** Map transactions to specific custom "customers" or family members. This allows you to visually isolate your spouse's, children's, or parents' portfolios within the same centralized account.

### 📈 Dynamic Interest & Growth Engine
- **Historical Rate Application:** Maintain a database of historical interest rates for different FD types. The Go engine will apply them dynamically to compute highly accurate total maturity values based on the deposit date.
- **Daily Growth Calculations:** See your money grow! Calculate accumulated compound interest accurately on a day-to-day basis so you always know your "today" net worth.
- **Automated Target Rebalancing:** Set an ideal asset allocation percentage across your portfolio using the rebalancer config. The app calculates the drift between your current asset holdings versus your long-term target goals automatically.

### 📊 Interactive Visual Dashboards
- **Rich Net Worth Charts:** Beautiful, interactive charts powered by Recharts mapping your total portfolio valuation.
- **Asset Allocation Breakdowns:** View precisely what percentage of your total net worth is locked in debt versus other asset classes down to the exact decimal.
- **Historical Velocity ("Snapshots"):** The Snapshot feature captures your exact portfolio total on any given day, permanently storing your financial timeline to visualize wealth progression over the years.

### 🔐 Security & Architecture
- **JWT User Authentication:** Fully working basic auth system with `bcrypt` encrypted passwords and secure stateless JSON Web Token sessions.
- **Dockerized & Cloud-Ready:** A highly optimized multi-stage container setup that builds React (via Node) and Go (via Alpine). It securely loads credentials via environment variables (`TURSO_DATABASE_URL`) making it 1-click deployable to cloud platforms like Koyeb.

## Tech Stack

### Frontend (`/go_app/frontend`)
- **React 19 & TypeScript:** Scalable, strictly-typed UI.
- **Vite:** Lightning-fast HMR and optimized production builds.
- **Tailwind CSS v4:** Utility-first styling for a beautiful, responsive layout.
- **Recharts:** Composable charting library to visualize portfolio history.

### Backend (`/go_app`)
- **Go 1.25+:** Extremely fast, compiled language for building the server.
- **Gin Web Framework:** High-performance HTTP routing and middleware mapping.
- **SQLite / Turso:** Fast, lightweight serverless database structure leveraging `libsql-client-go`.

---

## 🚀 Running Locally

You can run the application seamlessly using Docker, or locally on your host machine for live development. First, create your `.env` file from the provided `.env.example` template:
```bash
cp .env.example .env
export TURSO_DATABASE_URL="libsql://your-turso-database-url.turso.io?authToken=YOUR_ACTUAL_TOKEN"
```

### Option A: Standard Development Environment (Live Reloading)

1. **Start the Go Backend:**
   ```bash
   cd go_app
   go run cmd/server/main.go
   ```
   *The API will start running on `http://localhost:8080`.*

2. **Start the React Frontend:**
   ```bash
   cd go_app/frontend
   npm install
   npm run dev
   ```
   *The Vite development server will spin up on `http://localhost:5173`. CORS is pre-configured to allow local frontend requests to the Go backend.*

### Option B: Using Docker (Production Simulation)

To run the exact single-container build used in remote deployments:
```bash
docker build -t portfolio-app .
docker run -p 8080:8080 -e TURSO_DATABASE_URL="libsql://your-database-string..." portfolio-app
```
*You can now view both the frontend UI and the backend APIs by visiting `http://localhost:8080`.*

---

## ☁️ Deployment

The application features a multi-stage `Dockerfile` optimized for serverless/PaaS environments like **Koyeb** or **Render**. 
- The single container manages the React build and compiles the Go code together seamlessly. 
- You do *not* commit your secrets to version control. Pass your database URL through the Koyeb service's environment variables dashboard.

For Koyeb-specific instructions, see [README-Koyeb.md](./README-Koyeb.md).
