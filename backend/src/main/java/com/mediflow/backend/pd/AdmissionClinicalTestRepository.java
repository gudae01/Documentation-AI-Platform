package com.mediflow.backend.pd;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.*;

public interface AdmissionClinicalTestRepository extends JpaRepository<AdmissionClinicalTest, UUID> {
    List<AdmissionClinicalTest> findByAdmissionIdOrderByTestDateAscCreatedAtAsc(UUID admissionId);
}
