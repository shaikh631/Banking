package com.example.bank.model;

import java.math.BigDecimal;
import java.time.Instant;

public record Account(int id, String accountNumber, String ownerName, BigDecimal balance, Instant updatedAt) {
    public Account withBalance(BigDecimal newBalance, Instant newUpdatedAt) {
        return new Account(id, accountNumber, ownerName, newBalance, newUpdatedAt);
    }
}
