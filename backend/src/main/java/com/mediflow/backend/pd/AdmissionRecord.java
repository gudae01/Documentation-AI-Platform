package com.mediflow.backend.pd;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "pd_admission_records")
public class AdmissionRecord {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    @ManyToOne(optional = false)
    private PdPatient patient;
    @Lob @Column(nullable = false)
    private String rawCipher;
    @Lob @Column(nullable = false)
    private String parsedCipher;
    @Lob @Column(nullable = false)
    private String reportCipher;
    @Column(nullable = false, length = 20)
    private String status;
    @Column(nullable = false, updatable = false)
    private Instant createdAt;
    private Instant reviewedAt;
    private Instant approvedAt;
    @Version
    private long version;

    protected AdmissionRecord() { }

    public AdmissionRecord(PdPatient patient, String rawCipher, String parsedCipher, String reportCipher) {
        this.patient = patient;
        this.rawCipher = rawCipher;
        this.parsedCipher = parsedCipher;
        this.reportCipher = reportCipher;
        this.status = "DRAFT";
        this.createdAt = Instant.now();
    }

    public void saveReport(String reportCipher) {
        if ("APPROVED".equals(status)) throw new IllegalStateException("승인된 보고서는 수정할 수 없습니다.");
        this.reportCipher = reportCipher;
        this.status = "REVIEWED";
        this.reviewedAt = Instant.now();
    }

    public void replaceDraftReport(String reportCipher) {
        if (!"DRAFT".equals(status)) {
            throw new IllegalStateException("검토 저장 전 초안만 다시 만들 수 있습니다.");
        }
        this.reportCipher = reportCipher;
    }

    public void approve() {
        if (reportCipher == null || reportCipher.isBlank()) {
            throw new IllegalStateException("검토한 보고서가 필요합니다.");
        }
        if (!"REVIEWED".equals(status)) throw new IllegalStateException("검토 저장 후 승인할 수 있습니다.");
        status = "APPROVED";
        approvedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public PdPatient getPatient() { return patient; }
    public String getRawCipher() { return rawCipher; }
    public String getParsedCipher() { return parsedCipher; }
    public String getReportCipher() { return reportCipher; }
    public String getStatus() { return status; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getReviewedAt() { return reviewedAt; }
    public Instant getApprovedAt() { return approvedAt; }
    public long getVersion() { return version; }
}
