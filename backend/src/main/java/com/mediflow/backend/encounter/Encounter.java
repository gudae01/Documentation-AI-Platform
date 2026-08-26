package com.mediflow.backend.encounter;

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
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "encounters")
public class Encounter {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, length = 100)
    private String ownerKey;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    private Patient patient;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private EncounterType type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private EncounterStatus status;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private EncounterStep currentStep;

    @Lob
    private String chartText;

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
    private String autonomicTestJson;

    @Lob
    private String autonomicInterpretation;

    @Column(nullable = false)
    private boolean recording;

    @Column(nullable = false)
    private long recordingSeconds;

    @Column(length = 255)
    private String audioFileName;

    @Column(length = 255)
    private String autonomicFileName;

    @Column(length = 100)
    private String savedDevice;

    @Version
    private long version;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant updatedAt;

    private Instant approvedAt;

    protected Encounter() {
    }

    public Encounter(String ownerKey, Patient patient, EncounterType type, EncounterStep initialStep) {
        this.ownerKey = ownerKey;
        this.patient = patient;
        this.type = type;
        this.status = EncounterStatus.DRAFT;
        this.currentStep = initialStep;
    }

    public void saveDraft(EncounterStep currentStep, String chartText, String chiefComplaint,
                          String symptoms, String assessment, String plan, String soapSubjective,
                          String soapObjective, String soapAssessment, String soapPlan,
                          String examinationText, String autonomicTestJson,
                          String autonomicInterpretation, boolean recording, long recordingSeconds,
                          String audioFileName, String autonomicFileName, String savedDevice) {
        assertDraft();
        this.currentStep = currentStep;
        this.chartText = chartText;
        this.chiefComplaint = chiefComplaint;
        this.symptoms = symptoms;
        this.assessment = assessment;
        this.plan = plan;
        this.soapSubjective = soapSubjective;
        this.soapObjective = soapObjective;
        this.soapAssessment = soapAssessment;
        this.soapPlan = soapPlan;
        this.examinationText = examinationText;
        this.autonomicTestJson = autonomicTestJson;
        this.autonomicInterpretation = autonomicInterpretation;
        this.recording = recording;
        this.recordingSeconds = Math.max(0, recordingSeconds);
        this.audioFileName = audioFileName;
        this.autonomicFileName = autonomicFileName;
        this.savedDevice = savedDevice;
    }

    public void approve() {
        assertDraft();
        this.status = EncounterStatus.APPROVED;
        this.currentStep = EncounterStep.FINAL_APPROVAL;
        this.recording = false;
        this.approvedAt = Instant.now();
    }

    private void assertDraft() {
        if (status != EncounterStatus.DRAFT) {
            throw new IllegalStateException("이미 승인된 진료는 수정할 수 없습니다.");
        }
    }

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public String getOwnerKey() { return ownerKey; }
    public Patient getPatient() { return patient; }
    public EncounterType getType() { return type; }
    public EncounterStatus getStatus() { return status; }
    public EncounterStep getCurrentStep() { return currentStep; }
    public String getChartText() { return chartText; }
    public String getChiefComplaint() { return chiefComplaint; }
    public String getSymptoms() { return symptoms; }
    public String getAssessment() { return assessment; }
    public String getPlan() { return plan; }
    public String getSoapSubjective() { return soapSubjective; }
    public String getSoapObjective() { return soapObjective; }
    public String getSoapAssessment() { return soapAssessment; }
    public String getSoapPlan() { return soapPlan; }
    public String getExaminationText() { return examinationText; }
    public String getAutonomicTestJson() { return autonomicTestJson; }
    public String getAutonomicInterpretation() { return autonomicInterpretation; }
    public boolean isRecording() { return recording; }
    public long getRecordingSeconds() { return recordingSeconds; }
    public String getAudioFileName() { return audioFileName; }
    public String getAutonomicFileName() { return autonomicFileName; }
    public String getSavedDevice() { return savedDevice; }
    public long getVersion() { return version; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public Instant getApprovedAt() { return approvedAt; }
}
