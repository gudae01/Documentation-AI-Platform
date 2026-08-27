package com.mediflow.backend.pd;

import jakarta.persistence.*;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "questionnaire_invitations",
        indexes = @Index(name = "idx_questionnaire_token", columnList = "token_hash", unique = true))
public class QuestionnaireInvitation {
    public enum Status { ISSUED, SENT, IN_PROGRESS, SUBMITTED, REVOKED, EXPIRED }
    public enum DeliveryStatus { NOT_REQUESTED, SENT, NOT_CONFIGURED, FAILED }

    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    @Column(name = "token_hash", nullable = false, unique = true, length = 64)
    private String tokenHash;
    @Column(name = "recipient_cipher", nullable = false, length = 800)
    private String recipientCipher;
    @Column(nullable = false, length = 12)
    private String channel;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20)
    private Status status;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20)
    private DeliveryStatus deliveryStatus;
    @Column(length = 300)
    private String deliveryMessage;
    private LocalDate plannedDate;
    @Lob
    private String draftCipher;
    private Instant draftSavedAt;
    @Column(nullable = false)
    private Instant expiresAt;
    @Column(nullable = false, updatable = false)
    private Instant createdAt;
    private Instant submittedAt;
    @Column(nullable = false, length = 100)
    private String createdBy;
    @Version
    private long version;

    protected QuestionnaireInvitation() { }

    public QuestionnaireInvitation(String tokenHash, String recipientCipher, String channel,
                                   LocalDate plannedDate, Instant expiresAt, String createdBy) {
        this.tokenHash = tokenHash;
        this.recipientCipher = recipientCipher;
        this.channel = channel;
        this.plannedDate = plannedDate;
        this.expiresAt = expiresAt;
        this.createdBy = createdBy;
        this.status = Status.ISSUED;
        this.deliveryStatus = DeliveryStatus.NOT_REQUESTED;
        this.createdAt = Instant.now();
    }

    public void delivery(DeliveryStatus deliveryStatus, String message) {
        this.deliveryStatus = deliveryStatus;
        this.deliveryMessage = message;
        if (deliveryStatus == DeliveryStatus.SENT) status = Status.SENT;
    }

    public void saveDraft(String encryptedDraft, LocalDate plannedDate) {
        assertUsable();
        this.draftCipher = encryptedDraft;
        this.draftSavedAt = Instant.now();
        if (plannedDate != null) this.plannedDate = plannedDate;
        this.status = Status.IN_PROGRESS;
    }

    public void started() {
        if (status == Status.ISSUED || status == Status.SENT) status = Status.IN_PROGRESS;
    }

    public void submitted(LocalDate plannedDate) {
        assertUsable();
        if (plannedDate != null) this.plannedDate = plannedDate;
        status = Status.SUBMITTED;
        submittedAt = Instant.now();
        draftCipher = null;
        draftSavedAt = null;
    }

    public void revoke() {
        if (status != Status.SUBMITTED) status = Status.REVOKED;
    }

    public void assertUsable() {
        if (Instant.now().isAfter(expiresAt)) {
            status = Status.EXPIRED;
            throw new IllegalStateException("문진 링크가 만료되었습니다.");
        }
        if (status == Status.REVOKED || status == Status.SUBMITTED || status == Status.EXPIRED) {
            throw new IllegalStateException("이미 사용되었거나 유효하지 않은 문진 링크입니다.");
        }
    }

    public UUID getId() { return id; }
    public String getTokenHash() { return tokenHash; }
    public String getRecipientCipher() { return recipientCipher; }
    public String getChannel() { return channel; }
    public Status getStatus() { return status; }
    public DeliveryStatus getDeliveryStatus() { return deliveryStatus; }
    public String getDeliveryMessage() { return deliveryMessage; }
    public LocalDate getPlannedDate() { return plannedDate; }
    public String getDraftCipher() { return draftCipher; }
    public Instant getDraftSavedAt() { return draftSavedAt; }
    public Instant getExpiresAt() { return expiresAt; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getSubmittedAt() { return submittedAt; }
    public String getCreatedBy() { return createdBy; }
}
