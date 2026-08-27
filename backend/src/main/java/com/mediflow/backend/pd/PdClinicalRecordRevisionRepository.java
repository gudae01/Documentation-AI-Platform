package com.mediflow.backend.pd;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface PdClinicalRecordRevisionRepository extends JpaRepository<PdClinicalRecordRevision, UUID> {
    List<PdClinicalRecordRevision> findByClinicalRecordIdOrderByArchivedAtDesc(UUID clinicalRecordId);
}
