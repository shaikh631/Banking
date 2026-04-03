CREATE DATABASE IF NOT EXISTS bank
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE bank;

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(60) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS accounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
        account_no CHAR(12) NOT NULL UNIQUE,
    owner_name VARCHAR(120) NOT NULL,
    balance DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS account_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    account_id INT NOT NULL,
    type ENUM('DEPOSIT','WITHDRAW','TRANSFER_IN','TRANSFER_OUT') NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    note VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_account_transactions_account FOREIGN KEY (account_id)
        REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Optional performance index; rerun guarded if this already exists.
ALTER TABLE account_transactions
    ADD INDEX idx_account_transactions_account_created (account_id, created_at DESC);

UPDATE users
SET password_hash = '120000:flhZwJQWjKpT718jeICi7w==:6Et7RD608B3TLZGbdzato7A+1qfUVUdl2wTTnoVCJIY='
WHERE username = 'admin';