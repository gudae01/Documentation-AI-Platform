package com.mediflow.backend.pd;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PdClinicalRecordRepository extends JpaRepository<PdClinicalRecord, UUID> {
    Optional<PdClinicalRecord> findByQuestionnaireId(UUID questionnaireId);
    List<PdClinicalRecord> findTop100ByOrderByApprovedAtDesc();
    List<PdClinicalRecord> findByPatientIdOrderByApprovedAtDesc(UUID patientId);
}
