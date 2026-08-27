package com.mediflow.backend.pd;

import com.mediflow.backend.audit.AuditService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.*;

@RestController
@RequestMapping("/api/pd/admissions/{admissionId}/attachments")
@PreAuthorize("hasRole('CLINICIAN')")
public class AdmissionAttachmentController {
    private final AdmissionAttachmentService service;
    private final AuditService audit;

    public AdmissionAttachmentController(AdmissionAttachmentService service, AuditService audit) {
        this.service = service;
        this.audit = audit;
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public AdmissionAttachmentService.AttachmentResponse upload(
            @PathVariable UUID admissionId, @RequestPart("file") MultipartFile file,
            Authentication authentication, HttpServletRequest request) {
        AdmissionAttachmentService.AttachmentResponse response = service.upload(admissionId, file);
        audit.record(authentication, request, "UPLOAD", "ADMISSION_ATTACHMENT", response.id());
        return response;
    }

    @GetMapping
    public List<AdmissionAttachmentService.AttachmentResponse> list(@PathVariable UUID admissionId) {
        return service.list(admissionId);
    }

    @GetMapping("/{attachmentId}")
    public ResponseEntity<byte[]> download(@PathVariable UUID admissionId, @PathVariable UUID attachmentId,
                                           Authentication authentication, HttpServletRequest request) {
        AdmissionAttachmentService.Download download = service.download(admissionId, attachmentId);
        audit.record(authentication, request, "DOWNLOAD", "ADMISSION_ATTACHMENT", attachmentId);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .contentType(MediaType.parseMediaType(download.contentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(download.fileName(), StandardCharsets.UTF_8).build().toString())
                .body(download.content());
    }
}
