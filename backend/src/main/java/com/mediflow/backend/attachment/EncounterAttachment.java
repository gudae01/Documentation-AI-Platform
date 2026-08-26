package com.mediflow.backend.attachment;

import com.mediflow.backend.encounter.Encounter;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "encounter_attachments")
public class EncounterAttachment {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    private Encounter encounter;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private AttachmentType type;

    @Column(nullable = false, length = 255)
    private String originalFileName;

    @Column(nullable = false, length = 120)
    private String contentType;

    @Column(nullable = false)
    private long size;

    @Lob
    @Column(nullable = false)
    private byte[] content;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    protected EncounterAttachment() {
    }

    public EncounterAttachment(Encounter encounter, AttachmentType type, String originalFileName,
                               String contentType, byte[] content) {
        this.encounter = encounter;
        this.type = type;
        this.originalFileName = originalFileName;
        this.contentType = contentType;
        this.content = content.clone();
        this.size = content.length;
        this.createdAt = Instant.now();
    }

    public UUID getId() { return id; }
    public Encounter getEncounter() { return encounter; }
    public AttachmentType getType() { return type; }
    public String getOriginalFileName() { return originalFileName; }
    public String getContentType() { return contentType; }
    public long getSize() { return size; }
    public byte[] getContent() { return content.clone(); }
    public Instant getCreatedAt() { return createdAt; }
}
