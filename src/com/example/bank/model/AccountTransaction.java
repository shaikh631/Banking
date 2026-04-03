package com.example.bank.model;

import java.math.BigDecimal;
import java.time.Instant;

public record AccountTransaction(int id, int accountId, String type, BigDecimal amount, String note, Instant createdAt) {
}
