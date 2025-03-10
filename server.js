const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Jadoo API Configuration
const API_LOGIN_URL = "https://api.jadoodigital.com/api/v2.1/user/auth/login";
const API_REFRESH_URL = "https://api.jadoodigital.com/api/v2.1/user/auth/refresh";
const API_CHANNEL_URL = "https://api.jadoodigital.com/api/v2.1/user/channel/";

const USERNAME = process.env.JADOO_USERNAME || "jadoo6000";
const PASSWORD = process.env.JADOO_PASSWORD || "jadoo6000";
const DOMAIN = process.env.JADOO_DOMAIN || "af1dd86c3fb8448e87bb7770000c930c";

// Token Cache
const TOKEN_CACHE = path.join(__dirname, "token.json");

// Save Token
const saveToken = (tokenData) => {
    fs.writeFileSync(TOKEN_CACHE, JSON.stringify(tokenData));
};

// Read Token
const readToken = () => {
    if (fs.existsSync(TOKEN_CACHE)) {
        return JSON.parse(fs.readFileSync(TOKEN_CACHE, "utf8"));
    }
    return null;
};

// Get Refresh Token
const getRefreshToken = async () => {
    try {
        const response = await axios.post(API_LOGIN_URL, {
            username: USERNAME,
            password: PASSWORD,
            domain: DOMAIN,
        }, { headers: { "Content-Type": "application/json" } });

        if (response.data.data?.refresh_token) {
            saveToken({ refreshToken: response.data.data.refresh_token });
            return response.data.data.refresh_token;
        } else {
            throw new Error("Refresh Token Not Found!");
        }
    } catch (error) {
        console.error("❌ Jadoo Login Failed!", error.response ? error.response.data : error.message);
        return null;
    }
};

// Get Access Token
const getAccessToken = async () => {
    let tokenData = readToken();
    let refreshToken = tokenData?.refreshToken || await getRefreshToken();

    if (!refreshToken) return null;

    try {
        const response = await axios.get(API_REFRESH_URL, {
            headers: { Authorization: `Bearer ${refreshToken}` }
        });

        if (response.data.data?.access_token) {
            return response.data.data.access_token;
        } else {
            throw new Error("Access Token Not Found!");
        }
    } catch (error) {
        console.error("❌ Token Refresh Failed!", error.response ? error.response.data : error.message);
        return null;
    }
};

// Extract chunks.m3u8 URL
const extractChunksUrl = (m3u8Content, baseUrl) => {
    const lines = m3u8Content.split("\n");
    for (let line of lines) {
        if (line.includes("chunks.m3u8")) {
            return baseUrl + line.trim();
        }
    }
    return null;
};

// Process TS segments
const processChunks = (m3u8Content, baseUrl) => {
    return m3u8Content
        .split("\n")
        .map(line => line.includes(".ts") ? baseUrl + line.trim() : line)
        .join("\n");
};

// Express API Route
app.get("/stream/:id", async (req, res) => {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Channel ID Required!" });

    const accessToken = await getAccessToken();
    if (!accessToken) return res.status(401).json({ error: "Unauthorized!" });

    try {
        const response = await axios.get(`${API_CHANNEL_URL}${id}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!response.data.url) {
            return res.status(404).json({ error: "M3U8 URL Not Found!" });
        }

        const streamUrl = response.data.url;
        const streamResponse = await axios.get(streamUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
        
        const baseUrl = `https://edge01.iptv.digijadoo.net/live/${id}/`;
        const chunksUrl = extractChunksUrl(streamResponse.data, baseUrl);

        if (!chunksUrl) {
            return res.status(500).json({ error: "Chunks.m3u8 Not Found!" });
        }

        const chunksResponse = await axios.get(chunksUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
        const finalOutput = processChunks(chunksResponse.data, baseUrl);

        res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
        res.status(200).send(finalOutput);
    } catch (error) {
        console.error("❌ Stream Fetch Failed!", error.response ? error.response.data : error.message);
        res.status(500).json({ error: "Failed to Fetch Stream!" });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
