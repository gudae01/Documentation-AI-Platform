package com.mediflow.backend.pd;

import jakarta.persistence.*;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "pd_admission_clinical_tests")
public class AdmissionClinicalTest {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    private AdmissionRecord admission;
    @Column(nullable = false)
    private LocalDate testDate;
    @Column(nullable = false, length = 30)
    private String category;
    @Column(nullable = false, length = 800)
    private String metricCipher;
    @Column(nullable = false, length = 800)
    private String valueCipher;
    @Column(length = 800)
    private String unitCipher;
    @Column(length = 800)
    private String conditionCipher;
    @Lob
    private String rawCipher;
    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    protected AdmissionClinicalTest() { }

    public AdmissionClinicalTest(AdmissionRecord admission, LocalDate testDate, String category,
                                 String metricCipher, String valueCipher, String unitCipher,
                                 String conditionCipher, String rawCipher) {
        this.admission = admission;
        this.testDate = testDate;
        this.category = category;
        this.metricCipher = metricCipher;
        this.valueCipher = valueCipher;
        this.unitCipher = unitCipher;
        this.conditionCipher = conditionCipher;
        this.rawCipher = rawCipher;
        this.createdAt = Instant.now();
    }

    public UUID getId() { return id; }
    public AdmissionRecord getAdmission() { return admission; }
    public LocalDate getTestDate() { return testDate; }
    public String getCategory() { return category; }
    public String getMetricCipher() { return metricCipher; }
    public String getValueCipher() { return valueCipher; }
    public String getUnitCipher() { return unitCipher; }
    public String getConditionCipher() { return conditionCipher; }
    public String getRawCipher() { return rawCipher; }
    public Instant getCreatedAt() { return createdAt; }
}
