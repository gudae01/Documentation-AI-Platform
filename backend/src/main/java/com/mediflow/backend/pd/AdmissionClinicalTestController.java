package com.mediflow.backend.pd;

import com.mediflow.backend.audit.AuditService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.UUID;

@RestController
@RequestMapping("/api/pd/admissions/{admissionId}/tests")
@PreAuthorize("hasRole('CLINICIAN')")
public class AdmissionClinicalTestController {
    private final AdmissionClinicalTestService service;
    private final AuditService audit;

    public AdmissionClinicalTestController(AdmissionClinicalTestService service, AuditService audit) {
        this.service = service;
        this.audit = audit;
    }

    @GetMapping
    public AdmissionClinicalTestService.TestBundle list(@PathVariable UUID admissionId) {
        return service.bundle(admissionId);
    }

    @PostMapping
    public AdmissionClinicalTestService.TestResponse add(@PathVariable UUID admissionId,
                                                         @Valid @RequestBody AddTest request,
                                                         Authentication authentication,
                                                         HttpServletRequest servletRequest) {
        AdmissionClinicalTestService.TestResponse response = service.add(admissionId, request.testDate(),
                request.category(), request.metric(), request.value(), request.unit(), request.condition(),
                request.raw());
        audit.record(authentication, servletRequest, "ADD", "ADMISSION_TEST", response.id());
        return response;
    }

    public record AddTest(@NotNull LocalDate testDate,
                          @NotBlank @Pattern(regexp = "PEDISOL|HRV|LAB|RADIOLOGY|PD_SCALE|OTHER") String category,
                          @NotBlank @Size(max = 200) String metric,
                          @NotBlank @Size(max = 200) String value,
                          @Size(max = 80) String unit,
                          @Size(max = 200) String condition,
                          @Size(max = 5000) String raw) { }
}
