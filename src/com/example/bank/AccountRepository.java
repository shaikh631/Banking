package com.example.bank;

import com.example.bank.model.Account;
import com.example.bank.model.AccountTransaction;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.security.SecureRandom;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.SQLIntegrityConstraintViolationException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Data access layer for account operations.
 */
public final class AccountRepository {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int ACCOUNT_NUMBER_LENGTH = 12;

    public List<Account> findAll() {
        String sql = "SELECT id, account_no, owner_name, balance, updated_at FROM accounts ORDER BY id";
        try (Connection connection = Database.getConnection();
             PreparedStatement stmt = connection.prepareStatement(sql);
             ResultSet rs = stmt.executeQuery()) {
            List<Account> accounts = new ArrayList<>();
            while (rs.next()) {
                accounts.add(mapAccount(rs));
            }
            return accounts;
        } catch (SQLException ex) {
            throw new RuntimeException("Failed to load accounts", ex);
        }
    }

    public List<AccountLedger> findAllWithTotals() {
        String sql = "SELECT a.id, a.account_no, a.owner_name, a.balance, a.updated_at, " +
                "COALESCE(SUM(CASE WHEN t.type = 'DEPOSIT' THEN t.amount ELSE 0 END), 0) AS total_deposits, " +
                "COALESCE(SUM(CASE WHEN t.type = 'WITHDRAW' THEN t.amount ELSE 0 END), 0) AS total_withdrawals, " +
                "COALESCE(SUM(CASE WHEN t.type = 'DEPOSIT' THEN 1 ELSE 0 END), 0) AS deposit_count, " +
                "COALESCE(SUM(CASE WHEN t.type = 'WITHDRAW' THEN 1 ELSE 0 END), 0) AS withdraw_count " +
                "FROM accounts a " +
                "LEFT JOIN account_transactions t ON t.account_id = a.id " +
            "GROUP BY a.id, a.account_no, a.owner_name, a.balance, a.updated_at " +
                "ORDER BY a.id";
        try (Connection connection = Database.getConnection();
             PreparedStatement stmt = connection.prepareStatement(sql);
             ResultSet rs = stmt.executeQuery()) {
            List<AccountLedger> ledgers = new ArrayList<>();
            while (rs.next()) {
                ledgers.add(mapAccountLedger(rs));
            }
            return ledgers;
        } catch (SQLException ex) {
            throw new RuntimeException("Failed to load account summaries", ex);
        }
    }

    public DashboardSummary loadDashboardSummary() {
        String totalsSql = "SELECT COALESCE(SUM(balance), 0) AS total_balance, COUNT(*) AS account_count FROM accounts";
        String transactionsSql = "SELECT " +
                "COALESCE(SUM(CASE WHEN type = 'DEPOSIT' THEN amount ELSE 0 END), 0) AS total_deposits, " +
                "COALESCE(SUM(CASE WHEN type = 'WITHDRAW' THEN amount ELSE 0 END), 0) AS total_withdrawals " +
                "FROM account_transactions";
        try (Connection connection = Database.getConnection()) {
            BigDecimal totalBalance = BigDecimal.ZERO;
            long accountCount = 0L;
            try (PreparedStatement stmt = connection.prepareStatement(totalsSql);
                 ResultSet rs = stmt.executeQuery()) {
                if (rs.next()) {
                    totalBalance = sanitizeAmount(rs.getBigDecimal("total_balance"));
                    accountCount = rs.getLong("account_count");
                }
            }

            BigDecimal totalDeposits = BigDecimal.ZERO;
            BigDecimal totalWithdrawals = BigDecimal.ZERO;
            try (PreparedStatement stmt = connection.prepareStatement(transactionsSql);
                 ResultSet rs = stmt.executeQuery()) {
                if (rs.next()) {
                    totalDeposits = sanitizeAmount(rs.getBigDecimal("total_deposits"));
                    totalWithdrawals = sanitizeAmount(rs.getBigDecimal("total_withdrawals"));
                }
            }

            return new DashboardSummary(totalBalance, accountCount, totalDeposits, totalWithdrawals);
        } catch (SQLException ex) {
            throw new RuntimeException("Failed to load dashboard summary", ex);
        }
    }

