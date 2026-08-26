package com.mediflow.backend.attachment;

import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api")
public class AttachmentController {

    private final AttachmentService attachmentService;

    public AttachmentController(AttachmentService attachmentService) {
        this.attachmentService = attachmentService;
    }

    @PostMapping(value = "/encounters/{encounterId}/attachments", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<AttachmentResponse> upload(
            Authentication authentication,
            @PathVariable UUID encounterId,
            @RequestParam AttachmentType type,
            @RequestParam MultipartFile file) {
        return ResponseEntity.status(201)
                .body(attachmentService.upload(authentication.getName(), encounterId, type, file));
    }

    @GetMapping("/encounters/{encounterId}/attachments")
    public List<AttachmentResponse> list(Authentication authentication, @PathVariable UUID encounterId) {
        return attachmentService.list(authentication.getName(), encounterId);
    }

    @GetMapping("/attachments/{attachmentId}")
    public ResponseEntity<byte[]> download(Authentication authentication, @PathVariable UUID attachmentId) {
        EncounterAttachment attachment = attachmentService.download(authentication.getName(), attachmentId);
        ContentDisposition disposition = ContentDisposition.attachment()
                .filename(attachment.getOriginalFileName(), StandardCharsets.UTF_8)
                .build();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(attachment.getContentType()))
                .contentLength(attachment.getSize())
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .body(attachment.getContent());
    }
}
