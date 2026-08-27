package com.mediflow.backend.audit;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/pd/audit-logs")
@PreAuthorize("hasRole('CLINICIAN')")
public class AuditController {
    private final AuditLogRepository repository;
    public AuditController(AuditLogRepository repository) { this.repository = repository; }

    @GetMapping
    public List<AuditResponse> list() {
        return repository.findTop200ByOrderByCreatedAtDesc().stream().map(AuditResponse::from).toList();
    }

    public record AuditResponse(UUID id, String actorKey, String action, String resourceType,
                                String resourceId, String sourceIp, boolean succeeded, Instant createdAt) {
        static AuditResponse from(AuditLog log) {
            return new AuditResponse(log.getId(), log.getActorKey(), log.getAction(), log.getResourceType(),
                    log.getResourceId(), log.getSourceIp(), log.isSucceeded(), log.getCreatedAt());
        }
    }
}
