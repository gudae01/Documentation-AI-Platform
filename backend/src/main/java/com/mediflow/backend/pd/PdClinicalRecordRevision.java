package com.mediflow.backend.pd;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Lob;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "pd_clinical_record_revisions")
public class PdClinicalRecordRevision {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "clinical_record_id", nullable = false)
    private PdClinicalRecord clinicalRecord;

    @Lob
    @Column(nullable = false)
    private String payloadCipher;

    @Column(nullable = false, length = 120)
    private String clinician;

    @Column(nullable = false)
    private Instant approvedAt;

    @Column(nullable = false, updatable = false)
    private Instant archivedAt;

    protected PdClinicalRecordRevision() { }

    public PdClinicalRecordRevision(PdClinicalRecord clinicalRecord) {
        this.clinicalRecord = clinicalRecord;
        this.payloadCipher = clinicalRecord.getPayloadCipher();
        this.clinician = clinicalRecord.getClinician();
        this.approvedAt = clinicalRecord.getApprovedAt();
        this.archivedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public PdClinicalRecord getClinicalRecord() { return clinicalRecord; }
    public String getPayloadCipher() { return payloadCipher; }
    public String getClinician() { return clinician; }
    public Instant getApprovedAt() { return approvedAt; }
    public Instant getArchivedAt() { return archivedAt; }
}
