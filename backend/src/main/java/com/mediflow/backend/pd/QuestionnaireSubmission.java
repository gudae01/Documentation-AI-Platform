package com.mediflow.backend.pd;

import jakarta.persistence.*;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "questionnaire_submissions")
public class QuestionnaireSubmission {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    @OneToOne(optional = false)
    private QuestionnaireInvitation invitation;
    @ManyToOne(optional = false)
    private PdPatient patient;
    @Lob @Column(nullable = false)
    private String payloadCipher;
    @Lob @Column(nullable = false)
    private String structuredCipher;
    @Lob @Column(nullable = false)
    private String chartCipher;
    @Column(nullable = false)
    private LocalDate plannedDate;
    @Column(nullable = false, length = 20)
    private String respondentType;
    @Column(nullable = false, length = 20)
    private String status;
    @Column(nullable = false, updatable = false)
    private Instant createdAt;
    private Instant reviewedAt;
    @Version
    private long version;

    protected QuestionnaireSubmission() { }

    public QuestionnaireSubmission(QuestionnaireInvitation invitation, PdPatient patient,
                                   String payloadCipher, String structuredCipher, String chartCipher,
                                   LocalDate plannedDate, String respondentType) {
        this.invitation = invitation;
        this.patient = patient;
        this.payloadCipher = payloadCipher;
        this.structuredCipher = structuredCipher;
        this.chartCipher = chartCipher;
        this.plannedDate = plannedDate;
        this.respondentType = respondentType;
        this.status = "UNREVIEWED";
        this.createdAt = Instant.now();
    }

    public void review(String chartCipher) {
        this.chartCipher = chartCipher;
        status = "REVIEWED";
        reviewedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public QuestionnaireInvitation getInvitation() { return invitation; }
    public PdPatient getPatient() { return patient; }
    public String getPayloadCipher() { return payloadCipher; }
    public String getStructuredCipher() { return structuredCipher; }
    public String getChartCipher() { return chartCipher; }
    public LocalDate getPlannedDate() { return plannedDate; }
    public String getRespondentType() { return respondentType; }
    public String getStatus() { return status; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getReviewedAt() { return reviewedAt; }
    public long getVersion() { return version; }
}