    public Account createAccount(String ownerName, BigDecimal initialBalance) {
        BigDecimal amount = sanitizeAmount(initialBalance);
        String sql = "INSERT INTO accounts (account_no, owner_name, balance) VALUES (?, ?, ?)";
        try (Connection connection = Database.getConnection()) {
            for (int attempt = 0; attempt < 15; attempt++) {
                String accountNumber = generateAccountNumber();
                try (PreparedStatement stmt = connection.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
                    stmt.setString(1, accountNumber);
                    stmt.setString(2, ownerName);
                    stmt.setBigDecimal(3, amount);
                    stmt.executeUpdate();
                    try (ResultSet keys = stmt.getGeneratedKeys()) {
                        if (!keys.next()) {
                            throw new SQLException("Failed to retrieve generated account id");
                        }
                        int id = keys.getInt(1);
                        return findById(id);
                    }
                } catch (SQLIntegrityConstraintViolationException duplicate) {
                    if (attempt == 14) {
                        throw new RuntimeException("Failed to allocate unique account number", duplicate);
                    }
                }
            }
            throw new RuntimeException("Unable to allocate unique account number");
        } catch (SQLException ex) {
            throw new RuntimeException("Failed to create account", ex);
        }
    }

    public Account deposit(int accountId, BigDecimal rawAmount) {
        return mutateBalance(accountId, sanitizePositiveAmount(rawAmount), true, "DEPOSIT", "Deposit");
    }

    public Account withdraw(int accountId, BigDecimal rawAmount) {
        return mutateBalance(accountId, sanitizePositiveAmount(rawAmount), false, "WITHDRAW", "Withdrawal");
    }

    public TransferResult transfer(int fromAccountId, int toAccountId, BigDecimal rawAmount) {
        if (fromAccountId == toAccountId) {
            throw new IllegalArgumentException("Source and destination accounts must differ");
        }
        BigDecimal amount = sanitizePositiveAmount(rawAmount);
        try (Connection connection = Database.getConnection()) {
            connection.setAutoCommit(false);
            try {
                int firstId = Math.min(fromAccountId, toAccountId);
                int secondId = Math.max(fromAccountId, toAccountId);

                Account first = lockAccount(connection, firstId);
                Account second = lockAccount(connection, secondId);

                Account from = first.id() == fromAccountId ? first : second;
                Account to = first.id() == toAccountId ? first : second;

                if (from.balance().compareTo(amount) < 0) {
                    throw new IllegalArgumentException("Insufficient funds");
                }

                BigDecimal fromBalance = sanitizeAmount(from.balance().subtract(amount));
                BigDecimal toBalance = sanitizeAmount(to.balance().add(amount));

                updateBalance(connection, from.id(), fromBalance);
                insertTransaction(connection, from.id(), "TRANSFER_OUT", amount,
                    "Transfer to account " + to.accountNumber());

                updateBalance(connection, to.id(), toBalance);
                insertTransaction(connection, to.id(), "TRANSFER_IN", amount,
                    "Transfer from account " + from.accountNumber());

                connection.commit();
                Account updatedFrom = findById(from.id());
                Account updatedTo = findById(to.id());
                return new TransferResult(updatedFrom, updatedTo);
            } catch (SQLException | RuntimeException ex) {
                connection.rollback();
                throw ex;
            } finally {
                connection.setAutoCommit(true);
            }
        } catch (SQLException ex) {
            throw new RuntimeException("Failed to transfer funds", ex);
        }
    }

    public List<AccountTransaction> recentTransactions(int accountId, int limit) {
        String sql = "SELECT id, account_id, type, amount, note, created_at " +
                "FROM account_transactions WHERE account_id = ? ORDER BY created_at DESC LIMIT ?";
        try (Connection connection = Database.getConnection();
             PreparedStatement stmt = connection.prepareStatement(sql)) {
            stmt.setInt(1, accountId);
            stmt.setInt(2, Math.max(1, limit));
            try (ResultSet rs = stmt.executeQuery()) {
                List<AccountTransaction> transactions = new ArrayList<>();
                while (rs.next()) {
                    transactions.add(mapTransaction(rs));
                }
                return transactions;
            }
        } catch (SQLException ex) {
            throw new RuntimeException("Failed to load transactions", ex);
        }
    }

