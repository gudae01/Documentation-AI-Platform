package com.mediflow.backend.attachment;

import java.time.Instant;
import java.util.UUID;

public record AttachmentResponse(
        UUID id,
        AttachmentType type,
        String originalFileName,
        String contentType,
        long size,
        Instant createdAt
) {
    public static AttachmentResponse from(EncounterAttachment attachment) {
        return new AttachmentResponse(attachment.getId(), attachment.getType(), attachment.getOriginalFileName(),
                attachment.getContentType(), attachment.getSize(), attachment.getCreatedAt());
    }
}
