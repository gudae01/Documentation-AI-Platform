package com.mediflow.backend.audit;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuditService {
    private final AuditLogRepository repository;

    public AuditService(AuditLogRepository repository) { this.repository = repository; }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(Authentication authentication, HttpServletRequest request, String action,
                       String resourceType, Object resourceId) {
        String actor = authentication == null ? "PUBLIC" : authentication.getName();
        record(actor, request, action, resourceType, resourceId, true);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(String actor, HttpServletRequest request, String action,
                       String resourceType, Object resourceId, boolean succeeded) {
        String forwarded = request == null ? null : request.getHeader("X-Forwarded-For");
        String ip = forwarded == null || forwarded.isBlank()
                ? request == null ? null : request.getRemoteAddr()
                : forwarded.split(",", 2)[0].trim();
        repository.save(new AuditLog(actor, action, resourceType,
                resourceId == null ? null : String.valueOf(resourceId), ip, succeeded));
    }
}
