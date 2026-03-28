import { Router } from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { upsertUser, getUserById } from "../db/index.js";
import { encrypt, decrypt, deriveSecretForPurpose } from "../utils/crypto.js";
import { getSettings, updateGitHubToken, clearGitHubToken } from "../db/index.js";
import { createSessionToken, createRefreshToken, verifySessionToken } from "../utils/auth.js";

export const githubAuthRouter = Router();

interface GitHubUserProfile {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
}

/**
 * GET /auth/github
 *
 * Redirects to GitHub OAuth authorization URL.
 * This is the primary login entry point for the application.
 * Generates a random `state` parameter for CSRF protection and stores it
 * in a short-lived HttpOnly cookie.
 */
githubAuthRouter.get("/github", (_req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const redirectUri = process.env.GITHUB_REDIRECT_URI || "";

  if (!clientId) {
    res.status(500).json({ error: "GitHub OAuth is not configured (missing GITHUB_CLIENT_ID)" });
    return;
  }

  // Store State (HttpOnly Cookie - 10 mins)
  const state = randomBytes(32).toString("hex");
  res.cookie("oauth_state", state, {
    path: "/auth",
    maxAge: 600000,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",

  });

  const params = new URLSearchParams({
    state,
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "repo read:org user:email",
  });

  const githubAuthUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;
  res.redirect(githubAuthUrl);
});

/**
 * GET /auth/github/callback
 *
 * GitHub OAuth callback — this is the login/signup flow:
 * 1. Validates the OAuth state parameter (CSRF protection)
 * 2. Exchanges authorization code for access token
 * 3. Fetches GitHub user profile
 * 4. Upserts user in the database
 * 5. Encrypts and stores the GitHub token in per-user settings
 * 6. Issues session + refresh tokens as HttpOnly cookies and redirects
 */
githubAuthRouter.get("/github/callback", async (req, res) => {
  const code = req.query.code as string | undefined;
  const clientId = process.env.GITHUB_CLIENT_ID || "";
  const redirectUri = process.env.GITHUB_REDIRECT_URI || "";
  const clientSecret = process.env.GITHUB_CLIENT_SECRET || "";
  const callbackState = req.query.state as string | undefined;
  const cookieState = req.cookies?.oauth_state as string | undefined;

  // Always Clear OAuth State Cookie
  res.clearCookie("oauth_state", { path: "/auth" });

  // Validate CSRF state parameter
  if (!callbackState || !cookieState) {
    res.status(403).json({ error: "Missing OAuth state parameter" });
    return;
  }

  // Timing Safe Comparison of State Values
  const stateBuffer = Buffer.from(callbackState);
  const cookieBuffer = Buffer.from(cookieState);
  if (stateBuffer.length !== cookieBuffer.length || !timingSafeEqual(stateBuffer, cookieBuffer)) {
    res.status(403).json({ error: "OAuth state mismatch — possible CSRF attack" });
    return;
  }
  if (!code) {
    res.status(400).json({ error: "Missing authorization code" });
    return;
  }

  try {
    // Step 1: Exchange Code
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    });
    const tokenData = (await tokenResponse.json()) as {
      error?: string;
      access_token?: string;
      error_description?: string;
    };
    if (!tokenData.access_token) {
      console.error("[github] OAuth token exchange failed:", tokenData.error, tokenData.error_description);
      res.status(400).json({
        error: "GitHub OAuth token exchange failed",
        detail: tokenData.error_description || tokenData.error,
      });
      return;
    }

    // Step 2: Fetch GitHub User Profile
    const profileResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!profileResponse.ok) {
      console.error("[github] Failed to fetch user profile:", profileResponse.status);
      res.status(502).json({ error: "Failed to fetch GitHub user profile" });
      return;
    }
    const profile = (await profileResponse.json()) as GitHubUserProfile;

    // Step 3: Upsert User (async)
    const user = await upsertUser({
      email: profile.email,
      github_id: profile.id,
      github_login: profile.login,
      github_avatar_url: profile.avatar_url,
      display_name: profile.name || profile.login,
    });

    // Step 4: Encrypt & Store GitHub Token (per-user settings, async)
    const secret = deriveSecretForPurpose("github_token_encryption");
    const { encrypted, iv, authTag } = encrypt(tokenData.access_token, secret);

    await updateGitHubToken(user.id, {
      github_iv: iv,
      github_auth_tag: authTag,
      encrypted_github_token: encrypted,
    });

    console.log(`[github] User ${profile.login} authenticated successfully`);

    // ── Step 5: Issue Session + Refresh Tokens as HttpOnly Cookies ────
    const sessionToken = createSessionToken(user.id);
    const refreshToken = createRefreshToken(user.id);

    res.cookie("traycer_session", sessionToken, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 15 * 60 * 1000, // 15 minutes
      secure: process.env.NODE_ENV === "production",
    });

    res.cookie("traycer_refresh", refreshToken, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days
      secure: process.env.NODE_ENV === "production",
    });

    // Redirect WITHOUT token in URL
    const frontendUrl = process.env.FRONTEND_URL || "";
    res.redirect(frontendUrl || "/");
  } catch (err) {
    console.error("[github] OAuth callback error:", err);
    res.status(500).json({ error: "Failed to complete GitHub OAuth flow" });
  }
});

