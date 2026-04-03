# Bank Management System

A Java-based banking system with MySQL persistence and web UI.

## Prerequisites

- Java JDK (25 or newer)
- MySQL 8.0
- Homebrew (for macOS)

## Quick Start

1. Install MySQL if not already installed:
```bash
brew install mysql@8.0
```

2. Make the run script executable:
```bash
chmod +x run.sh
```

3. Run the server:
```bash
./run.sh
```

The server will:
- Start MySQL if needed
- Create/update the database schema
- Compile Java sources
- Start the server on http://localhost:8080

## Default Credentials

- Admin User:
  - Username: admin
  - Password: admin123!
  - **Important:** Change this password immediately after first login

## Manual Setup (if not using run.sh)

1. Start MySQL:
```bash
brew services start mysql@8.0
```

2. Import schema:
```bash
mysql -u root -p'your_password' < db/schema.sql
```

3. Compile and run:
```bash
export BANK_DB_PASSWORD='your_password'
javac -cp ".:lib/mysql-connector-j-9.5.0.jar" -d . src/com/example/bank/model/*.java src/com/example/bank/*.java
java -cp ".:lib/mysql-connector-j-9.5.0.jar" com.example.bank.BankServer 8080
```

## Environment Variables

- `BANK_DB_URL` - MySQL connection URL (default: jdbc:mysql://localhost:3306/bank?createDatabaseIfNotExist=true&useSSL=false&allowPublicKeyRetrieval=true)
- `BANK_DB_USER` - MySQL username (default: root)
- `BANK_DB_PASSWORD` - MySQL password (required)

## API Examples

Create an account:
```bash
# First get a token
TOKEN=$(curl -s -X POST -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"admin123!"}' \
    http://localhost:8080/api/login | jq -r .token)

# Create account
curl -X POST -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"ownerName":"Test User","initialBalance":"100.00"}' \
    http://localhost:8080/api/accounts
```

## Troubleshooting

If you see "Unknown column 'account_no'" errors:
1. Back up existing data:
```bash
mysqldump -u root -p bank > bank_backup.sql
```
2. Drop and recreate the schema:
```bash
mysql -u root -p -e "DROP DATABASE bank; CREATE DATABASE bank;"
mysql -u root -p bank < db/schema.sql
```# Banking
