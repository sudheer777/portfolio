# Deploying to Koyeb

This project is fully Dockerized to easily deploy on Koyeb. The single Docker container builds the React frontend and Go backend, and serves them together on port `8080`.

## Instructions
1. Push all latest changes (including the `Dockerfile` and updated `cmd/server/main.go`) to your GitHub repository.
2. Go to the [Koyeb Dashboard](https://app.koyeb.com/).
3. Click **Create Web Service**.
4. Choose **GitHub** as the deployment method and select your `portfolio` repository.
5. In the **Builder** section, Koyeb should automatically detect the `Dockerfile`. Choose the **Docker** builder type.
6. Under **Environment variables**, you **must** add:
   - `TURSO_DATABASE_URL`: `libsql://your-turso-database-url.turso.io?authToken=your_auth_token_here`
7. Koyeb will automatically detect that the application listens on port `8080` (as per the Dockerfile `EXPOSE`). Ensure the port mapping is `8080`.
8. Click **Deploy**.

Koyeb will build your Docker image (creating the static React assets and the Go binary) and deploy the application. You can view the live app via your Koyeb service URL!
