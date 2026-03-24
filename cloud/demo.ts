/**
 * Jarvis Demo Server
 * 
 * Starts the cloud backend with SQLite and serves the web UI.
 * Run: npx tsx demo.ts
 * Open: http://localhost:3001
 */

process.env.DB_MODE = "sqlite";
process.env.PORT = process.env.PORT || "3001";

import "./src/server.js";
