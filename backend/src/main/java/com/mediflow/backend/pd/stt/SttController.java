package com.mediflow.backend.pd.stt;

import com.mediflow.backend.audit.AuditService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/pd/stt")
@PreAuthorize("hasRole('CLINICIAN')")
public class SttController {
    private final SttService service;
    private final AuditService audit;

    public SttController(SttService service, AuditService audit) {
        this.service = service;
        this.audit = audit;
    }

    @PostMapping("/transcriptions")
    public SttResponse transcribe(@RequestPart("file") MultipartFile file,
                                  Authentication authentication,
                                  HttpServletRequest request) {
        SttResponse response = service.transcribe(file);
        audit.record(authentication, request, "TRANSCRIBE", "PD_AUDIO", null);
        return response;
    }
}
