package com.mediflow.backend.pd;

import com.mediflow.backend.audit.AuditService;
import com.mediflow.backend.security.KakaoPrincipal;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/pd")
@PreAuthorize("hasRole('CLINICIAN')")
public class PdClinicalRecordController {
    private final PdClinicalRecordService service;
    private final AuditService audit;

    public PdClinicalRecordController(PdClinicalRecordService service, AuditService audit) {
        this.service = service;
        this.audit = audit;
    }

    @PutMapping("/questionnaires/{questionnaireId}/clinical-record")
    public Response approve(@PathVariable UUID questionnaireId,
                            @Valid @RequestBody ApproveRequest request,
                            Authentication authentication,
                            HttpServletRequest servletRequest) {
        String clinician = authentication.getPrincipal() instanceof KakaoPrincipal principal
                ? principal.getNickname() : "의료진";
        PdClinicalRecord saved = service.approve(questionnaireId, request, clinician);
        audit.record(authentication, servletRequest, "APPROVE", "PD_CLINICAL_RECORD", saved.getId());
        return response(saved);
    }

    @GetMapping("/clinical-records")
    public List<Response> recent(Authentication authentication, HttpServletRequest servletRequest) {
        List<Response> result = service.recent().stream().map(this::response).toList();
        audit.record(authentication, servletRequest, "SEARCH", "PD_CLINICAL_RECORD", null);
        return result;
    }

    @GetMapping("/patients/{patientId}/clinical-records")
    public List<Response> byPatient(@PathVariable UUID patientId,
                                    Authentication authentication,
                                    HttpServletRequest servletRequest) {
        List<Response> result = service.byPatient(patientId).stream().map(this::response).toList();
        audit.record(authentication, servletRequest, "READ", "PD_CLINICAL_RECORD", patientId);
        return result;
    }

    private Response response(PdClinicalRecord record) {
        ApproveRequest payload = service.read(record);
        return new Response(record.getId(), record.getPatient().getId(), record.getQuestionnaire().getId(),
                payload.rawExaminationText(), payload.structuredResults(), payload.soap(), payload.autonomic(),
                payload.audioFileName(), payload.autonomicFileName(), record.getClinician(), record.getApprovedAt());
    }

    public record ApproveRequest(
            @Size(max = 30000) String rawExaminationText,
            @NotNull @Size(max = 200) List<@Valid ResultItem> structuredResults,
            @NotNull @Valid Soap soap,
            @NotNull @Size(max = 60) Map<@Size(max = 80) String, @Size(max = 2000) String> autonomic,
            @Size(max = 255) String audioFileName,
            @Size(max = 255) String autonomicFileName) { }

    public record ResultItem(
            @NotBlank @Size(max = 40) String source,
            @NotBlank @Size(max = 100) String title,
            @Size(max = 10000) String value,
            @Size(max = 200) String status) { }

    public record Soap(
            @Size(max = 30000) String subjective,
            @Size(max = 30000) String objective,
            @Size(max = 30000) String assessment,
            @Size(max = 30000) String plan) { }

    public record Response(UUID id, UUID patientId, UUID questionnaireId, String rawExaminationText,
                           List<ResultItem> structuredResults, Soap soap, Map<String, String> autonomic,
                           String audioFileName, String autonomicFileName, String clinician,
                           Instant approvedAt) { }
}
