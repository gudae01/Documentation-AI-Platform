package com.mediflow.backend.pd;

import com.mediflow.backend.common.NotFoundException;
import com.mediflow.backend.security.SensitiveDataCrypto;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.Instant;
import java.util.*;

@Service
public class AdmissionAttachmentService {
    private static final long MAX_SIZE = 20L * 1024 * 1024;
    private static final Set<String> ALLOWED = Set.of(
            "application/pdf", "image/png", "image/jpeg", "text/plain");

    private final AdmissionRecordRepository admissions;
    private final AdmissionAttachmentRepository attachments;
    private final SensitiveDataCrypto crypto;

    public AdmissionAttachmentService(AdmissionRecordRepository admissions,
                                      AdmissionAttachmentRepository attachments,
                                      SensitiveDataCrypto crypto) {
        this.admissions = admissions;
        this.attachments = attachments;
        this.crypto = crypto;
    }

    @Transactional
    public AttachmentResponse upload(UUID admissionId, MultipartFile file) {
        AdmissionRecord admission = admissions.findById(admissionId)
                .orElseThrow(() -> new NotFoundException("입원 기록을 찾을 수 없습니다."));
        if ("APPROVED".equals(admission.getStatus())) {
            throw new IllegalStateException("승인된 보고서에는 파일을 추가할 수 없습니다.");
        }
        if (file.isEmpty()) throw new IllegalArgumentException("빈 파일은 업로드할 수 없습니다.");
        if (file.getSize() > MAX_SIZE) throw new IllegalArgumentException("파일은 20MB 이하만 허용됩니다.");
        String type = Objects.toString(file.getContentType(), "application/octet-stream").toLowerCase(Locale.ROOT);
        if (!ALLOWED.contains(type)) throw new IllegalArgumentException("PDF, PNG, JPEG, TXT 파일만 허용됩니다.");
        try {
            byte[] content = file.getBytes();
            validateMagic(type, content);
            AdmissionAttachment saved = attachments.save(new AdmissionAttachment(admission,
                    sanitize(file.getOriginalFilename()), type, content.length, crypto.encryptBytes(content)));
            return AttachmentResponse.from(saved);
        } catch (IOException exception) {
            throw new IllegalStateException("첨부파일을 저장하지 못했습니다.", exception);
        }
    }

    @Transactional(readOnly = true)
    public List<AttachmentResponse> list(UUID admissionId) {
        if (!admissions.existsById(admissionId)) throw new NotFoundException("입원 기록을 찾을 수 없습니다.");
        return attachments.findByAdmissionIdOrderByCreatedAtAsc(admissionId).stream()
                .map(AttachmentResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public Download download(UUID admissionId, UUID attachmentId) {
        AdmissionAttachment attachment = attachments.findByIdAndAdmissionId(attachmentId, admissionId)
                .orElseThrow(() -> new NotFoundException("첨부파일을 찾을 수 없습니다."));
        return new Download(attachment.getOriginalFileName(), attachment.getContentType(),
                crypto.decryptBytes(attachment.getContentCipher()));
    }

    private void validateMagic(String type, byte[] bytes) {
        boolean valid = switch (type) {
            case "application/pdf" -> starts(bytes, "%PDF".getBytes(java.nio.charset.StandardCharsets.US_ASCII));
            case "image/png" -> bytes.length >= 8 && bytes[0] == (byte) 0x89 && bytes[1] == 0x50
                    && bytes[2] == 0x4e && bytes[3] == 0x47;
            case "image/jpeg" -> bytes.length >= 3 && bytes[0] == (byte) 0xff && bytes[1] == (byte) 0xd8
                    && bytes[2] == (byte) 0xff;
            case "text/plain" -> !containsNull(bytes);
            default -> false;
        };
        if (!valid) throw new IllegalArgumentException("파일 내용과 확장 형식이 일치하지 않습니다.");
    }

    private boolean starts(byte[] value, byte[] prefix) {
        if (value.length < prefix.length) return false;
        for (int i = 0; i < prefix.length; i++) if (value[i] != prefix[i]) return false;
        return true;
    }

    private boolean containsNull(byte[] value) {
        int limit = Math.min(value.length, 4096);
        for (int i = 0; i < limit; i++) if (value[i] == 0) return true;
        return false;
    }

    private String sanitize(String name) {
        if (name == null || name.isBlank()) return "attachment";
        String normalized = name.replace('\\', '/');
        String safe = normalized.substring(normalized.lastIndexOf('/') + 1)
                .replaceAll("[\\r\\n\\t]", "_").trim();
        return safe.isBlank() ? "attachment" : safe.substring(0, Math.min(255, safe.length()));
    }

    public record AttachmentResponse(UUID id, String fileName, String contentType, long size,
                                     Instant createdAt) {
        static AttachmentResponse from(AdmissionAttachment attachment) {
            return new AttachmentResponse(attachment.getId(), attachment.getOriginalFileName(),
                    attachment.getContentType(), attachment.getSize(), attachment.getCreatedAt());
        }
    }
    public record Download(String fileName, String contentType, byte[] content) { }
}
