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

### � Advanced Financial Simulators
- **FIRE Simulator:** A robust, multi-phase retirement simulation engine. It factors in real-world portfolio yields, dynamic inflation-adjusted living expenses, and seamlessly models both the active accumulation phase (via monthly SIPs) and the lifelong post-retirement depletion phase.
- **Career Growth Analytics:** Map out your lifetime earnings with detailed year-over-year increment metrics. It calculates gross vs. in-hand salary increases (accounting for gratuity and leave encashment growth) and allows side-by-side comparative analysis of user-defined salary hike scenarios against 0% static baselines.

### �🔐 Security & Architecture
- **JWT User Authentication:** Fully working basic auth system with `bcrypt` encrypted passwords and secure stateless JSON Web Token sessions.
- **Dockerized & Cloud-Ready:** A highly optimized multi-stage container setup that builds React (via Node) and Go (via Alpine). It securely loads credentials via environment variables (`TURSO_DATABASE_URL`) making it 1-click deployable to cloud platforms like Koyeb.

### 🔒 Bring Your Own Database (BYODB) Privacy
- **Opt-In True Privacy:** Optionally provide your own Turso database credentials during registration. Instead of storing your life's financial data on the shared server, your data lives uniquely in your own personal Turso instance.
- **Robust Encryption:** The backend securely encrypts your Turso API credentials using an AES-256-GCM key derived directly from your login password (PBKDF2-SHA256). Even the server administrator cannot intercept your credentials or decrypt your database token.
- **Dynamic Database Routing:** A custom Golang middleware dynamically resolves and routes REST API requests directly to your personal database based on zero-trust headers.
- **Seamless Data Migrations:** A built-in dashboard allows existing users to migrate their entire transaction history to a personal database at any time, complete with a 1-click hard-delete mechanism to permanently scrub their old data from the global master server.
- **Secure Key Rotation:** Comprehensive encryption lifecycle handling guarantees that when changing your login password, the backend automatically reconstructs the crypto sequence, rotates the salt, and seamlessly re-encrypts your database credentials.

#### 📝 How to get your Turso Credentials
To use the BYODB feature, you simply need a free Turso database. You can set this up quickly using the Web UI or the CLI:

**Option A: Using the Turso Web UI (Easiest)**
1. **Sign Up:** Go to [turso.tech](https://turso.tech/) and log in / create a free account.
2. **Create Database:** From the main dashboard, click the **"Create Database"** button. Give it a name (e.g., `portfolio-db`).
3. **Get Database URL:** Once created, click on your database. Copy the **Database URL** from the top of the overview page (it will look like `libsql://...`).
4. **Generate Token:** On the same page, click the **"Generate Token"** button (usually in the connection details) and copy the text block.
5. **Migrate:** Open this app, navigate to "Privacy & BYODB" (or input them during registration), and paste your URL and Token!

**Option B: Using the Turso CLI**
1. **Install CLI:** `curl -sSf https://get.turso.tech/install.sh | bash` (Mac/Linux) or `brew install tursodatabase/tap/turso`.
2. **Login:** Run `turso auth login` in your terminal to authenticate.
3. **Create Database:** Run `turso db create my-portfolio-db`.
4. **Get Database URL:** Run `turso db show my-portfolio-db` and copy the URL.
5. **Get Auth Token:** Run `turso db tokens create my-portfolio-db` and copy the generated token.
6. **Migrate:** As above, paste these into the app's settings section.

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
