package com.mediflow.backend.security;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

@Component
public class SensitiveDataCrypto {

    private static final int IV_LENGTH = 12;
    private static final int TAG_LENGTH = 128;

    private final String configuredSecret;
    private final SecureRandom secureRandom = new SecureRandom();
    private SecretKeySpec encryptionKey;
    private SecretKeySpec indexKey;

    public SensitiveDataCrypto(@Value("${app.data-encryption-key:}") String configuredSecret) {
        this.configuredSecret = configuredSecret;
    }

    @PostConstruct
    void initialize() {
        if (configuredSecret == null || configuredSecret.length() < 32) {
            throw new IllegalStateException("APP_DATA_ENCRYPTION_KEY는 32자 이상의 무작위 비밀값으로 설정해야 합니다.");
        }
        byte[] root = digest(configuredSecret.getBytes(StandardCharsets.UTF_8));
        encryptionKey = new SecretKeySpec(root, "AES");
        indexKey = new SecretKeySpec(digest(ByteBuffer.allocate(root.length + 5)
                .put(root).put("index".getBytes(StandardCharsets.UTF_8)).array()), "HmacSHA256");
    }

    public String encrypt(String plaintext) {
        if (plaintext == null) return null;
        try {
            byte[] iv = new byte[IV_LENGTH];
            secureRandom.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, encryptionKey, new GCMParameterSpec(TAG_LENGTH, iv));
            byte[] encrypted = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            return "v1:" + Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(ByteBuffer.allocate(iv.length + encrypted.length).put(iv).put(encrypted).array());
        } catch (Exception exception) {
            throw new IllegalStateException("민감정보를 암호화하지 못했습니다.", exception);
        }
    }

    public String decrypt(String ciphertext) {
        if (ciphertext == null) return null;
        if (!ciphertext.startsWith("v1:")) throw new IllegalStateException("지원하지 않는 암호문 버전입니다.");
        try {
            byte[] packed = Base64.getUrlDecoder().decode(ciphertext.substring(3));
            byte[] iv = new byte[IV_LENGTH];
            byte[] encrypted = new byte[packed.length - IV_LENGTH];
            System.arraycopy(packed, 0, iv, 0, IV_LENGTH);
            System.arraycopy(packed, IV_LENGTH, encrypted, 0, encrypted.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, encryptionKey, new GCMParameterSpec(TAG_LENGTH, iv));
            return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
        } catch (Exception exception) {
            throw new IllegalStateException("민감정보를 복호화하지 못했습니다.", exception);
        }
    }

    public String blindIndex(String value) {
        if (value == null) return null;
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(indexKey);
            return HexFormat.of().formatHex(mac.doFinal(normalize(value).getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new IllegalStateException("검색용 식별자를 만들지 못했습니다.", exception);
        }
    }

    public String tokenHash(String token) {
        return HexFormat.of().formatHex(digest(token.getBytes(StandardCharsets.UTF_8)));
    }

    public String encryptBytes(byte[] value) {
        if (value == null) return null;
        return encrypt(Base64.getEncoder().encodeToString(value));
    }

    public byte[] decryptBytes(String ciphertext) {
        if (ciphertext == null) return null;
        return Base64.getDecoder().decode(decrypt(ciphertext));
    }

    private String normalize(String value) {
        return value.trim().replaceAll("\\s+", "").toLowerCase();
    }

    private byte[] digest(byte[] value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value);
        } catch (Exception exception) {
            throw new IllegalStateException("SHA-256을 사용할 수 없습니다.", exception);
        }
    }
}
