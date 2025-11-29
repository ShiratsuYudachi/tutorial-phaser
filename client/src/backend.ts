// Get backend URL from localStorage or use default
const getBackendUrl = (): string => {
	const customUrl = localStorage.getItem('backend_url');
	if (customUrl) {
		return customUrl;
	}
	
	// Default behavior
	return (window.location.href.indexOf("localhost") === -1)
		? `${window.location.protocol.replace("http", "ws")}//${window.location.hostname}${(window.location.port && `:${window.location.port}`)}`
		: "ws://localhost:2567";
};

export const BACKEND_URL = getBackendUrl();
export const BACKEND_HTTP_URL = BACKEND_URL.replace("ws", "http");

// Function to update backend URL (requires page reload)
export const setBackendUrl = (url: string) => {
	localStorage.setItem('backend_url', url);
};