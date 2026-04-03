package com.example.bank.model;

import java.time.Instant;

public record User(int id, String username, String passwordHash, Instant createdAt) {
}
