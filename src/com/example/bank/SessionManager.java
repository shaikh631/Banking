package com.example.bank;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Manages short-lived API sessions for authenticated users.
 */
public final class SessionManager {

    private static final Duration SESSION_TTL = Duration.ofMinutes(30);
    private final Map<String, Session> sessions = new ConcurrentHashMap<>();

    public String createSession(int userId, String username) {
        String token = UUID.randomUUID().toString();
        sessions.put(token, new Session(userId, username, Instant.now().plus(SESSION_TTL)));
        return token;
    }

    public Session validate(String token) {
        if (token == null || token.isBlank()) {
            return null;
        }
        Session session = sessions.get(token);
        if (session == null) {
            return null;
        }
        if (session.expiresAt().isBefore(Instant.now())) {
            sessions.remove(token);
            return null;
        }
        Session refreshed = session.refresh();
        sessions.put(token, refreshed);
        return refreshed;
    }

    public void invalidate(String token) {
        if (token != null) {
            sessions.remove(token);
        }
    }

    /**
     * Simple session value object.
     */
    public static final class Session {
        private final int userId;
        private final String username;
        private final Instant expiresAt;

        Session(int userId, String username, Instant expiresAt) {
            this.userId = userId;
            this.username = username;
            this.expiresAt = expiresAt;
        }

        public int userId() {
            return userId;
        }

        public String username() {
            return username;
        }

        public Instant expiresAt() {
            return expiresAt;
        }

        Session refresh() {
            return new Session(userId, username, Instant.now().plus(SESSION_TTL));
        }
    }
}
