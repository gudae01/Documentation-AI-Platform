package com.mediflow.backend.pd;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "pd_admission_attachments")
public class AdmissionAttachment {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    private AdmissionRecord admission;
    @Column(nullable = false, length = 255)
    private String originalFileName;
    @Column(nullable = false, length = 80)
    private String contentType;
    @Column(nullable = false)
    private long size;
    @Lob @Column(nullable = false)
    private String contentCipher;
    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    protected AdmissionAttachment() { }

    public AdmissionAttachment(AdmissionRecord admission, String originalFileName, String contentType,
                               long size, String contentCipher) {
        this.admission = admission;
        this.originalFileName = originalFileName;
        this.contentType = contentType;
        this.size = size;
        this.contentCipher = contentCipher;
        this.createdAt = Instant.now();
    }

    public UUID getId() { return id; }
    public AdmissionRecord getAdmission() { return admission; }
    public String getOriginalFileName() { return originalFileName; }
    public String getContentType() { return contentType; }
    public long getSize() { return size; }
    public String getContentCipher() { return contentCipher; }
    public Instant getCreatedAt() { return createdAt; }
}
