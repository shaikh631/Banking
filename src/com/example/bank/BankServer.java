package com.example.bank;

import com.example.bank.model.Account;
import com.example.bank.model.AccountTransaction;
import com.example.bank.model.User;
import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.StringJoiner;
import java.util.concurrent.Executors;

/**
 * HTTP server that powers the banking management system with authentication and MySQL persistence.
 */
public final class BankServer {

    private final AccountRepository accountRepository = new AccountRepository();
    private final UserRepository userRepository = new UserRepository();
    private final SessionManager sessionManager = new SessionManager();

    public BankServer() {
        userRepository.ensureDefaultAdmin();
    }

    public static void main(String[] args) throws IOException {
        int port = args.length > 0 ? Integer.parseInt(args[0]) : 8080;
        BankServer app = new BankServer();
        app.start(port);
    }

    private void start(int port) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);
        server.createContext("/api/login", new LoginHandler());
        server.createContext("/api/logout", new LogoutHandler());
        server.createContext("/api/accounts", new AccountsHandler());
        server.createContext("/api/accounts/summary", new AccountsSummaryHandler());
        server.createContext("/api/accounts/", new AccountActionHandler());
        server.createContext("/api/transfers", new TransferHandler());
        server.createContext("/api/users/me", new CurrentUserHandler());
        server.createContext("/api/users/password", new ChangePasswordHandler());
        server.createContext("/api/dashboard", new DashboardHandler());
        server.createContext("/", new StaticFileHandler());
        server.setExecutor(Executors.newCachedThreadPool());
        System.out.println("Bank server running at http://localhost:" + port);
        server.start();
    }

    private AuthContext requireAuth(HttpExchange exchange) throws IOException {
        String token = extractBearerToken(exchange);
        if (token == null) {
            sendJson(exchange, 401, errorJson("Missing authorization token"));
            return null;
        }
        SessionManager.Session session = sessionManager.validate(token);
        if (session == null) {
            sendJson(exchange, 401, errorJson("Invalid or expired session"));
            return null;
        }
        return new AuthContext(token, session);
    }

    private String extractBearerToken(HttpExchange exchange) {
        String header = exchange.getRequestHeaders().getFirst("Authorization");
        if (header == null) {
            return null;
        }
        if (header.toLowerCase(Locale.ROOT).startsWith("bearer ")) {
            return header.substring(7).trim();
        }
        return null;
    }

    private final class LoginHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendMethodNotAllowed(exchange, exchange.getRequestMethod());
                return;
            }
            try {
                Map<String, String> payload = parseFlatJson(readBody(exchange));
                String username = payload.getOrDefault("username", "").trim();
                String password = payload.getOrDefault("password", "").trim();
                if (username.isEmpty() || password.isEmpty()) {
                    sendJson(exchange, 400, errorJson("Username and password are required"));
                    return;
                }
                var userOpt = userRepository.findByUsername(username);
                if (userOpt.isEmpty() || !PasswordUtil.verify(password, userOpt.get().passwordHash())) {
                    sendJson(exchange, 401, errorJson("Invalid credentials"));
                    return;
                }
                String token = sessionManager.createSession(userOpt.get().id(), userOpt.get().username());
                sendJson(exchange, 200, '{' +
                        "\"token\":\"" + escapeJson(token) + "\"," +
                        "\"username\":\"" + escapeJson(userOpt.get().username()) + "\"" +
                        '}');
            } catch (IllegalArgumentException ex) {
                sendJson(exchange, 400, errorJson(ex.getMessage()));
            } catch (RuntimeException ex) {
                ex.printStackTrace();
                sendJson(exchange, 500, errorJson("Internal server error"));
            }
        }
    }

    private final class LogoutHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendMethodNotAllowed(exchange, exchange.getRequestMethod());
                return;
            }
            AuthContext context = requireAuth(exchange);
            if (context == null) {
                return;
            }
            sessionManager.invalidate(context.token());
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
        }
    }

    private final class AccountsHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            AuthContext auth = requireAuth(exchange);
            if (auth == null) {
                return;
            }
            String method = exchange.getRequestMethod();
            if ("GET".equalsIgnoreCase(method)) {
                handleList(exchange);
                return;
            }
            if ("POST".equalsIgnoreCase(method)) {
                handleCreate(exchange);
                return;
            }
            sendMethodNotAllowed(exchange, method);
        }

        private void handleList(HttpExchange exchange) throws IOException {
            try {
                List<Account> accounts = accountRepository.findAll();
                sendJson(exchange, 200, accountsToJson(accounts));
            } catch (RuntimeException ex) {
                ex.printStackTrace();
                sendJson(exchange, 500, errorJson("Unable to load accounts"));
            }
        }

        private void handleCreate(HttpExchange exchange) throws IOException {
            try {
                Map<String, String> payload = parseFlatJson(readBody(exchange));
                String ownerName = payload.getOrDefault("ownerName", "").trim();
                if (ownerName.isEmpty()) {
                    throw new IllegalArgumentException("Owner name is required");
                }
                String initialBalanceRaw = payload.getOrDefault("initialBalance", "0");
                BigDecimal initialBalance = initialBalanceRaw.isBlank()
                    ? BigDecimal.ZERO.setScale(2, RoundingMode.HALF_EVEN)
                    : parseAmount(initialBalanceRaw);
                if (initialBalance.compareTo(BigDecimal.ZERO) < 0) {
                    throw new IllegalArgumentException("Initial balance cannot be negative");
                }
                Account created = accountRepository.createAccount(ownerName, initialBalance);
                sendJson(exchange, 201, accountToJson(created));
            } catch (IllegalArgumentException ex) {
                sendJson(exchange, 400, errorJson(ex.getMessage()));
            } catch (RuntimeException ex) {
                ex.printStackTrace();
                sendJson(exchange, 500, errorJson("Unable to create account"));
            }
        }
    }

    private final class AccountsSummaryHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            AuthContext auth = requireAuth(exchange);
            if (auth == null) {
                return;
            }
            if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendMethodNotAllowed(exchange, exchange.getRequestMethod());
                return;
            }
            try {
                List<AccountRepository.AccountLedger> ledgers = accountRepository.findAllWithTotals();
                sendJson(exchange, 200, accountLedgersToJson(ledgers));
            } catch (RuntimeException ex) {
                ex.printStackTrace();
                sendJson(exchange, 500, errorJson("Unable to load account summaries"));
            }
        }
    }

    private final class CurrentUserHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            AuthContext auth = requireAuth(exchange);
            if (auth == null) {
                return;
            }
            if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendMethodNotAllowed(exchange, exchange.getRequestMethod());
                return;
            }
            try {
                var userOpt = userRepository.findById(auth.session().userId());
                if (userOpt.isEmpty()) {
                    sendJson(exchange, 404, errorJson("User not found"));
                    return;
                }
                sendJson(exchange, 200, userToJson(userOpt.get()));
            } catch (RuntimeException ex) {
                ex.printStackTrace();
                sendJson(exchange, 500, errorJson("Unable to load user profile"));
            }
        }
    }

    private final class ChangePasswordHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            AuthContext auth = requireAuth(exchange);
            if (auth == null) {
                return;
            }
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendMethodNotAllowed(exchange, exchange.getRequestMethod());
                return;
            }
            try {
                Map<String, String> payload = parseFlatJson(readBody(exchange));
                String currentPassword = payload.getOrDefault("currentPassword", "").trim();
                String newPassword = payload.getOrDefault("newPassword", "").trim();
                if (currentPassword.isEmpty() || newPassword.isEmpty()) {
                    sendJson(exchange, 400, errorJson("Current and new passwords are required"));
                    return;
                }
                if (newPassword.length() < 8) {
                    sendJson(exchange, 400, errorJson("New password must be at least 8 characters"));
                    return;
                }
                var userOpt = userRepository.findById(auth.session().userId());
                if (userOpt.isEmpty()) {
                    sendJson(exchange, 404, errorJson("User not found"));
                    return;
                }
                User user = userOpt.get();
                if (!PasswordUtil.verify(currentPassword, user.passwordHash())) {
                    sendJson(exchange, 400, errorJson("Current password is incorrect"));
                    return;
                }
                if (PasswordUtil.verify(newPassword, user.passwordHash())) {
                    sendJson(exchange, 400, errorJson("New password must differ from the current password"));
                    return;
                }
                userRepository.updatePassword(user.id(), newPassword);
                sendJson(exchange, 200, "{\"status\":\"Password updated\"}");
            } catch (IllegalArgumentException ex) {
                sendJson(exchange, 400, errorJson(ex.getMessage()));
            } catch (RuntimeException ex) {
                ex.printStackTrace();
                sendJson(exchange, 500, errorJson("Unable to update password"));
            }
        }
    }

    private final class AccountActionHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            AuthContext auth = requireAuth(exchange);
            if (auth == null) {
                return;
            }
            String path = exchange.getRequestURI().getPath();
            String[] segments = path.split("/");
            if (segments.length < 4) {
                sendJson(exchange, 404, errorJson("Unknown endpoint"));
                return;
            }
            int accountId;
            try {
                accountId = Integer.parseInt(segments[3]);
            } catch (NumberFormatException ex) {
                sendJson(exchange, 400, errorJson("Invalid account id"));
                return;
            }

            if (segments.length == 4 || segments[4].isEmpty()) {
                sendMethodNotAllowed(exchange, exchange.getRequestMethod());
                return;
            }

            String action = segments[4];
            if ("transactions".equalsIgnoreCase(action)) {
                handleTransactions(exchange, accountId);
                return;
            }
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendMethodNotAllowed(exchange, exchange.getRequestMethod());
                return;
            }
            switch (action.toLowerCase(Locale.ROOT)) {
                case "deposit" -> handleDeposit(exchange, accountId);
                case "withdraw" -> handleWithdraw(exchange, accountId);
                default -> sendJson(exchange, 404, errorJson("Unknown action"));
            }
        }

        private void handleDeposit(HttpExchange exchange, int accountId) throws IOException {
            try {
                Map<String, String> payload = parseFlatJson(readBody(exchange));
                BigDecimal amount = parseAmount(payload.get("amount"));
                Account updated = accountRepository.deposit(accountId, amount);
                sendJson(exchange, 200, accountToJson(updated));
            } catch (IllegalArgumentException ex) {
                sendJson(exchange, 400, errorJson(ex.getMessage()));
            } catch (RuntimeException ex) {
                ex.printStackTrace();
                sendJson(exchange, 500, errorJson("Unable to complete deposit"));
            }
        }

        private void handleWithdraw(HttpExchange exchange, int accountId) throws IOException {
            try {
                Map<String, String> payload = parseFlatJson(readBody(exchange));
                BigDecimal amount = parseAmount(payload.get("amount"));
                Account updated = accountRepository.withdraw(accountId, amount);
                sendJson(exchange, 200, accountToJson(updated));
            } catch (IllegalArgumentException ex) {
                sendJson(exchange, 400, errorJson(ex.getMessage()));
            } catch (RuntimeException ex) {
                ex.printStackTrace();
                sendJson(exchange, 500, errorJson("Unable to complete withdrawal"));
            }
        }

        private void handleTransactions(HttpExchange exchange, int accountId) throws IOException {
            if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendMethodNotAllowed(exchange, exchange.getRequestMethod());
                return;
            }
            int limit = parseLimit(exchange.getRequestURI().getQuery());
            try {
                List<AccountTransaction> transactions = accountRepository.recentTransactions(accountId, limit);
                sendJson(exchange, 200, transactionsToJson(transactions));
            } catch (IllegalArgumentException ex) {
                sendJson(exchange, 404, errorJson(ex.getMessage()));
            } catch (RuntimeException ex) {
                ex.printStackTrace();
                sendJson(exchange, 500, errorJson("Unable to load transactions"));
            }
        }

        private int parseLimit(String query) {
            if (query == null || query.isBlank()) {
                return 20;
            }
            for (String part : query.split("&")) {
                String[] keyValue = part.split("=", 2);
                if (keyValue.length == 2 && keyValue[0].equals("limit")) {
                    try {
                        return Math.max(1, Math.min(100, Integer.parseInt(keyValue[1])));
                    } catch (NumberFormatException ignored) {
                        return 20;
                    }
                }
            }
            return 20;
        }
    }

    private final class TransferHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            AuthContext auth = requireAuth(exchange);
            if (auth == null) {
                return;
            }
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendMethodNotAllowed(exchange, exchange.getRequestMethod());
                return;
            }
            try {
                Map<String, String> payload = parseFlatJson(readBody(exchange));
                int fromAccountId = Integer.parseInt(payload.getOrDefault("fromAccountId", ""));
                int toAccountId = Integer.parseInt(payload.getOrDefault("toAccountId", ""));
                BigDecimal amount = parseAmount(payload.get("amount"));
                AccountRepository.TransferResult result = accountRepository.transfer(fromAccountId, toAccountId, amount);
                sendJson(exchange, 200, transferResultToJson(result));
            } catch (NumberFormatException ex) {
                sendJson(exchange, 400, errorJson("Account ids must be numeric"));
            } catch (IllegalArgumentException ex) {
                sendJson(exchange, 400, errorJson(ex.getMessage()));
            } catch (RuntimeException ex) {
                ex.printStackTrace();
                sendJson(exchange, 500, errorJson("Unable to complete transfer"));
            }
        }
    }

    private final class DashboardHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            AuthContext auth = requireAuth(exchange);
            if (auth == null) {
                return;
            }
            if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendMethodNotAllowed(exchange, exchange.getRequestMethod());
                return;
            }
            try {
                AccountRepository.DashboardSummary summary = accountRepository.loadDashboardSummary();
                List<AccountTransaction> deposits = accountRepository.recentTransactionsByType("DEPOSIT", 12);
                List<AccountTransaction> withdrawals = accountRepository.recentTransactionsByType("WITHDRAW", 12);
                sendJson(exchange, 200, dashboardToJson(summary, deposits, withdrawals));
            } catch (IllegalArgumentException ex) {
                sendJson(exchange, 400, errorJson(ex.getMessage()));
            } catch (RuntimeException ex) {
                ex.printStackTrace();
                sendJson(exchange, 500, errorJson("Unable to load dashboard data"));
            }
        }
    }

    private final class StaticFileHandler implements HttpHandler {
        private final Path webRoot = Paths.get("web").toAbsolutePath().normalize();

        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendMethodNotAllowed(exchange, exchange.getRequestMethod());
                return;
            }
            String rawPath = exchange.getRequestURI().getPath();
            if (rawPath.equals("/")) {
                rawPath = "/new_index.html";
            }
            // Optional redirect for index path to new_index
            if (rawPath.equals("/new_index.html")) {
                rawPath = "/new_index.html";
            }
            Path requested = webRoot.resolve(rawPath.substring(1)).normalize();
            if (!requested.startsWith(webRoot) || Files.isDirectory(requested) || !Files.exists(requested)) {
                sendPlain(exchange, 404, "Not Found");
                return;
            }
            byte[] content = Files.readAllBytes(requested);
            Headers headers = exchange.getResponseHeaders();
            headers.set("Content-Type", contentTypeFor(requested));
            exchange.sendResponseHeaders(200, content.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(content);
            }
        }

        private String contentTypeFor(Path file) {
            String filename = file.getFileName().toString();
            if (filename.endsWith(".html")) {
                return "text/html; charset=utf-8";
            }
            if (filename.endsWith(".css")) {
                return "text/css; charset=utf-8";
            }
            if (filename.endsWith(".js")) {
                return "application/javascript; charset=utf-8";
            }
            if (filename.endsWith(".json")) {
                return "application/json; charset=utf-8";
            }
            return "application/octet-stream";
        }
    }

    private String accountsToJson(List<Account> accounts) {
        StringJoiner joiner = new StringJoiner(",", "[", "]");
        for (Account account : accounts) {
            joiner.add(accountToJson(account));
        }
        return joiner.toString();
    }

    private String accountLedgersToJson(List<AccountRepository.AccountLedger> ledgers) {
        StringJoiner joiner = new StringJoiner(",", "[", "]");
        for (AccountRepository.AccountLedger ledger : ledgers) {
            joiner.add(accountLedgerToJson(ledger));
        }
        return joiner.toString();
    }

    private String transactionsToJson(List<AccountTransaction> transactions) {
        StringJoiner joiner = new StringJoiner(",", "[", "]");
        for (AccountTransaction txn : transactions) {
            joiner.add(transactionToJson(txn));
        }
        return joiner.toString();
    }

    private String dashboardToJson(AccountRepository.DashboardSummary summary,
                                   List<AccountTransaction> deposits,
                                   List<AccountTransaction> withdrawals) {
        return "{" +
                "\"summary\":" + dashboardSummaryToJson(summary) + ',' +
                "\"recentDeposits\":" + transactionsToJson(deposits) + ',' +
                "\"recentWithdrawals\":" + transactionsToJson(withdrawals) +
                '}';
    }

    private String dashboardSummaryToJson(AccountRepository.DashboardSummary summary) {
        return "{" +
                "\"totalBalance\":" + formatAmount(summary.totalBalance()) + ',' +
                "\"accountsCount\":" + summary.accountCount() + ',' +
                "\"totalDeposits\":" + formatAmount(summary.totalDeposits()) + ',' +
                "\"totalWithdrawals\":" + formatAmount(summary.totalWithdrawals()) +
                '}';
    }

    private String transferResultToJson(AccountRepository.TransferResult result) {
        return "{" +
                "\"from\":" + accountToJson(result.fromAccount()) + ',' +
                "\"to\":" + accountToJson(result.toAccount()) +
                '}';
    }

    private String accountToJson(Account account) {
        return "{" +
                "\"id\":" + account.id() + ',' +
                "\"accountNo\":\"" + escapeJson(account.accountNumber()) + "\"," +
                "\"ownerName\":\"" + escapeJson(account.ownerName()) + "\"," +
                "\"balance\":" + formatAmount(account.balance()) + ',' +
                "\"updatedAt\":\"" + account.updatedAt().toString() + "\"" +
                '}';
    }

    private String accountLedgerToJson(AccountRepository.AccountLedger ledger) {
        String updatedAt = ledger.updatedAt() == null ? "" : ledger.updatedAt().toString();
        return "{" +
                "\"id\":" + ledger.id() + ',' +
                "\"accountNo\":\"" + escapeJson(ledger.accountNumber()) + "\"," +
                "\"ownerName\":\"" + escapeJson(ledger.ownerName()) + "\"," +
                "\"balance\":" + formatAmount(ledger.balance()) + ',' +
                "\"totalDeposits\":" + formatAmount(ledger.totalDeposits()) + ',' +
                "\"totalWithdrawals\":" + formatAmount(ledger.totalWithdrawals()) + ',' +
                "\"depositCount\":" + ledger.depositCount() + ',' +
                "\"withdrawCount\":" + ledger.withdrawCount() + ',' +
                "\"updatedAt\":\"" + updatedAt + "\"" +
                '}';
    }

    private String userToJson(User user) {
        return "{" +
                "\"id\":" + user.id() + ',' +
                "\"username\":\"" + escapeJson(user.username()) + "\"," +
                "\"createdAt\":\"" + user.createdAt().toString() + "\"" +
                '}';
    }

    private String transactionToJson(AccountTransaction txn) {
        return "{" +
                "\"id\":" + txn.id() + ',' +
                "\"accountId\":" + txn.accountId() + ',' +
                "\"type\":\"" + escapeJson(txn.type()) + "\"," +
                "\"amount\":" + formatAmount(txn.amount()) + ',' +
                "\"note\":\"" + escapeJson(txn.note() == null ? "" : txn.note()) + "\"," +
                "\"createdAt\":\"" + txn.createdAt().toString() + "\"" +
                '}';
    }

    private static String formatAmount(BigDecimal value) {
        return value.setScale(2, RoundingMode.HALF_EVEN).toPlainString();
    }

    private static String escapeJson(String text) {
        return text.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private static String readBody(HttpExchange exchange) throws IOException {
        return new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
    }

    private Map<String, String> parseFlatJson(String json) {
        Map<String, String> result = new HashMap<>();
        String trimmed = json == null ? "" : json.trim();
        if (trimmed.isEmpty()) {
            return result;
        }
        if (trimmed.charAt(0) == '{' && trimmed.charAt(trimmed.length() - 1) == '}') {
            trimmed = trimmed.substring(1, trimmed.length() - 1);
        }
        StringBuilder key = new StringBuilder();
        StringBuilder value = new StringBuilder();
        boolean readingKey = true;
        boolean insideQuotes = false;
        char prev = '\0';
        for (int i = 0; i < trimmed.length(); i++) {
            char current = trimmed.charAt(i);
            if (current == '"' && prev != '\\') {
                insideQuotes = !insideQuotes;
            }
            if (!insideQuotes && current == ':') {
                readingKey = false;
            } else if (!insideQuotes && current == ',') {
                putPair(result, key, value);
                key.setLength(0);
                value.setLength(0);
                readingKey = true;
            } else {
                if (readingKey) {
                    key.append(current);
                } else {
                    value.append(current);
                }
            }
            prev = current;
        }
        putPair(result, key, value);
        return result;
    }

    private static void putPair(Map<String, String> target, StringBuilder key, StringBuilder value) {
        if (key.length() == 0) {
            return;
        }
        String mapKey = normalizeJsonValue(key);
        String mapValue = normalizeJsonValue(value);
        target.put(mapKey, mapValue);
    }

    private static String normalizeJsonValue(CharSequence seq) {
        String raw = seq.toString().trim();
        if (raw.startsWith("\"") && raw.endsWith("\"")) {
            raw = raw.substring(1, raw.length() - 1).replace("\\\"", "\"").replace("\\\\", "\\");
        }
        return raw;
    }

    private static BigDecimal parseAmount(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("Amount is required");
        }
        try {
            return new BigDecimal(raw.trim()).setScale(2, RoundingMode.HALF_EVEN);
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException("Invalid monetary amount");
        }
    }

    private static void sendJson(HttpExchange exchange, int statusCode, String json) throws IOException {
        byte[] payload = json.getBytes(StandardCharsets.UTF_8);
        Headers headers = exchange.getResponseHeaders();
        headers.set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(statusCode, payload.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(payload);
        }
    }

    private static void sendPlain(HttpExchange exchange, int statusCode, String message) throws IOException {
        byte[] payload = message.getBytes(StandardCharsets.UTF_8);
        Headers headers = exchange.getResponseHeaders();
        headers.set("Content-Type", "text/plain; charset=utf-8");
        exchange.sendResponseHeaders(statusCode, payload.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(payload);
        }
    }

    private static void sendMethodNotAllowed(HttpExchange exchange, String method) throws IOException {
        sendPlain(exchange, 405, "Method " + method + " not allowed");
    }

    private static String errorJson(String message) {
        return "{" + "\"error\":\"" + escapeJson(message) + "\"}";
    }

    private record AuthContext(String token, SessionManager.Session session) {
    }
}
