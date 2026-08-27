package com.mediflow.backend.pd;

import com.mediflow.backend.audit.AuditService;
import com.mediflow.backend.common.NotFoundException;
import com.mediflow.backend.security.SensitiveDataCrypto;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;

@RestController
@RequestMapping("/api/pd/admissions")
@PreAuthorize("hasRole('CLINICIAN')")
public class AdmissionController {
    private final AdmissionRecordRepository records;
    private final PdPatientRepository patients;
    private final SensitiveDataCrypto crypto;
    private final EmrParserService parser;
    private final AdmissionReportService reportService;
    private final ReportPdfService pdfService;
    private final AdmissionClinicalTestService clinicalTests;
    private final ObjectMapper json;
    private final AuditService audit;

    public AdmissionController(AdmissionRecordRepository records, PdPatientRepository patients,
                               SensitiveDataCrypto crypto, EmrParserService parser,
                               AdmissionReportService reportService, ReportPdfService pdfService,
                               AdmissionClinicalTestService clinicalTests,
                               ObjectMapper json, AuditService audit) {
        this.records = records;
        this.patients = patients;
        this.crypto = crypto;
        this.parser = parser;
        this.reportService = reportService;
        this.pdfService = pdfService;
        this.clinicalTests = clinicalTests;
        this.json = json;
        this.audit = audit;
    }

    @PostMapping
    @Transactional
    public AdmissionResponse create(@Valid @RequestBody Create request, Authentication authentication,
                                    HttpServletRequest servletRequest) {
        PdPatient patient = patients.findFirstByNameIndexAndBirth6IndexAndSex(
                        crypto.blindIndex(request.name()), crypto.blindIndex(request.birth6()), request.sex())
                .orElseGet(() -> patients.save(new PdPatient(request.name(), request.birth6(), request.sex(), crypto)));
        EmrParserService.Parsed parsed = parser.parse(request.rawEmr());
        String report = reportService.generate(request.name(), parsed);
        AdmissionRecord saved = records.save(new AdmissionRecord(patient, crypto.encrypt(request.rawEmr()),
                crypto.encrypt(json.writeValueAsString(parsed)), crypto.encrypt(report)));
        audit.record(authentication, servletRequest, "PARSE", "ADMISSION", saved.getId());
        return response(saved);
    }

    @GetMapping
    @Transactional(readOnly = true)
    public List<AdmissionResponse> list() {
        return records.findTop100ByOrderByCreatedAtDesc().stream().map(this::response).toList();
    }

    @PutMapping("/{id}/report")
    @Transactional
    public AdmissionResponse report(@PathVariable UUID id, @Valid @RequestBody SaveReport request,
                                    Authentication authentication, HttpServletRequest servletRequest) {
        AdmissionRecord record = get(id);
        if (record.getVersion() != request.version()) {
            throw new IllegalStateException("다른 사용자가 먼저 보고서를 수정했습니다.");
        }
        record.saveReport(crypto.encrypt(request.report()));
        audit.record(authentication, servletRequest, "REVIEW", "ADMISSION_REPORT", id);
        return response(record);
    }

    @PostMapping("/{id}/approve")
    @Transactional
    public AdmissionResponse approve(@PathVariable UUID id, Authentication authentication,
                                     HttpServletRequest servletRequest) {
        AdmissionRecord record = get(id);
        record.approve();
        audit.record(authentication, servletRequest, "APPROVE", "ADMISSION_REPORT", id);
        return response(record);
    }

    @PostMapping("/{id}/rebuild-report")
    @Transactional
    public AdmissionResponse rebuildReport(@PathVariable UUID id, Authentication authentication,
                                           HttpServletRequest servletRequest) {
        AdmissionRecord record = get(id);
        EmrParserService.Parsed parsed = json.readValue(crypto.decrypt(record.getParsedCipher()),
                EmrParserService.Parsed.class);
        String name = crypto.decrypt(record.getPatient().getNameCipher());
        String report = reportService.generate(name, parsed);
        report = reportService.includeManualTests(report, clinicalTests.bundle(id));
        record.replaceDraftReport(crypto.encrypt(report));
        audit.record(authentication, servletRequest, "REBUILD", "ADMISSION_REPORT", id);
        return response(record);
    }

    @GetMapping(value = "/{id}/pdf", produces = MediaType.APPLICATION_PDF_VALUE)
    @Transactional(readOnly = true)
    public ResponseEntity<byte[]> pdf(@PathVariable UUID id, Authentication authentication,
                                      HttpServletRequest servletRequest) {
        AdmissionRecord record = get(id);
        byte[] pdf = pdfService.create(crypto.decrypt(record.getReportCipher()));
        audit.record(authentication, servletRequest, "DOWNLOAD_PDF", "ADMISSION_REPORT", id);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename("admission-report-" + id + ".pdf", StandardCharsets.UTF_8).build().toString())
                .body(pdf);
    }

    private AdmissionRecord get(UUID id) {
        return records.findById(id).orElseThrow(() -> new NotFoundException("입원 기록을 찾을 수 없습니다."));
    }

    private AdmissionResponse response(AdmissionRecord record) {
        return new AdmissionResponse(record.getId(), record.getPatient().getId(),
                crypto.decrypt(record.getPatient().getNameCipher()),
                crypto.decrypt(record.getPatient().getBirth6Cipher()), record.getPatient().getSex(),
                crypto.decrypt(record.getParsedCipher()), crypto.decrypt(record.getReportCipher()),
                record.getStatus(), record.getCreatedAt(), record.getReviewedAt(), record.getApprovedAt(),
                record.getVersion());
    }

    public record Create(@NotBlank @Size(max = 80) String name,
                         @Pattern(regexp = "\\d{6}") String birth6,
                         @Pattern(regexp = "M|F") String sex,
                         @NotBlank @Size(max = 2_000_000) String rawEmr) { }
    public record SaveReport(@NotBlank @Size(max = 100_000) String report,
                             @PositiveOrZero long version) { }
    public record AdmissionResponse(UUID id, UUID patientId, String name, String birth6, String sex,
                                    String parsedJson, String report, String status, Instant createdAt,
                                    Instant reviewedAt, Instant approvedAt, long version) { }
}
