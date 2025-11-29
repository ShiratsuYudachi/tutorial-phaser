/**
 * IMPORTANT:
 * ---------
 * Do not manually edit this file if you'd like to use Colyseus Cloud
 *
 * If you're self-hosting (without Colyseus Cloud), you can manually instantiate a
 * Colyseus Server as documented here: 👉 https://docs.colyseus.io/server/api/#constructor-options
 */
import { listen } from "@colyseus/tools";

// Import arena config
import appConfig from "./app.config";

// Set hostname to 0.0.0.0 to allow remote connections
// This can be overridden by HOST environment variable
if (!process.env.HOST) {
	process.env.HOST = "0.0.0.0";
}

// Create and listen on 2567 (or PORT environment variable.)
// The listen function will use HOST environment variable if available
listen(appConfig).then(() => {
	const port = process.env.PORT || "2567";
	const host = process.env.HOST || "0.0.0.0";
	console.log(`🚀 Server listening on ${host}:${port}`);
}).catch((err) => {
	console.error("Failed to start server:", err);
});
