package com.mediflow.backend.patient;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface PatientRepository extends JpaRepository<Patient, String> {

    @EntityGraph(attributePaths = "diagnoses")
    @Query("select p from Patient p where p.id = :registrationNumber")
    Optional<Patient> findByRegistrationNumber(@Param("registrationNumber") String registrationNumber);
}
