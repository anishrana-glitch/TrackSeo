import { useEffect, useState } from "react";
import { checkApiHealth } from "../services/api";
import "./BackendStatus.css";

type ApiConnectionStatus = "checking" | "connected" | "offline";
type DbConnectionStatus = "connected" | "disconnected" | "connecting" | "not_configured";

export default function BackendStatus() {
  const [apiStatus, setApiStatus] = useState<ApiConnectionStatus>("checking");
  const [dbStatus, setDbStatus] = useState<DbConnectionStatus | null>(null);
  const [dbDetails, setDbDetails] = useState<{ host?: string; error?: string }>({});

  useEffect(() => {
    let active = true;

    const checkConnection = async () => {
      try {
        const result = await checkApiHealth();

        if (active) {
          if (result.success && result.data.status === "healthy") {
            setApiStatus("connected");
            if (result.data.database) {
              setDbStatus(result.data.database.status);
              setDbDetails({
                host: result.data.database.host,
                error: result.data.database.error
              });
            }
          } else {
            setApiStatus("offline");
          }
        }
      } catch {
        if (active) {
          setApiStatus("offline");
          setDbStatus(null);
        }
      }
    };

    void checkConnection();

    return () => {
      active = false;
    };
  }, []);

  const apiLabels: Record<ApiConnectionStatus, string> = {
    checking: "API CHECKING",
    connected: "API ONLINE",
    offline: "API OFFLINE"
  };

  const dbLabels: Record<DbConnectionStatus, string> = {
    connected: "DB CONNECTED",
    not_configured: "DB NOT CONFIGURED",
    disconnected: "DB OFFLINE",
    connecting: "DB CONNECTING"
  };

  return (
    <div className="status-badge-group">
      <div
        className={`backend-status backend-status--${apiStatus}`}
        role="status"
        aria-live="polite"
        title={apiStatus === "connected" ? "Express API server reachable" : "Express API server offline"}
      >
        <span className="backend-status__dot" />
        <span>{apiLabels[apiStatus]}</span>
      </div>

      {apiStatus === "connected" && dbStatus && (
        <div
          className={`backend-status backend-status--db-${dbStatus}`}
          role="status"
          aria-live="polite"
          title={
            dbStatus === "connected"
              ? `Connected to MongoDB Atlas (${dbDetails.host || "cluster"})`
              : dbStatus === "not_configured"
              ? "MONGODB_URI not configured in backend/.env — persistence disabled"
              : dbDetails.error
              ? `Database error: ${dbDetails.error}`
              : "Database disconnected"
          }
        >
          <span className="backend-status__dot" />
          <span>{dbLabels[dbStatus]}</span>
        </div>
      )}
    </div>
  );
}