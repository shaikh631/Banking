#!/bin/bash

# Environment variables for MySQL connection
export BANK_DB_PASSWORD='ayan9819'  # MySQL root password
export BANK_DB_USER='root'          # MySQL user
export BANK_DB_URL='jdbc:mysql://localhost:3306/bank?createDatabaseIfNotExist=true&useSSL=false&allowPublicKeyRetrieval=true'

# Ensure MySQL service is running
brew services start mysql@8.0

# Wait for MySQL to be ready
echo "Waiting for MySQL to be ready..."
for i in {1..30}; do
    if mysql -u root -p"$BANK_DB_PASSWORD" -e "SELECT 1" >/dev/null 2>&1; then
        break
    fi
    sleep 1
done

# Apply schema (creates bank database if not exists)
echo "Applying database schema..."
mysql -u root -p"$BANK_DB_PASSWORD" < db/schema.sql

# Compile Java sources if needed
echo "Compiling Java sources..."
javac -cp ".:lib/mysql-connector-j-9.5.0.jar" -d . src/com/example/bank/model/*.java src/com/example/bank/*.java

# Run the server (default port 8080)
echo "Starting BankServer on port 8080..."
java -cp ".:lib/mysql-connector-j-9.5.0.jar" com.example.bank.BankServer 8080