/**
 * POST /auth/refresh
 *
 * Uses the refresh token cookie to issue a new short-lived access token.
 */
githubAuthRouter.post("/refresh", async (req, res) => {
  const refreshToken = req.cookies?.traycer_refresh;
  if (!refreshToken) {
    res.status(401).json({ error: "No refresh token" });
    return;
  }

  const payload = verifySessionToken(refreshToken);
  if (!payload || payload.type !== "refresh") {
    res.clearCookie("traycer_session", { path: "/" });
    res.clearCookie("traycer_refresh", { path: "/" });
    res.status(401).json({ error: "Invalid refresh token" });
    return;
  }

  // Verify User Exists
  const user = await getUserById(payload.sub);
  if (!user) {
    res.clearCookie("traycer_session", { path: "/" });
    res.clearCookie("traycer_refresh", { path: "/" });
    res.status(401).json({ error: "User not found" });
    return;
  }

  // Issue New Access Token
  const newAccessToken = createSessionToken(payload.sub);
  res.cookie("traycer_session", newAccessToken, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 15 * 60 * 1000,
    secure: process.env.NODE_ENV === "production",
  });

  res.json({ ok: true });
});

/**
 * POST /auth/logout
 *
 * Clears both session and refresh token cookies.
 */
githubAuthRouter.post("/logout", (_req, res) => {
  res.clearCookie("traycer_session", { path: "/" });
  res.clearCookie("traycer_refresh", { path: "/" });
  res.json({ ok: true });
});

// ─── API Router (/api/github) ───────────────────────────────────────────────
export const githubApiRouter = Router();

/**
 * GET /api/github/status
 * Returns { connected: boolean }
 *
 * Checks if the authenticated user has a stored GitHub token.
 */
githubApiRouter.get("/status", async (req, res) => {
  const userId = req.user!.id;
  const settings = await getSettings(userId);

  const connected = !!(
    settings.encrypted_github_token &&
    settings.github_iv &&
    settings.github_auth_tag
  );

  res.json({ connected });
});

/**
 * GET /api/github/repos
 * Returns { id, full_name, description, private }[]
 *
 * Decrypts the authenticated user's GitHub token;
 * fetches their repositories from GitHub API.
 */
githubApiRouter.get("/repos", async (req, res) => {
  const userId = req.user!.id;
  const settings = await getSettings(userId);

  // Decrypt GitHub Token
  if (!settings.encrypted_github_token || !settings.github_iv || !settings.github_auth_tag) {
    res.status(401).json({ error: "GitHub not connected. Please authenticate via GitHub OAuth." });
    return;
  }

  let token: string;
  try {
    const secret = deriveSecretForPurpose("github_token_encryption");
    token = decrypt(
      {
        encrypted: settings.encrypted_github_token,
        iv: settings.github_iv,
        authTag: settings.github_auth_tag,
      },
      secret
    );
  } catch (err) {
    console.error("[github] Failed to decrypt GitHub token:", err);
    res.status(401).json({ error: "GitHub token could not be decrypted. Please reconnect." });
    return;
  }

  try {
    const repos: Array<{
      id: number;
      private: boolean;
      full_name: string;
      description: string | null;
    }> = [];

    // Paginate All Repos
    let page = 1;
    let hasMore = true;
    const perPage = 100;

    while (hasMore) {
      const response = await fetch(
        `https://api.github.com/user/repos?per_page=${perPage}&page=${page}&sort=updated&direction=desc&type=all`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        }
      );
      if (response.status === 401) {
        res.status(401).json({ error: "GitHub token is invalid or expired. Please reconnect." });
        return;
      }
      if (!response.ok) {
        const errorText = await response.text();
        console.error("[github] API error fetching repos:", response.status, errorText);
        res.status(502).json({ error: "Failed to fetch repositories from GitHub" });
        return;
      }

      const pageRepos = (await response.json()) as Array<{
        id: number;
        private: boolean;
        full_name: string;
        description: string | null;
      }>;

      for (const repo of pageRepos) {
        repos.push({
          id: repo.id,
          private: repo.private,
          full_name: repo.full_name,
          description: repo.description,
        });
      }

      if (pageRepos.length < perPage) {
        hasMore = false;
      } else {
        page++;
      }

      // Safety Cap: 10 Page Limit
      if (page > 10) {
        hasMore = false;
      }
    }

    res.json(repos);
  } catch (err) {
    console.error("[github] Error fetching repos:", err);
    res.status(500).json({ error: "Failed to fetch repositories from GitHub" });
  }
});

/**
 * DELETE /api/github/token
 * Returns { disconnected: true }
 *
 * Clears the authenticated user's stored GitHub token.
 */
githubApiRouter.delete("/token", async (req, res) => {
  try {
    const userId = req.user!.id;
    await clearGitHubToken(userId);

    res.json({ disconnected: true });
  } catch (err) {
    console.error("[github] Error clearing GitHub token:", err);
    res.status(500).json({ error: "Failed to disconnect GitHub" });
  }
});
