"use client";

import { useState, useEffect } from "react";

export default function SonarrSettings() {
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [qualityProfileId, setQualityProfileId] = useState("");
  const [languageProfileId, setLanguageProfileId] = useState("");
  const [rootFolderPath, setRootFolderPath] = useState("");
  
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.json())
      .then(data => {
        if (data.sonarrUrl) setUrl(data.sonarrUrl);
        if (data.sonarrApiKey) setApiKey(data.sonarrApiKey);
        if (data.qualityProfileId) setQualityProfileId(data.qualityProfileId);
        if (data.languageProfileId) setLanguageProfileId(data.languageProfileId);
        if (data.rootFolderPath) setRootFolderPath(data.rootFolderPath);
      });
  }, []);

  async function handleSave() {
    setLoading(true);
    setStatus("");
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sonarrUrl: url,
          sonarrApiKey: apiKey,
          qualityProfileId,
          languageProfileId,
          rootFolderPath
        })
      });
      if (!res.ok) throw new Error("Failed to save");
      setStatus("Settings saved successfully.");
    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    setSyncStatus("Syncing with Sonarr...");
    try {
      const res = await fetch("/api/sonarr/sync", { method: "POST" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSyncStatus(`Sync complete! Flagged ${data.count} shows already in Sonarr.`);
    } catch (err: any) {
      setSyncStatus(`Sync failed: ${err.message}`);
    }
  }

  return (
    <section className="card" style={{ marginBottom: 24 }}>
      <h2 className="section-title" style={{ marginBottom: 12 }}>
        <span className="section-icon">📺</span>
        Sonarr Configuration
      </h2>
      <p style={{ color: "var(--text-secondary)", marginBottom: 16, fontSize: "0.9rem" }}>
        Connect your Sonarr instance to automatically filter out shows you already track and easily add new recommendations. Note: Quality/Language profile IDs and Root folder paths must be retrieved from your Sonarr settings.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 500 }}>
        <div>
          <label style={{ display: "block", fontSize: "0.85rem", marginBottom: 4 }}>Sonarr URL (e.g. http://192.168.1.100:8989)</label>
          <input type="text" className="search-input" value={url} onChange={e => setUrl(e.target.value)} style={{ width: "100%" }} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: "0.85rem", marginBottom: 4 }}>API Key</label>
          <input type="password" className="search-input" value={apiKey} onChange={e => setApiKey(e.target.value)} style={{ width: "100%" }} />
        </div>
        <div>
           <label style={{ display: "block", fontSize: "0.85rem", marginBottom: 4 }}>Quality Profile ID (Numeric)</label>
           <input type="number" className="search-input" value={qualityProfileId} onChange={e => setQualityProfileId(e.target.value)} style={{ width: "100%" }} />
        </div>
        <div>
           <label style={{ display: "block", fontSize: "0.85rem", marginBottom: 4 }}>Language Profile ID (Numeric)</label>
           <input type="number" className="search-input" value={languageProfileId} onChange={e => setLanguageProfileId(e.target.value)} style={{ width: "100%" }} />
        </div>
        <div>
           <label style={{ display: "block", fontSize: "0.85rem", marginBottom: 4 }}>Root Folder Path (e.g. /tv/)</label>
           <input type="text" className="search-input" value={rootFolderPath} onChange={e => setRootFolderPath(e.target.value)} style={{ width: "100%" }} />
        </div>
        
        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
            {loading ? "Saving..." : "Save Settings"}
          </button>
          <button className="btn btn-secondary" onClick={handleSync}>
            Sync Shows
          </button>
        </div>

        {status && <div className={`status-message ${status.startsWith("Error") ? "status-error" : "status-success"}`}>{status}</div>}
        {syncStatus && <div className={`status-message ${syncStatus.startsWith("Sync failed") ? "status-error" : "status-success"}`}>{syncStatus}</div>}
      </div>
    </section>
  );
}
