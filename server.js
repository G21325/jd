const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// API URLs
const apiLoginUrl = "https://api.jadoodigital.com/api/v2.1/user/auth/login";
const apiRefreshUrl = "https://api.jadoodigital.com/api/v2.1/user/auth/refresh";
const tokenFile = path.join(__dirname, "token.cache");

// Login Credentials
const username = "jadoo6000";
const password = "jadoo6000";
const domain = "af1dd86c3fb8448e87bb7770000c930c";

// Function: Save Token
const saveToken = (token) => fs.writeFileSync(tokenFile, token);
const getToken = () => fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, "utf8") : null;

// Function: Login & Get Refresh Token
async function login() {
    try {
        const response = await axios.post(apiLoginUrl, { username, password, domain });
        if (response.data?.data?.refresh_token) {
            saveToken(response.data.data.refresh_token);
            return response.data.data.refresh_token;
        }
    } catch (error) {
        console.error("Login Failed:", error.response?.data || error.message);
    }
    return null;
}

// Function: Get Access Token
async function getAccessToken() {
    let refreshToken = getToken();
    if (!refreshToken) refreshToken = await login();
    if (!refreshToken) return null;

    try {
        const response = await axios.get(apiRefreshUrl, {
            headers: { Authorization: `Bearer ${refreshToken}` }
        });
        return response.data?.data?.access_token || null;
    } catch (error) {
        console.error("Token Refresh Failed:", error.response?.data || error.message);
        return null;
    }
}

// API: Get Channel M3U8
app.get("/channel/:id", async (req, res) => {
    const channelId = req.params.id;
    const accessToken = await getAccessToken();
    if (!accessToken) return res.status(401).json({ error: "Unauthorized" });

    try {
        const channelResponse = await axios.get(`https://api.jadoodigital.com/api/v2.1/user/channel/${channelId}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!channelResponse.data?.url) return res.status(404).json({ error: "Channel URL not found" });

        const streamUrl = channelResponse.data.url;
        const m3u8Response = await axios.get(streamUrl, { headers: { Authorization: `Bearer ${accessToken}` } });

        const baseUrl = `https://edge01.iptv.digijadoo.net/live/${channelId}/`;
        const finalOutput = m3u8Response.data.replace(/chunks\.m3u8/g, `${baseUrl}chunks.m3u8`);

        res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
        res.send(finalOutput);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch stream" });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
