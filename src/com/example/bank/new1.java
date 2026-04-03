package com.example.bank;
public class new1 {
    public static void main(String[] args) {
        String password = "ayan9819";
        String hash = PasswordUtil.hash(password);
        System.out.println("Password: " + password);
        System.out.println("Hash: " + hash);
        System.out.println("Verification check: " + PasswordUtil.verify(password, hash));
    }
}
