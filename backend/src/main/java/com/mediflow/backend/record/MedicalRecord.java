package com.mediflow.backend.record;

import com.mediflow.backend.encounter.EncounterType;
import com.mediflow.backend.patient.Patient;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "medical_records")
public class MedicalRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    private Patient patient;

    @Column(nullable = false)
    private LocalDate visitDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private EncounterType visitType;

    @Column(length = 500)
    private String chiefComplaint;

    @Lob
    private String symptoms;

    @Lob
    private String assessment;

    @Lob
    private String plan;

    @Lob
    private String soapSubjective;

    @Lob
    private String soapObjective;

    @Lob
    private String soapAssessment;

    @Lob
    private String soapPlan;

    @Lob
    private String examinationText;

    @Lob
    private String autonomicInterpretation;

    @Column(nullable = false, length = 80)
    private String clinician;

    @Column(nullable = false)
    private Instant approvedAt;

    @Column(nullable = false, unique = true)
    private UUID sourceEncounterId;

    protected MedicalRecord() {
    }

    public MedicalRecord(Patient patient, LocalDate visitDate, EncounterType visitType, String chiefComplaint,
                         String symptoms, String assessment, String plan, String soapSubjective,
                         String soapObjective, String soapAssessment, String soapPlan, String examinationText,
                         String autonomicInterpretation, String clinician, Instant approvedAt,
                         UUID sourceEncounterId) {
        this.patient = patient;
        this.visitDate = visitDate;
        this.visitType = visitType;
        this.chiefComplaint = chiefComplaint;
        this.symptoms = symptoms;
        this.assessment = assessment;
        this.plan = plan;
        this.soapSubjective = soapSubjective;
        this.soapObjective = soapObjective;
        this.soapAssessment = soapAssessment;
        this.soapPlan = soapPlan;
        this.examinationText = examinationText;
        this.autonomicInterpretation = autonomicInterpretation;
        this.clinician = clinician;
        this.approvedAt = approvedAt;
        this.sourceEncounterId = sourceEncounterId;
    }

    public UUID getId() {
        return id;
    }

    public Patient getPatient() {
        return patient;
    }

    public LocalDate getVisitDate() {
        return visitDate;
    }

    public EncounterType getVisitType() {
        return visitType;
    }

    public String getChiefComplaint() {
        return chiefComplaint;
    }

    public String getSymptoms() {
        return symptoms;
    }

    public String getAssessment() {
        return assessment;
    }

    public String getPlan() {
        return plan;
    }

    public String getSoapSubjective() {
        return soapSubjective;
    }

    public String getSoapObjective() {
        return soapObjective;
    }

    public String getSoapAssessment() {
        return soapAssessment;
    }

    public String getSoapPlan() {
        return soapPlan;
    }

    public String getExaminationText() {
        return examinationText;
    }

    public String getAutonomicInterpretation() {
        return autonomicInterpretation;
    }

    public String getClinician() {
        return clinician;
    }

    public Instant getApprovedAt() {
        return approvedAt;
    }

    public UUID getSourceEncounterId() {
        return sourceEncounterId;
    }
}
