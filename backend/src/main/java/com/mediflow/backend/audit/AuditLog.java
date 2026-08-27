package com.mediflow.backend.audit;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "audit_logs")
public class AuditLog {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    @Column(nullable = false, length = 100) private String actorKey;
    @Column(nullable = false, length = 80) private String action;
    @Column(nullable = false, length = 80) private String resourceType;
    @Column(length = 80) private String resourceId;
    @Column(length = 64) private String sourceIp;
    @Column(nullable = false) private boolean succeeded;
    @Column(nullable = false, updatable = false) private Instant createdAt;

    protected AuditLog() { }

    public AuditLog(String actorKey, String action, String resourceType, String resourceId,
                    String sourceIp, boolean succeeded) {
        this.actorKey = actorKey;
        this.action = action;
        this.resourceType = resourceType;
        this.resourceId = resourceId;
        this.sourceIp = sourceIp;
        this.succeeded = succeeded;
        this.createdAt = Instant.now();
    }

    public UUID getId() { return id; }
    public String getActorKey() { return actorKey; }
    public String getAction() { return action; }
    public String getResourceType() { return resourceType; }
    public String getResourceId() { return resourceId; }
    public String getSourceIp() { return sourceIp; }
    public boolean isSucceeded() { return succeeded; }
    public Instant getCreatedAt() { return createdAt; }
}