    public List<AccountTransaction> recentTransactionsByType(String type, int limit) {
        String normalizedType = type == null ? "" : type.trim().toUpperCase(Locale.ROOT);
        if (!List.of("DEPOSIT", "WITHDRAW", "TRANSFER_IN", "TRANSFER_OUT").contains(normalizedType)) {
            throw new IllegalArgumentException("Unsupported transaction type for summary");
        }
        String sql = "SELECT id, account_id, type, amount, note, created_at FROM account_transactions " +
                "WHERE type = ? ORDER BY created_at DESC LIMIT ?";
        try (Connection connection = Database.getConnection();
             PreparedStatement stmt = connection.prepareStatement(sql)) {
            stmt.setString(1, normalizedType);
            stmt.setInt(2, Math.max(1, limit));
            try (ResultSet rs = stmt.executeQuery()) {
                List<AccountTransaction> transactions = new ArrayList<>();
                while (rs.next()) {
                    transactions.add(mapTransaction(rs));
                }
                return transactions;
            }
        } catch (SQLException ex) {
            throw new RuntimeException("Failed to load transactions for type " + normalizedType, ex);
        }
    }

    private Account mutateBalance(int accountId, BigDecimal amount, boolean isDeposit, String txnType, String note) {
        try (Connection connection = Database.getConnection()) {
            connection.setAutoCommit(false);
            try {
                Account account = lockAccount(connection, accountId);
                BigDecimal newBalance = isDeposit
                        ? sanitizeAmount(account.balance().add(amount))
                        : sanitizeAmount(account.balance().subtract(amount));
                if (!isDeposit && newBalance.compareTo(BigDecimal.ZERO) < 0) {
                    throw new IllegalArgumentException("Insufficient funds");
                }
                updateBalance(connection, account.id(), newBalance);
                insertTransaction(connection, account.id(), txnType, amount, note);
                connection.commit();
                return findById(account.id());
            } catch (SQLException | RuntimeException ex) {
                connection.rollback();
                throw ex;
            } finally {
                connection.setAutoCommit(true);
            }
        } catch (SQLException ex) {
            throw new RuntimeException("Failed to update balance", ex);
        }
    }

    private Account lockAccount(Connection connection, int accountId) throws SQLException {
        String sql = "SELECT id, account_no, owner_name, balance, updated_at FROM accounts WHERE id = ? FOR UPDATE";
        try (PreparedStatement stmt = connection.prepareStatement(sql)) {
            stmt.setInt(1, accountId);
            try (ResultSet rs = stmt.executeQuery()) {
                if (!rs.next()) {
                    throw new IllegalArgumentException("Account not found");
                }
                return mapAccount(rs);
            }
        }
    }

    public Account findById(int accountId) {
        String sql = "SELECT id, account_no, owner_name, balance, updated_at FROM accounts WHERE id = ?";
        try (Connection connection = Database.getConnection();
             PreparedStatement stmt = connection.prepareStatement(sql)) {
            stmt.setInt(1, accountId);
            try (ResultSet rs = stmt.executeQuery()) {
                if (!rs.next()) {
                    throw new IllegalArgumentException("Account not found");
                }
                return mapAccount(rs);
            }
        } catch (SQLException ex) {
            throw new RuntimeException("Failed to load account", ex);
        }
    }

    private void updateBalance(Connection connection, int accountId, BigDecimal amount) throws SQLException {
        String sql = "UPDATE accounts SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?";
        try (PreparedStatement stmt = connection.prepareStatement(sql)) {
            stmt.setBigDecimal(1, amount);
            stmt.setInt(2, accountId);
            stmt.executeUpdate();
        }
    }

    private void insertTransaction(Connection connection, int accountId, String type, BigDecimal amount, String note) throws SQLException {
        String sql = "INSERT INTO account_transactions (account_id, type, amount, note) VALUES (?, ?, ?, ?)";
        try (PreparedStatement stmt = connection.prepareStatement(sql)) {
            stmt.setInt(1, accountId);
            stmt.setString(2, type);
            stmt.setBigDecimal(3, amount);
            stmt.setString(4, note);
            stmt.executeUpdate();
        }
    }

    private Account mapAccount(ResultSet rs) throws SQLException {
        int id = rs.getInt("id");
        String accountNumber = rs.getString("account_no");
        if (isBlank(accountNumber)) {
            accountNumber = ensureAccountNumber(null, id, accountNumber);
        }
        String owner = rs.getString("owner_name");
        BigDecimal balance = rs.getBigDecimal("balance");
        Timestamp updated = rs.getTimestamp("updated_at");
        return new Account(id, accountNumber, owner, balance, updated.toInstant());
    }

