# Deriv Algo Trading Bot

A full-stack algorithmic trading bot for the Deriv platform, featuring a Node.js/MongoDB backend and a React frontend. The project is structured as a monorepo using npm workspaces.

## Features

- **Backend**: Node.js automated trading engine that connects to Deriv via WebSockets, stores trade data in MongoDB, and exposes an API.
- **Frontend**: React application for monitoring and interacting with the bot.
- **Monorepo Architecture**: Shared dependencies managed through npm workspaces at the root level.
- **Containerized**: Clean development setup using Docker Compose for the backend and MongoDB database.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+ recommended)
- [Docker](https://www.docker.com/) & Docker Compose
- Deriv API Token (configured in your `.env` file)

## Getting Started

### 1. Install Dependencies

From the root directory, run `npm run setup`. This will install all dependencies for both the frontend and backend into a single `node_modules` folder at the root, and pull the required Docker images.

```bash
npm run setup
```

### 2. Environment Variables

The project uses a **single, unified `.env` file** in the root directory that is shared between both the frontend and backend. 

Copy the provided example file:
```bash
cp .env.example .env
```
Then, edit the `.env` file in the root to add your **Deriv API token**, Database configs, frontend variables (like `REACT_APP_BACKEND_PORT`), and default admin credentials.

### 3. Run the Backend

The backend runs inside a Docker container, linked to a MongoDB database.

```bash
npm run backend:dev
```
*This command runs `docker-compose up`, starting the algorithm engine, MongoDB, and Mongo Express debugger.*

### 4. Run the Frontend

To run the React frontend UI locally:

```bash
npm run frontend:dev
```
*This command navigates to the `frontend` folder and runs the React development server.*

## Tech Stack

- **Backend**: Node.js, Mongoose/MongoDB, WebSocket, Express (if applicable)
- **Frontend**: React.js
- **Tooling**: Docker, Docker Compose, NPM Workspaces
