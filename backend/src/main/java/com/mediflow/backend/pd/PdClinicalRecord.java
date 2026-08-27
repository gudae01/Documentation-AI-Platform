package com.mediflow.backend.pd;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Lob;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "pd_clinical_records")
public class PdClinicalRecord {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "patient_id", nullable = false)
    private PdPatient patient;

    @OneToOne(optional = false)
    @JoinColumn(name = "questionnaire_id", nullable = false, unique = true)
    private QuestionnaireSubmission questionnaire;

    @Lob
    @Column(nullable = false)
    private String payloadCipher;

    @Column(nullable = false, length = 120)
    private String clinician;

    @Column(nullable = false, updatable = false)
    private Instant approvedAt;

    protected PdClinicalRecord() { }

    public PdClinicalRecord(PdPatient patient, QuestionnaireSubmission questionnaire,
                            String payloadCipher, String clinician) {
        this.patient = patient;
        this.questionnaire = questionnaire;
        this.payloadCipher = payloadCipher;
        this.clinician = clinician;
        this.approvedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public PdPatient getPatient() { return patient; }
    public QuestionnaireSubmission getQuestionnaire() { return questionnaire; }
    public String getPayloadCipher() { return payloadCipher; }
    public String getClinician() { return clinician; }
    public Instant getApprovedAt() { return approvedAt; }
}