    private AccountLedger mapAccountLedger(ResultSet rs) throws SQLException {
        int id = rs.getInt("id");
        String accountNumber = rs.getString("account_no");
        String owner = rs.getString("owner_name");
        BigDecimal balance = sanitizeAmount(rs.getBigDecimal("balance"));
        BigDecimal deposits = sanitizeAmount(rs.getBigDecimal("total_deposits"));
        BigDecimal withdrawals = sanitizeAmount(rs.getBigDecimal("total_withdrawals"));
        int depositCount = rs.getInt("deposit_count");
        int withdrawCount = rs.getInt("withdraw_count");
        Timestamp updated = rs.getTimestamp("updated_at");
        if (isBlank(accountNumber)) {
            Connection connection = null;
            Statement statement = rs.getStatement();
            if (statement != null) {
                connection = statement.getConnection();
            }
            accountNumber = ensureAccountNumber(connection, id, accountNumber);
        }
        return new AccountLedger(id, accountNumber, owner, balance, deposits, withdrawals, depositCount, withdrawCount,
                updated != null ? updated.toInstant() : null);
    }

    private AccountTransaction mapTransaction(ResultSet rs) throws SQLException {
        int id = rs.getInt("id");
        int accountId = rs.getInt("account_id");
        String type = rs.getString("type");
        BigDecimal amount = rs.getBigDecimal("amount");
        String note = rs.getString("note");
        Timestamp created = rs.getTimestamp("created_at");
        return new AccountTransaction(id, accountId, type, amount, note, created.toInstant());
    }

    private BigDecimal sanitizeAmount(BigDecimal value) {
        if (value == null) {
            return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_EVEN);
        }
        return value.setScale(2, RoundingMode.HALF_EVEN);
    }

    private BigDecimal sanitizePositiveAmount(BigDecimal value) {
        BigDecimal amount = sanitizeAmount(value);
        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Amount must be greater than zero");
        }
        return amount;
    }

    public record TransferResult(Account fromAccount, Account toAccount) {
    }

    public record DashboardSummary(BigDecimal totalBalance, long accountCount, BigDecimal totalDeposits,
                                   BigDecimal totalWithdrawals) {
    }

    public record AccountLedger(int id, String accountNumber, String ownerName, BigDecimal balance,
                                BigDecimal totalDeposits, BigDecimal totalWithdrawals, int depositCount, int withdrawCount,
                                Instant updatedAt) {
    }

    private String ensureAccountNumber(Connection connection, int accountId, String currentValue) throws SQLException {
        if (!isBlank(currentValue)) {
            return currentValue;
        }
        if (connection == null) {
            try (Connection fresh = Database.getConnection()) {
                return ensureAccountNumber(fresh, accountId, currentValue);
            }
        }
        for (int attempt = 0; attempt < 20; attempt++) {
            String candidate = generateAccountNumber();
            try (PreparedStatement update = connection.prepareStatement(
                    "UPDATE accounts SET account_no = ? WHERE id = ? AND (account_no IS NULL OR account_no = '')")) {
                update.setString(1, candidate);
                update.setInt(2, accountId);
                int changed = update.executeUpdate();
                if (changed > 0) {
                    return candidate;
                }
            } catch (SQLIntegrityConstraintViolationException duplicate) {
                continue;
            }
            try (PreparedStatement fetch = connection.prepareStatement(
                    "SELECT account_no FROM accounts WHERE id = ?")) {
                fetch.setInt(1, accountId);
                try (ResultSet rs = fetch.executeQuery()) {
                    if (rs.next()) {
                        String existing = rs.getString(1);
                        if (!isBlank(existing)) {
                            return existing;
                        }
                    }
                }
            }
        }
        String fallback = fallbackAccountNumber(accountId);
        try (PreparedStatement update = connection.prepareStatement(
                "UPDATE accounts SET account_no = ? WHERE id = ? AND (account_no IS NULL OR account_no = '')")) {
            update.setString(1, fallback);
            update.setInt(2, accountId);
            update.executeUpdate();
        }
        return fallback;
    }

    private static String fallbackAccountNumber(int accountId) {
        return String.format("%012d", accountId);
    }

    private static boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    private static String generateAccountNumber() {
        StringBuilder builder = new StringBuilder(ACCOUNT_NUMBER_LENGTH);
        builder.append(RANDOM.nextInt(9) + 1); // ensure first digit is non-zero
        for (int i = 1; i < ACCOUNT_NUMBER_LENGTH; i++) {
            builder.append(RANDOM.nextInt(10));
        }
        return builder.toString();
    }
}
