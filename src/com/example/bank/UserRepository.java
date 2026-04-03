package com.example.bank;

import com.example.bank.model.User;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;

/**
 * Data access for system users.
 */
public final class UserRepository {

    public Optional<User> findByUsername(String username) {
        String sql = "SELECT id, username, password_hash, created_at FROM users WHERE username = ?";
        try (Connection connection = Database.getConnection();
             PreparedStatement stmt = connection.prepareStatement(sql)) {
            stmt.setString(1, username);
            try (ResultSet rs = stmt.executeQuery()) {
                if (!rs.next()) {
                    return Optional.empty();
                }
                return Optional.of(mapUser(rs));
            }
        } catch (SQLException ex) {
            throw new RuntimeException("Failed to load user", ex);
        }
    }

    public Optional<User> findById(int userId) {
        String sql = "SELECT id, username, password_hash, created_at FROM users WHERE id = ?";
        try (Connection connection = Database.getConnection();
             PreparedStatement stmt = connection.prepareStatement(sql)) {
            stmt.setInt(1, userId);
            try (ResultSet rs = stmt.executeQuery()) {
                if (!rs.next()) {
                    return Optional.empty();
                }
                return Optional.of(mapUser(rs));
            }
        } catch (SQLException ex) {
            throw new RuntimeException("Failed to load user", ex);
        }
    }

    public void ensureDefaultAdmin() {
        String countSql = "SELECT COUNT(*) FROM users";
        try (Connection connection = Database.getConnection();
             PreparedStatement stmt = connection.prepareStatement(countSql);
             ResultSet rs = stmt.executeQuery()) {
            rs.next();
            long count = rs.getLong(1);
            if (count == 0) {
                createUser("admin", "admin123!");
                System.out.println("Created default admin user (username: admin, password: admin123!). Change this immediately.");
            }
        } catch (SQLException ex) {
            throw new RuntimeException("Failed to check users", ex);
        }
    }

    public void createUser(String username, String rawPassword) {
        String sql = "INSERT INTO users (username, password_hash) VALUES (?, ?)";
        String hash = PasswordUtil.hash(rawPassword);
        try (Connection connection = Database.getConnection();
             PreparedStatement stmt = connection.prepareStatement(sql)) {
            stmt.setString(1, username);
            stmt.setString(2, hash);
            stmt.executeUpdate();
        } catch (SQLException ex) {
            throw new RuntimeException("Failed to create user", ex);
        }
    }

    public void updatePassword(int userId, String rawPassword) {
        String sql = "UPDATE users SET password_hash = ? WHERE id = ?";
        String hash = PasswordUtil.hash(rawPassword);
        try (Connection connection = Database.getConnection();
             PreparedStatement stmt = connection.prepareStatement(sql)) {
            stmt.setString(1, hash);
            stmt.setInt(2, userId);
            int updated = stmt.executeUpdate();
            if (updated == 0) {
                throw new IllegalArgumentException("User not found");
            }
        } catch (SQLException ex) {
            throw new RuntimeException("Failed to update password", ex);
        }
    }

    private User mapUser(ResultSet rs) throws SQLException {
        int id = rs.getInt("id");
        String username = rs.getString("username");
        String passwordHash = rs.getString("password_hash");
        Timestamp created = rs.getTimestamp("created_at");
        Instant createdAt = created == null ? Instant.now() : created.toInstant();
        return new User(id, username, passwordHash, createdAt);
    }
}
